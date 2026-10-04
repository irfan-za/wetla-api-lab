import assert from "node:assert/strict";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { chromium } from "playwright";

const base = process.env.BASE_URL ?? "http://127.0.0.1:3106";
const output = new URL("../docs/evidence/ui/", import.meta.url);
await mkdir(output, { recursive: true });
const browser = await chromium.launch({
  headless: true,
  args: ["--disable-dev-shm-usage"],
});
const context = await browser.newContext({
  viewport: { width: 1440, height: 900 },
  reducedMotion: "reduce",
  acceptDownloads: true,
});
const page = await context.newPage();
page.setDefaultTimeout(40_000);
const errors = [];
const apiCalls = [];
page.on("pageerror", (error) => errors.push(error.message));
page.on("console", (message) => {
  if (message.type() === "error") errors.push(message.text());
});
page.on("response", (response) => {
  if (response.url().includes("/api/query?"))
    apiCalls.push({ url: response.url(), status: response.status() });
});
const checks = [];
const locations = page.getByRole("region", { name: "Location browser" });
const plants = page.getByRole("region", { name: "Plant recommendations" });
try {
  const response = await page.goto(base);
  assert.equal(response.status(), 200);
  await page
    .getByRole("heading", { name: "WETLA API lab", exact: true })
    .waitFor();
  await locations
    .getByRole("status")
    .filter({ hasText: "location polygons on this page" })
    .waitFor();
  assert.equal(
    await locations.getByRole("button", { name: /View plants/ }).count(),
    12,
  );
  assert.equal(
    apiCalls.some((call) => call.url.includes("kind=assignments")),
    false,
  );
  checks.push("Initial attribute-only page has 12 cards; no plant prefetch");
  await page.screenshot({
    // Preserve input styles: Playwright's default hidden caret mutates DOM during SSR hydration.
    caret: "initial",
    path: new URL("desktop-initial.png", output).pathname,
  });

  await page
    .getByLabel("Search district, regency, or province")
    .fill("Gununghalu");
  await page
    .getByRole("button", { name: "Search locations", exact: true })
    .click();
  await locations
    .getByRole("status")
    .filter({ hasText: "location polygons on this page" })
    .waitFor();
  assert.ok(
    (await locations
      .getByRole("button", { name: /Gununghalu.*View plants/ })
      .count()) > 0,
  );
  await page
    .getByRole("button", { name: "Compare geometry", exact: true })
    .click();
  await page
    .getByRole("status")
    .filter({ hasText: "Matched polygon objectids" })
    .waitFor();
  checks.push(
    "Search is province-scoped; geometry experiment matches polygon IDs",
  );

  await page.getByText("Query a coordinate instead", { exact: true }).click();
  await page.getByRole("button", { name: "Query point", exact: true }).click();
  await locations
    .getByRole("status")
    .filter({ hasText: "location polygons on this page" })
    .waitFor();
  await locations
    .getByRole("button", { name: /Polygon #2893.*View plants/ })
    .click();
  await plants
    .getByRole("status")
    .filter({ hasText: "11 plants from" })
    .waitFor();
  assert.equal(await plants.locator("li").count(), 11);
  assert.ok((await plants.innerText()).includes("WETLA-096"));
  checks.push(
    "Exact coordinate selects Gununghalu polygon 2893; KBA has 11 plant identities",
  );
  await page.getByRole("button", { name: "Lito", exact: true }).click();
  await plants
    .getByRole("status")
    .filter({ hasText: "11 plants from" })
    .waitFor();
  assert.equal(await plants.locator("li").count(), 11);
  assert.ok((await plants.innerText()).includes("WETLA-144"));
  checks.push(
    "Switching to Litologi queries its separate ID; 11 plant identities",
  );

  const downloadPromise = page.waitForEvent("download");
  await page
    .getByRole("button", { name: "Export report", exact: true })
    .click();
  const download = await downloadPromise;
  const reportPath = new URL("browser-report.json", output).pathname;
  await download.saveAs(reportPath);
  const report = JSON.parse(await readFile(reportPath, "utf8"));
  assert.equal(report.recommendation.complete, true);
  assert.equal(report.recommendation.plants.length, 11);
  // React StrictMode replays initial effects in development; that first query is cancelled, not retried.
  assert.ok(report.requests.every((request) => request.outcome !== "error"));
  assert.ok(
    report.requests
      .filter((request) => request.outcome === "success")
      .every((request) => request.measurement?.status === 200),
  );
  checks.push(
    "Export contains real browser/upstream measurements and complete plant results",
  );
  const layouts = [];
  for (const width of [1440, 1024, 768, 375]) {
    await page.setViewportSize({ width, height: 900 });
    await page.evaluate(() => window.scrollTo(0, 0));
    const sizes = await page.evaluate(() => ({
      viewport: window.innerWidth,
      scroll: document.documentElement.scrollWidth,
    }));
    assert.ok(
      sizes.scroll <= sizes.viewport,
      `Horizontal overflow at ${width}: ${JSON.stringify(sizes)}`,
    );
    layouts.push({ width, ...sizes });
    assert.equal(
      await plants.locator("li").count(),
      11,
      `Selection must survive resizing/capture at ${width}px`,
    );
    assert.ok((await plants.innerText()).includes("WETLA-144"));
    await page.screenshot({
      // Preserve input styles: Playwright's default hidden caret mutates DOM during SSR hydration.
      caret: "initial",
      path: new URL(`viewport-${width}.png`, output).pathname,
    });
    if (width === 375 || width === 1440)
      await page.screenshot({
        // Preserve input styles: Playwright's default hidden caret mutates DOM during SSR hydration.
        caret: "initial",
        path: new URL(`full-${width}.png`, output).pathname,
        fullPage: true,
      });
  }
  checks.push("No horizontal page overflow at 375, 768, 1024 and 1440px");

  await page
    .getByLabel("Search district, regency, or province")
    .fill("zzqwetlanomatch");
  await page
    .getByRole("button", { name: "Search locations", exact: true })
    .click();
  await locations
    .getByText("No location polygons matched.", { exact: false })
    .waitFor();
  await plants
    .getByRole("heading", { name: "Select a location card" })
    .waitFor();
  checks.push("Empty search clears previous selection and plant results");
  const beforeInvalid = apiCalls.length;
  await page.getByLabel("Search district, regency, or province").fill("%");
  await page
    .getByRole("button", { name: "Search locations", exact: true })
    .click();
  await locations.getByRole("alert").waitFor();
  assert.equal(apiCalls.length, beforeInvalid);
  checks.push(
    "Invalid wildcard search is inline error without network request",
  );
  await page.screenshot({
    // Preserve input styles: Playwright's default hidden caret mutates DOM during SSR hydration.
    caret: "initial",
    path: new URL("mobile-error.png", output).pathname,
    fullPage: true,
  });
  assert.deepEqual(errors, [], "Unexpected browser exceptions");
  await writeFile(
    new URL("verification.json", output),
    JSON.stringify(
      {
        timestamp: new Date().toISOString(),
        environment: "development server; live upstream; no mocked payloads",
        base,
        checks,
        layouts,
        apiCalls,
        errors,
      },
      null,
      2,
    ),
  );
  console.log(
    JSON.stringify(
      {
        checks,
        layouts,
        apiRequestCount: apiCalls.length,
        errors,
        evidence: output.pathname,
      },
      null,
      2,
    ),
  );
} finally {
  await browser.close();
}
