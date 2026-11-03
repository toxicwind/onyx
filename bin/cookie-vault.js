#!/usr/bin/env bun
// bin/cookie-vault.js — executable wrapper into src/cli.js.
"use strict";
const { dispatch } = require("../src/cli");
const cmd = process.argv[2] || "status";
dispatch(cmd, process.argv[3]).catch((e) => {
  console.error(`[cookie-vault] error: ${e.message}`);
  process.exit(1);
});
