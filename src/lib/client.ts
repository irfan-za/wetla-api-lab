import type {
  Attributes,
  ClientMeasurement,
  LocationQuery,
  Method,
  Plant,
  QueryResult,
} from "./wetla.ts";
import {
  assignmentParams,
  groupPlants,
  locationParams,
  pointParams,
  text,
} from "./wetla.ts";

export interface AssignmentResult {
  rows: Attributes[];
  plants: Plant[];
  complete: boolean;
  reason?: string;
  pages: number;
}

export type ClientQuery =
  | ({ kind: "locations" } & LocationQuery)
  | { kind: "point"; longitude: number; latitude: number; offset?: number }
  | { kind: "assignments"; method: Method; id: string; offset?: number };
export interface ClientResult extends Omit<QueryResult, "measurement"> {
  measurement: ClientMeasurement;
}
export interface RequestRecord {
  request: ClientQuery;
  outcome: "success" | "error" | "aborted";
  measurement?: ClientMeasurement;
  error?: string;
}
export interface ClientOptions {
  fetch?: typeof globalThis.fetch;
  onRequest?: (record: RequestRecord) => void;
}

export function createClient(options: ClientOptions = {}) {
  const fetcher = options.fetch ?? globalThis.fetch;
  async function query(
    request: ClientQuery,
    signal?: AbortSignal,
  ): Promise<ClientResult> {
    if (request.kind === "locations") locationParams(request);
    else if (request.kind === "point")
      pointParams(request.longitude, request.latitude, request.offset);
    else assignmentParams(request.id, request.offset ?? 0);
    const params = new URLSearchParams();
    for (const [key, value] of Object.entries(request)) {
      params.set(
        key,
        typeof value === "boolean" ? (value ? "1" : "0") : String(value),
      );
    }
    const started = performance.now();
    let measurement: ClientMeasurement | undefined;
    try {
      signal?.throwIfAborted();
      const response = await fetcher(`/api/query?${params}`, {
        cache: "no-store",
        signal,
      });
      const body = await response.text();
      const browserRequestMs = performance.now() - started;
      signal?.throwIfAborted();
      const parseStarted = performance.now();
      const result = JSON.parse(body) as QueryResult & { error?: string };
      const browserParseMs = performance.now() - parseStarted;
      if (result.measurement)
        measurement = {
          ...result.measurement,
          browserRequestMs,
          browserParseMs,
          responseBytes: new TextEncoder().encode(body).byteLength,
        };
      if (!response.ok || result.error)
        throw new Error(result.error || `HTTP ${response.status}`);
      if (
        !Array.isArray(result.rows) ||
        typeof result.hasMore !== "boolean" ||
        !measurement
      )
        throw new Error("Invalid query response");
      options.onRequest?.({ request, outcome: "success", measurement });
      return { rows: result.rows, hasMore: result.hasMore, measurement };
    } catch (error) {
      const aborted =
        signal?.aborted ||
        (error instanceof Error && error.name === "AbortError");
      options.onRequest?.({
        request,
        outcome: aborted ? "aborted" : "error",
        measurement,
        error: error instanceof Error ? error.message : String(error),
      });
      throw error;
    }
  }
  async function loadAssignments(
    method: Method,
    id: string,
    signal?: AbortSignal,
  ): Promise<AssignmentResult> {
    const rows: Attributes[] = [];
    const seen = new Set<string>();
    let pages = 0;
    const finish = (complete: boolean, reason?: string): AssignmentResult => ({
      rows,
      plants: groupPlants(rows, method, id),
      complete,
      reason,
      pages,
    });
    for (let offset = 0; pages < 20; offset += 50) {
      const result = await query(
        { kind: "assignments", method, id, offset },
        signal,
      );
      pages++;
      const signature = JSON.stringify(
        result.rows.map((row) => text(row, "objectid")).sort(),
      );
      if (result.rows.length && seen.has(signature))
        return finish(
          false,
          "Upstream repeated an assignment page. This list is partial.",
        );
      if (result.rows.length) seen.add(signature);
      rows.push(...result.rows);
      if (!result.hasMore) return finish(true);
    }
    return finish(
      false,
      "Stopped at the 20-page safety cap. This list is partial.",
    );
  }
  async function compareGeometry(input: LocationQuery, signal?: AbortSignal) {
    const withoutGeometry = await query(
      { ...input, kind: "locations", geometry: false },
      signal,
    );
    const withGeometry = await query(
      { ...input, kind: "locations", geometry: true },
      signal,
    );
    const ids = (result: ClientResult) =>
      result.rows.map((row) => text(row, "objectid")).sort();
    const withoutIds = ids(withoutGeometry),
      withIds = ids(withGeometry);
    const sameObjectIds =
      withoutIds.every(Boolean) &&
      withIds.every(Boolean) &&
      JSON.stringify(withoutIds) === JSON.stringify(withIds);
    return { withoutGeometry, withGeometry, sameObjectIds };
  }
  return { query, loadAssignments, compareGeometry };
}
