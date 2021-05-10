#!/usr/bin/env node

"use strict";

var path = require("path");

/* istanbul ignore next */
if (process.env.TEST_PACKAGE) {
	global.CAF = require("../");
	global.CAG = require("caf/cag");
	runTests();
}
/* istanbul ignore next */
else if (process.env.TEST_UMD) {
	require(path.join("..","dist","abortcontroller-polyfill-only.js"));
	global.CAF = require(path.join("..","dist","umd","caf.js"));
	global.CAG = require(path.join("..","dist","umd","cag.js"));
	runTests();
}
/* istanbul ignore next */
else if (process.env.TEST_ESM) {
	let { spawn, } = require("child_process");
	let child = spawn("node",[ path.join(__dirname,"node-esm-tests.mjs"), ]);
	child.stdout.pipe(process.stdout);
	child.stderr.pipe(process.stderr);
	child.on("exit",function onExit(code){
		process.exit(code);
	});
}
else {
	require(path.join("..","dist","abortcontroller-polyfill-only.js"));
	global.CAF = require(path.join("..","src","caf.js"));
	global.CAG = require(path.join("..","src","cag.js"));
	runTests();
}


// ******************************************

function runTests() {
	global.QUnit = require("qunit");

	require(path.join("..","tests","qunit.config.js"));
	require(path.join("..","tests","tests.js"));

	QUnit.start();
}
