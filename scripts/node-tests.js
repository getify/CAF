#!/usr/bin/env node

var path = require("path");

require(path.join("..","node_modules","abortcontroller-polyfill","dist","abortcontroller-polyfill-only.js"));

/* istanbul ignore next */
if (process.env.TEST_DIST) {
	global.CAF = require(path.join("..","dist","caf.js"));
}
/* istanbul ignore next */
else if (process.env.TEST_PACKAGE) {
	global.CAF = require(path.join(".."));
}
else {
	global.CAF = require(path.join("..","src","caf.src.js"));
}

global.QUnit = require("qunit");

require("../tests/qunit.config.js");
require("../tests/tests.js");

QUnit.start();
