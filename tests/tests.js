"use strict";

// load in Node only
if (typeof EventEmitter3 == "undefined") {
	global.EventEmitter3 = require("events");
}

QUnit.test( "API", function test(assert){
	assert.expect( 6 );

	assert.ok( _isFunction( CAF ), "CAF()" );
	assert.ok( _hasProp( CAF, "cancelToken" ), "CAF.cancelToken" );
	assert.ok( _isFunction( CAF.cancelToken ), "CAF.cancelToken()" );
	assert.ok( _isObject( (new CAF.cancelToken()).signal ), "CAF.cancelToken#signal" );
	assert.ok( _isObject( (new CAF.cancelToken()).signal.pr ), "CAF.cancelToken#signal.pr" );
	assert.ok( _isFunction( (new CAF.cancelToken()).abort ), "CAF.cancelToken#abort()" );
} );

QUnit.test( "cancelToken.abort()", async function test(assert){
	function checkParameter(reason) {
		assert.step(reason);
	}

	var token = new CAF.cancelToken();

	var rExpected = [
		"quit",
		"quit",
	];

	token.signal.pr.catch(checkParameter);
	token.abort("quit");
	token.signal.pr.catch(checkParameter);

	await token.signal.pr.catch(_=>1);

	// rActual;

	assert.expect( 3 ); // note: 1 assertion + 2 `step(..)` calls
	assert.verifySteps( rExpected, "cancelation reason passed" );
} );

QUnit.test( "CAF() + this + parameters + return", async function test(assert){
	function *checkParameters(signal,a,b,...args) {
		assert.step(this.x);
		assert.step(String(signal === token.signal));
		assert.step(String(a));
		assert.step(String(b));
		assert.step(String(args.length === 0));
		return 42;
	}

	var token = new CAF.cancelToken();
	var obj = { x: "obj.x", };

	var rExpected = [
		"obj.x",
		"true",
		"3",
		"12",
		"true",
	];
	var pExpected = "[object Promise]";
	var qExpected = 42;

	var asyncFn = CAF(checkParameters);

	// rActual;
	var pActual = asyncFn.call(obj,token.signal,3,12);
	var qActual = await pActual;
	pActual = getString(pActual);

	assert.expect( 9 ); // note: 4 assertions + 5 `step(..)` calls
	assert.ok( _isFunction( asyncFn ), "asyncFn()" );
	assert.verifySteps( rExpected, "check arguments to generator" );
	assert.strictEqual( pActual, pExpected, "returns promise" );
	assert.strictEqual( qActual, qExpected, "eventually returns 42" );
} );

QUnit.test( "CAF() + raw AbortController", async function test(assert){
	function *main(signal,ms) {
		assert.step(String(signal === ac.signal));
		assert.step(String(signal.pr && typeof signal.pr == "object"));
		yield CAF.delay(signal,ms);
		assert.step("oops");
	}

	var ac = new AbortController();
	main = CAF(main);

	var rExpected = [
		"true",
		"true",
		"caught 1",
		"caught 2"
	];

	// var rActual;
	try {
		let pr = main(ac,20);
		ac.abort();
		await pr;
	}
	catch (err) {
		assert.step("caught 1");
	}
	try {
		await ac.signal.pr;
	}
	catch (err) {
		assert.step("caught 2");
	}

	assert.expect( 5 ); // note: 1 assertions + 4 `step(..)` calls
	assert.verifySteps( rExpected, "check AC and signal" );
} );

QUnit.test( "immediate exception rejection", async function test(assert){
	function *main(signal,msg) {
		assert.step("main");
		throw msg;
		assert.step("didn't get here");
	}

	var token = new CAF.cancelToken();
	main = CAF(main);

	var rExpected = [
		"main",
		"Oops right away!",
	];

	// rActual
	try {
		await main(token.signal,"Oops right away!");
		assert.step("didn't run this");
	}
	catch (err) {
		assert.step(err);
	}

	assert.expect( 3 ); // note: 1 assertions + 2 `step(..)` calls
	assert.verifySteps( rExpected, "immediate exception => rejection" );
} );

QUnit.test( "cancelation + rejection", async function test(assert){
	function *main(signal,ms) {
		for (let i = 0; i < 5; i++) {
			assert.step(`step: ${i}`);
			yield CAF.delay(signal,ms);
		}
	}

	var token = new CAF.cancelToken();
	main = CAF(main);

	var rExpected = [
		"step: 0",
		"step: 1",
		"step: 2",
	];
	var pExpected = "Quit!";

	setTimeout(function t(){
		token.abort("Quit!");
	},50);

	// rActual;
	try {
		await main(token.signal,20);
	}
	catch (err) {
		var pActual = err;
	}

	assert.expect( 5 ); // note: 2 assertions + 3 `step(..)` calls
	assert.verifySteps( rExpected, "canceled after 3 iterations" );
	assert.strictEqual( pActual, pExpected, "cancelation => rejection" );
} );

