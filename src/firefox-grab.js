"use strict";
// src/firefox-grab.js — grab cookies + per-origin localStorage from live Firefox.
// Snapshot-copies the SQLite DBs (Firefox holds them via WAL -> lock without a
// copy), then reads. Zero deps; uses bun's sqlite when in bun, else node:sqlite.

const {
  copyFileSync,
  existsSync,
  mkdirSync,
  readdirSync,
  unlinkSync,
} = require("node:fs");
const { join } = require("node:path");
const { decompressSnappy, decompressLz4 } = require("./snappy");

const DEFAULT_PROFILE = "/home/toxic/.mozilla/firefox/7c8v85fg.default-nightly";

function sqliteOpen(path, readonly) {
  // Prefer bun:sqlite (bundled with the runtime), fall back to node:sqlite.
  try {
    const { Database } = require("bun:sqlite");
    return new Database(path, { readonly: !!readonly });
  } catch (_) {
    const { DatabaseSync } = require("node:sqlite");
    return new DatabaseSync(path, { readOnly: !!readonly });
  }
}
function queryAll(db, sql) {
  if (typeof db.query === "function") return db.query(sql).all();
  if (typeof db.prepare === "function") return db.prepare(sql).all();
  throw new Error("Unsupported sqlite database interface");
}

function decodeUtf8(buf) {
  return new TextDecoder().decode(buf);
}
/**
 * Grab cookies + localStorage from Firefox.
 * @param {{ profile?: string }} [opts]
 * @returns {{ cookies: Array<object>, storage: Array<{origin:string, localStorage:Record<string,string>}>, capturedAt: string }}
 */
function grabFirefox(opts = {}) {
  const profile = opts.profile || DEFAULT_PROFILE;
  const cookiesDb = join(profile, "cookies.sqlite");
  const storeDb = join(profile, "webappsstore.sqlite");
  if (!existsSync(cookiesDb))
    throw new Error(`Firefox cookies.sqlite not found: ${cookiesDb}`);

  mkdirSync("/tmp/cookie-vault", { recursive: true });
  const tag = `${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
  const tmpCookies = `/tmp/cookie-vault/ff-cookies-${tag}.sqlite`;
  const tmpStore = `/tmp/cookie-vault/ff-store-${tag}.sqlite`;
  const vault = {
    cookies: [],
    storage: [],
    capturedAt: new Date().toISOString(),
  };
  try {
    copyFileSync(cookiesDb, tmpCookies);
    if (existsSync(storeDb)) copyFileSync(storeDb, tmpStore);

    // --- cookies ---
    const db = sqliteOpen(tmpCookies, true);
    const rows = queryAll(
      db,
      "SELECT host, name, value, path, expiry, isSecure, isHttpOnly, sameSite FROM moz_cookies",
    );
    db.close();
    for (const r of rows) {
      let exp = r.expiry;
      if (exp && exp > 1_000_000_000_000) exp = Math.floor(exp / 1_000_000);
      else if (exp && exp > 10_000_000_000) exp = Math.floor(exp / 1_000);
      vault.cookies.push({
        name: r.name,
        value: r.value,
        domain: r.host,
        path: r.path || "/",
        secure: Boolean(r.isSecure),
        httpOnly: Boolean(r.isHttpOnly),
        expires: exp > 0 ? exp : undefined,
        sameSite:
          r.sameSite === 1 ? "Lax" : r.sameSite === 2 ? "Strict" : "None",
      });
    }

    // --- per-origin localStorage (storage/default/<origin>/ls/data.sqlite) ---
    const byOrigin = new Map();
    const lsRoot = join(profile, "storage/default");
    if (existsSync(lsRoot)) {
      for (const originDir of readdirSync(lsRoot)) {
        const dataSqlite = join(lsRoot, originDir, "ls", "data.sqlite");
        if (!existsSync(dataSqlite)) continue;
        const origin = originDir
          .split("+++")
          .join("://")
          .replace(/^http:\/\//, "http://")
          .split("+")
          .join(":");
        try {
          const tmp = `/tmp/cookie-vault/ff-ls-${tag}.sqlite`;
          copyFileSync(dataSqlite, tmp);
          const sd = sqliteOpen(tmp, true);
          let srows = [];
          try {
            srows = queryAll(
              sd,
              "SELECT key, value, compression_type FROM data WHERE value IS NOT NULL",
            );
          } finally {
            sd.close();
          }
          try {
            unlinkSync(tmp);
          } catch (_) {}
          if (srows.length) {
            if (!byOrigin.has(origin)) byOrigin.set(origin, {});
            for (const s of srows) {
              let raw = s.value;
              if (
                raw &&
                (s.compression_type === 2 || s.compression_type === 4)
              ) {
                raw = decompressSnappy(raw);
              } else if (raw && s.compression_type === 5) {
                raw = decompressLz4(raw);
              }
              byOrigin.get(origin)[s.key] = raw ? decodeUtf8(raw) : "";
            }
          }
        } catch (_) {
          /* transient lock / unsupported — skip this origin this pass */
        }
      }
    }

    // --- legacy webappsstore.sqlite fallback ---
    const unescapeScope = (scope) => {
      let s = scope;
      try {
        s = decodeURIComponent(s);
      } catch (_) {}
      return s.replace(/^\/\//, "https://").replace(/:(\d+)\/$/, "");
    };
    if (existsSync(tmpStore)) {
      const sd = sqliteOpen(tmpStore, true);
      try {
        const srows = queryAll(
          sd,
          "SELECT scope, key, value FROM webappsstore2 WHERE value IS NOT NULL",
        );
        for (const s of srows) {
          const origin = unescapeScope(s.scope);
          if (!origin) continue;
          if (!byOrigin.has(origin)) byOrigin.set(origin, {});
          byOrigin.get(origin)[s.key] = s.value;
        }
      } finally {
        sd.close();
      }
    }

    for (const [origin, kv] of byOrigin)
      vault.storage.push({ origin, localStorage: kv });
    return vault;
  } finally {
    try {
      unlinkSync(tmpCookies);
    } catch (_) {}
    try {
      unlinkSync(tmpStore);
    } catch (_) {}
  }
}

module.exports = { grabFirefox, sqliteOpen };
