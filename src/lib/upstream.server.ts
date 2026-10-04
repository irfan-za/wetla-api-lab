import {
  type Attributes,
  assignmentParams,
  locationParams,
  pointParams,
  type QueryMeasurement,
  type QueryParams,
  type QueryResult,
  UPSTREAM,
} from "./wetla.ts";

type Fetcher = (url: string, init?: RequestInit) => Promise<Response>;
export class UpstreamError extends Error {
  status: number;
  measurement: QueryMeasurement;
  constructor(message: string, status: number, measurement: QueryMeasurement) {
    super(message);
    this.name = "UpstreamError";
    this.status = status;
    this.measurement = measurement;
  }
}
const MAX_BODY_BYTES = 16 * 1024 * 1024;
export async function runQuery(
  layer: number,
  params: QueryParams,
  signal?: AbortSignal,
  fetcher: Fetcher = fetch,
): Promise<QueryResult> {
  if (![0, 1, 2].includes(layer)) throw new Error("Unsupported layer");
  const url = `${UPSTREAM}/${layer}/query?${new URLSearchParams(params)}`;
  const start = performance.now();
  const measurement: QueryMeasurement = {
    layer,
    url,
    status: 0,
    headersMs: 0,
    downloadMs: 0,
    parseMs: 0,
    totalMs: 0,
    decodedBytes: 0,
    rows: 0,
    exceededTransferLimit: false,
    cache: "DISABLED",
    contentEncoding: null,
  };
  const timeout = AbortSignal.timeout(30_000);
  const combined = signal ? AbortSignal.any([signal, timeout]) : timeout;
  try {
    const response = await fetcher(url, {
      signal: combined,
      cache: "no-store",
      headers: { Accept: "application/json", "Cache-Control": "no-cache" },
    });
    measurement.headersMs = performance.now() - start;
    measurement.status = response.status;
    measurement.contentEncoding = response.headers.get("content-encoding");
    const downloadStart = performance.now();
    const reader = response.body?.getReader();
    const chunks: Uint8Array[] = [];
    if (reader) {
      try {
        for (;;) {
          combined.throwIfAborted();
          const { done, value } = await reader.read();
          if (done) break;
          measurement.decodedBytes += value.byteLength;
          if (measurement.decodedBytes > MAX_BODY_BYTES) {
            await reader.cancel();
            throw new UpstreamError(
              "Upstream payload exceeds 16 MiB. Use a smaller geometry page.",
              502,
              measurement,
            );
          }
          chunks.push(value);
        }
      } finally {
        reader.releaseLock();
      }
    }
    const buffer = new Uint8Array(measurement.decodedBytes);
    let cursor = 0;
    for (const chunk of chunks) {
      buffer.set(chunk, cursor);
      cursor += chunk.length;
    }
    const raw = new TextDecoder().decode(buffer);
    measurement.downloadMs = performance.now() - downloadStart;
    if (!response.ok)
      throw new UpstreamError(
        `SIGI returned HTTP ${response.status}. This is an access/upstream error, not an empty dataset.`,
        response.status,
        measurement,
      );
    const parseStart = performance.now();
    let payload: unknown;
    try {
      payload = JSON.parse(raw);
    } catch {
      throw new UpstreamError("SIGI returned invalid JSON", 502, measurement);
    } finally {
      measurement.parseMs = performance.now() - parseStart;
    }
    if (!payload || typeof payload !== "object")
      throw new UpstreamError(
        "SIGI returned invalid feature data",
        502,
        measurement,
      );
    const data = payload as {
      features?: unknown;
      error?: { code?: unknown; message?: unknown };
      exceededTransferLimit?: unknown;
    };
    if (data.error) {
      const code = Number(data.error.code);
      throw new UpstreamError(
        typeof data.error.message === "string"
          ? data.error.message
          : "SIGI reported an ArcGIS error",
        Number.isInteger(code) && code >= 400 && code < 500 ? code : 502,
        measurement,
      );
    }
    if (!Array.isArray(data.features))
      throw new UpstreamError(
        "SIGI returned no feature array",
        502,
        measurement,
      );
    const rows: Attributes[] = data.features.map((feature: unknown) => {
      if (
        !feature ||
        typeof feature !== "object" ||
        !("attributes" in feature) ||
        !feature.attributes ||
        typeof feature.attributes !== "object" ||
        Array.isArray(feature.attributes)
      )
        throw new UpstreamError(
          "SIGI returned invalid feature attributes",
          502,
          measurement,
        );
      return feature.attributes as Attributes;
    });
    measurement.rows = rows.length;
    measurement.exceededTransferLimit = data.exceededTransferLimit === true;
    measurement.totalMs = performance.now() - start;
    return { rows, hasMore: measurement.exceededTransferLimit, measurement };
  } catch (error) {
    measurement.totalMs = performance.now() - start;
    if (error instanceof UpstreamError) throw error;
    if (combined.aborted)
      throw new UpstreamError(
        signal?.aborted
          ? "Request cancelled"
          : "SIGI request exceeded the 30-second timeout",
        signal?.aborted ? 499 : 504,
        measurement,
      );
    throw new UpstreamError(
      "Unable to reach SIGI WETLA service",
      502,
      measurement,
    );
  }
}