QUnit.test( "cancelation + finally", async function test(assert){
	function *main(signal,ms) {
		try {
			for (let i = 0; i < 5; i++) {
				assert.step(`step: ${i}`);
				yield CAF.delay(signal,ms);
			}
		}
		finally {
			return 42;
		}
	}

	var token = new CAF.cancelToken();
	main = CAF(main);

	var rExpected = [
		"step: 0",
		"step: 1",
		"step: 2",
	];
	var pExpected = 42;

	setTimeout(function t(){
		token.abort();
	},50);

	// rActual;
	try {
		await main(token.signal,20);
	}
	catch (err) {
		var pActual = err;
	}

	assert.expect( 5 ); // note: 2 assertions + 3 `step(..)` calls
	assert.verifySteps( rExpected, "canceled after 3 iterations" );
	assert.strictEqual( pActual, pExpected, "finally: 42" );
} );

QUnit.test( "cascading cancelation", async function test(assert){
	function *main(signal,ms) {
		try {
			assert.step("main: 1");
			yield CAF.delay(signal,ms);

			var x = yield secondary(signal,ms,2);
			assert.step(`main: ${x}`);

			x = yield secondary(signal,ms,3);
			assert.step("shouldn't happen");
		}
		finally {
			assert.step("main: done");
		}
	}

	function *secondary(signal,ms,v) {
		try {
			assert.step(`secondary: ${v}`);
			yield CAF.delay(signal,ms);
			return v;
		}
		finally {
			assert.step("secondary: done");
		}
	}

	var token = new CAF.cancelToken();
	main = CAF(main);
	secondary = CAF(secondary);

	var rExpected = [
		"main: 1",
		"secondary: 2",
		"secondary: done",
		"main: 2",
		"secondary: 3",
		"main: done",
		"secondary: done",
	];
	var pExpected = "Quit!";

	setTimeout(function t(){
		token.abort("Quit!");
	},50);

	// rActual;
	try {
		await main(token.signal,20);
	}
	catch (err) {
		var pActual = err;
	}

	assert.expect( 9 ); // note: 2 assertions + 7 `step(..)` calls
	assert.verifySteps( rExpected, "canceled during second 'secondary()' call" );
	assert.strictEqual( pActual, pExpected, "Quit!" );
} );

QUnit.test( "cancelation rejection ordering", async function test(assert){
	function *main(signal,ms) {
		signal.pr.catch(function c(){ assert.step("main:signal.pr.catch"); });

		assert.step("main: 1");
		var pr = secondary(signal,ms);
		pr.catch(function c(){ assert.step("main:pr.catch"); });
		yield pr;
		assert.step("main: shouldn't happen");
	}

	function *secondary(signal,ms) {
		signal.pr.catch(function c() { assert.step("secondary:signal.pr.catch"); });

		assert.step("secondary: 1");
		yield CAF.delay(signal,ms);
		assert.step("secondary: shouldn't happen");
	}

	var token = new CAF.cancelToken();
	main = CAF(main);
	secondary = CAF(secondary);

	var rExpected = [
		"main: 1",
		"secondary: 1",
		"main:signal.pr.catch",
		"secondary:signal.pr.catch",
		"outer:pr.catch",
		"main:pr.catch",
	];
	var pExpected = "Quit!";

	setTimeout(function t(){
		token.abort("Quit!");
	},30);

	// rActual;
	try {
		var pr = main(token.signal,50);
		var x = pr.catch(function c() { assert.step("outer:pr.catch"); });
		await x;
		await pr;
	}
	catch (err) {
		var pActual = err;
	}

	assert.expect( 8 ); // note: 2 assertions + 6 `step(..)` calls
	assert.verifySteps( rExpected, "rejects in expected order" );
	assert.strictEqual( pActual, pExpected, "Quit!" );
} );

