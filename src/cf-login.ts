/**
 * cf-login.ts — persistent Firefox (good Turnstile score) CF dashboard login.
 *
 * Borrows the trawl pattern: a real fingerprint browser (Firefox on a real
 * X display, persistent profile) scores well with Cloudflare's Turnstile, so
 * the login flow auto-passes the challenge instead of churning like automated
 * Chromium. Launches Firefox via Playwright on DISPLAY :99, fills the login,
 * watches for the email-MFA code field, and (once a code is provided) submits.
 *
 * Run: bun cf-login.ts
 */
import { firefox } from "playwright";

const EMAIL = "toxicwind@gmail.com";
const PASSWORD = "7CMHA^EStPdBa3";
const CODE = process.env.CF_2FA_CODE || ""; // email-MFA 7-digit code, if available

async function main() {
  const ctx = await firefox.launchPersistentContext("/tmp/cf-login-profile", {
    headless: false,
    viewport: { width: 1440, height: 900 },
    locale: "en-US",
    timezoneId: "America/New_York",
    env: { DISPLAY: ":99" },
  });
  const page = ctx.pages()[0] ?? (await ctx.newPage());
  console.log("[cf-login] firefox launched, -> dash.cloudflare.com/login");

  await page.goto("https://dash.cloudflare.com/login", { waitUntil: "domcontentloaded" });
  await page.waitForTimeout(3000);

  // Fill the form (React-controlled inputs respond to real typing / fill)
  await page.fill("#email", EMAIL);
  await page.fill("#password", PASSWORD);
  await page.waitForTimeout(1000);

  // Click Sign in
  await page.evaluate(() => {
    const b = [...document.querySelectorAll("button")].find(x => x.textContent.trim() === "Sign in");
    b?.click();
  });
  console.log("[cf-login] submitted credentials");

  // Watch for either the email-MFA code field or a captcha error
  for (let i = 0; i < 20; i++) {
    await page.waitForTimeout(1000);
    const state = await page.evaluate(() => {
      const inputs = [...document.querySelectorAll("input")].map(i => ({
        id: i.id || "", name: i.name || "", type: i.type,
        mx: i.maxLength, auto: i.autocomplete || "",
      }));
      const codeField = inputs.find(i =>
        /code|token|verif|otp|digit/i.test(i.id + " " + i.name) &&
        !/email|password|security|redirect|sso|sig|cf_/.test(i.id + " " + i.name)
      );
      const turnstile = !!document.querySelector('iframe[src*="turnstile"], [class*="turnstile"]');
      const err = document.body.innerText.match(/problem with verification|Incorrect[^.]*|Wrong password[^.]*/i)?.[0] || "";
      return { url: location.href.substring(0, 70), codeField: codeField?.id || codeField?.name || "", turnstile, err };
    });
    if (state.codeField && CODE) {
      console.log("[cf-login] email-MFA code field found:", state.codeField, "-> submitting", CODE);
      await page.fill(`input[name="${state.codeField}"]`, CODE).catch(() =>
        page.fill(`#${state.codeField}`, CODE).catch(() => {}));
      await page.evaluate(() => {
        const b = [...document.querySelectorAll("button")].find(x => /verify|continue|submit/i.test(x.textContent));
        b?.click();
      });
      console.log("[cf-login] code submitted");
      await page.waitForTimeout(6000);
      console.log("[cf-login] final url:", page.url());
      break;
    }
    if (state.codeField && !CODE) {
      console.log("[cf-login] email-MFA code field present. Set CF_2FA_CODE to submit it. State:", JSON.stringify(state));
    }
    if (i % 4 === 0) console.log("[cf-login] poll", i, JSON.stringify(state));
  }

  // Keep alive long enough to inspect; caller closes.
  await ctx.close();
}

main().catch(e => { console.error("[cf-login] ERR:", e.message); process.exit(1); });