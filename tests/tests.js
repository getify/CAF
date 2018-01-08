"use strict";

QUnit.test( "API", function test(assert){
	assert.expect( 5 );

	assert.ok( _isFunction( CAF ), "CAF()" );
	assert.ok( _hasProp( CAF, "cancelToken" ), "CAF.cancelToken" );
	assert.ok( _isFunction( CAF.cancelToken ), "CAF.cancelToken()" );
	assert.ok( _isFunction( (new CAF.cancelToken()).listen ), "CAF.cancelToken#listen()" );
	assert.ok( _isFunction( (new CAF.cancelToken()).cancel ), "CAF.cancelToken#cancel()" );
} );

QUnit.test( "cancelToken", function test(assert){
	function checkParameter(reason) {
		assert.step(reason);
	}

	var token = new CAF.cancelToken();

	var rExpected = [
		"quit",
		"quit",
		"---",
		"quit",
	];

	token.listen(checkParameter);
	token.listen(checkParameter);
	token.cancel("quit");
	assert.step("---");
	token.listen(checkParameter);

	// rActual;

	assert.expect( 5 ); // note: 1 assertion + 4 `step(..)` calls
	assert.verifySteps( rExpected, "cancelation reason passed" );
} );

QUnit.test( "CAF() + this + parameters + return", async function test(assert){
	function *checkParameters(cancelToken,a,b,...args) {
		assert.step(this.x);
		assert.step(String(cancelToken === token));
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
	var pActual = asyncFn.call(obj,token,"3","12");
	var qActual = await pActual;
	pActual = pActual.toString();

	assert.expect( 9 ); // note: 4 assertions + 5 `step(..)` calls
	assert.ok( _isFunction( asyncFn ), "asyncFn()" );
	assert.verifySteps( rExpected, "check arguments to generator" );
	assert.strictEqual( pActual, pExpected, "returns promise" );
	assert.strictEqual( qActual, qExpected, "eventually returns 42" );
} );

QUnit.test( "cancelation + rejection", async function test(assert){
	function *main(cancelToken,ms) {
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
		token.cancel("Quit!");
	},50);

	// rActual;
	try {
		await main(token,20);
	}
	catch (err) {
		var pActual = err;
	}

	assert.expect( 5 ); // note: 2 assertions + 3 `step(..)` calls
	assert.verifySteps( rExpected, "canceled after 3 iterations" );
	assert.strictEqual( pActual, pExpected, "cancelation => rejection" );
} );

QUnit.test( "cancelation + finally", async function test(assert){
	function *main(cancelToken,ms) {
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
		token.cancel();
	},50);

	// rActual;
	try {
		await main(token,20);
	}
	catch (err) {
		var pActual = err;
	}

	assert.expect( 5 ); // note: 2 assertions + 3 `step(..)` calls
	assert.verifySteps( rExpected, "canceled after 3 iterations" );
	assert.strictEqual( pActual, pExpected, "finally: 42" );
} );

QUnit.test( "cascading cancelation", async function test(assert){
	function *main(cancelToken,ms) {
		try {
			assert.step("main: 1");
			yield _delay(ms);

			var x = yield secondary(cancelToken,ms,2);
			assert.step(`main: ${x}`);

			x = yield secondary(cancelToken,ms,3);
			assert.step("shouldn't happen");
		}
		finally {
			assert.step("main: done");
		}
	}

	function *secondary(cancelToken,ms,v) {
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
		"secondary: done",
		"main: done",
	];
	var pExpected = "Quit!";

	main = CAF(main);
	secondary = CAF(secondary);

	setTimeout(function(){
		token.cancel("Quit!");
	},50);

	// rActual;
	try {
		await main(token,20);
	}
	catch (err) {
		var pActual = err;
	}

	assert.expect( 9 ); // note: 2 assertions + 7 `step(..)` calls
	assert.verifySteps( rExpected, "canceled after during second 'secondary()' call" );
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
