import assert from "node:assert/strict";
import test from "node:test";
import { createClient, type RequestRecord } from "../src/lib/client.ts";
import type { QueryMeasurement, QueryResult } from "../src/lib/wetla.ts";

// All responses below are explicit fixtures, not observations of the live API.
const measurement: QueryMeasurement = {
  layer: 0,
  url: "https://fixture.invalid/query",
  status: 200,
  headersMs: 10,
  downloadMs: 4,
  parseMs: 1,
  totalMs: 15,
  decodedBytes: 100,
  rows: 1,
  exceededTransferLimit: false,
  cache: "disabled",
  contentEncoding: null,
};
function fixture(
  rows: QueryResult["rows"] = [{ objectid: 1 }],
  hasMore = false,
): Response {
  return Response.json({
    rows,
    hasMore,
    measurement: {
      ...measurement,
      rows: rows.length,
      exceededTransferLimit: hasMore,
    },
  });
}

test("location request preserves applied controls, disables caching, and measures browser read/parse", async () => {
  let called = "";
  let options: RequestInit | undefined;
  const signal = new AbortController().signal;
  const client = createClient({
    fetch: async (url, init) => {
      called = String(url);
      options = init;
      return fixture();
    },
  });
  const result = await client.query(
    {
      kind: "locations",
      province: "Jawa Barat",
      search: "Bandung",
      offset: 12,
      limit: 12,
      geometry: false,
    },
    signal,
  );
  const url = new URL(called, "http://fixture.invalid");
  assert.equal(url.pathname, "/api/query");
  assert.equal(url.searchParams.get("province"), "Jawa Barat");
  assert.equal(url.searchParams.get("search"), "Bandung");
  assert.equal(url.searchParams.get("offset"), "12");
  assert.equal(url.searchParams.get("limit"), "12");
  assert.equal(url.searchParams.get("geometry"), "0");
  assert.equal(options?.cache, "no-store");
  assert.equal(options?.signal, signal);
  assert.deepEqual(result.rows, [{ objectid: 1 }]);
  assert.equal(result.measurement.headersMs, 10);
  assert.ok(result.measurement.browserRequestMs >= 0);
  assert.ok(result.measurement.browserParseMs >= 0);
  assert.ok(result.measurement.responseBytes > 0);
});

test("failed HTTP requests retain measurement in log and do not retry", async () => {
  const records: RequestRecord[] = [];
  let calls = 0;
  const client = createClient({
    fetch: async () => {
      calls++;
      return Response.json(
        { error: "Upstream unavailable", measurement },
        { status: 502 },
      );
    },
    onRequest: (record) => records.push(record),
  });
  await assert.rejects(
    client.query({ kind: "point", longitude: 107, latitude: -7 }),
    /Upstream unavailable/,
  );
  assert.equal(calls, 1);
  assert.equal(records[0]?.outcome, "error");
  assert.equal(records[0]?.measurement?.headersMs, 10);
});

test("a request cancelled while reading never returns stale data and logs abort", async () => {
  const controller = new AbortController();
  const records: RequestRecord[] = [];
  const client = createClient({
    fetch: async () => {
      controller.abort();
      return fixture();
    },
    onRequest: (record) => records.push(record),
  });
  await assert.rejects(
    client.query(
      { kind: "point", longitude: 107, latitude: -7 },
      controller.signal,
    ),
    { name: "AbortError" },
  );
  assert.equal(records[0]?.outcome, "aborted");
});

test("successful requests are recorded individually", async () => {
  const records: RequestRecord[] = [];
  const client = createClient({
    fetch: async () => fixture(),
    onRequest: (record) => records.push(record),
  });
  await client.query({
    kind: "assignments",
    method: "kba",
    id: "WETLA-1",
    offset: 0,
  });
  assert.equal(records.length, 1);
  assert.equal(records[0]?.outcome, "success");
  assert.equal(records[0]?.request.kind, "assignments");
});

test("selection loads every assignment page of 50 before grouping plants for the selected method", async () => {
  const offsets: string[] = [];
  const client = createClient({
    fetch: async (url) => {
      const params = new URL(String(url), "http://fixture.invalid")
        .searchParams;
      assert.equal(params.get("kind"), "assignments");
      assert.equal(params.get("method"), "kba");
      assert.equal(params.get("id"), "WETLA-1");
      offsets.push(params.get("offset") ?? "");
      const offset = Number(params.get("offset"));
      return fixture(
        [
          {
            objectid: offset + 1,
            id_wetla: "WETLA-1",
            nama_tanaman: "Padi",
            nama_latin: "Oryza sativa",
            status_pencocokan: offset === 0 ? "KBA Gradasi 1" : "KBA Gradasi 2",
            deskripsi_iklim: "Tropis",
          },
        ],
        offset === 0,
      );
    },
  });
  const result = await client.loadAssignments("kba", "WETLA-1");
  assert.deepEqual(offsets, ["0", "50"]);
  assert.equal(result.complete, true);
  assert.equal(result.rows.length, 2);
  assert.equal(result.plants.length, 1);
  assert.deepEqual(result.plants[0]?.statuses, [
    "KBA Gradasi 1",
    "KBA Gradasi 2",
  ]);
  assert.equal(result.plants[0]?.climate, "Tropis");
});

