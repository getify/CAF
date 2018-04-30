"use strict";

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
	var obj = { x: "obj.x" };

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
	pActual = pActual.toString();

	assert.expect( 9 ); // note: 4 assertions + 5 `step(..)` calls
	assert.ok( _isFunction( asyncFn ), "asyncFn()" );
	assert.verifySteps( rExpected, "check arguments to generator" );
	assert.strictEqual( pActual, pExpected, "returns promise" );
	assert.strictEqual( qActual, qExpected, "eventually returns 42" );
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
			yield CAF.delay(ms);
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

	setTimeout(function(){
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
				yield CAF.delay(ms);
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

	setTimeout(function(){
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
			yield CAF.delay(ms);

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
			yield CAF.delay(ms);
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

	setTimeout(function(){
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
		signal.pr.catch(()=>assert.step("main:signal.pr.catch"));

		assert.step("main: 1");
		var pr = secondary(signal,ms);
		pr.catch(()=>assert.step("main:pr.catch"));
		yield pr;
		assert.step("main: shouldn't happen");
	}

	function *secondary(signal,ms) {
		signal.pr.catch(()=>assert.step("secondary:signal.pr.catch"));

		assert.step(`secondary: 1`);
		yield CAF.delay(ms);
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

	setTimeout(function(){
		token.abort("Quit!");
	},30);

	// rActual;
	try {
		var pr = main(token.signal,50);
		var x = pr.catch(()=>assert.step("outer:pr.catch"));
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
			assert.step(err.toString());
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
		yield CAF.delay(ms);
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
		qActual = err.toString();
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
		var result = yield CAF.delay(ms);
		assert.step("main: 3");
		return result;
	}

	function *secondary(signal,ms) {
		assert.step("secondary: 1");
		yield CAF.delay(null,ms);
		assert.step("secondary: 2");
		var result = yield CAF.delay(ms);
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
			assert.step(err.toString());
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
	timeoutToken3.abort("timeout 3!");

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
		pActual = err.toString();
	}
	qActual = await qActual;
	try {
		await tActual;
	}
	catch (err) {
		tActual = err.toString();
	}

	assert.expect( 7 ); // note: 4 assertions + 3 `step(..)` calls
	assert.verifySteps( rExpected, "timeouts flow control" );
	assert.strictEqual( pActual, pExpected, "main: result" );
	assert.strictEqual( qActual, qExpected, "secondary: result" );
	assert.strictEqual( tActual, tExpected, "third: result" );
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
