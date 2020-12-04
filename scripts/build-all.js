#!/usr/bin/env node

"use strict";

var fs = require("fs"),
	path = require("path"),
	util = require("util"),
	{ execFile } = require("child_process"),

	terser = require("terser"),
	execFileAsync = util.promisify(execFile),
	packageJSON,
	knownDeps,
	copyrightHeader,
	version,
	year = (new Date()).getFullYear(),
	builds,

	ROOT_DIR = path.join(__dirname,".."),
	SRC_DIR = path.join(ROOT_DIR,"src"),
	DIST_DIR = path.join(ROOT_DIR,"dist"),

	POLYFILL_SRC = path.join(ROOT_DIR,"node_modules","abortcontroller-polyfill","dist","abortcontroller-polyfill-only.js"),
	POLYFILL_DIST = path.join(DIST_DIR,"abortcontroller-polyfill-only.js"),

	result
;

console.log("*** Building CAF ***");

(async function main(){
	try {
		// try to make the dist directory, if needed
		try {
			fs.mkdirSync(DIST_DIR,0o755);
		}
		catch (err) { }

		// first compress the polyfill
		console.log(`Building: ${POLYFILL_DIST}`);

		result = `${fs.readFileSync(POLYFILL_SRC,{ encoding: "utf8", })}`;
		result = await terser.minify(result,{
			mangle: {
				keep_fnames: true,
			},
			compress: {
				keep_fnames: true,
			},
		});
		if (!(result && result.code)) {
			if (result.error) throw result.error;
			else throw result;
		}
		// append credit link
		result = `// From: https://github.com/mo/abortcontroller-polyfill\n\n${result.code}`;
		fs.writeFileSync(POLYFILL_DIST,result,{ encoding: "utf8", });


		// *******************************


		// read package.json
		packageJSON = JSON.parse(
			fs.readFileSync(
				path.join(ROOT_DIR,"package.json"),
				{ encoding: "utf8", }
			)
		);
		// read mz-dependencies
		knownDeps = packageJSON["mz-dependencies"];
		// read version number from package.json
		version = packageJSON.version;
		// read copyright-header text, render with version and year
		copyrightHeader = fs.readFileSync(
			path.join(SRC_DIR,"copyright-header.txt"),
			{ encoding: "utf8", }
		).replace(/`/g,"");
		copyrightHeader = copyrightHeader.replace(/#VERSION#/g,version).replace(/#YEAR#/g,year);

		// now, convert and compress the core lib (UMD and ESM)
		console.log(`Building: core`);

		// run moduloze CLI on the src/ tree
		await execFileAsync(
			path.join(ROOT_DIR,"node_modules",".bin","mz"),
			[
				`--prepend=${ copyrightHeader }`,
				"-ruben",
			]
		);


		// *******************************


		console.log("Complete.");
	}
	catch (err) {
		console.error(err);
		process.exit(1);
	}
})();
