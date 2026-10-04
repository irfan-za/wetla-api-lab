# Initial live API findings

Source: `docs/evidence/live-benchmark.json`, generated with direct Node fetch on this machine. No fabricated payloads, no local query cache/retries.

## Verified sample

Longitude107.29700509151542, latitude-7.06424324594125 selected polygon2893: Gununghalu, Bandung Barat, Jawa Barat. KBA WETLA-096 and Litologi WETLA-144 each returned26 raw rows; the correct method's statuses produced11 distinct plant identities. Examples include Kayu Putih Kuning, Janda Merana, Pucuk Merah and Sikat Botol.

## Observed times

- Point request260.77ms (one observation).
- KBA assignment request61.06ms; Litologi102.69ms (one observation each).
- Three attribute queries (Jawa Barat/Gununghalu,12records,offset0): median225.56ms,9225 decoded bytes.
- Three matching geometry queries: median226.88ms,43672 decoded bytes (4.73times attribute payload).
- Query order alternated between the three pairs. Each pair had identical record IDs. No geometry simplification applied in this first experiment.

This small12-record case does not demonstrate a material geometry download delay. It does demonstrate that geometry increases decoded payload. **It does not establish the cause of the existing map's slowdown.**

## Existing code evidence

The original map's loading signal combines sequential50-record GeoJSON pages, assembling the complete result, `GeoJSONLayer.load()`, `whenLayerView()` and waiting for `!layerView.updating`. It cannot distinguish API wait from SDK render. The proxy buffers and validates the upstream JSON, has caching and retries; this app deliberately removes those local effects.

## Access caveat

Curl returnedHTTP403 for the sample query; browser navigation and Node fetch succeeded. This is transport-dependent access behavior observed here, not proof of endpoint downtime, and not evidence of latency. The app uses Node fetch through a fixed-upstream server route.

## Limits and next experiments

- Server-host measurements, not the client's mobile network/device.
- One point/two assignment samples and onlythree pairs of a small query; no population-wide claim.
- Connection reuse and upstream caches remain possible even without app caching.
- Match the exact bounding box, fields, page count, format and simplification of a slow production map request before comparing geometry fairly.
- Capture original ArcGIS import/startup, geometry JSON processing and layer-view settlement separately. Card render time is not a substitute for map render time.
- A full plant catalogue join is intentionally excluded from this baseline; measure its pages independently if it delays production enrichment.
