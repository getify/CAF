#!/usr/bin/env node

var fs = require("fs"),
	path = require("path"),
	// ugly = require("uglify-js"),
	packageJSON,
	copyrightHeader,
	version,
	year = (new Date()).getFullYear(),

	ROOT_DIR = path.join(__dirname,".."),
	SRC_DIR = path.join(ROOT_DIR,"src"),
	LIB_DIR = path.join(ROOT_DIR,"lib"),
	DIST_DIR = path.join(ROOT_DIR,"dist"),

	POLYFILL_SRC = path.join(LIB_DIR,"abortcontroller-polyfill-modified.js"),
	CORE_SRC = path.join(SRC_DIR,"caf.src.js"),
	CORE_DIST = path.join(DIST_DIR,"caf.js"),

	result = ""
;

console.log("*** Building Core ***");
console.log(`Building: ${CORE_DIST}`);

try {
	// try to make the dist directory, if needed
	try {
		fs.mkdirSync(DIST_DIR,0o755);
	}
	catch (err) { }

	result += fs.readFileSync(POLYFILL_SRC,{ encoding: "utf8" });
	result += "\n" + fs.readFileSync(CORE_SRC,{ encoding: "utf8" });

	// NOTE: since uglify doesn't yet support ES6, no minifying happening :(

	// result = ugly.minify(path.join(SRC_DIR,"caf.src.js"),{
	// 	mangle: {
	// 		keep_fnames: true
	// 	},
	// 	compress: {
	// 		keep_fnames: true
	// 	},
	// 	output: {
	// 		comments: /^!/
	// 	}
	// });

	// read version number from package.json
	packageJSON = JSON.parse(
		fs.readFileSync(
			path.join(ROOT_DIR,"package.json"),
			{ encoding: "utf8" }
		)
	);
	version = packageJSON.version;

	// read copyright-header text, render with version and year
	copyrightHeader = fs.readFileSync(
		path.join(SRC_DIR,"copyright-header.txt"),
		{ encoding: "utf8" }
	).replace(/`/g,"");
	copyrightHeader = Function("version","year",`return \`${copyrightHeader}\`;`)( version, year );

	// append copyright-header text
	result = copyrightHeader + result;

	// write dist
	fs.writeFileSync( CORE_DIST, result /* result.code + "\n" */, { encoding: "utf8" } );

	console.log("Complete.");
}
catch (err) {
	console.error(err);
	process.exit(1);
}
