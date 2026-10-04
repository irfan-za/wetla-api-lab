import assert from "node:assert/strict";
import { test } from "node:test";
import { handleQuery, runQuery } from "../src/lib/upstream.server.ts";

// Controlled Response fixtures exercise the adapter only; live evidence comes from scripts/benchmark.mjs.
test("ArcGIS error inside HTTP 200 is returned as an error rather than empty rows", async () => {
  const r = await handleQuery(
    new Request(
      "http://localhost/api/query?kind=assignments&method=kba&id=WETLA-096",
    ),
    async () =>
      new Response('{"error":{"code":403,"message":"Permission denied"}}'),
  );
  assert.equal(r.status, 403);
  const body = await r.json();
  assert.equal(body.error, "Permission denied");
  assert.equal(body.measurement.status, 200);
});
test("missing coordinates fail before any network request", async () => {
  let calls = 0;
  const r = await handleQuery(
    new Request("http://localhost/api/query?kind=point&longitude=&latitude=0"),
    async () => {
      calls++;
      return new Response("{}");
    },
  );
  assert.equal(r.status, 400);
  assert.equal(calls, 0);
});
test("invalid upstream JSON is a 502 and uncached", async () => {
  const r = await handleQuery(
    new Request("http://localhost/api/query?kind=locations"),
    async () => new Response("<html>error</html>"),
  );
  assert.equal(r.status, 502);
  assert.equal(r.headers.get("cache-control"), "no-store");
});
test("upstream HTTP 403 remains an access failure with measurements", async () => {
  const r = await handleQuery(
    new Request("http://localhost/api/query?kind=locations"),
    async () => new Response("Forbidden", { status: 403 }),
  );
  assert.equal(r.status, 403);
  assert.match((await r.json()).error, /access\/upstream error/);
});
test("aborted requests are forwarded and returned as cancellation", async () => {
  const controller = new AbortController();
  controller.abort();
  const r = await handleQuery(
    new Request("http://localhost/api/query?kind=locations", {
      signal: controller.signal,
    }),
    async (_url, init) => {
      init?.signal?.throwIfAborted();
      return new Response("{}");
    },
  );
  assert.equal(r.status, 499);
});
test("negative offsets and invalid methods are rejected", async () => {
  assert.equal(
    (
      await handleQuery(
        new Request("http://localhost/api/query?kind=locations&offset=-1"),
      )
    ).status,
    400,
  );
  assert.equal(
    (
      await handleQuery(
        new Request(
          "http://localhost/api/query?kind=assignments&method=other&id=WETLA-096",
        ),
      )
    ).status,
    400,
  );
});
test("query adapter records header/download/parse times and raw decoded bytes without returning geometry", async () => {
  const raw = JSON.stringify({
    features: [
      {
        attributes: { objectid: 2893, kecamatan: "Gununghalu" },
        geometry: { rings: [[1, 2, 3]] },
      },
    ],
    exceededTransferLimit: true,
  });
  const result = await runQuery(
    0,
    { f: "json" },
    undefined,
    async () => new Response(raw),
  );
  assert.equal(result.rows[0]?.objectid, 2893);
  assert.equal(result.rows[0]?.geometry, undefined);
  assert.equal(result.hasMore, true);
  assert.equal(result.measurement.decodedBytes, Buffer.byteLength(raw));
  assert.equal(result.measurement.rows, 1);
  assert.ok(result.measurement.headersMs >= 0);
  assert.ok(result.measurement.downloadMs >= 0);
  assert.ok(result.measurement.parseMs >= 0);
});
test("server route has no local/browser cache and rejects arbitrary proxy input", async () => {
  const response = await handleQuery(
    new Request(
      "http://localhost/api/query?kind=locations&province=Jawa%20Barat&limit=12&offset=0",
    ),
    async () => new Response('{"features":[],"exceededTransferLimit":false}'),
  );
  assert.equal(response.status, 200);
  assert.equal(response.headers.get("cache-control"), "no-store");
  assert.match(
    response.headers.get("server-timing") ?? "",
    /upstream_headers;dur=/,
  );
  const invalid = await handleQuery(
    new Request("http://localhost/api/query?kind=evil&url=https://example.com"),
  );
  assert.equal(invalid.status, 400);
});
