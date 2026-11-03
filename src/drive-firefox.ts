// Connect to the running Firefox BiDi (good-risk browser) and drive the CF login.
// Borrowed pattern: trawl uses a real Fingerprint-browser so Turnstile auto-solves.
import { chromium } from "playwright";

// Firefox BiDi has no chromium.connectOverCDP; use the generic CDP-less connect via
// connectOverCDP isn't supported. Playwright firefox.connect() is for WS BiDi in newer versions.
// For a locally-launched Firefox instance we normally use firefox.launch. Instead, we connect
// over CDP-compatible: Playwright's connect() expects a Playwright server. So launch fresh
// via Playwright with firefox channel + a real profile to get a good risk score.

// Simplest wheel-borrow that works: launch Playwright's own Firefox with automation-STEALTH.
// But that still triggers Turnstile. The KEY borrowed insight is a REAL profile + fingerprint.

// Use Playwright to attach to the ALREADY-RUNNING Firefox via CDP endpoint if any.
// Firefox uses WebDriver BiDi on :9225; Playwright 1.64 can launch its own firefox.
// We'll launch a Playwright-managed firefox with a persistent real-looking profile.

import { firefox as pwFirefox } from "playwright";

async function main() {
  // Launch Firefox with a persistent context (real-ish profile) on the visible display
  const ctx = await pwFirefox.launchPersistentContext("/tmp/cf-real-profile", {
    headless: false,
    channel: undefined, // use bundled firefox (we have firefox-1555)
    viewport: { width: 1440, height: 900 },
    locale: "en-US",
    timezoneId: "America/New_York",
    args: ["--window-position=0,0"],
  });
  const page = ctx.pages()[0] ?? await ctx.newPage();
  console.log("firefox launched, going to dash.cloudflare.com");
  await page.goto("https://dash.cloudflare.com/login", { waitUntil: "domcontentloaded" });
  await page.waitForTimeout(2000);

  // Check state: is the login form ready?
  const hasEmail = await page.locator("#email").count();
  console.log("has email field:", hasEmail > 0);
  console.log("url:", page.url());

  await ctx.close();
}

main().catch(e => { console.error("ERR:", e.message); process.exit(1); });