# onyx AGENTS.md — the browser-session vault contract

Refines `/home/toxic/AGENTS.md` for this product; never contradicts it.

## What this product owns
- Full-session (cookies + per-origin localStorage) grab/restore between the
  live Firefox profile, keeper Chromium (:25154, ports.env SSOT), and real
  Chrome.
- The cache-friendly multi-route Cloudflare/Turnstile login coordinator.

## Rules
1. **Single-flight is non-negotiable.** Never run two drivers on the same
   browser profile or CDP port. The PID lock in `cf-coord.ts` (`.driver.lock`
   per profile) enforces this; a second launch on a held profile MUST refuse,
   never race. (Root AGENTS.md: never run more than once on the same state.)
2. **Cache-friendly calling.** Profiles are the cache. A validated signed-in
   session inside its soft TTL is a cache HIT — do not re-challenge Turnstile
   unless the marker is stale or past its hard TTL. Route affinity: try the
   last winner first.
3. **Never commit secrets.** Credentials via env / secretsmith keyring only.
   Profiles and locks live under `/tmp` (ephemeral).
4. **Additive-only on user-facing surfaces.** This product adds session
   borrowing; it never removes/breaks the user's live Firefox or keeper.
5. **Merged lineage.** onyx absorbed cookie-vault + cf-borrow + borrowed on
   2026-11-03. The old repos are retired; this is the only live copy.

## Ports / state
- `BROWSER_KEEPER_CDP` — keeper Chromium CDP (ports.env SSOT, :25154)
- Real Chrome CDP route: :9226; profiles under `/tmp/cf-profiles/`
- Session markers: `<profile>/.cf-session.json`; locks: `<profile>/.driver.lock`