#!/usr/bin/env node

var fs = require("fs"),
	path = require("path"),
	ugly = require("terser"),
	packageJSON,
	copyrightHeader,
	version,
	year = (new Date()).getFullYear(),

	ROOT_DIR = path.join(__dirname,".."),
	SRC_DIR = path.join(ROOT_DIR,"src"),
	DIST_DIR = path.join(ROOT_DIR,"dist"),

	POLYFILL_SRC = path.join(ROOT_DIR,"node_modules","abortcontroller-polyfill","dist","abortcontroller-polyfill-only.js"),
	POLYFILL_DIST = path.join(DIST_DIR,"abortcontroller-polyfill-only.js"),
	CORE_SRC = path.join(SRC_DIR,"caf.src.js"),
	CORE_DIST = path.join(DIST_DIR,"caf.js"),

	result
;

console.log("*** Building CAF ***");

try {
	// try to make the dist directory, if needed
	try {
		fs.mkdirSync(DIST_DIR,0o755);
	}
	catch (err) { }

	// first compress the polyfill
	console.log(`Building: ${POLYFILL_DIST}`);

	result = `${fs.readFileSync(POLYFILL_SRC,{ encoding: "utf8", })}`;
	result = ugly.minify(result,{
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


	// now, compress the core lib
	console.log(`Building: ${CORE_DIST}`);

	result = `${fs.readFileSync(CORE_SRC,{ encoding: "utf8", })}`;
	result = ugly.minify(result,{
		mangle: {
			keep_fnames: true,
		},
		compress: {
			keep_fnames: true,
		},
		output: {
			comments: /^!/,
		},
	});
	if (!(result && result.code)) {
		if (result.error) throw result.error;
		else throw result;
	}
	// read version number from package.json
	packageJSON = JSON.parse(
		fs.readFileSync(
			path.join(ROOT_DIR,"package.json"),
			{ encoding: "utf8", }
		)
	);
	version = packageJSON.version;
	// read copyright-header text, render with version and year
	copyrightHeader = fs.readFileSync(
		path.join(SRC_DIR,"copyright-header.txt"),
		{ encoding: "utf8", }
	).replace(/`/g,"");
	copyrightHeader = Function("version","year",`return \`${copyrightHeader}\`;`)( version, year );
	// append copyright-header text
	result = `${copyrightHeader}${result.code}`;
	// write dist
	fs.writeFileSync(CORE_DIST,result,{ encoding: "utf8", });


	// *******************************


	console.log("Complete.");
}
catch (err) {
	console.error(err);
	process.exit(1);
}
