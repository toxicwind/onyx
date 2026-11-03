"use strict";
// src/cli.js — cookie-vault command-line interface.
//
// Commands:
//   grab-firefox     cookies + localStorage from live Firefox -> vault
//   grab-keeper      cookies + DOMStorage from keeper Chromium -> vault
//   restore-keeper   inject vault snapshot into keeper Chromium
//   sync             grab Firefox -> restore keeper in one shot
//   auto [interval]  run forever: sync when Firefox store mtime changes
//   status           report what the vault holds

const { grabFirefox } = require("./firefox-grab");
const { grabKeeper, restoreKeeper } = require("./keeper-cdp");
const {
  emptyVault,
  writeVault,
  readVault,
  resolveVaultFile,
  statusOf,
} = require("./vault");
const { statSync, existsSync, join } = require("node:fs");

// Keeper Chromium CDP port. The keeper's chromium was moved off the archaic
// 9223 fallback onto the 25xxx estate range (config/ports.env:
// BROWSER_KEEPER_CDP_PORT=25154), so this MUST default to that SSOT port, not
// 9223 — writing cookies to a stray :9223 test instance silently no-ops.
// Resolution: explicit BROWSER_KEEPER_CDP wins, then BROWSER_KEEPER_CDP_PORT,
// then the SSOT default.
const CDP_PORT = process.env.BROWSER_KEEPER_CDP_PORT || "25154";
const CDP_URL =
  process.env.BROWSER_KEEPER_CDP || `http://127.0.0.1:${CDP_PORT}`;
const FF_PROFILE =
  process.env.FF_PROFILE ||
  "/home/toxic/.mozilla/firefox/7c8v85fg.default-nightly";

async function runAuto(intervalMs) {
  console.log(
    `[cookie-vault] auto mode: sync Firefox->keeper every ${intervalMs}ms + on store change.`,
  );
  const cookiesDb = join(FF_PROFILE, "cookies.sqlite");
  let lastMtime = -1;
  for (;;) {
    try {
      let mtime = -1;
      if (existsSync(cookiesDb)) mtime = statSync(cookiesDb).mtimeMs;
      if (lastMtime === -1) {
        lastMtime = mtime;
      } else if (mtime !== lastMtime) {
        lastMtime = mtime;
        const v = grabFirefox({ profile: FF_PROFILE });
        writeVault(v);
        try {
          await restoreKeeper(CDP_URL, v);
          console.log(
            `[auto] synced ${v.cookies.length} cookies + ${v.storage.length} origins`,
          );
        } catch (e) {
          console.log("[auto] keeper not ready:", e.message);
        }
      }
    } catch (e) {
      console.log(`[auto] tick error: ${e.message}`);
    }
    await new Promise((r) => setTimeout(r, intervalMs));
  }
}

async function dispatch(cmd, arg) {
  switch (cmd) {
    case "grab-firefox": {
      const v = grabFirefox({ profile: FF_PROFILE });
      const f = writeVault(v);
      console.log(
        `[cookie-vault] Firefox: ${v.cookies.length} cookies, ${v.storage.length} origins -> ${f}`,
      );
      return v;
    }
    case "grab-keeper": {
      const v = await grabKeeper(CDP_URL);
      const f = writeVault(v);
      console.log(
        `[cookie-vault] Keeper: ${v.cookies.length} cookies, ${v.storage.length} origins -> ${f}`,
      );
      return v;
    }
    case "restore-keeper": {
      const v = readVault(resolveVaultFile()) || emptyVault();
      const n = await restoreKeeper(CDP_URL, v);
      console.log(
        `[cookie-vault] Restored ${n} cookies + ${v.storage.length} storage origins into keeper Chromium!`,
      );
      return n;
    }
    case "sync": {
      const v = grabFirefox({ profile: FF_PROFILE });
      writeVault(v);
      const n = await restoreKeeper(CDP_URL, v);
      console.log(
        `[cookie-vault] Synced ${v.cookies.length} cookies + ${v.storage.length} storage origins into keeper Chromium (restored=${n})`,
      );
      return n;
    }
    case "auto": {
      const interval = Number(arg || "45000");
      return runAuto(interval);
    }
    case "status": {
      const v = readVault(resolveVaultFile());
      const s = statusOf(v);
      if (!s.present) {
        console.log("[cookie-vault] No vault present.");
      } else {
        console.log(
          `[cookie-vault] Stored: ${s.cookies} cookies, ${s.domains} domains, ${s.storageOrigins} storage origins (${s.file}) at ${s.capturedAt}`,
        );
      }
      return s;
    }
    default:
      console.error(`Unknown command: ${cmd}`);
      console.error(
        "Commands: grab-firefox | grab-keeper | restore-keeper | sync | auto [interval] | status",
      );
      process.exit(1);
  }
}

// Entrypoint guard: running under a direct invocation (not required as a module).
if (require.main === module) {
  const cmd = process.argv[2] || "status";
  dispatch(cmd, process.argv[3]).catch((e) => {
    console.error(`[cookie-vault] error: ${e.message}`);
    process.exit(1);
  });
}

module.exports = { runAuto, dispatch, CDP_URL };
