# WETLA API Lab Implementation Plan

> **For Hermes:** Use subagent-driven-development skill to implement this plan task-by-task.

**Goal:** Isolate API/download/parse latency from map SDK rendering using a separate real-data TanStack Start app.
**Architecture:** Attribute-only paginated location cards, explicit search and point lookup, selected-method plant assignments fetched on demand. Fixed-upstream server endpoints expose Server-Timing and byte counts without local caching/retries. A bounded geometry experiment requests exactly the same records/fields with geometry toggled and discards geometry before card rendering.
**Tech Stack:** TanStack Start, strict TypeScript, React 19, Tailwind v4, shadcn-style primitives, pnpm, Biome, Node tests, Playwright.

## Task 1: Query contract
Create src/lib/wetla.ts, tests/wetla.test.ts. One test-first slice at a time: escaping search, province allowlist, bounded paging, coordinate validation, status-filtered joins. Run pnpm test for RED then GREEN.
## Task 2: Instrumented upstream
Create src/lib/upstream.server.ts, src/routes/api.query.ts and tests/upstream.test.ts. Test no-store, ArcGIS HTTP-200 errors, timings, truncation and timeouts at real Response boundaries. Fixed host/layers; no arbitrary proxy.
## Task 3: Card explorer
Create src/components/explorer.tsx and UI primitives. Form-driven search (not keystroke download), province/record count filters, paging, cancel stale work, exact coordinate lookup, selectable cards, on-demand KBA/lito assignments. No map SDK. Expose complete/loading/empty/error states. Cap recommendation paging, never present partial rows as complete.
## Task 4: Measurements
Show upstream header wait (includes DNS/TLS/connection/server processing), body read, JSON parse, decoded bytes, browser request, browser parse, React commit/next-frame estimate with clear caveats. Compare geometry false/true using same page/query/JSON format; no claims about ArcGIS rendering. Export last request/report JSON.
## Task 5: Verification
Run pnpm test, pnpm typecheck, pnpm lint; launch bounded-memory dev server on localhost3106 and verify health. Use Playwright for real API location/plant results, paging/search/coordinates/error states and desktop375/768/1024/1440 layouts. Save actual evidence. Do not run pnpm build on this low-RAM host. Document dev-mode profiling limitations and lack of production deployment.

## Hypotheses
Sequential page latency; polygon payload size; ArcGIS initialization/rendering; upstream/cache/access failures. Each tested independently; no root-cause claim from cards alone.

## Publication
Local project first; GitHub private repo/PR and Vercel preview require available repo authorization. Existing web-gis remains read-only.
