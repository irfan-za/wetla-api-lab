import assert from "node:assert/strict";
import { test } from "node:test";
import {
  assignmentParams,
  groupPlants,
  locationParams,
  pointParams,
} from "../src/lib/wetla.ts";

test("point lookup validates coordinates and preserves exact spatial selection", () => {
  assert.equal(pointParams(107.297, -7.064, 50).geometry, "107.297,-7.064");
  assert.equal(pointParams(107.297, -7.064, 50).resultOffset, "50");
  assert.equal(pointParams(107.297, -7.064, 50).returnGeometry, "false");
  assert.throws(() => pointParams(Number.NaN, 0));
  assert.throws(() => pointParams(181, 0));
});
test("assignment query uses the published identity field", () => {
  assert.equal(assignmentParams("WETLA-096", 0).where, "id_wetla='WETLA-096'");
  assert.throws(() => assignmentParams("WETLA-1' OR 1=1", 0));
});
test("plant grouping filters the correct method and keeps distinct cultivar identities", () => {
  const rows = [
    {
      objectid: 1,
      id_wetla: "WETLA-096",
      nama_tanaman: "A",
      nama_latin: "Species A",
      status_pencocokan: "KBA Gradasi 1",
    },
    {
      objectid: 2,
      id_wetla: "WETLA-096",
      nama_tanaman: "A",
      nama_latin: "species  a",
      status_pencocokan: "KBA Gradasi 2",
    },
    {
      objectid: 3,
      id_wetla: "WETLA-096",
      nama_tanaman: "B",
      nama_latin: "Species B",
      status_pencocokan: "Lito Gradasi 1",
    },
    {
      objectid: 4,
      id_wetla: "WETLA-096",
      nama_tanaman: "A",
      nama_latin: "Species A 'red'",
      status_pencocokan: "KBA Gradasi 1",
    },
  ];
  const plants = groupPlants(rows, "kba", "WETLA-096");
  assert.equal(plants.length, 2);
  assert.deepEqual(plants[0]?.assignmentIds, ["1", "2"]);
  assert.deepEqual(plants[0]?.statuses, ["KBA Gradasi 1", "KBA Gradasi 2"]);
  assert.throws(() =>
    groupPlants([{ id_wetla: "WETLA-999" }], "kba", "WETLA-096"),
  );
});
test("location query rejects out of range pagination, unsupported provinces and wildcard input", () => {
  assert.throws(() =>
    locationParams({ province: "Jakarta", search: "", offset: 0, limit: 12 }),
  );
  assert.throws(() =>
    locationParams({ province: "", search: "%", offset: 0, limit: 12 }),
  );
  assert.throws(() =>
    locationParams({ province: "", search: "", offset: -1, limit: 12 }),
  );
  assert.throws(() =>
    locationParams({ province: "", search: "", offset: 0, limit: 500 }),
  );
});
test("location search stays scoped to an allowed province and escapes SQL apostrophes", () => {
  const p = locationParams({
    province: "Jawa Barat",
    search: "O'Brien",
    offset: 0,
    limit: 12,
  });
  assert.match(p.where ?? "", /provinsi='Jawa Barat'/);
  assert.match(p.where ?? "", /O''BRIEN/);
  assert.equal(p.returnGeometry, "false");
  assert.equal(p.resultRecordCount, "12");
  assert.equal(p.resultOffset, "0");
});