QUnit.test( "already aborted", async function test(assert){
	function *main(signal,ms) {
		assert.step("main: 1");
		try {
			let delayToken = new CAF.cancelToken();
			delayToken.abort("aborting delayToken");
			yield CAF.delay(delayToken.signal,ms);
			assert.step("main: shouldn't get here");
		}
		catch (err) {
			assert.step(getString(err));
		}
		assert.step("main: 2");
		return "end of main";
	}

	function *secondary(signal) {
		assert.step("secondary: shouldn't get here");
		return "shouldn't return this value";
	}

	function *third(signal,ms) {
		assert.step("third: 1");
		yield CAF.delay(signal,ms);
		assert.step("third: 2");
		return "end of third";
	}

	var token1 = new CAF.cancelToken();
	var token2 = new CAF.cancelToken();
	var token3 = new CAF.cancelToken();

	token2.abort("aborting token2");

	main = CAF(main);
	secondary = CAF(secondary);
	third = CAF(third);

	var rExpected = [
		"main: 1",
		"third: 1",
		"aborting delayToken",
		"main: 2",
		"third: 2",
	];
	var pExpected = "end of main";
	var qExpected = "aborting token2";
	var tExpected = "end of third";

	// rActual;
	var pActual = main(token1,token1,50);
	var qActual = secondary(token2,token2,25);
	var tActual = third(token3,token3,10);

	await CAF.delay(20);
	token3.abort("aborting token3");

	pActual = await pActual;
	try {
		await qActual;
	}
	catch (err) {
		qActual = getString(err);
	}
	tActual = await tActual;

	assert.expect( 9 ); // note: 4 assertions + 5 `step(..)` calls
	assert.verifySteps( rExpected, "pre-aborts flow control" );
	assert.strictEqual( pActual, pExpected, "main: result" );
	assert.strictEqual( qActual, qExpected, "secondary: result" );
	assert.strictEqual( tActual, tExpected, "third: result" );
} );

QUnit.test( "delay()", async function test(assert){
	function *main(signal,ms) {
		assert.step("main: 1");
		yield CAF.delay(null,ms);
		assert.step("main: 2");
		var result = yield CAF.delay(signal,ms);
		assert.step("main: 3");
		return result;
	}

	function *secondary(signal,ms) {
		assert.step("secondary: 1");
		yield CAF.delay(null,ms);
		assert.step("secondary: 2");
		var result = yield CAF.delay(signal,ms);
		assert.step("secondary: 3");
		return result;
	}

	function *third(signal,ms) {
		assert.step("third: 1");
		try {
			let timeoutToken = new CAF.cancelToken();
			setTimeout(function t(){ timeoutToken.abort(); },ms);
			yield CAF.delay(timeoutToken,ms * 10);
			assert.step("third: shouldn't get here");
		}
		catch (err) {
			assert.step(getString(err));
		}
		assert.step("third: 3");
		return "end of third";
	}

	var token = new CAF.cancelToken();
	main = CAF(main);
	secondary = CAF(secondary);
	third = CAF(third);

	var rExpected = [
		"main: 1",
		"secondary: 1",
		"third: 1",
		"secondary: 2",
		"main: 2",
		"delay (600) interrupted",
		"third: 3",
		"secondary: 3",
		"main: 3",
	];
	var pExpected = [
		"delayed: 50",
		"delayed: 40",
		"end of third",
	];

	// rActual;
	var pActual = await Promise.all([
		main(token,50),
		secondary(token,40),
		third(token,60),
	]);

	assert.expect( 11 ); // note: 1 assertions + 9 `step(..)` calls
	assert.verifySteps( rExpected, "delays in expected order" );
	assert.deepEqual( pActual, pExpected, "returns from successful delay()" );
} );

QUnit.test( "timeout()", async function test(assert){
	function *main(signal,ms) {
		assert.step("main: 1");
		yield CAF.delay(signal,ms);
		assert.step("main: shouldn't get here");
		return "shouldn't return this value";
	}

	function *secondary(signal,ms) {
		assert.step("secondary: 1");
		yield CAF.delay(signal,ms);
		assert.step("secondary: 2");
		return "end of secondary";
	}

	function *third(signal,ms) {
		assert.step("third: shouldn't get here");
		return "shouldn't return this value";
	}

	var timeoutToken1 = new CAF.timeout(20);
	var timeoutToken2 = new CAF.timeout(75,"timeout 2");
	var timeoutToken3 = new CAF.timeout();
	timeoutToken3.abort("timeout 3");
	timeoutToken3.abort("timeout 3!!!!!");

	main = CAF(main);
	secondary = CAF(secondary);
	third = CAF(third);

	var rExpected = [
		"main: 1",
		"secondary: 1",
		"secondary: 2",
	];
	var pExpected = "Timeout";
	var qExpected = "end of secondary";
	var tExpected = "timeout 3";

	// rActual;
	var pActual = main(timeoutToken1,50);
	var qActual = secondary(timeoutToken2,40);
	var tActual = third(timeoutToken3,60);

	try {
		await pActual;
	}
	catch (err) {
		pActual = getString(err);
	}
	qActual = await qActual;
	try {
		await tActual;
	}
	catch (err) {
		tActual = getString(err);
	}

	assert.expect( 7 ); // note: 4 assertions + 3 `step(..)` calls
	assert.verifySteps( rExpected, "timeouts flow control" );
	assert.strictEqual( pActual, pExpected, "main: result" );
	assert.strictEqual( qActual, qExpected, "secondary: result" );
	assert.strictEqual( tActual, tExpected, "third: result" );
} );

