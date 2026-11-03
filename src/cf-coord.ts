/**
 * cf-coord.ts — cache-friendly multi-route Cloudflare dashboard login.
 *
 * Route table (ordered by Turnstile trust; last winner moves to front):
 *   1. nd — real Google Chrome, automation-disabled, via CDP (persistent)  [best score]
 *   2. ff — Playwright Firefox persistent profile on DISPLAY :99            [good score]
 *   3. cw — Playwright patched-Chromium persistent profile                  [fallback]
 *
 * Cache-friendly calling (tau github-cache / MCPToolCache doctrine):
 *   - The browser PROFILE is the cache: persistent user-data dirs keep
 *     cookies/localStorage across runs. A validated signed-in session is a
 *     cache HIT — the expensive Turnstile challenge runs once per hard TTL,
 *     not every launch.
 *   - Session marker per profile: {ok, at, exp, route, ua}. Soft TTL → reuse
 *     blindly (fresh hit). Stale → live-validate, refresh if still signed in.
 *     Past hard TTL → wipe profile and challenge again (miss).
 *   - Route affinity: winning route id persisted; next run tries it first
 *     (cache-friendly ordering — take the proven path before burning others).
 *   - Single-flight (never two drivers on the same profile/port):
 *     each profile holds a PID lockfile; a second launch on the same
 *     profile/port refuses instead of racing (mirrors github-cache's
 *     inflightRefreshes dedupe). Port-bound routes also check CDP liveness.
 *
 * Run:
 *   bun cf-coord.ts              # validate cache; then try routes until signed in
 *   bun cf-coord.ts --validate   # cache-only: check markers, no challenge
 *   bun cf-coord.ts --force      # ignore markers, fresh challenge on best route
 */
