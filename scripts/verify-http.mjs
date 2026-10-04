import assert from "node:assert/strict";
import { mkdir, writeFile } from "node:fs/promises";

const base = process.env.BASE_URL ?? "http://127.0.0.1:3106";
const evidence = [];
async function query(parameters) {
  const url = `${base}/api/query?${new URLSearchParams(parameters)}`;
  const response = await fetch(url, { signal: AbortSignal.timeout(40_000) });
  const result = await response.json();
  assert.equal(response.status, 200, JSON.stringify(result));
  assert.equal(response.headers.get("cache-control"), "no-store");
  assert.ok(response.headers.get("server-timing"));
  evidence.push({ url, result });
  return result;
}
const point = await query({
  kind: "point",
  longitude: "107.29700509151542",
  latitude: "-7.06424324594125",
});
assert.ok(point.rows.some((row) => row.objectid === 2893));
const region = point.rows.find((row) => row.objectid === 2893);
assert.equal(region.kecamatan, "Gununghalu");
for (const [method, field, prefix] of [
  ["kba", "id_wetla_kba", "KBA"],
  ["lito", "id_wetla_lito", "Lito"],
]) {
  const result = await query({
    kind: "assignments",
    method,
    id: region[field],
  });
  assert.ok(result.rows.length > 0);
  assert.ok(
    result.rows.some((row) => String(row.status_pencocokan).startsWith(prefix)),
  );
}
const path = new URL("../docs/evidence/local-http.json", import.meta.url);
await mkdir(new URL("../docs/evidence/", import.meta.url), { recursive: true });
await writeFile(
  path,
  JSON.stringify(
    {
      timestamp: new Date().toISOString(),
      transport: "actual local TanStack server HTTP + live SIGI",
      evidence,
    },
    null,
    2,
  ),
);
console.log(
  `Live route verification passed: point polygon 2893/Gununghalu, KBA and Litologi assignment requests. Evidence: ${path.pathname}`,
);
