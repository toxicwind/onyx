"use strict";
// src/index.js — cookie-vault public API.

const { grabFirefox } = require("./firefox-grab");
const { grabKeeper, restoreKeeper } = require("./keeper-cdp");
const vault = require("./vault");

function sync(cdpUrl) {
  const firefoxVault = grabFirefox();
  vault.writeVault(firefoxVault);
  return firefoxVault;
}

module.exports = {
  grabFirefox,
  grabKeeper,
  restoreKeeper,
  sync,
  vault,
};
