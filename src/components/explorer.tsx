import { Download, FlaskConical, Leaf, Search } from "lucide-react";
import {
  type FormEvent,
  Profiler,
  type ProfilerOnRenderCallback,
  useCallback,
  useEffect,
  useRef,
  useState,
} from "react";
import type { ClientMeasurement } from "../lib/wetla";
import { type Attributes, type Plant, PROVINCES, text } from "../lib/wetla";
import { Button } from "./ui/button";
import { Input } from "./ui/input";
import { cn } from "./ui/utils";
import { type LoadState, useExplorer } from "./use-explorer";

const selectClass =
  "min-h-10 w-full min-w-0 rounded-md border border-zinc-300 bg-white px-3 py-2 text-sm focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-emerald-700";
const ms = (value: number | undefined) =>
  value === undefined ? "Unavailable" : `${value.toFixed(1)} ms`;
const bytes = (value: number) => `${value.toLocaleString("en-US")} B`;
interface RenderSample {
  id: string;
  phase: string;
  actualDuration: number;
  commitTime: number;
}

export function Explorer() {
  const lab = useExplorer();
  const [province, setProvince] = useState("Jawa Barat");
  const [search, setSearch] = useState("");
  const [limit, setLimit] = useState(12);
  const [longitude, setLongitude] = useState("107.29700509151542");
  const [latitude, setLatitude] = useState("-7.06424324594125");
  const [formError, setFormError] = useState("");
  const [pointError, setPointError] = useState("");
  const renders = useRef<RenderSample[]>([]);
  const [frameEstimate, setFrameEstimate] = useState<number | undefined>();
  const onRender = useCallback<ProfilerOnRenderCallback>(
    (id, phase, actualDuration, _baseDuration, _startTime, commitTime) => {
      renders.current.push({ id, phase, actualDuration, commitTime });
      if (renders.current.length > 200) renders.current.shift();
    },
    [],
  );
  // biome-ignore lint/correctness/useExhaustiveDependencies: measure frame opportunity after each data commit, not every render.
  useEffect(() => {
    // This estimates the next frame opportunity, not guaranteed browser paint completion.
    const start = performance.now();
    let second = 0;
    const first = requestAnimationFrame(() => {
      second = requestAnimationFrame(() =>
        setFrameEstimate(performance.now() - start),
      );
    });
    return () => {
      cancelAnimationFrame(first);
      cancelAnimationFrame(second);
    };
  }, [lab.rows, lab.recommendation]);

  function submitLocations(event: FormEvent) {
    event.preventDefault();
    setFormError("");
    try {
      lab.apply({
        kind: "locations",
        province,
        search: search.trim(),
        offset: 0,
        limit,
        geometry: false,
      });
    } catch (error) {
      setFormError(error instanceof Error ? error.message : String(error));
    }
  }
  function submitPoint(event: FormEvent) {
    event.preventDefault();
    setPointError("");
    try {
      if (!longitude.trim() || !latitude.trim())
        throw new Error("Enter both longitude and latitude.");
      lab.apply({
        kind: "point",
        longitude: Number(longitude),
        latitude: Number(latitude),
        offset: 0,
      });
    } catch (error) {
      setPointError(error instanceof Error ? error.message : String(error));
    }
  }
  function page(direction: -1 | 1) {
    const step = lab.applied.kind === "locations" ? lab.applied.limit : 50;
    const offset = Math.max(0, (lab.applied.offset ?? 0) + direction * step);
    lab.apply({ ...lab.applied, offset });
  }
  function exportReport() {
    const report = {
      exportedAt: new Date().toISOString(),
      appliedQuery: lab.applied,
      selectedPolygon: lab.selected,
      method: lab.method,
      recommendation: lab.recommendation,
      geometryComparison: lab.comparison,
      requests: lab.requests,
      devModeProfiler: {
        enabled: import.meta.env.DEV,
        samples: renders.current,
        retainedSamples: 200,
      },
      nextFrameEstimateMs: frameEstimate,
      limitations: [
        "Header wait includes connection, DNS, TLS, and upstream processing; it is not pure API compute.",
        "Geometry is downloaded but not rendered. No map SDK is loaded, so ArcGIS rendering time cannot be quantified.",
        "Decoded bytes are not compressed network transfer bytes.",
        "Plant catalogue details are not loaded.",
        "Two animation frames estimate a frame opportunity, not guaranteed paint completion.",
      ],
    };
    const url = URL.createObjectURL(
      new Blob([JSON.stringify(report, null, 2)], { type: "application/json" }),
    );
    const link = document.createElement("a");
    link.href = url;
    link.download = "wetla-api-lab-report.json";
    link.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  }
  const appliedDescription =
    lab.applied.kind === "locations"
      ? `${lab.applied.province || "All six provinces"}${lab.applied.search ? ` / ${lab.applied.search}` : ""}`
      : lab.applied.kind === "point"
        ? `${lab.applied.longitude}, ${lab.applied.latitude}`
        : "";
  const latestRender = renders.current.at(-1);

  return (
    <div className="min-h-[100dvh]">
      <a
        href="#locations"
        className="sr-only rounded-md bg-white p-3 text-emerald-800 focus:not-sr-only focus:fixed focus:left-4 focus:top-4 focus:z-10"
      >
        Skip to locations
      </a>
      <header className="border-b border-zinc-200 bg-white">
        <div className="mx-auto flex max-w-[1440px] flex-wrap items-center justify-between gap-4 px-4 py-5 sm:px-8">
          <div>
            <h1 className="flex items-center gap-2 text-xl font-semibold tracking-tight">
              <Leaf aria-hidden="true" size={22} className="text-emerald-800" />
              WETLA API lab
            </h1>
            <p className="mt-1 text-sm text-zinc-600">
              Location cards and plant assignments, without the map.
            </p>
          </div>
          <Button variant="outline" onClick={exportReport}>
            <Download aria-hidden="true" size={16} />
            Export report
          </Button>
        </div>
      </header>
      <main className="mx-auto max-w-[1440px] space-y-6 px-4 py-6 sm:px-8">
        <div className="flex flex-wrap gap-x-6 gap-y-2 rounded-md border border-zinc-200 bg-zinc-100 px-4 py-3 text-sm text-zinc-700">
          <span>No map SDK</span>
          <span>No cache or automatic retries</span>
          <span>Geometry off for browsing</span>
        </div>
        <div className="grid min-w-0 grid-cols-1 items-start gap-6 lg:grid-cols-[minmax(0,1.1fr)_minmax(0,1fr)]">
          <Profiler id="location-browser" onRender={onRender}>
            <section
              id="locations"
              aria-labelledby="locations-heading"
              className="min-w-0 rounded-lg border border-zinc-200 bg-white"
            >
              <div className="border-b border-zinc-200 p-4 sm:p-5">
                <h2 id="locations-heading" className="text-lg font-semibold">
                  Location browser
                </h2>
                <p className="mt-1 text-sm text-zinc-600">
                  Each card is one polygon, not one unique district.
                </p>
                <form onSubmit={submitLocations} className="mt-5 space-y-3">
                  <div className="grid grid-cols-1 gap-3 sm:grid-cols-[minmax(0,1fr)_110px]">
                    <div>
                      <label
                        htmlFor="province"
                        className="mb-1.5 block text-sm font-medium"
                      >
                        Province
                      </label>
                      <select
                        id="province"
                        value={province}
                        className={selectClass}
                        onChange={(event) => {
                          setProvince(event.target.value);
                          lab.cancelExperiment();
                        }}
                      >
                        <option value="">All six provinces</option>
                        {PROVINCES.map((value) => (
                          <option key={value} value={value}>
                            {value}
                          </option>
                        ))}
                      </select>
                    </div>
                    <div>
                      <label
                        htmlFor="page-size"
                        className="mb-1.5 block text-sm font-medium"
                      >
                        Page size
                      </label>
                      <select
                        id="page-size"
                        value={limit}
                        className={selectClass}
                        onChange={(event) => {
                          setLimit(Number(event.target.value));
                          lab.cancelExperiment();
                        }}
                      >
                        {[12, 25, 50].map((value) => (
                          <option key={value} value={value}>
                            {value}
                          </option>
                        ))}
                      </select>
                    </div>
                  </div>
                  <div>
                    <label
                      htmlFor="location-search"
                      className="mb-1.5 block text-sm font-medium"
                    >
                      Search district, regency, or province
                    </label>
                    <Input
                      id="location-search"
                      value={search}
                      onChange={(event) => {
                        setSearch(event.target.value);
                        setFormError("");
                        lab.cancelExperiment();
                      }}
                      aria-invalid={!!formError}
                      aria-describedby="search-help search-error"
                      placeholder="For example, Bandung"
                    />
                    <p
                      id="search-help"
                      className="mt-1.5 text-xs text-zinc-600"
                    >
                      Up to 80 characters. No % or _ wildcards. Submit to fetch.
                    </p>
                    <p
                      id="search-error"
                      role={formError ? "alert" : undefined}
                      className="mt-1 text-sm text-red-800"
                    >
                      {formError}
                    </p>
                  </div>
                  <Button type="submit">
                    <Search aria-hidden="true" size={16} />
                    Search locations
                  </Button>
                </form>
                <details className="mt-4 rounded-md border border-zinc-200 px-3 py-2 text-sm">
                  <summary className="font-medium text-zinc-700">
                    Query a coordinate instead
                  </summary>
                  <form onSubmit={submitPoint} className="mt-3 space-y-3">
                    <p className="text-xs text-zinc-600">
                      Historical sample prefilled. Coordinates use longitude,
                      latitude in WGS84.
                    </p>
                    <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                      <div>
                        <label
                          htmlFor="longitude"
                          className="mb-1.5 block font-medium"
                        >
                          Longitude
                        </label>
                        <Input
                          id="longitude"
                          inputMode="decimal"
                          value={longitude}
                          onChange={(event) => {
                            setLongitude(event.target.value);
                            lab.cancelExperiment();
                          }}
                          aria-invalid={!!pointError}
                          aria-describedby="point-error"
                        />
                      </div>
                      <div>
                        <label
                          htmlFor="latitude"
                          className="mb-1.5 block font-medium"
                        >
                          Latitude
                        </label>
                        <Input
                          id="latitude"
                          inputMode="decimal"
                          value={latitude}
                          onChange={(event) => {
                            setLatitude(event.target.value);
                            lab.cancelExperiment();
                          }}
                          aria-invalid={!!pointError}
                          aria-describedby="point-error"
                        />
                      </div>
                    </div>
                    <p
                      id="point-error"
                      role={pointError ? "alert" : undefined}
                      className="text-red-800"
                    >
                      {pointError}
                    </p>
                    <Button type="submit" variant="outline">
                      Query point
                    </Button>
                  </form>
                </details>
              </div>
              <div className="p-4 sm:p-5">
                <p className="mb-3 break-words text-xs text-zinc-600">
                  Applied: {appliedDescription}
                </p>
                <Status
                  state={lab.locations}
                  onCancel={() => lab.cancel("locations")}
                />
                {lab.locations.phase === "success" && !lab.rows.length ? (
                  <p className="mt-4 rounded-md bg-zinc-50 p-4 text-sm text-zinc-600">
                    No location polygons matched. Try another search or
                    province.
                  </p>
                ) : null}
                <div className="mt-4 grid grid-cols-1 gap-3 sm:grid-cols-2">
                  {lab.rows.map((row) => (
                    <LocationCard
                      key={text(row, "objectid")}
                      row={row}
                      selected={
                        !!lab.selected &&
                        text(lab.selected, "objectid") === text(row, "objectid")
                      }
                      onSelect={() => lab.select(row)}
                    />
                  ))}
                </div>
                <div className="mt-5 flex flex-wrap items-center justify-between gap-3 border-t border-zinc-200 pt-4">
                  <Button
                    variant="outline"
                    disabled={
                      !(lab.applied.offset ?? 0) ||
                      lab.locations.phase === "loading"
                    }
                    onClick={() => page(-1)}
                  >
                    Previous
                  </Button>
                  <span className="font-mono text-xs text-zinc-600">
                    Offset {lab.applied.offset ?? 0}
                  </span>
                  <Button
                    variant="outline"
                    disabled={!lab.hasMore || lab.locations.phase === "loading"}
                    onClick={() => page(1)}
                  >
                    Next page
                  </Button>
                </div>
              </div>
            </section>
          </Profiler>
          <Profiler id="plant-recommendations" onRender={onRender}>
            <section
              aria-labelledby="plants-heading"
              className="min-w-0 rounded-lg border border-zinc-200 bg-white"
            >
              <div className="border-b border-zinc-200 p-4 sm:p-5">
                <h2 id="plants-heading" className="text-lg font-semibold">
                  Plant recommendations
                </h2>
                <p className="mt-1 text-sm text-zinc-600">
                  Assignments only. Full plant catalogue details are not loaded.
                </p>
                <fieldset className="mt-4 flex gap-2">
                  <legend className="sr-only">Recommendation method</legend>
                  {(["kba", "lito"] as const).map((value) => (
                    <Button
                      key={value}
                      variant={lab.method === value ? "default" : "outline"}
                      aria-pressed={lab.method === value}
                      onClick={() => lab.changeMethod(value)}
                    >
                      {value === "kba" ? "KBA" : "Lito"}
                    </Button>
                  ))}
                </fieldset>
              </div>
              <div className="p-4 sm:p-5">
                {!lab.selected ? (
                  <div className="rounded-md border border-dashed border-zinc-300 px-5 py-8">
                    <h3 className="font-medium">Select a location card</h3>
                    <p className="mt-2 text-sm leading-relaxed text-zinc-600">
                      The selected polygon’s WETLA identity queries its
                      assignment layer. No recommendations are prefetched.
                    </p>
                  </div>
                ) : (
                  <>
                    <div className="mb-4 rounded-md bg-emerald-50 p-3">
                      <h3 className="font-semibold">
                        {text(lab.selected, "kecamatan") || "Unnamed district"}
                      </h3>
                      <p className="mt-1 text-sm text-zinc-700">
                        {text(lab.selected, "kabupaten_kota")} /{" "}
                        {text(lab.selected, "provinsi")}
                      </p>
                      <p className="mt-2 break-words font-mono text-xs text-emerald-900">
                        Polygon #{text(lab.selected, "objectid")} /{" "}
                        {text(lab.selected, `id_wetla_${lab.method}`) ||
                          "No WETLA identity"}
                      </p>
                    </div>
                    <Status
                      state={lab.plants}
                      onCancel={() => lab.cancel("plants")}
                    />
                    {lab.recommendation && !lab.recommendation.complete ? (
                      <p
                        role="alert"
                        className="mt-3 rounded-md border border-amber-300 bg-amber-50 p-3 text-sm text-amber-900"
                      >
                        Partial results: {lab.recommendation.reason} Do not
                        treat these as the complete recommendation list.
                      </p>
                    ) : null}
                    {lab.recommendation ? (
                      <>
                        <p className="mt-3 text-xs text-zinc-600">
                          {lab.recommendation.rows.length} assignment rows
                          fetched. Grouped by plant name and Latin name; Gradasi
                          1 and 2 only.
                        </p>
                        {!lab.recommendation.plants.length ? (
                          <p className="mt-4 text-sm text-zinc-600">
                            {lab.recommendation.complete
                              ? "No matching Gradasi 1 or 2 plants for this identity."
                              : "No matching plants in the partial pages fetched."}
                          </p>
                        ) : (
                          <ul className="mt-4 space-y-3">
                            {lab.recommendation.plants.map((plant) => (
                              <PlantCard key={plant.id} plant={plant} />
                            ))}
                          </ul>
                        )}
                      </>
                    ) : null}
                    {lab.plants.phase === "error" ||
                    lab.plants.phase === "aborted" ? (
                      <Button
                        variant="outline"
                        className="mt-4"
                        onClick={() => {
                          if (lab.selected) lab.select(lab.selected);
                        }}
                      >
                        Retry selection
                      </Button>
                    ) : null}
                  </>
                )}
              </div>
            </section>
          </Profiler>
        </div>
        <section
          aria-labelledby="timing-heading"
          className="min-w-0 rounded-lg border border-zinc-200 bg-white p-4 sm:p-5"
        >
          <div className="flex flex-wrap items-center justify-between gap-3">
            <h2 id="timing-heading" className="text-lg font-semibold">
              Request diagnostics
            </h2>
            <Button
              variant="outline"
              disabled={
                lab.applied.kind !== "locations" ||
                lab.experiment.phase === "loading" ||
                lab.locations.phase === "loading"
              }
              onClick={() => {
                void lab.compare();
              }}
            >
              <FlaskConical aria-hidden="true" size={16} />
              Compare geometry
            </Button>
          </div>
          <p className="mt-2 max-w-4xl text-sm leading-relaxed text-zinc-600">
            Header wait includes connection, DNS, TLS, and upstream processing.
            It is not pure API compute. Browser request time includes the app
            server and response read. Decoded bytes are not compressed network
            transfer bytes.
          </p>
          <div className="mt-4 flex flex-wrap gap-x-8 gap-y-2 rounded-md bg-zinc-50 p-3 text-xs text-zinc-700">
            <span>
              React Profiler actualDuration (dev-mode):{" "}
              <strong className="font-mono">
                {import.meta.env.DEV
                  ? ms(latestRender?.actualDuration)
                  : "Unavailable in production"}
              </strong>
            </span>
            <span>
              Two-rAF next-frame estimate:{" "}
              <strong className="font-mono">{ms(frameEstimate)}</strong>
            </span>
          </div>
          <p className="mt-2 text-xs text-zinc-600">
            Profiler measures React rendering, not layout or paint. Two-rAF
            estimates a frame opportunity after data commit, not guaranteed
            paint completion.
          </p>
          <div className="mt-4">
            <Status
              state={lab.experiment}
              onCancel={() => lab.cancel("experiment")}
            />
          </div>
          {lab.applied.kind !== "locations" ? (
            <p className="mt-2 text-xs text-zinc-600">
              Apply a province/search query to enable the geometry experiment.
            </p>
          ) : null}
          {lab.comparison ? (
            <div className="mt-3 grid grid-cols-1 gap-3 sm:grid-cols-2">
              <GeometrySummary
                title="Geometry off"
                measurement={lab.comparison.withoutGeometry.measurement}
              />
              <GeometrySummary
                title="Geometry on"
                measurement={lab.comparison.withGeometry.measurement}
              />
            </div>
          ) : null}
          <p className="mt-3 text-xs leading-relaxed text-zinc-600">
            The experiment uses the same applied province, search, offset, and
            limit; geometry off runs first. Geometry is downloaded upstream,
            discarded on the server, and never rendered. Cards stay unchanged.
            Without a map SDK, this lab cannot quantify ArcGIS rendering itself.
          </p>
          <div className="mt-5 overflow-x-auto rounded-md border border-zinc-200">
            <table className="w-full min-w-[960px] text-left text-xs">
              <caption className="px-3 py-3 text-left font-medium text-zinc-700">
                Individual requests ({lab.requests.length}). All requests are
                uncached.
              </caption>
              <thead className="border-y border-zinc-200 bg-zinc-50 text-zinc-600">
                <tr>
                  {[
                    "Request",
                    "Outcome",
                    "Layer",
                    "Header wait",
                    "Download",
                    "Parse",
                    "Upstream total",
                    "Decoded bytes",
                    "Browser read",
                    "Browser parse",
                    "App bytes",
                    "Rows",
                  ].map((label) => (
                    <th
                      key={label}
                      scope="col"
                      className="whitespace-nowrap px-3 py-2 font-medium"
                    >
                      {label}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {lab.requests.map((record, index) => (
                  <tr
                    key={record.id}
                    className="border-b border-zinc-100 align-top"
                  >
                    <td className="max-w-48 px-3 py-3">
                      <details>
                        <summary className="font-medium">
                          {index + 1}. {record.request.kind}
                          {record.request.kind === "locations"
                            ? ` (geometry ${record.request.geometry ? "on" : "off"})`
                            : ""}
                        </summary>
                        <pre className="mt-2 max-w-64 overflow-auto whitespace-pre-wrap break-all font-mono text-[11px]">
                          {JSON.stringify(record.request, null, 2)}
                        </pre>
                        {record.measurement ? (
                          <a
                            className="mt-2 block break-all text-emerald-800 underline"
                            href={record.measurement.url}
                            target="_blank"
                            rel="noreferrer"
                          >
                            Upstream query
                          </a>
                        ) : null}
                        {record.error ? (
                          <p className="mt-2 break-words text-red-800">
                            {record.error}
                          </p>
                        ) : null}
                        {record.measurement ? (
                          <p className="mt-2 break-words text-zinc-600">
                            HTTP {record.measurement.status}; cache{" "}
                            {record.measurement.cache}; encoding{" "}
                            {record.measurement.contentEncoding || "none"}
                            {"; transfer limit "}
                            {String(record.measurement.exceededTransferLimit)}
                          </p>
                        ) : null}
                      </details>
                    </td>
                    <td className="px-3 py-3">{record.outcome}</td>
                    <td className="px-3 py-3 font-mono">
                      {record.measurement?.layer ?? "-"}
                    </td>
                    {record.measurement ? (
                      <>
                        <Metric value={ms(record.measurement.headersMs)} />
                        <Metric value={ms(record.measurement.downloadMs)} />
                        <Metric value={ms(record.measurement.parseMs)} />
                        <Metric value={ms(record.measurement.totalMs)} />
                        <Metric
                          value={bytes(record.measurement.decodedBytes)}
                        />
                        <Metric
                          value={ms(record.measurement.browserRequestMs)}
                        />
                        <Metric value={ms(record.measurement.browserParseMs)} />
                        <Metric
                          value={bytes(record.measurement.responseBytes)}
                        />
                        <Metric value={String(record.measurement.rows)} />
                      </>
                    ) : (
                      <td colSpan={9} className="px-3 py-3 text-zinc-500">
                        No completed response measurement
                      </td>
                    )}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      </main>
      <footer className="mx-auto max-w-[1440px] px-4 pb-6 text-xs text-zinc-600 sm:px-8">
        WETLA six-province dataset. This baseline isolates data retrieval from
        map rendering; recommendations are not an agronomic guarantee.
      </footer>
    </div>
  );
}
function Status({
  state,
  onCancel,
}: {
  state: LoadState;
  onCancel: () => void;
}) {
  if (state.phase === "idle") return null;
  return (
    <div
      className="flex flex-wrap items-center justify-between gap-2"
      aria-busy={state.phase === "loading"}
    >
      <p
        role={state.phase === "error" ? "alert" : "status"}
        className={cn(
          "text-sm",
          state.phase === "error" ? "text-red-800" : "text-zinc-700",
        )}
      >
        {state.message}
      </p>
      {state.phase === "loading" ? (
        <Button variant="ghost" onClick={onCancel}>
          Cancel
        </Button>
      ) : null}
    </div>
  );
}
function LocationCard({
  row,
  selected,
  onSelect,
}: {
  row: Attributes;
  selected: boolean;
  onSelect: () => void;
}) {
  return (
    <button
      type="button"
      aria-pressed={selected}
      onClick={onSelect}
      className={cn(
        "w-full min-w-0 rounded-md border p-3 text-left focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-emerald-700",
        selected
          ? "border-emerald-700 bg-emerald-50"
          : "border-zinc-200 bg-white hover:border-emerald-600 hover:bg-zinc-50",
      )}
    >
      <span className="block break-words font-semibold">
        {text(row, "kecamatan") || "Unnamed district"}
      </span>
      <span className="mt-1 block break-words text-xs leading-relaxed text-zinc-600">
        {text(row, "kabupaten_kota") || "Unknown regency"}
        <br />
        {text(row, "provinsi") || "Unknown province"}
      </span>
      <span className="mt-3 block break-words font-mono text-[11px] text-zinc-700">
        Polygon #{text(row, "objectid")}
        <br />
        KBA {text(row, "kode_wetla_kba") || "-"}
        <br />
        Lito {text(row, "kode_wetla_lito") || "-"}
      </span>
      <span className="mt-3 block text-xs font-medium text-emerald-800">
        {selected ? "Selected polygon" : "View plants"}
      </span>
    </button>
  );
}
function PlantCard({ plant }: { plant: Plant }) {
  return (
    <li className="rounded-md border border-zinc-200 p-3">
      <h3 className="font-semibold">{plant.name || "Unnamed plant"}</h3>
      <p className="mt-0.5 text-sm italic text-zinc-600">
        {plant.latin || "Latin name unavailable"}
      </p>
      <div className="mt-3 flex flex-wrap gap-2">
        {plant.statuses.map((status) => (
          <span
            key={status}
            className="rounded border border-emerald-200 bg-emerald-50 px-2 py-1 text-xs font-medium text-emerald-900"
          >
            {status}
          </span>
        ))}
      </div>
      <dl className="mt-3 grid grid-cols-1 gap-x-4 gap-y-2 text-xs sm:grid-cols-2">
        {[
          ["Climate", plant.climate],
          ["Wetness", plant.wetness],
          ["Elevation", plant.elevation],
          ["Fertility", plant.fertility],
        ].map(([label, value]) => (
          <div key={label}>
            <dt className="text-zinc-500">{label}</dt>
            <dd className="mt-0.5 break-words text-zinc-800">
              {value || "Not provided"}
            </dd>
          </div>
        ))}
      </dl>
    </li>
  );
}
function Metric({ value }: { value: string }) {
  return (
    <td className="whitespace-nowrap px-3 py-3 font-mono tabular-nums">
      {value}
    </td>
  );
}
function GeometrySummary({
  title,
  measurement,
}: {
  title: string;
  measurement: ClientMeasurement;
}) {
  return (
    <div className="rounded-md border border-zinc-200 p-3 text-sm">
      <h3 className="font-semibold">{title}</h3>
      <dl className="mt-2 space-y-1 text-xs">
        <div className="flex justify-between gap-3">
          <dt>Decoded upstream bytes</dt>
          <dd className="font-mono">{bytes(measurement.decodedBytes)}</dd>
        </div>
        <div className="flex justify-between gap-3">
          <dt>Upstream total</dt>
          <dd className="font-mono">{ms(measurement.totalMs)}</dd>
        </div>
        <div className="flex justify-between gap-3">
          <dt>Browser request + read</dt>
          <dd className="font-mono">{ms(measurement.browserRequestMs)}</dd>
        </div>
        <div className="flex justify-between gap-3">
          <dt>Rows</dt>
          <dd className="font-mono">{measurement.rows}</dd>
        </div>
      </dl>
    </div>
  );
}
