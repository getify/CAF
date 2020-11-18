#!/usr/bin/env node

var fs = require("fs"),
	path = require("path"),
	ugly = require("terser"),
	{ build: buildModule, } = require("moduloze"),
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
	CORE_SRC = path.join(SRC_DIR,"caf.js"),
	CORE_UMD_DIST = path.join(DIST_DIR,"caf.js"),
	CORE_ESM_DIST = path.join(DIST_DIR,"caf.mjs"),

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
		result = await ugly.minify(result,{
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
		copyrightHeader = Function("version","year",`return \`${copyrightHeader}\`;`)( version, year );

		// now, convert and compress the core lib (UMD and ESM)
		console.log(`Building: ${CORE_UMD_DIST}`);

		result = `${fs.readFileSync(CORE_SRC,{ encoding: "utf8", })}`;

		builds = buildModule(
			{
				buildUMD: true,
				buildESM: true,
			},
			path.basename(CORE_SRC),
			result,
			knownDeps
		);

		result = await ugly.minify(builds.umd.code,{
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
		// append copyright-header text
		result = `${copyrightHeader}${result.code}`;
		// write dist
		fs.writeFileSync(CORE_UMD_DIST,result,{ encoding: "utf8", });

		// now, convert and compress the core lib (UMD and ESM)
		console.log(`Building: ${CORE_ESM_DIST}`);

		result = await ugly.minify(builds.esm.code,{
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
		// append copyright-header text
		result = `${copyrightHeader.replace("/*! caf.js","/*! caf.mjs")}${result.code}`;
		// write dist
		fs.writeFileSync(CORE_ESM_DIST,result,{ encoding: "utf8", });


		// *******************************


		console.log("Complete.");
	}
	catch (err) {
		console.error(err);
		process.exit(1);
	}
})();
