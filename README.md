# onyx

> The estate's **browser-session vault** — borrow, keep, and restore full
> sessions (cookies + per-origin localStorage) across browsers, and get into
> challenge-gated services (Cloudflare Turnstile logins) with a
> cache-friendly, single-flight multi-route coordinator.

**onyx** = the banded black gemstone, historically carved into **signet/seal
stones** — the token of identity and persistent authentication. Fits the geode
mineral theme: this product IS the estate's session seal.

Merged 2026-11-03 from three predecessors (retired):
- **cookie-vault** (ranch `@estate/cookie-vault`, toxicwind/cookie-vault)
- **cf-borrow** (scratch `/home/toxic/cf-borrow`)
- **borrowed** (ranch vendor-staging dir `products/borrowed`)

## What it does

1. **Session vault** — full-session grab/restore between the live Firefox
   profile, the keeper Chromium (`BROWSER_KEEPER_CDP=127.0.0.1:25154`,
   ports.env SSOT), and real Google Chrome:
   - `src/firefox-grab.js` — pull cookies + localStorage from Firefox
   - `src/keeper-cdp.js` — apply/read session state on the keeper via CDP
   - `src/vault.js` + `src/snappy.js` — serialization + compression
   - `bin/cookie-vault.js` — CLI (grab / restore / auto-sync)
2. **CF/Turnstile login coordinator** (`src/cf-coord.ts`) — multi-route Cloudflare
   dashboard login that passes Turnstile by using a real-fingerprint browser:
   - routes: `nd` real Chrome (CDP :9226, automation-disabled), `ff` Playwright
     Firefox persistent on :99, `cw` patched-Chromium persistent
   - **cache-friendly calling** (tau github-cache doctrine): browser profiles
     ARE the cache; validated sessions are cache HITs; soft/hard TTL session
     markers; route affinity (last winner first)
   - **single-flight**: per-profile/port PID lock — never two drivers on the
     same profile/port at once; port-bound routes check CDP liveness
   - nodriver (python) scripts `cf-nodriver.py` / `cf-nd-min.py` kept for the
     real-Chrome CDP path

## Cache doctrine (borrowed from tau)

| Concept | tau source | onyx mapping |
| --- | --- | --- |
| Soft/hard TTL ladder | `github-cache.ts` `resolveCacheTtl` | session marker `{at, exp}` |
| Single-flight refreshes | `inflightRefreshes` Set | per-profile `.driver.lock` PID files |
| Degrade-to-miss | cache failures never block | lock/profile failures → fresh launch |
| Route affinity | — | `.last-winner` in `~/.cf-borrow/profiles` |

## Run

```sh
bun bin/cookie-vault.js --help        # vault CLI
bun src/cf-coord.ts                   # try routes until signed in
bun src/cf-coord.ts --validate        # cache-only check, no challenge
bun src/cf-coord.ts --force           # fresh challenge on best route
```

## Secrecy

Credentials are loaded from env (`CF_2FA_CODE`) or the repo-local files they
were merged from; SSOT rule stands — never commit secrets. Profiles live under
`/tmp/cf-profiles/` (ephemeral by design).

## AGENTS.md

See `AGENTS.md` for the vault/borrow contract.