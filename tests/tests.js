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
		assert.step(a);
		assert.step(b);
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
	var pActual = asyncFn.call(obj,token.signal,"3","12");
	var qActual = await pActual;
	pActual = pActual.toString();

	assert.expect( 9 ); // note: 4 assertions + 5 `step(..)` calls
	assert.ok( _isFunction( asyncFn ), "asyncFn()" );
	assert.verifySteps( rExpected, "check arguments to generator" );
	assert.strictEqual( pActual, pExpected, "returns promise" );
	assert.strictEqual( qActual, qExpected, "eventually returns 42" );
} );

QUnit.test( "cancelation + rejection", async function test(assert){
	function *main(signal,ms) {
		for (let i = 0; i < 5; i++) {
			assert.step(`step: ${i}`);
			yield _delay(ms);
		}
	}

	var token = new CAF.cancelToken();

	var rExpected = [
		"step: 0",
		"step: 1",
		"step: 2",
	];
	var pExpected = "Quit!";

	main = CAF(main);

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
				yield _delay(ms);
			}
		}
		finally {
			return 42;
		}
	}

	var token = new CAF.cancelToken();

	var rExpected = [
		"step: 0",
		"step: 1",
		"step: 2",
	];
	var pExpected = 42;

	main = CAF(main);

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
			yield _delay(ms);

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
			yield _delay(ms);
			return v;
		}
		finally {
			assert.step("secondary: done");
		}
	}

	var token = new CAF.cancelToken();

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

	main = CAF(main);
	secondary = CAF(secondary);

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
		yield _delay(ms);
		assert.step("secondary: shouldn't happen");
	}

	var token = new CAF.cancelToken();

	var rExpected = [
		"main: 1",
		"secondary: 1",
		"main:signal.pr.catch",
		"secondary:signal.pr.catch",
		"outer:pr.catch",
		"main:pr.catch",
	];
	var pExpected = "Quit!";

	main = CAF(main);
	secondary = CAF(secondary);

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




function _delay(ms) {
	return new Promise(res => setTimeout(res,ms));
}

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