QUnit.test( "signalRace()", async function test(assert){
	function *main(signal,ms) {
		assert.step("main: 1");
		yield CAF.delay(signal,ms);
		assert.step("main: 2");
		yield CAF.delay(signal,ms);
		assert.step("main: shouldn't get here");
		return "shouldn't return this value";
	}

	var ac = new AbortController();
	CAF.delay(60).then(function t(){ ac.abort(); });
	var timeoutToken1 = new CAF.timeout(90);
	var timeoutToken2 = new CAF.timeout(45,"Timeout2");

	main = CAF(main);

	var rExpected = [
		"main: 1",
		"main: 2",
	];
	var pExpected = "Timeout2";

	// rActual;
	var pActual = main(
		CAF.signalRace([
			timeoutToken1.signal,
			ac.signal,
			timeoutToken2.signal,
		]),
		30
	);

	try {
		await pActual;
	}
	catch (err) {
		pActual = getString(err);
	}

	assert.expect( 4 ); // note: 2 assertions + 2 `step(..)` calls
	assert.verifySteps( rExpected, "signal race() flow control" );
	assert.strictEqual( pActual, pExpected, "main: result" );
} );

QUnit.test( "signalAll()", async function test(assert){
	function *main(signal,ms) {
		assert.step("main: 1");
		yield CAF.delay(signal,ms);
		assert.step("main: 2");
		yield CAF.delay(signal,ms);
		assert.step("main: shouldn't get here");
		return "shouldn't return this value";
	}

	var ac = new AbortController();
	CAF.delay(50).then(function t(){ ac.abort(); });
	var timeoutToken1 = new CAF.timeout(60);
	var timeoutToken2 = new CAF.timeout(25,"Timeout2");

	main = CAF(main);

	var rExpected = [
		"main: 1",
		"main: 2",
	];
	var pExpected = [
		"Timeout",
		"undefined",
		"Timeout2",
	];

	// rActual;
	var pActual = main(
		CAF.signalAll([
			timeoutToken1.signal,
			ac.signal,
			timeoutToken2.signal,
		]),
		40
	);

	try {
		await pActual;
	}
	catch (err) {
		pActual = err;
		pActual[1] = typeof pActual[1];
	}

	assert.expect( 4 ); // note: 2 assertions + 2 `step(..)` calls
	assert.verifySteps( rExpected, "signal all() flow control" );
	assert.deepEqual( pActual, pExpected, "main: result" );
} );

QUnit.test( "checking aborted reason", async function test(assert){
	var cancelReason = 'testing cancel req';
	function *main(signal, ms) {
		try {
			for (let i = 0; i < 5; i++) {
				assert.step(`step: ${i}`);
				yield CAF.delay(signal,ms);
			}
		}
		finally {
			if (signal.aborted) {
				assert.step("step: in canceled finally");
				assert.strictEqual(signal.reason, cancelReason, 'unexpected cancel reason');
			}
			else {
				assert.step("step: uhoh signal should be aborted");
			}
		}
	}

	var token = new CAF.cancelToken();
	main = CAF(main);

	var rExpected = [
		"step: 0",
		"step: 1",
		"step: 2",
		"step: in canceled finally"
	];
	var pExpected = cancelReason;

	setTimeout(function t(){
		token.abort(cancelReason);
		// call abort a second time right away to make sure it doesn't change things
		token.abort("uhoh reason");
	},50);

	// rActual;
	try {
		await main(token.signal,20);
	}
	catch (err) {
		var pActual = err;
	}

	assert.expect( 7 ); // note: 3 assertions + 4 `step(..)` calls
	assert.verifySteps( rExpected, "ignore canceled after 3 iterations" );
	assert.strictEqual( pActual, pExpected, "unexpected final result" );
} );

QUnit.test( "checking aborted reason exists + raw AbortController", async function test(assert){
	function *main(signal, ms) {
		try {
			for (let i = 0; i < 5; i++) {
				assert.step(`step: ${i}`);
				yield CAF.delay(signal,ms);
			}
		}
		finally {
			if (signal.aborted) {
				assert.step("step: in canceled finally");
			}
		}
	}

	var ac = new AbortController();
	main = CAF(main);

	var rExpected = [
		"step: 0",
		"step: 1",
		"step: 2",
		"step: in canceled finally"
	];

	setTimeout(function t(){
		ac.abort();
		// try to forcibly fire the event even after
		// the token was already aborted
		ac.signal.dispatchEvent(new Event("abort"));
	},50);

	// rActual;
	try {
		await main(ac,20);
	}
	catch (err) {
		var pActual = (err === undefined) ? "ac.abort()" : err;
	}

	assert.expect( 6 ); // note: 2 assertions + 4 `step(..)` calls
	assert.verifySteps( rExpected, "ignore canceled after 3 iterations" );
	assert.ok( pActual && pActual === "ac.abort()", "expected final abort event to be thrown" );
} );

