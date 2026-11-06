# onyx

<div align="center">

[![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg?style=for-the-badge)](LICENSE) [![GitHub stars](https://img.shields.io/github/stars/toxicwind/onyx?style=for-the-badge)](https://github.com/toxicwind/onyx) [![GitHub issues](https://img.shields.io/github/issues/toxicwind/onyx?style=for-the-badge)](https://github.com/toxicwind/onyx/issues)

</div>

---

## **onyx** is the browser-session vault for the estate that borrows, keeps, and restores full sessions (cookies + per-origin localStorage) across Firefox, the keeper Chromium, and real Chrome — and gets through challenge-gated services (Cloudflare Turnstile) with a cache-friendly, single-flight multi-route coordinator.

<p align="center">
  <a href="docs/">Explore the docs »</a> ·
  <a href="https://github.com/toxicwind/onyx/issues/new?labels=bug">Report Bug</a> ·
  <a href="https://github.com/toxicwind/onyx/issues/new?labels=enhancement">Request Feature</a>
</p>

## Example

```ts
import { grabFirefox } from "./src/firefox-grab.js";
const { cookies } = grabFirefox({}); // auto-resolves the live Firefox profile
const gh = cookies.filter((c) => /github/i.test(c.host || c.domain || ""));
console.log("github cookies:", gh.length);
```

## Features

- **cross-platform Firefox grab** — auto-resolves the live profile (estate default on Linux, `%APPDATA%\Mozilla\Firefox\Profiles` on Windows; override `ONYX_FIREFOX_PROFILE`); snapshot-copies the SQLite DBs so WAL locks never block
- **session vault** — grab/restore cookies + per-origin localStorage between Firefox, keeper Chromium (`BROWSER_KEEPER_CDP=127.0.0.1:25154`), and real Chrome
- **CF/Turnstile coordinator** (`src/cf-coord.ts`) — multi-route Cloudflare login that passes Turnstile using a real-fingerprint browser
- **cache-friendly calling** (tau doctrine) — browser profiles cached so repeated calls reuse warm sessions
- **single-flight** — per-profile/port PID lock; never two drivers on the same profile/port; port-bound routes check CDP liveness

## Getting Started

### Prerequisites

- Bun >= 1.1 (or the runtime your package targets)

### Install

```bash
bun install
```

## Usage

Copy the example above — it works as-is. See [docs/](docs/) for the full API.

## Built With

- [bun:sqlite / node:sqlite](https://bun.sh/docs/api/sqlite)
- [snappy/lz4](https://github.com/andris9/snappy)
- [CDP (keeper / real Chrome)](https://chromedevtools.github.io/devtools-protocol/)

## Roadmap

- [x] Cross-platform Firefox profile auto-resolution
- [x] Session vault grab/restore (cookies + localStorage)
- [x] CF/Turnstile login coordinator (multi-route)
- [ ] Cookies-that-expire rotation + bleed into keeper via CDP ([#1](https://github.com/toxicwind/onyx/issues/1))

See the [open issues](https://github.com/toxicwind/onyx/issues) for full roadmap and proposed features.

## Contributing

Contributions are what make the open-source community such an amazing place — read [CONTRIBUTING.md](CONTRIBUTING.md) and jump in.

## License

Distributed under the MIT License. See [LICENSE](LICENSE) for more information.

## Contact & Acknowledgments

Maintainer: @toxicwind — open a [discussion](https://github.com/toxicwind/onyx/issues).

Borrowed from / inspired by:

- Best-README-Template — https://github.com/othneildrew/Best-README-Template
- awesome-readme — https://github.com/matiassingers/awesome-readme
- wzdnzd/harvester search/client.py — https://github.com/wzdnzd/harvester

---

> Don't forget to give the project a star! ⭐ Thanks again!
