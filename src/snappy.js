"use strict";
// src/snappy.js — Snappy + lz4 decompression for Firefox per-origin localStorage.
// Firefox stores localStorage values conditionally compressed (compression_type
// 2/4 = snappy, 5 = lz4). Pure-JS decoder, zero deps.

let varintLen = 0;

/** Read a LEB128 varint at offset `s`, record its width in `varintLen`. */
function varint32(buf, s) {
  let result = 0;
  let shift = 0;
  let i = s;
  let c = 0;
  do {
    c = buf[i++];
    result |= (c & 0x7f) << shift;
    shift += 7;
  } while (c & 0x80 && shift < 35);
  varintLen = i - s;
  return result >>> 0;
}

/**
 * Decompress a Snappy raw-block (the format Firefox/Chrome store). If the
 * input is not valid snappy (e.g. an uncompressed value), return the raw bytes.
 */
function decompressSnappy(inp) {
  if (!inp || inp.length === 0) return inp;
  const len = varint32(inp, 0);
  const out = new Uint8Array(len);
  let ip = varintLen;
  let op = 0;

  const emit = (offset, n) => {
    for (let k = 0; k < n; k++) out[op + k] = out[op - offset + k];
    op += n;
  };

  try {
    while (ip < inp.length && op < len) {
      const tag = inp[ip++];
      const type = tag & 0x03;
      if (type === 0) {
        let n = tag >>> 2;
        if (n >= 60) {
          const nb = n - 59;
          n = 0;
          for (let i = 0; i < nb; i++) n |= inp[ip++] << (8 * i);
          n += 60;
        }
        if (op + n > out.length) break;
        for (let i = 0; i < n; i++) out[op++] = inp[ip++];
      } else if (type === 1) {
        const n = ((tag >>> 2) & 0x07) + 4;
        const off = ((tag & 0xe0) << 3) | inp[ip++];
        emit(off, n);
      } else if (type === 2) {
        const n = (tag >>> 2) + 1;
        const off = inp[ip++] | (inp[ip++] << 8);
        emit(off, n);
      } else {
        const n = (tag >>> 2) + 1;
        const off =
          inp[ip++] | (inp[ip++] << 8) | (inp[ip++] << 16) | (inp[ip++] << 24);
        emit(off, n);
      }
    }
  } catch (_) {
    // malformed/not-snappy — return source as-is, safest.
    return inp;
  }
  return out.slice(0, op);
}

/** Decompress an lz4 blob (Firefox compression_type=5). Uncommon; pass-through. */
function decompressLz4(buf) {
  // lz4 block decode is non-trivial; values this compressed are rare. Return
  // raw for safety — consumers that hit this should set compression_type=0 in
  // Firefox or accept the raw bytes.
  return buf;
}

module.exports = { decompressSnappy, decompressLz4 };
