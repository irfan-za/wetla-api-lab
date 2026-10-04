# Vercel missing-router fix

## Root cause

The initial API-only commit on `main` contained the TanStack Start plugin but did not commit `src/router.tsx`, the root route or the UI imports. Resolving production configuration from a clean archive of that commit reproduced the exact error reported by Vercel:

```text
Error: Could not resolve entry for router entry: router in .../src
```

Adding another SPA rewrite or changing the output directory does not fix missing source files.

## Fix

- Commit the router entry exporting `getRouter()`, route tree, root route, index route and the complete card explorer/client.
- Add the pinned `nitro` dependency and `nitro()` Vite plugin as required by the current Vercel TanStack Start integration.
- Preserve API routes and SSR; existing `vercel.json` already selects `tanstack-start`, pnpm install/build commands and cache headers.
- Ignore generated evidence in the Vite watcher so QA exports/captures do not trigger HMR reloads and invalidate measurements.
- Add CI with the Vercel Nitro preset, production config resolution, tests, lint, full build and typecheck.

## Local verification

- Before: the clean archive of `main` failed with the same missing-router error.
- After: `NITRO_PRESET=vercel node scripts/verify-config.mjs` resolves `client, ssr, nitro` environments.
- `pnpm test`: 26 tests passed.
- `pnpm typecheck` and `pnpm lint`: passed.
- Live local HTTP routes return the Gununghalu point polygon and both method assignment tables.
- Real browser tests verify search, coordinate selection, 11 KBA plants, 11 Litologi plants, geometry comparison, report export, empty/invalid states and state-preserving layouts at 375/768/1024/1440px. Browser errors are checked, not suppressed.

## Remaining deployment gate

No full production build is run on the low-RAM host. Configuration resolution is **not** a full build. CI/Vercel must pass; no deployed preview URL is claimed. Merge the reviewed feature branch into `main` only after that check. Redeploying the old initial `main` commit will keep failing.

Vercel settings: framework TanStack Start, root repository root, build `pnpm build`, install `pnpm install --frozen-lockfile`, Output Directory left at the framework default.

References:
- https://vercel.com/docs/frameworks/full-stack/tanstack-start
- https://v3.nitro.build/deploy/providers/vercel
