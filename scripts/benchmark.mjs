import { mkdir, writeFile } from "node:fs/promises";
import { runQuery } from "../src/lib/upstream.server.ts";
import {
  assignmentParams,
  groupPlants,
  locationParams,
  pointParams,
} from "../src/lib/wetla.ts";

const reports = [];
const at = await runQuery(
  0,
  pointParams(107.29700509151542, -7.06424324594125),
);
reports.push({ test: "point", ...at });
const sample = at.rows.find((row) => row.objectid === 2893) ?? at.rows[0];
if (!sample) throw new Error("Known sample point returned no polygon");
for (const method of ["kba", "lito"]) {
  const id = String(sample[`id_wetla_${method}`]);
  const result = await runQuery(
    method === "kba" ? 2 : 1,
    assignmentParams(id, 0),
  );
  if (result.hasMore)
    throw new Error(
      "Sample recommendations truncated; extend benchmark paging before claiming complete",
    );
  reports.push({
    test: `plants-${method}`,
    plants: groupPlants(result.rows, method, id),
    ...result,
  });
}
for (let trial = 0; trial < 3; trial++) {
  const order = trial % 2 === 0 ? [false, true] : [true, false];
  const pair = [];
  for (const geometry of order) {
    const params = locationParams({
      province: "Jawa Barat",
      search: "Gununghalu",
      limit: 12,
      offset: 0,
      geometry,
    });
    const result = await runQuery(0, params);
    reports.push({
      test: geometry ? "geometry" : "attributes",
      trial,
      ...result,
    });
    pair.push(result.rows.map((row) => row.objectid));
  }
  if (JSON.stringify(pair[0]) !== JSON.stringify(pair[1]))
    throw new Error("Geometry experiment returned different record identities");
}
await mkdir(new URL("../docs/evidence/", import.meta.url), { recursive: true });
const path = new URL("../docs/evidence/live-benchmark.json", import.meta.url);
await writeFile(
  path,
  JSON.stringify(
    {
      capturedAt: new Date().toISOString(),
      origin: "Direct Node fetch from this machine; no app cache/retries",
      reports,
    },
    null,
    2,
  ),
);
console.log(
  JSON.stringify(
    reports.map((r) => ({
      test: r.test,
      trial: r.trial,
      rows: r.rows.length,
      plants: r.plants?.length,
      ms: r.measurement.totalMs,
      headersMs: r.measurement.headersMs,
      downloadMs: r.measurement.downloadMs,
      parseMs: r.measurement.parseMs,
      decodedBytes: r.measurement.decodedBytes,
    })),
    null,
    2,
  ),
);
console.log("Saved " + path.pathname);
