#!/usr/bin/env node

var path = require("path");

/* istanbul ignore next */
if (process.env.TEST_DIST) {
	global.CAF = require(path.join("..","dist","caf.js"));
}
/* istanbul ignore next */
else if (process.env.TEST_PACKAGE) {
	global.CAF = require(path.join(".."));
}
else {
	require(path.join("..","lib","abortcontroller-polyfill-modified.js"));
	global.CAF = require(path.join("..","src","caf.src.js"));
}

global.QUnit = require("qunit");

require("../tests/qunit.config.js");
require("../tests/tests.js");

QUnit.start();