QUnit.test( "discard()", async function test(assert){
	function *main(signal,ms) {
		assert.step("step 1");
		yield CAF.delay(signal,ms);
		assert.step("step 2");
		yield CAF.delay(signal,ms);
		assert.step("step 3");
		yield CAF.delay(signal,ms);
		assert.step("step 4");
	}

	var token = new CAF.cancelToken();
	main = CAF(main);

	var rExpected = [
		"step 1",
		"step 2",
		"step 3",
		"step 4",
	];

	setTimeout(function t(){
		token.discard();
		token.discard();
	},40);

	setTimeout(function t(){
		token.abort();
	},50);

	// rActual;
	try {
		await main(token,30);
	}
	catch (err) {
		var pActual = err;
	}

	assert.expect( 6 ); // note: 2 assertions + 4 `step(..)` calls
	assert.verifySteps( rExpected, "cancelation ignored because the token was discarded" );
	assert.ok( pActual === undefined, "normal completion with no abort being thrown" );
} );

QUnit.test( "token cycle", async function test(assert){
	function *main(signal,counter,ms) {
		assert.step(`step 1: ${counter}`);
		yield CAF.delay(signal,ms);
		assert.step(`step 2: ${counter}`);
		yield CAF.delay(signal,ms);
		assert.step("should not reach here");
	}

	var getNextToken = CAF.tokenCycle();
	main = CAF(main);

	var rExpected = [
		"step 1: 0",
		"catch(0): re-requesting(1)",
		"step 1: 1",
		"catch(1): re-requesting(2)",
		"step 1: 2",
		"catch(2): re-requesting(3)",
		"catch(3): already canceled",
		"step 1: 4",
		"step 2: 4",
		"catch(4): please stop",
	];

	var token;
	var waitPr;

	for (let i = 0; i < 5; i++) {
		token = getNextToken(/*reason=*/`re-requesting(${i})`);

		// prematurely cancel this token before even using it
		if (i == 3) {
			token.abort("already canceled");
		}

		// give time for the cancellation to be fully
		// processed
		await CAF.delay(10);

		waitPr = main(token,i,50)
		.then(function t() {
			assert.step("should not reach here either");
		})
		.catch(function c(err){
			assert.step(`catch(${i}): ${err}`);
		});

		if (i < 4) {
			await CAF.delay(30);
		}
		else {
			await CAF.delay(75);
			token.abort("please stop");
		}
	}

	// make sure to wait for all of the test steps to
	// complete...
	await waitPr;

	assert.expect( 11 ); // note: 1 assertions + 10 `step(..)` calls
	assert.verifySteps( rExpected, "expected token cycle" );
} );

QUnit.test( "async-generator: loop iteration", async function test(assert){
	function *main({ signal, pwait },ms) {
		assert.step("step 1");
		yield pwait(CAF.delay(signal,ms));
		assert.step("step 2");
		yield "step 3";
		assert.step("step 4");
		yield pwait(CAF.delay(signal,ms));
		assert.step("step 5");
		yield Promise.resolve("step 6");
	}

	var token = new CAF.cancelToken();
	main = CAG(main);

	var rExpected = [
		"step 1",
		"step 2",
		"step 3",
		"step 4",
		"step 5",
		"step 6",
	];

	// var rActual;
	for await (let msg of main(token,10)) {
		assert.step(msg);
	}

	assert.expect( 7 ); // note: 1 assertions + 6 `step(..)` calls
	assert.verifySteps( rExpected, "iteration steps" );
} );

QUnit.test( "async-generator: manual iteration", async function test(assert){
	function *main({ signal, pwait },ms) {
		assert.step("step 1");
		yield pwait(CAF.delay(signal,ms));
		assert.step("step 2");
		var nextStep = yield "step 3";
		assert.step(nextStep);
		yield pwait(CAF.delay(signal,ms));
		assert.step("step 5");
		yield Promise.resolve("step 6");
		return "step 7";
	}

	var token = new CAF.cancelToken();
	main = CAG(main);
	var it = main(token,10);
	var res;

	var rExpected = [
		"step 1",
		"step 2",
		"step 3",
		"step 4",
		"step 5",
		"step 6",
		"step 7",
	];

	// var rActual;
	while (true) {
		let ret = await it.next(res);
		assert.step(ret.value);

		if (ret.value == "step 3") {
			res = "step 4";
		}
		else {
			res = undefined;
		}

		if (ret.done) {
			break;
		}
	}

	assert.expect( 8 ); // note: 1 assertions + 7 `step(..)` calls
	assert.verifySteps( rExpected, "iteration steps" );
} );