function integer(value: string | null, fallback: number): number {
  if (value === null) return fallback;
  if (!/^\d+$/.test(value))
    throw new Error("Pagination requires non-negative integer values");
  const result = Number(value);
  if (!Number.isSafeInteger(result))
    throw new Error("Pagination value is too large");
  return result;
}
function coordinate(value: string | null): number {
  if (value === null || !value.trim())
    throw new Error("Both longitude and latitude are required");
  return Number(value);
}
export async function handleQuery(
  request: Request,
  fetcher: Fetcher = fetch,
): Promise<Response> {
  const headers: Record<string, string> = { "Cache-Control": "no-store" };
  try {
    const search = new URL(request.url).searchParams;
    let params: QueryParams,
      layer = 0;
    const offset = integer(search.get("offset"), 0);
    const kind = search.get("kind");
    if (kind === "locations") {
      const geometry = search.get("geometry");
      if (geometry !== null && !["0", "1"].includes(geometry))
        throw new Error("geometry must be 0 or 1");
      params = locationParams({
        province: search.get("province") ?? "",
        search: search.get("search") ?? "",
        offset,
        limit: integer(search.get("limit"), 12),
        geometry: geometry === "1",
      });
    } else if (kind === "point") {
      params = pointParams(
        coordinate(search.get("longitude")),
        coordinate(search.get("latitude")),
        offset,
      );
    } else if (kind === "assignments") {
      const method = search.get("method");
      if (method !== "kba" && method !== "lito")
        throw new Error("Method must be kba or lito");
      layer = method === "kba" ? 2 : 1;
      params = assignmentParams(search.get("id") ?? "", offset);
    } else throw new Error("Unknown query kind");
    if (offset > 100_000)
      throw new Error("Offset exceeds diagnostic query limit");
    const result = await runQuery(layer, params, request.signal, fetcher);
    const m = result.measurement;
    headers["Server-Timing"] =
      `upstream_headers;dur=${m.headersMs.toFixed(2)}, upstream_body;dur=${m.downloadMs.toFixed(2)}, json_parse;dur=${m.parseMs.toFixed(2)}`;
    headers["X-WETLA-Cache"] = "DISABLED";
    return Response.json(result, { headers });
  } catch (error) {
    const isUpstream = error instanceof UpstreamError;
    return Response.json(
      {
        error: error instanceof Error ? error.message : "Request failed",
        ...(isUpstream ? { measurement: error.measurement } : {}),
      },
      { status: isUpstream ? error.status : 400, headers },
    );
  }
}
