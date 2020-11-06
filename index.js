"use strict";

var path = require("path");

require(path.join(__dirname,"dist","abortcontroller-polyfill-only.js"));
module.exports = require(path.join(__dirname,"src","caf.js"));