QUnit.test( "async-generator: iteration exception recovery", async function test(assert){
	async function exception(signal,msg,ms) {
		await CAF.delay(signal,ms);
		throw msg;
	}

	function *main({ signal, pwait },ms) {
		assert.step("step 1");
		yield pwait(CAF.delay(signal,ms));
		try {
			yield pwait(exception(signal,"step 2",ms));
		}
		catch (err) {
			assert.step(err);
		}
		yield "step 3";
		assert.step("step 4");
		yield pwait(CAF.delay(signal,ms));
		assert.step("step 5");
		yield Promise.resolve("step 6");
	}

	var token = new CAF.cancelToken();
	main = CAG(main);

	var rExpected = [
		"step 1",
		"step 2",
		"step 3",
		"step 4",
		"step 5",
		"step 6",
	];

	// var rActual;
	for await (let msg of main(token,10)) {
		assert.step(msg);
	}

	assert.expect( 7 ); // note: 1 assertions + 6 `step(..)` calls
	assert.verifySteps( rExpected, "iteration steps" );
} );

QUnit.test( "async-generator: timeout aborted iteration", async function test(assert){
	function *main({ signal, pwait },ms) {
		assert.step("step 1");
		yield pwait(CAF.delay(signal,ms));
		assert.step("step 2");
		yield "step 3";
		assert.step("step 4");
		yield pwait(CAF.delay(signal,ms));
		assert.step("should not get here");
	}

	var token = new CAF.timeout(75);
	main = CAG(main);

	var rExpected = [
		"step 1",
		"step 2",
		"step 3",
		"step 4",
		"Timeout",
	];

	try {
		// var rActual;
		for await (let msg of main(token,50)) {
			assert.step(msg);
		}
	}
	catch (err) {
		assert.step(err);
	}

	assert.expect( 6 ); // note: 1 assertions + 5 `step(..)` calls
	assert.verifySteps( rExpected, "iteration steps" );
} );

QUnit.test( "async-generator: token aborted iteration", async function test(assert){
	function *main({ signal, pwait },ms) {
		assert.step("step 1");
		yield pwait(CAF.delay(signal,ms));
		assert.step("step 2");
		yield Promise.resolve("step 3");
		assert.step("step 4");
		yield pwait(CAF.delay(signal,ms));
		assert.step("should not get here");
	}

	var token = new CAF.cancelToken();
	main = CAG(main);

	var rExpected = [
		"step 1",
		"step 2",
		"step 3",
		"step 4",
		"Canceled!",
		"Canceled!",
	];

	setTimeout(function waitToCancel(){
		token.abort("Canceled!");
	},75);

	try {
		// var rActual;
		for await (let msg of main(token,50)) {
			assert.step(msg);
		}
	}
	catch (err) {
		assert.step(err);
	}

	try {
		main(token,50).next();
	}
	catch (err) {
		assert.step(err);
	}

	assert.expect( 7 ); // note: 1 assertions + 6 `step(..)` calls
	assert.verifySteps( rExpected, "iteration steps" );
} );

QUnit.test( "async-generator: abort-controller aborted iteration", async function test(assert){
	function *main({ signal, pwait },ms) {
		try {
			assert.step("step 1");
			yield pwait(CAF.delay(signal,ms));
			assert.step("step 2");
			yield "step 3";
			assert.step("step 4");
			yield pwait(CAF.delay(signal,ms));
			assert.step("should not get here");
		}
		finally {
			return "step 5";
		}
	}

	var ac = new AbortController();
	main = CAG(main);

	var rExpected = [
		"step 1",
		"step 2",
		"step 3",
		"step 4",
		"step 5",
		"Aborted",
	];

	setTimeout(function waitToCancel(){
		ac.abort();
	},75);

	try {
		// var rActual;
		for await (let msg of main(ac,50)) {
			assert.step(msg);
		}
	}
	catch (err) {
		assert.step(err);
	}

	try {
		main(ac,50).next();
	}
	catch (err) {
		assert.step(err);
	}

	assert.expect( 7 ); // note: 1 assertions + 6 `step(..)` calls
	assert.verifySteps( rExpected, "iteration steps" );
} );

