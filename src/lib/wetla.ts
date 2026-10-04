export const UPSTREAM =
  "https://sigi.pu.go.id/serverpu/rest/services/Hosted/WETLA_6Provinsi_V1/FeatureServer";
export const PROVINCES = [
  "Bali",
  "Jawa Barat",
  "Jawa Timur",
  "Kalimantan Timur",
  "Sulawesi Selatan",
  "Sumatera Utara",
] as const;
export type Method = "kba" | "lito";
export type Attributes = Record<string, unknown>;
export type QueryParams = Record<string, string>;
export const REGION_FIELDS =
  "objectid,provinsi,kabupaten_kota,kecamatan,id_wetla_kba,id_wetla_lito,kode_wetla_kba,kode_wetla_lito,deskripsi_wetla_kba,deskripsi_wetla_lito,deskripsi_subur_kba,deskripsi_subur_lito,deskripsi_iklim,deskripsi_kebasahan,deskripsi_elevasi,penggunaan_lahan_22";
export interface LocationQuery {
  province: string;
  search: string;
  offset: number;
  limit: number;
  geometry?: boolean;
}
export interface QueryMeasurement {
  layer: number;
  url: string;
  status: number;
  headersMs: number;
  downloadMs: number;
  parseMs: number;
  totalMs: number;
  decodedBytes: number;
  rows: number;
  exceededTransferLimit: boolean;
  cache: string;
  contentEncoding: string | null;
}
export interface QueryResult {
  rows: Attributes[];
  hasMore: boolean;
  measurement: QueryMeasurement;
}
export interface ClientMeasurement extends QueryMeasurement {
  browserRequestMs: number;
  browserParseMs: number;
  responseBytes: number;
}
export function text(row: Attributes, field: string): string {
  const key = Object.keys(row).find(
    (k) => k.toLowerCase() === field.toLowerCase(),
  );
  const value = key ? row[key] : null;
  if (value === null || value === undefined) return "";
  const result = String(value).trim();
  return result === "-" || result.toLowerCase() === "null" ? "" : result;
}
export interface Plant {
  id: string;
  name: string;
  latin: string;
  statuses: string[];
  assignmentIds: string[];
  climate: string;
  wetness: string;
  elevation: string;
  fertility: string;
}
export function pointParams(
  longitude: number,
  latitude: number,
  offset = 0,
): QueryParams {
  if (
    !Number.isFinite(longitude) ||
    !Number.isFinite(latitude) ||
    Math.abs(longitude) > 180 ||
    Math.abs(latitude) > 90
  )
    throw new Error("Coordinates must be valid longitude and latitude");
  return {
    ...locationParams({ province: "", search: "", offset, limit: 50 }),
    geometry: `${longitude},${latitude}`,
    geometryType: "esriGeometryPoint",
    inSR: "4326",
    spatialRel: "esriSpatialRelIntersects",
  };
}
export function assignmentParams(id: string, offset: number): QueryParams {
  if (!/^WETLA-\d{1,4}$/.test(id)) throw new Error("Invalid WETLA identity");
  if (!Number.isSafeInteger(offset) || offset < 0)
    throw new Error("Invalid offset");
  return {
    f: "json",
    where: `id_wetla='${id}'`,
    outFields:
      "objectid,id_wetla,nama_tanaman,nama_latin,status_pencocokan,deskripsi_subur,deskripsi_iklim,deskripsi_kebasahan,deskripsi_elevasi",
    returnGeometry: "false",
    orderByFields: "objectid",
    resultOffset: String(offset),
    resultRecordCount: "50",
  };
}
export function groupPlants(
  rows: Attributes[],
  method: Method,
  id: string,
): Plant[] {
  const label = method === "kba" ? "KBA" : "Lito";
  const normalize = (value: string) =>
    value
      .normalize("NFKC")
      .trim()
      .replace(/\s+/g, " ")
      .toLocaleLowerCase("id-ID");
  const grouped = new Map<string, Plant>();
  for (const row of rows) {
    if (text(row, "id_wetla") !== id)
      throw new Error("Assignments returned for a different WETLA identity");
    const status = text(row, "status_pencocokan");
    if (
      ![`${label} Gradasi 1`, `${label} Gradasi 2`].some(
        (s) => normalize(s) === normalize(status),
      )
    )
      continue;
    const name = text(row, "nama_tanaman"),
      latin = text(row, "nama_latin");
    const oid = text(row, "objectid");
    const key =
      name || latin ? JSON.stringify([normalize(name), normalize(latin)]) : oid;
    const existing = grouped.get(key);
    if (existing) {
      if (!existing.statuses.includes(status)) existing.statuses.push(status);
      if (!existing.assignmentIds.includes(oid))
        existing.assignmentIds.push(oid);
    } else
      grouped.set(key, {
        id: key,
        name,
        latin,
        statuses: [status],
        assignmentIds: [oid],
        climate: text(row, "deskripsi_iklim"),
        wetness: text(row, "deskripsi_kebasahan"),
        elevation: text(row, "deskripsi_elevasi"),
        fertility: text(row, "deskripsi_subur"),
      });
  }
  return [...grouped.values()];
}
export function locationParams(input: LocationQuery): QueryParams {
  if (
    input.province &&
    !(PROVINCES as readonly string[]).includes(input.province)
  )
    throw new Error("Unknown province");
  if (
    !Number.isSafeInteger(input.offset) ||
    input.offset < 0 ||
    ![12, 25, 50].includes(input.limit)
  )
    throw new Error("Invalid page size or offset");
  const search = input.search.trim();
  if (
    search.length > 80 ||
    /[%_]/.test(search) ||
    [...search].some((character) => character.charCodeAt(0) < 32)
  )
    throw new Error(
      "Search accepts up to 80 characters, without SQL wildcard characters",
    );
  const clauses = input.province ? [`provinsi='${input.province}'`] : [];
  if (search) {
    const escaped = search.toUpperCase().replaceAll("'", "''");
    clauses.push(
      `(UPPER(kecamatan) LIKE '%${escaped}%' OR UPPER(kabupaten_kota) LIKE '%${escaped}%' OR UPPER(provinsi) LIKE '%${escaped}%')`,
    );
  }
  return {
    f: "json",
    where: clauses.join(" AND ") || "1=1",
    outFields: REGION_FIELDS,
    returnGeometry: String(input.geometry ?? false),
    orderByFields: "objectid",
    resultOffset: String(input.offset),
    resultRecordCount: String(input.limit),
    outSR: "4326",
    returnZ: "false",
    returnM: "false",
  };
}
