
import { firefox as pwFirefox } from "playwright";

async function main() {
  const ctx = await pwFirefox.launchPersistentContext("/tmp/cf-real-profile", {
    headless: false,
    viewport: { width: 1440, height: 900 },
    locale: "en-US",
    timezoneId: "America/New_York",
  });
  const page = ctx.pages()[0] ?? await ctx.newPage();
  console.log("firefox launched, going to dash.cloudflare.com", "PID:", ctx.browser()?.browserType().name?.());
  await page.goto("https://dash.cloudflare.com/login", { waitUntil: "domcontentloaded" });
  await page.waitForTimeout(2000);
  const hasEmail = await page.locator("#email").count();
  const hasTurnstile = await page.locator('iframe[src*="turnstile"], [class*="turnstile"]').count();
  console.log("has email:", hasEmail>0, "| hasTurnstile:", hasTurnstile>0, "| url:", page.url());
  await ctx.close();
}
main().catch(e => { console.error("ERR:", e.message); });
