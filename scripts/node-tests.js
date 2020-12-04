#!/usr/bin/env node

"use strict";

var path = require("path");

/* istanbul ignore next */
if (process.env.TEST_DIST) {
	require(path.join("..","dist","abortcontroller-polyfill-only.js"));
	global.CAF = require(path.join("..","dist","umd","caf.js"));
	global.CAG = require(path.join("..","dist","umd","cag.js"));
}
/* istanbul ignore next */
else if (process.env.TEST_PACKAGE) {
	global.CAF = require("../");
	global.CAG = require("caf/cag");
}
else {
	require(path.join("..","dist","abortcontroller-polyfill-only.js"));
	global.CAF = require(path.join("..","src","caf.js"));
	global.CAG = require(path.join("..","src","cag.js"));
}

global.QUnit = require("qunit");

require("../tests/qunit.config.js");
require("../tests/tests.js");

QUnit.start();