test("repeated assignment pages stop with a partial-list warning instead of duplicating plants", async () => {
  let calls = 0;
  const client = createClient({
    fetch: async () => {
      if (++calls > 3) throw new Error("Fixture runaway guard");
      return fixture(
        [
          {
            objectid: 1,
            id_wetla: "WETLA-1",
            nama_tanaman: "Padi",
            status_pencocokan: "Lito Gradasi 1",
          },
        ],
        true,
      );
    },
  });
  const result = await client.loadAssignments("lito", "WETLA-1");
  assert.equal(calls, 2);
  assert.equal(result.complete, false);
  assert.match(result.reason ?? "", /repeated/i);
  assert.equal(result.rows.length, 1);
});

test("twenty empty pages with hasMore remain incomplete and terminate at the safety cap", async () => {
  let calls = 0;
  const client = createClient({
    fetch: async () => {
      if (++calls > 21) throw new Error("Fixture runaway guard");
      return fixture([], true);
    },
  });
  const result = await client.loadAssignments("kba", "WETLA-1");
  assert.equal(calls, 20);
  assert.equal(result.complete, false);
  assert.match(result.reason ?? "", /20/);
});

test("an empty intermediate page does not mean pagination is complete", async () => {
  let calls = 0;
  const client = createClient({
    fetch: async () => (++calls === 1 ? fixture([], true) : fixture([], false)),
  });
  const result = await client.loadAssignments("kba", "WETLA-1");
  assert.equal(calls, 2);
  assert.equal(result.complete, true);
});

test("aborting pagination stops subsequent assignment pages", async () => {
  let calls = 0;
  const controller = new AbortController();
  const client = createClient({
    fetch: async () => {
      calls++;
      controller.abort();
      return fixture([], true);
    },
  });
  await assert.rejects(
    client.loadAssignments("kba", "WETLA-1", controller.signal),
    { name: "AbortError" },
  );
  assert.equal(calls, 1);
});

test("geometry experiment uses identical applied controls in ordered attribute-only then geometry requests", async () => {
  const requests: URLSearchParams[] = [];
  const client = createClient({
    fetch: async (url) => {
      const params = new URL(String(url), "http://fixture.invalid")
        .searchParams;
      requests.push(params);
      return fixture(
        params.get("geometry") === "0"
          ? [{ objectid: 2 }, { objectid: 1 }]
          : [{ objectid: 1 }, { objectid: 2 }],
      );
    },
  });
  const result = await client.compareGeometry({
    province: "Bali",
    search: "Denpasar",
    offset: 25,
    limit: 25,
  });
  assert.equal(result.sameObjectIds, true);
  assert.equal(result.withoutGeometry.measurement.rows, 2);
  assert.equal(result.withGeometry.measurement.rows, 2);
  assert.deepEqual(
    requests.map((p) => p.get("geometry")),
    ["0", "1"],
  );
  for (const params of requests) {
    assert.equal(params.get("province"), "Bali");
    assert.equal(params.get("search"), "Denpasar");
    assert.equal(params.get("offset"), "25");
    assert.equal(params.get("limit"), "25");
  }
});

test("geometry comparison flags mismatched polygon identities", async () => {
  let calls = 0;
  const client = createClient({
    fetch: async () => fixture([{ objectid: ++calls }]),
  });
  const result = await client.compareGeometry({
    province: "",
    search: "",
    offset: 0,
    limit: 12,
  });
  assert.equal(result.sameObjectIds, false);
});

test("invalid search, province, coordinates, and identity are visible errors without a network request", async () => {
  let calls = 0;
  const client = createClient({
    fetch: async () => {
      calls++;
      return fixture();
    },
  });
  await assert.rejects(
    client.query({
      kind: "locations",
      province: "Jawa Barat",
      search: "bad%",
      offset: 0,
      limit: 12,
    }),
    /Search/,
  );
  await assert.rejects(
    client.query({
      kind: "locations",
      province: "Unknown",
      search: "",
      offset: 0,
      limit: 12,
    }),
    /province/,
  );
  await assert.rejects(
    client.query({ kind: "point", longitude: 181, latitude: 0 }),
    /Coordinates/,
  );
  await assert.rejects(client.loadAssignments("kba", "WETLA-abc"), /identity/);
  assert.equal(calls, 0);
});

test("cancelling a geometry experiment prevents its second request", async () => {
  const controller = new AbortController();
  let calls = 0;
  const client = createClient({
    fetch: async () => {
      calls++;
      controller.abort();
      return fixture();
    },
  });
  await assert.rejects(
    client.compareGeometry(
      { province: "", search: "", offset: 0, limit: 12 },
      controller.signal,
    ),
    { name: "AbortError" },
  );
  assert.equal(calls, 1);
});
