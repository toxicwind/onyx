"use strict";
// src/keeper-cdp.js — minimal CDP client for the keeper Chromium.
// The keeper's CDP port is the estate SSOT value (default :25154), passed in
// via `cdpUrl` from cli.js — never hardcode 9223 here.
// Grabs and restores cookies + DOMStorage/localStorage over the browser target.

let callCounter = 10;

async function cdpTabs(cdpUrl) {
  const res = await fetch(`${cdpUrl}/json/list`);
  if (!res.ok)
    throw new Error(`Keeper CDP unreachable on ${cdpUrl} (${res.status})`);
  const tabs = await res.json();
  if (!Array.isArray(tabs) || !tabs.length || !tabs[0].webSocketDebuggerUrl)
    throw new Error("No active keeper pages found");
  return tabs;
}

/**
 * Issue one CDP command over the target websocket. Waits for the socket to be
 * OPEN before sending (a fresh WebSocket throws InvalidStateError if written
 * before connect — the bug that broke the original one-shot sync).
 */
function cdpCall(ws, method, params = {}, id = ++callCounter) {
  callCounter = id;
  return new Promise((resolve, reject) => {
    const onMsg = (evt) => {
      const data = JSON.parse(evt.data.toString());
      if (data.id === id) {
        ws.removeEventListener("message", onMsg);
        resolve(data.result);
      }
    };
    ws.addEventListener("message", onMsg);
    ws.onerror = (e) => reject(e);
    const sendWhenReady = () => {
      if (ws.readyState === WebSocket.OPEN) {
        ws.send(JSON.stringify({ id, method, params }));
      } else if (ws.readyState === WebSocket.CONNECTING) {
        setTimeout(sendWhenReady, 10);
      } else {
        reject(new Error(`CDP ws not open (state ${ws.readyState})`));
      }
    };
    sendWhenReady();
    setTimeout(() => {
      ws.removeEventListener("message", onMsg);
      reject(new Error(`CDP timeout: ${method}`));
    }, 8000);
  });
}

/** Grab cookies + localStorage(DOMStorage) from the keeper. */
async function grabKeeper(cdpUrl) {
  const tabs = await cdpTabs(cdpUrl);
  const ws = new WebSocket(tabs[0].webSocketDebuggerUrl);
  await new Promise((res, rej) => {
    ws.onopen = res;
    ws.onerror = rej;
  });
  const vault = {
    cookies: [],
    storage: [],
    capturedAt: new Date().toISOString(),
  };

  const raw = await cdpCall(ws, "Storage.getCookies");
  vault.cookies = (raw && raw.cookies) || [];

  try {
    const frames = await cdpCall(ws, "Page.getFrameTree");
    const keys = [];
    const collect = (node) => {
      if (node && node.frame && node.frame.securityOrigin)
        keys.push(node.frame.securityOrigin);
      (node.childFrames || []).forEach(collect);
    };
    collect(frames && frames.frameTree);
    const seen = new Set();
    for (const origin of keys) {
      if (seen.has(origin)) continue;
      seen.add(origin);
      try {
        const sk = await cdpCall(ws, "Storage.getStorageKeyForFrame", {
          frameId: frames.frameTree.frame.id,
        });
        const items = await cdpCall(ws, "Storage.getDOMStorageItems", {
          storageKey: sk.storageKey,
          storageArea: "local",
        });
        const kv = {};
        for (const e of (items && items.entries) || [])
          kv[e[0].name] = e[1].value;
        if (Object.keys(kv).length)
          vault.storage.push({ origin, localStorage: kv });
      } catch (_) {}
    }
  } catch (_) {}

  ws.close();
  return vault;
}

/** Restore cookies + localStorage into the keeper. Returns cookie count. */
async function restoreKeeper(cdpUrl, vault) {
  const tabs = await cdpTabs(cdpUrl);
  const ws = new WebSocket(tabs[0].webSocketDebuggerUrl);
  await new Promise((res, rej) => {
    ws.onopen = res;
    ws.onerror = rej;
  });
  if (vault.cookies && vault.cookies.length) {
    await cdpCall(ws, "Storage.setCookies", { cookies: vault.cookies });
  }
  if (vault.storage) {
    try {
      await cdpCall(ws, "DOMStorage.enable");
    } catch (_) {}
    for (const s of vault.storage) {
      if (!s || !s.localStorage) continue;
      try {
        const expr = `localStorage.clear();Object.entries(${JSON.stringify(s.localStorage)}).forEach(([k,v])=>localStorage.setItem(k,v));localStorage.length`;
        await cdpCall(ws, "Runtime.evaluate", { expression: expr });
      } catch (_) {}
    }
  }
  ws.close();
  return (vault.cookies || []).length;
}

module.exports = { cdpTabs, cdpCall, grabKeeper, restoreKeeper };
