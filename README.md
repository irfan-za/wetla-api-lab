# WETLA API Lab

A separate TanStack Start diagnostic app for the existing six-province WETLA FeatureServer. No ArcGIS SDK, map canvas, basemap or polygon rendering. The original `web-gis` checkout is not modified.

## Checkpoint status

The initial `main` commit is a **work-in-progress API/scaffold checkpoint**, not a completed browser application. Query helpers and the server adapter are tested; the card UI and its browser/type verification are being completed on `feat/card-explorer`. The UI instructions below describe the intended completed workflow. Do not deploy this checkpoint as a finished application.

## Run

Node >=22.12 and pnpm10.32.1 (see packageManager):

```sh
pnpm install --frozen-lockfile
pnpm dev
# http://localhost:3106
pnpm test
pnpm typecheck
pnpm lint
pnpm benchmark
pnpm test:e2e
```

This machine currently has no `pnpm` launcher on PATH. A task-local pnpm distribution is available at `/home/zah/.hermes/profiles/nova/cache/scratch/pnpm-10.32.1/package/bin/pnpm.cjs`; invoke it with Node, e.g. `node <path> dev`. That scratch copy is not required on another machine with pnpm installed.

## What to test

- Browse a bounded page of **polygon records**, not a unique-district directory. Multiple cards may represent the same district with different polygon/classification IDs.
- Select province, search district/regency/province, explicitly submit. No entire-dataset download or per-keystroke fetching.
- Select a record to request plants by `id_wetla_kba` (layer2) or `id_wetla_lito` (layer1). Keep only the matching method's Gradasi1/2 statuses and group scientific/local identities, retaining source IDs/grades.
- Exact longitude/latitude lookup is attribute-only. A useful live-verified sample is `107.29700509151542, -7.06424324594125` (Gununghalu, Bandung Barat).
- Plant recommendation cards use published assignment names and environmental fields. The full plant catalogue, nursery data and photographs are intentionally not preloaded: this is a latency baseline, not a feature-complete replacement for web-gis.
- Compare geometry queries for the same page/search/filter and record IDs. Raw geometry is downloaded and measured by the server, then omitted from browser responses. This tests upstream payload cost, **not ArcGIS rendering**.

## Endpoint

`GET /api/query`

- `kind=locations&province=Jawa%20Barat&search=Gununghalu&offset=0&limit=12&geometry=0`
- `kind=point&longitude=107.29700509151542&latitude=-7.06424324594125&offset=0`
- `kind=assignments&method=kba&id=WETLA-096&offset=0`

Success: `{rows,hasMore,measurement}`. `hasMore` follows ArcGIS `exceededTransferLimit`, including empty intermediate pages. Errors: non2xx `{error,measurement?}`. Fixed public upstream only; no arbitrary URL proxy. Max50 records/page, 30-second upstream timeout,16MiB decoded response limit. No automatic retries. No credentials required.

## Measurement interpretation

- **Upstream header wait** includes DNS, connection/TLS and server processing. It is **not pure API computation time**.
- **Body read/decode** covers reading the decoded response body and decoding UTF8; **JSON parse** is measured separately.
- **Decoded bytes** are uncompressed body bytes; they are **not network transfer bytes**. Content-Encoding is reported where available.
- **Browser request** includes browser-to-app transport, server handling and response-body read. Do not add it to upstream times; those are nested intervals.
- React profiling/next-frame indicators are local **development-mode estimates**, not map render timings or a production performance score.
- App/browser cache is disabled with no-store. Upstream/proxy infrastructure can still cache; repeated requests may reuse TLS connections. Cold vs warm needs a separate controlled deployment.

## Evidence

`docs/evidence/live-benchmark.json` contains freshly downloaded real point, plant and geometry/attribute results, exact URLs, timings and decoded byte counts. `docs/initial-findings.md` explains the limits.

## Deployment status

Local development artifact only unless a verified deployment URL is documented. `vercel.json` preserves API routes (no catch-all SPA rewrite); Vercel's TanStack Start integration owns SSR routing. On the low-RAM host no production build is run. Validate `pnpm build` in CI/a suitable environment before publishing.

## Scope boundary

Do not infer the existing map's root cause from a small attribute page. Compare matching viewport geometry requests and measure ArcGIS initialization, layer load and layer-view settlement separately in the original app. This baseline makes those follow-up measurements easier to interpret.
