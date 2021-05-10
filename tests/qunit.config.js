QUnit.config.requireExpects = true;

QUnit.begin(begin);
QUnit.log(testLog);
QUnit.testDone(testDone);
QUnit.done(done);

var testLogEntries = {};

// ******************************

function begin(details){
	printEnvNotification();

	if (details.totalTests > 0) {
		console.log(`CAF Test Suite (${details.totalTests})`);
		console.log("");
	}
	else {
		console.log(`CAF Test Suite: empty!`);
		process.exit(1);
	}
}

function testLog(details) {
	var testId = details.testId;

	testLogEntries[testId] = testLogEntries[testId] || {};
	testLogEntries[testId][details.message] = JSON.parse(JSON.stringify(details));
}

function testDone(results){
	var testId = results.testId;

	if (results.failed > 0) {
		console.log(`Failed: '${results.name}' (${results.failed}/${results.total})`);
		for (let i = 0; i < results.assertions.length; i++) {
			if (results.assertions[i].result === false) {
				let { message, expected, actual, source } = testLogEntries[testId][results.assertions[i].message];
				console.log(`  ${message}`);
				// is there a JS exception stack trace included?
				if (source && /^\w*Error: .+/.test(source)) {
					console.log("");
					console.log(`  ${source}`);
					console.log("");
				}
				else {
					console.log(`    expected: ${prettyPrint(expected)}`);
					console.log(`    actual: ${prettyPrint(actual)}`);
				}
			}
		}
	}
	else if (results.passed > 0) {
		console.log(`Passed: '${results.name}' (${results.passed}/${results.total})`);
	}
	else {
		console.log(`No assertions run: '${results.name}'`);
	}
}

function done(results){
	console.log("");

	if (results.failed > 0) {
		console.log(`Failed (${results.failed}/${results.total})`);
		console.log("");
		console.log("**********************************");
		process.exit(1);
	}
	else if (results.passed > 0) {
		console.log(`Passed (${results.passed}/${results.total})`);
		console.log("");
		console.log("**********************************");
		process.exit(0);
	}
	else {
		console.log("No tests run!");
		console.log("");
		console.log("**********************************");
		process.exit(1);
	}
}

function prettyPrint(v) {
	if (Array.isArray(v)) {
		return `[${ v.map( prettyPrint ).toString() }]`;
	}
	else if (v && typeof v == "object") {
		return JSON.stringify(v,function(k,v){
			if (v === undefined) {
				return null;
			}
			return v;
		});
	}
	return String(v);
}

function printEnvNotification() {
	console.log("");
	console.log("**********************************");
	if (process.env.TEST_PACKAGE) {
		console.log("******** TESTING PACKAGE *********");
	}
	else if (process.env.TEST_UMD) {
		console.log("******** TESTING DIST/UMD ********");
	}
	else if (process.env.TEST_ESM) {
		console.log("******** TESTING DIST/ESM ********");
	}
	else {
		console.log("********** TESTING SRC ***********");
	}
	console.log("**********************************");
	console.log("");
}