QUnit.test( "async-generator: iterator return", async function test(assert){
	function *main({ signal, pwait },ms) {
		try {
			assert.step("step 1");
			yield pwait(CAF.delay(signal,ms));
			assert.step("step 2");
			yield "step 3";
			assert.step("step 4");
			yield pwait(CAF.delay(signal,ms));
			assert.step("should not get here");
		}
		finally {
			return "step 5";
		}
	}

	var token = new CAF.cancelToken();
	main = CAG(main);
	var it = main(token,50);

	var rExpected = [
		"step 1",
		"step 2",
		"step 3",
		"step 4",
		"step 5",
		"already complete",
	];

	setTimeout(async function waitToCancel(){
		var ret = await it.return("returned");
		assert.step(ret.value);
	},75);

	try {
		// var rActual;
		for await (let msg of it) {
			assert.step(msg);
		}
	}
	catch (err) {
		assert.step(String(err));
	}

	var ret = await it.return("already complete");
	assert.step(ret.value);

	assert.expect( 7 ); // note: 1 assertions + 6 `step(..)` calls
	assert.verifySteps( rExpected, "iteration steps" );
} );

QUnit.test( "async-generator: onEvent", async function test(assert){
	var token = new CAF.cancelToken();
	var token3 = new CAF.cancelToken();
	var token4 = new CAF.cancelToken();

	var events = new EventEmitter3();
	var eventStream1 = CAG.onEvent(token,events,"msg1");
	var eventStream2 = CAG.onEvent(token,events,"msg2");
	var eventStream3 = CAG.onEvent(token3,events,"msg3");
	var eventStream4 = CAG.onEvent(token4,events,"msg4");
	var eventStream5 = CAG.onEvent(CAF.timeout(250),events,"msg5");

	var rExpected = [
		"counter(1): 2",
		"counter(1): 3",
		"counter(1): 4",
		"counter(2): 0",
		"counter(2): 1",
		"counter(2): 2",
		"counter(2): 3",
		"counter(2): 4",
		"counter(2): 5",
		"counter(2): 6",
		"counter(2): 7",
		"eventStream(3) stopped: aborting(3)",
		"eventStream(4) stopped: aborting(4)",
		"counter(5): 8",
		"counter(5): 9",
		"counter(5): 10",
		"counter(5): 11",
		"eventStream(5) stopped: Timeout"
	];

	var counter = 0;
	var intv = setInterval(function emits(){
		events.emit("msg1",`counter(1): ${counter}`);
		events.emit("msg2",`counter(2): ${counter}`);
		events.emit("msg3",`counter(3): ${counter}`);
		token3.abort("aborting(3)");
		events.emit("msg4",`counter(4): ${counter}`);
		if (counter > 5) {
			token4.abort("aborting(4)");
		}
		events.emit("msg5",`counter(5): ${counter}`);

		counter++;
	},20);

	// emit some events that should be ignored because
	// the event streams are not yet listening
	events.emit("msg1","ignored event(1)");
	events.emit("msg2","ignored event(2)");
	events.emit("msg3","ignored event(3)");
	events.emit("msg4","ignored event(4)");

	// force one stream to start listening right away
	eventStream2.start();

	// wait to start iterating the streams, to let
	// some events build up in the buffer
	await CAF.delay(50);

	try {
		for await (let e1 of eventStream1) {
			// make sure the start() method doesn't mess
			// up an already started stream
			eventStream1.start();
			assert.step(e1);
			if (counter > 4) break;
		}
	}
	catch (err) {
		assert.step(`no throw(1): ${err}`);
	}
	try {
		for await (let e2 of eventStream2) {
			assert.step(e2);
			if (counter > 7) eventStream2.return();
		}
	}
	catch (err) {
		assert.step(`no throw(2): ${err}`);
	}
	try {
		for await (let e3 of eventStream3) {
			assert.step("should not get here(3)");
			break;
		}
	}
	catch (err) {
		assert.step(`eventStream(3) stopped: ${err}`);
	}
	try {
		for await (let e4 of eventStream4) {
			assert.step("should not get here(4)");
			break;
		}
	}
	catch (err) {
		assert.step(`eventStream(4) stopped: ${err}`);
	}
	try {
		for await (let e5 of eventStream5) {
			assert.step(e5);
			// this is just a fail-safe to prevent
			// a run-away test
			if (counter > 50) break;
		}
	}
	catch (err) {
		assert.step(`eventStream(5) stopped: ${err}`);
	}

	await CAF.delay(20);
	clearInterval(intv);

	assert.expect( 19 ); // note: 1 assertions + 18 `step(..)` calls
	assert.verifySteps( rExpected, "events received" );
} );