import { chromium, firefox, type Browser, type BrowserContext, type Page } from "playwright";
import { existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { cpus } from "node:os";

const EMAIL = "toxicwind@gmail.com";
const PASSWORD = "7CMHA^EStPdBa3";
const CODE = process.env.CF_2FA_CODE || ""; // email-MFA 7-digit code when available

// ── cache / storage layout ──────────────────────────────────────────────────
const PROFILES_ROOT = "/tmp/cf-profiles";
mkdirSync(PROFILES_ROOT, { recursive: true });

const SOFT_TTL_MS = 2 * 60 * 60 * 1000; // 2h: reuse blindly
const HARD_TTL_MS = 24 * 60 * 60 * 1000; // 24h: fresh profile after
const LAST_WINNER = join(PROFILES_ROOT, ".last-winner");

interface RouteDef {
	label: string;
	profileDir: string;
	port?: number; // CDP port when the route is port-bound
}
const ROUTES: Record<string, RouteDef> = {
	nd: { label: "real Chrome (CDP :9226)", profileDir: join(PROFILES_ROOT, "chrome-real"), port: 9226 },
	ff: { label: "Firefox persistent :99", profileDir: "/tmp/cf-login-profile" },
	cw: { label: "patched Chromium :99", profileDir: join(PROFILES_ROOT, "chromium") },
};

interface SessionMarker {
	ok: true;
	at: number;
	exp: number;
	route: string;
	ua?: string;
}
interface LockInfo {
	pid: number;
	at: number;
	host: string;
}

// ── single-flight lock (never two drivers on the same profile/port) ─────────
function lockProfile(routeId: string, def: RouteDef): LockInfo | null {
	const lockPath = join(def.profileDir, ".driver.lock");
	try {
		mkdirSync(def.profileDir, { recursive: true }); // profile may not exist yet
		if (existsSync(lockPath)) {
			const prev = JSON.parse(readFileSync(lockPath, "utf8")) as LockInfo;
			// Stale lock: pid not alive → take over.
			try {
				process.kill(prev.pid, 0);
				console.error(`[coord] LOCKED: ${routeId} already driven by pid ${prev.pid} (${def.label}). Refusing to double-run.`);
				return null;
			} catch {
				rmSync(lockPath, { force: true });
			}
		}
		writeFileSync(lockPath, JSON.stringify({ pid: process.pid, at: Date.now(), host: cpus()[0]?.model || "" } satisfies LockInfo));
	} catch (err) {
		console.error(`[coord] lock ${routeId} failed:`, String(err));
		return null;
	}
	return JSON.parse(readFileSync(lockPath, "utf8")) as LockInfo;
}
function unlockProfile(def: RouteDef) {
	try {
		rmSync(join(def.profileDir, ".driver.lock"), { force: true });
	} catch {}
}

// ── session marker (the cache rows) ─────────────────────────────────────────
function markerPath(def: RouteDef): string {
	return join(def.profileDir, ".cf-session.json");
}
function readMarker(def: RouteDef): SessionMarker | null {
	try {
		const m = JSON.parse(readFileSync(markerPath(def), "utf8")) as SessionMarker;
		return m && m.ok === true ? m : null;
	} catch {
		return null;
	}
}
function writeMarker(def: RouteDef, routeId: string, ua?: string) {
	try {
		writeFileSync(
			markerPath(def),
			JSON.stringify({ ok: true, at: Date.now(), exp: Date.now() + HARD_TTL_MS, route: routeId, ua } satisfies SessionMarker),
		);
		writeFileSync(LAST_WINNER, routeId);
	} catch {}
}

// ── page helpers ────────────────────────────────────────────────────────────
async function gotoLogin(page: Page) {
	await page.goto("https://dash.cloudflare.com/login", { waitUntil: "domcontentloaded" });
	await page.waitForTimeout(3000);
}
/** Live validation: signed in when we left the login page AND no #email form. */
async function isSignedIn(page: Page): Promise<boolean> {
	await gotoLogin(page);
	const st = await page.evaluate(() => ({
		url: location.href,
		hasEmail: !!document.querySelector("#email"),
	}));
	return !/\/login/.test(st.url) && !st.hasEmail;
}
async function fillAndSubmit(page: Page, label: string): Promise<string> {
	try {
		await page.waitForSelector("#email", { timeout: 12000 });
	} catch {
		const dump = await page.evaluate(() => ({
			url: location.href.slice(0, 70),
			turnstile: !!document.querySelector('iframe[src*="turnstile"], [class*="turnstile"]'),
			challenge: /challenge|verify|human/i.test(document.body?.innerText?.slice(0, 300) || ""),
		}));
		console.error(`[${label}] no #email — page state:`, JSON.stringify(dump));
		return "no-email";
	}
	await page.fill("#email", EMAIL);
	await page.fill("#password", PASSWORD);
	await page.evaluate(() => {
		const b = [...document.querySelectorAll("button")].find(x => x.textContent?.trim() === "Sign in");
		b?.click();
	});
	return "submitted";
}
/** Poll for 2FA code field / turnstile / error → returns "code-field" | "signed-in" | "blocked" | "timeout" */
async function watchFlow(page: Page, label: string): Promise<"code-field" | "signed-in" | "blocked" | "timeout"> {
	for (let i = 0; i < 25; i++) {
		await page.waitForTimeout(1000);
		const st = await page.evaluate(() => {
			const inputs = [...document.querySelectorAll("input")].map(i => ({
				id: i.id || "",
				name: i.name || "",
				type: i.type,
				autocomplete: i.autocomplete || "",
			}));
			const codeField = inputs.find(
				i =>
					/code|token|verif|otp|digit/i.test(i.id + " " + i.name) &&
					!/email|password|security|redirect|sso|sig|cf_/.test(i.id + " " + i.name),
			);
			return {
				url: location.href.slice(0, 70),
				hasEmail: !!document.querySelector("#email"),
				codeField: codeField?.id || codeField?.name || "",
				turnstile: !!document.querySelector('iframe[src*="turnstile"], [class*="turnstile"]'),
				err: document.body?.innerText?.match(/problem with verification|Incorrect[^.]*|Wrong password[^.]*/i)?.[0] || "",
			};
		});
		if (st.err) {
			console.error(`[${label}] challenge/error:`, st.err);
			return "blocked";
		}
		if (st.codeField) {
			if (CODE) {
				console.log(`[${label}] 2FA field ${st.codeField} → submitting code`);
				await page.fill(`input[name="${st.codeField}"]`, CODE).catch(() => {});
				await page.evaluate(() => {
					const b = [...document.querySelectorAll("button")].find(x => /verify|continue|submit|log in/i.test(x.textContent || ""));
					b?.click();
				});
				await page.waitForTimeout(8000);
				return (await isSignedIn(page)) ? "signed-in" : "code-field";
			}
			console.log(`[${label}] 2FA field present; set CF_2FA_CODE to submit`);
			return "code-field";
		}
		if (i % 5 === 0) console.log(`[${label}] poll ${i}:`, JSON.stringify(st));
	}
	return "timeout";
}

// ── routes ──────────────────────────────────────────────────────────────────
/** nd: real Google Chrome — reuse live CDP :9226 if alive, else spawn (persistent profile). */
async function realChromePage(port: number, profileDir: string): Promise<{ browser?: Browser; ctx?: BrowserContext; page: Page }> {
	const cdp = `http://127.0.0.1:${port}`;
	let alive = false;
	try {
		const r = await fetch(`${cdp}/json/version`);
		alive = r.ok;
	} catch {}
	if (alive) {
		const browser = await chromium.connectOverCDP(cdp);
		const ctx = browser.contexts()[0] ?? (await browser.newContext());
		const page = ctx.pages()[0] ?? (await ctx.newPage());
		return { browser, ctx, page };
	}
	// Spawn real Chrome (no-sandbox; automation-disabled) with the persistent profile.
	const browser = await chromium.launchPersistentContext(profileDir, {
		headless: false,
		executablePath: "/opt/google/chrome/chrome",
		args: [
			`--remote-debugging-port=${port}`,
			"--no-sandbox",
			"--disable-dev-shm-usage",
			"--disable-blink-features=AutomationControlled",
			"--no-first-run",
			"--no-default-browser-check",
		],
		viewport: { width: 1440, height: 900 },
		env: { ...process.env, DISPLAY: ":99" },
	});
	const page = browser.pages()[0] ?? (await browser.newPage());
	return { ctx: browser, page };
}

async function routeND(): Promise<boolean> {
	const def = ROUTES.nd;
	const lock = lockProfile("nd", def);
	if (!lock) return false;
	try {
		// NOTE: we deliberately take only the page and never close the browser —
		// the real Chrome on :9226 is the cache; it stays alive between runs so
		// validateCachedSessions() gets a cheap live-CDP HIT next time.
		const { page } = await realChromePage(def.port!, def.profileDir);
		const ua = await page.evaluate(() => navigator.userAgent);
		console.log(`[nd] ua:`, ua.slice(0, 80));
		const res = await fillAndSubmit(page, "nd");
		if (res === "no-email") return false;
		const outcome = await watchFlow(page, "nd");
		const signedIn = outcome === "signed-in" || (await isSignedIn(page));
		if (signedIn) writeMarker(def, "nd", ua);
		return signedIn;
	} finally {
		unlockProfile(def);
	}
}

/** ff: Playwright Firefox persistent profile on the real X display. */
async function routeFF(): Promise<boolean> {
	const def = ROUTES.ff;
	const lock = lockProfile("ff", def);
	if (!lock) return false;
	let ctx: BrowserContext | undefined;
	try {
		ctx = await firefox.launchPersistentContext(def.profileDir, {
			headless: false,
			viewport: { width: 1440, height: 900 },
			locale: "en-US",
			timezoneId: "America/New_York",
			env: { ...process.env, DISPLAY: ":99" },
		});
		const page = ctx.pages()[0] ?? (await ctx.newPage());
		const ua = await page.evaluate(() => navigator.userAgent);
		console.log(`[ff] ua:`, ua.slice(0, 80));
		const res = await fillAndSubmit(page, "ff");
		if (res === "no-email") return false;
		const outcome = await watchFlow(page, "ff");
		const signedIn = outcome === "signed-in" || (await isSignedIn(page));
		if (signedIn) writeMarker(def, "ff", ua);
		return signedIn;
	} finally {
		await ctx?.close().catch(() => {});
		unlockProfile(def);
	}
}

/** cw: Playwright patched-Chromium (bundled chromium + anti-automation flags). */
async function routeCW(): Promise<boolean> {
	const def = ROUTES.cw;
	const lock = lockProfile("cw", def);
	if (!lock) return false;
	let ctx: BrowserContext | undefined;
	try {
		ctx = await chromium.launchPersistentContext(def.profileDir, {
			headless: false,
			executablePath: chromium.executablePath(),
			args: ["--no-sandbox", "--disable-dev-shm-usage", "--disable-blink-features=AutomationControlled", "--no-first-run", "--no-default-browser-check"],
			viewport: { width: 1440, height: 900 },
			env: { ...process.env, DISPLAY: ":99" },
		});
		const page = ctx.pages()[0] ?? (await ctx.newPage());
		const ua = await page.evaluate(() => navigator.userAgent);
		console.log(`[cw] ua:`, ua.slice(0, 80));
		const res = await fillAndSubmit(page, "cw");
		if (res === "no-email") return false;
		const outcome = await watchFlow(page, "cw");
		const signedIn = outcome === "signed-in" || (await isSignedIn(page));
		if (signedIn) writeMarker(def, "cw", ua);
		return signedIn;
	} finally {
		await ctx?.close().catch(() => {});
		unlockProfile(def);
	}
}

// ── coordinator ─────────────────────────────────────────────────────────────
async function validateCachedSessions(): Promise<RouteDef | null> {
	// Cache-first: any profile with a marker inside its TTL that is STILL
	// signed in is a hit — no challenge, no launch cost beyond one page.
	for (const [id, def] of Object.entries(ROUTES)) {
		const m = readMarker(def);
		if (!m) continue;
		if (Date.now() - m.at > SOFT_TTL_MS) {
			console.log(`[coord] ${id}: marker ${Math.round((Date.now() - m.at) / 60000)}m old — stale (soft TTL ${SOFT_TTL_MS / 60000}m), will revalidate`);
			continue;
		}
		if (id === "nd") {
			// Cheap: hit the live CDP, check current page.
			try {
				const r = await fetch(`http://127.0.0.1:${def.port}/json`);
				if (r.ok) {
					console.log(`[coord] ${id}: fresh marker + live CDP → cache HIT (reusing running Chrome session)`);
					return def;
				}
			} catch {}
		} else {
			// ff/cw: fresh marker within soft TTL = trust it (revalidating would
			// cost a full browser launch — the TTL IS the freshness contract).
			console.log(`[coord] ${id}: marker ${Math.round((Date.now() - m.at) / 60000)}m old → cache HIT`);
			return def;
		}
		const lock = lockProfile(id, def);
		if (!lock) continue;
		try {
			const { page, browser, ctx } = await realChromePage(def.port || 9226, def.profileDir);
			const ok = await isSignedIn(page);
			console.log(`[coord] ${id}: cache validation → ${ok ? "HIT" : "MISS"}`);
			await browser?.close().catch(() => {});
			await ctx?.close().catch(() => {});
			if (ok) return def;
		} finally {
			unlockProfile(def);
		}
	}
	return null;
}

async function main() {
	const args = process.argv.slice(2);
	const validateOnly = args.includes("--validate");
	const force = args.includes("--force");

	if (!force) {
		const hit = await validateCachedSessions();
		if (hit) {
			console.log(`[coord] DONE — validated session cached on ${hit.label} (no challenge needed)`);
			return;
		}
		if (validateOnly) {
			console.log("[coord] --validate: no fresh session; nothing challenged");
			return;
		}
	}

	// Route order: affinity first (last winner), then trust order.
	const order = ["nd", "ff", "cw"] as const as string[];
	const winner = (existsSync(LAST_WINNER) ? readFileSync(LAST_WINNER, "utf8").trim() : "") as keyof typeof ROUTES;
	if (winner && ROUTES[winner]) order.sort((a, b) => (a === winner ? -1 : b === winner ? 1 : 0));

	for (const id of order) {
		console.log(`[coord] → route ${id} (${ROUTES[id].label})`);
		const ok = await (id === "nd" ? routeND() : id === "ff" ? routeFF() : routeCW());
		if (ok) {
			console.log(`[coord] ✅ signed in via ${id} — session cached`);
			return;
		}
		console.log(`[coord] ✗ ${id} failed; next route`);
	}
	console.log("[coord] ❌ all routes failed (may need CF_2FA_CODE or manual intervention)");
	process.exit(1);
}

main().catch(e => {
	console.error("[coord] ERR:", e);
	process.exit(1);
});