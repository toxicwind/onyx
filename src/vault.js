"use strict";
// src/vault.js — persistent vault file IO (cookies + storage snapshot).

const {
  existsSync,
  mkdirSync,
  readFileSync,
  writeFileSync,
} = require("node:fs");
const { join } = require("node:path");

const VAULT_DIR = "/home/toxic/.browserless/vault";
const BACKUP_FILE = join(VAULT_DIR, "vault.json");
const KEEPER_BACKUP_FILE = "/home/toxic/.browserless/vault-keeper.json";

function emptyVault() {
  return { cookies: [], storage: [], capturedAt: new Date().toISOString() };
}

function writeVault(vault, file = BACKUP_FILE) {
  mkdirSync(VAULT_DIR, { recursive: true });
  writeFileSync(file, JSON.stringify(vault, null, 2));
  return file;
}

function readVault(file = BACKUP_FILE) {
  if (!existsSync(file)) return null;
  try {
    return JSON.parse(readFileSync(file, "utf8"));
  } catch (_) {
    return null;
  }
}

function resolveVaultFile() {
  if (existsSync(BACKUP_FILE)) return BACKUP_FILE;
  if (existsSync(KEEPER_BACKUP_FILE)) return KEEPER_BACKUP_FILE;
  return null;
}

function statusOf(vault) {
  if (!vault) return { present: false };
  const domains = new Set((vault.cookies || []).map((c) => c.domain));
  return {
    present: true,
    cookies: (vault.cookies || []).length,
    domains: domains.size,
    storageOrigins: (vault.storage || []).length,
    capturedAt: vault.capturedAt,
    file: resolveVaultFile(),
  };
}

module.exports = {
  VAULT_DIR,
  BACKUP_FILE,
  KEEPER_BACKUP_FILE,
  emptyVault,
  writeVault,
  readVault,
  resolveVaultFile,
  statusOf,
};