QUnit.test( "async-generator: onEvent, manual iteration", async function test(assert){
	var token = new CAF.cancelToken();

	var events = new EventEmitter3();
	var eventStream = CAG.onEvent(token,events,"msg");

	var rExpected = [
		"first messages sent",
		"counter: 0",
		"counter: 1",
		"buffered messages received",
		"last messages sent",
		"counter: 2",
		"counter: 3",
		"counter: 4",
		"counter: 5",
	];

	var prs = [];

	// pre-request events from the stream
	for (let i = 0; i < 4; i++) {
		prs.push(eventStream.next());
	}

	await CAF.delay(20);

	// push some messages into the stream
	for (let i = 0; i < 2; i++) {
		events.emit("msg",`counter: ${i}`);
	}

	assert.step("first messages sent");

	setTimeout(function moreMessages(){
		for (let i = 2; i < 6; i++) {
			events.emit("msg",`counter: ${i}`);
		}
		assert.step("last messages sent");
		setTimeout(function after(){
			eventStream.return();
		},0);
	},20);

	setTimeout(function after(){
		assert.step("buffered messages received");
	},0);

	// consume messages from the stream
	for (let pr of prs) {
		let res = await pr;
		if (!res.done) {
			assert.step(res.value);
		}
		else break;
	}
	for await (let v of eventStream) {
		assert.step(v);
	}

	assert.expect( 10 ); // note: 1 assertions + 9 step(..)` calls
	assert.verifySteps( rExpected, "events received" );
} );

QUnit.test( "async-generator: onceEvent", async function test(assert){
	var token = new CAF.cancelToken();
	var token3 = new CAF.cancelToken();
	var token4 = new CAF.cancelToken();

	var events = new EventEmitter3();
	var pr1 = CAG.onceEvent(token,events,"msg1");
	var pr2 = CAG.onceEvent(token,events,"msg2");
	var pr3 = CAG.onceEvent(token3,events,"msg3");
	var pr4 = CAG.onceEvent(token4,events,"msg4");
	var pr5 = CAG.onceEvent(CAF.timeout(10),events,"msg5");

	var rExpected = [
		"counter(1): 0",
		"counter(2): 2",
		"counter(3): 0",
		"throws(4): aborting(4)",
		"throws(5): Timeout",
	];

	var counter = 0;
	var intv = setInterval(function emits(){
		events.emit("msg1",`counter(1): ${counter}`);
		if (counter > 1) {
			events.emit("msg2",`counter(2): ${counter}`);
		}
		events.emit("msg3",`counter(3): ${counter}`);
		if (counter > 0) {
			token3.abort("aborting(3)");
		}
		events.emit("msg4",`counter(4): ${counter}`);
		token4.abort("aborting(4)");
		events.emit("msg5",`counter(5): ${counter}`);

		counter++;
	},20);

	// wait to read the event promises, to let
	// multiple events have a chance to fire
	await CAF.delay(50);
	var listeners1 = events.listeners("msg1");
	var listeners3 = events.listeners("msg3");
	var listeners4 = events.listeners("msg4");
	var listeners5 = events.listeners("msg5");

	try {
		// wait for an event from pr1
		let msg1 = await pr1;
		assert.step(msg1);

		// make sure event already unsubscribed
		if (listeners1.length > 0) {
			throw "event still subscribed";
		}
	}
	catch (err) {
		assert.step(`no throw(1): ${err}`);
	}
	try {
		// wait for an event from pr2
		let msg2 = await pr2;
		assert.step(msg2);

		// make sure event already unsubscribed
		if (events.listeners("msg2").length > 0) {
			throw "event still subscribed";
		}
	}
	catch (err) {
		assert.step(`no throw(2): ${err}`);
	}
	try {
		// wait for an event from pr3
		let msg3 = await pr3;
		assert.step(msg3);

		// make sure event already unsubscribed
		if (listeners3.length > 0) {
			throw "event still subscribed";
		}
	}
	catch (err) {
		assert.step(`no throw(3): ${err}`);
	}
	try {
		// wait for an event from pr4
		let msg4 = await pr4;
		assert.step(`should not get here: ${msg4}`);

		// make sure event already unsubscribed
		if (listeners4.length > 0) {
			assert.step("event still subscribed");
		}
	}
	catch (err) {
		assert.step(`throws(4): ${err}`);
	}
	try {
		// wait for an event from pr5
		let msg5 = await pr5;
		assert.step(`should not get here: ${msg5}`);

		// make sure event already unsubscribed
		if (listeners5.length > 0) {
			assert.step("event still subscribed");
		}
	}
	catch (err) {
		assert.step(`throws(5): ${err}`);
	}

	await CAF.delay(50);
	clearInterval(intv);

	assert.expect( 6 ); // note: 1 assertions + 5 `step(..)` calls
	assert.verifySteps( rExpected, "events received" );
} );

function _hasProp(obj,prop) {
	return Object.hasOwnProperty.call( obj, prop );
}

function _isFunction(v) {
	return typeof v == "function";
}

function _isObject(v) {
	return v && typeof v == "object" && !_isArray( v );
}

function _isArray(v) {
	return Array.isArray( v );
}

function getString(v) {
	try {
		return (v && _isFunction(v.toString)) ? v.toString() : String(v);
	}
	catch (err) {
		return "";
	}
}
