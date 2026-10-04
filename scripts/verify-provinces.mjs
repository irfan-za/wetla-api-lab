import { mkdir, writeFile } from "node:fs/promises";
import { runQuery } from "../src/lib/upstream.server.ts";
import { locationParams, PROVINCES } from "../src/lib/wetla.ts";

const reports = [];
for (const province of PROVINCES) {
  const result = await runQuery(
    0,
    locationParams({ province, search: "", offset: 0, limit: 12 }),
  );
  if (!result.rows.length && !result.hasMore)
    throw new Error(`No rows for ${province}`);
  if (result.rows.some((row) => row.provinsi !== province))
    throw new Error(`Province scope mismatch: ${province}`);
  reports.push({ province, ...result });
  console.log(
    JSON.stringify({
      province,
      rows: result.rows.length,
      hasMore: result.hasMore,
      ms: result.measurement.totalMs,
      bytes: result.measurement.decodedBytes,
      firstDistrict: result.rows[0]?.kecamatan,
    }),
  );
}
await mkdir(new URL("../docs/evidence/", import.meta.url), { recursive: true });
await writeFile(
  new URL("../docs/evidence/six-provinces.json", import.meta.url),
  JSON.stringify({ capturedAt: new Date().toISOString(), reports }, null, 2),
);
