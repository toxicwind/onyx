// gen-onyx-readme.mjs — generate onyx's README with marquee's renderReadme.
import { renderReadme } from "./marquee-readme.ts";

const readme = renderReadme({
  name: "onyx",
  repoUrl: "https://github.com/toxicwind/onyx",
  tagline:
    "**onyx** is a browser-session vault that borrows, keeps, and restores full sessions (cookies + per-origin localStorage) across Firefox, the keeper Chromium, and real Chrome — and gets through challenge-gated services (Cloudflare Turnstile) with a cache-friendly, single-flight multi-route coordinator.",
  badges: undefined, // default built from repo/language/license
  demo: undefined,
  installCommand: "bun install",
  example: `import { grabFirefox } from "./src/firefox-grab.js";
const { cookies } = grabFirefox({}); // auto-resolves the live Firefox profile
const gh = cookies.filter((c) => /github/i.test(c.host || c.domain || ""));
console.log("github cookies:", gh.length);`,
  exampleLang: "ts",
  builtWith: {
    "bun:sqlite / node:sqlite": "https://bun.sh/docs/api/sqlite",
    "snappy/lz4": "https://github.com/andris9/snappy",
    "CDP (keeper / real Chrome)": "https://chromedevtools.github.io/devtools-protocol/",
  },
  features: [
    "**cross-platform Firefox grab** — auto-resolves the live profile (Linux default under `~/.mozilla/firefox`, Windows `%APPDATA%\\Mozilla\\Firefox\\Profiles`; override `ONYX_FIREFOX_PROFILE`); snapshot-copies the SQLite DBs so WAL locks never block",
    "**session vault** — grab/restore cookies + per-origin localStorage between Firefox, keeper Chromium (`BROWSER_KEEPER_CDP=127.0.0.1:25154`), and real Chrome",
    "**CF/Turnstile coordinator** (`src/cf-coord.ts`) — multi-route Cloudflare login that passes Turnstile using a real-fingerprint browser",
    "**cache-friendly calling** (tau doctrine) — browser profiles cached so repeated calls reuse warm sessions",
    "**single-flight** — per-profile/port PID lock; never two drivers on the same profile/port; port-bound routes check CDP liveness",
  ],
  roadmap: [
    { done: true, label: "Cross-platform Firefox profile auto-resolution" },
    { done: true, label: "Session vault grab/restore (cookies + localStorage)" },
    { done: true, label: "CF/Turnstile login coordinator (multi-route)" },
    { done: false, label: "Cookies-that-expire rotation + bleed into keeper via CDP", issue: "1" },
  ],
  license: "MIT",
  maintainer: "@toxicwind",
  acknowledgments: {
    "Best-README-Template": "https://github.com/othneildrew/Best-README-Template",
    "awesome-readme": "https://github.com/matiassingers/awesome-readme",
    "wzdnzd/harvester search/client.py": "https://github.com/wzdnzd/harvester",
  },
});

await Bun.write("README.md", readme);
console.log("wrote README.md", readme.length, "bytes");