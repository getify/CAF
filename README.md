# Cancelable Async Functions (CAF)

[![Build Status](https://travis-ci.org/getify/CAF.svg?branch=master)](https://travis-ci.org/getify/CAF)
[![npm Module](https://badge.fury.io/js/async-caf.svg)](https://www.npmjs.org/package/async-caf)
[![Dependencies](https://david-dm.org/getify/caf.svg)](https://david-dm.org/getify/caf)
[![devDependencies](https://david-dm.org/getify/caf/dev-status.svg)](https://david-dm.org/getify/caf)
[![Coverage Status](https://coveralls.io/repos/github/getify/caf/badge.svg?branch=master)](https://coveralls.io/github/getify/caf?branch=master)

**CAF** (/ˈkahf/) is a wrapper for `function*` generators that treats them like `async function`s, but with support for external cancelation.

## Environment Support

This library uses ES6 (aka ES2015) features. If you need to support environments prior to ES6, transpile it first (with Babel, etc).

## At A Glance

**CAF** (Cancelable Async Functions) wraps a `function*` generator so it behaves like an `async function` that can be externally canceled:

```js
var token = new CAF.cancelToken();

// wrap a generator to make it look like a normal async
// function that when called, returns a promise.
var main = CAF( function *main(cancelToken,url){
    var resp = yield ajax( url );

    // want to be able to cancel so we never get here?!?
    console.log( resp );
    return resp;
} );

// run the fake async function, listen to its
// returned promise
main( token, "http://some.tld/other" )
.then( onResponse, onCancelOrError );

// only wait 3 seconds for the request!
setTimeout( function(){
    token.cancel( "Request took too long!" );
}, 3000 );
```

Create a cancelation token (via `new CAF.cancelToken()`) to pass into your wrapped `function*` generator, and then if you cancel the token, the `function*` generator will abort itself immediately, even if it's presently waiting on a promise to resolve.

Moreover, the generator itself is provided the cancelation token (`cancelToken` parameter above), so you can call another `function*` generator with **CAF**, and pass along the shared cancelation token. In this way, a single cancelation signal cascades across however many `function*` generators are currently in the execution chain:

```js
var token = new CAF.cancelToken();

var one = CAF( function *one(cancelToken,v){
    return yield two(cancelToken,v);
} );

var two = CAF( function *two(cancelToken,v){
    return yield three(cancelToken,v);
} );

var three = CAF( function* three(cancelToken,v){
    return yield ajax( `http://some.tld/?v=${v}` );
} );

one( token, 42 );

// cancel request if not completed in 5 seconds
setTimeout(function(){
    token.cancel();
}, 5000 );
```

In this snippet, `one(..)` calls and waits on `two(..)`, `two(..)` calls and waits on `three(..)`, and `three(..)` calls and waits on `ajax(..)`. Because the same cancelation token is used for the 3 generators, if `token.cancel()` is executed while they're all still paused, they will all immediately abort.

**Note:** In this example, the cancelation token has no effect on the `ajax(..)` call, since that utility ostensibly doesn't provide cancelation capability. The Ajax request itself would still run to its completion (or error or whatever), but we've canceled the `one(..)`, `two(..)`, and `three(..)` functions that were waiting to process its response.

## Overview

An `async function` and a `function*` generator (driven with a [generator-runner](https://github.com/getify/You-Dont-Know-JS/blob/master/async%20%26%20performance/ch4.md#promise-aware-generator-runner)) look, generally speaking, very similar. For that reason, most people just prefer `async function` since it's a little nicer syntax and doesn't require a library to provide the runner.

However, there are several limitations to `async function`s inherent to having the syntax and engine make implicit assumptions that you otherwise have to explicitly handle with `function*` generators.

One clear example of this limitation is that an `async function` cannot be externally canceled once it starts running. If you want to be able to cancel it, you have to intrusively modify its definition to have it consult an external value source -- like a boolean -- at each line that you care about being a cancelation point. This is ugly and error-prone.

`function*` generators by contrast can be aborted at any time, using the iterator's `return(..)` method. But the downside of `function*` generators is either needing a library or the repetitive boilerplate of handling the iterator manually.

The best compromise is being able to call a `function*` generator like an `async function`, and providing it a cancelation token you can then use to signal that you want it to cancel. That's what **CAF** provides.

The `CAF(..)` function takes a `function*` generator, and returns a regular function that expects arguments, much the same as if it was a normal `async function`. The only observable difference is that this function should be provided the cancelation token as its first argument, with any other arguments passed subsequent, as desired.

These two functions are essentially equivalent; `one(..)` is an actual `async function`, whereas `two(..)` will behave like an async function in that it also returns a promise:

```js
async function one(v) {
    await delay( 100 );
    return v * 2;
}

var two = CAF( function *two(cancelToken,v){
    yield delay( 100 );
    return v * 2;
} );
```

Both `one(..)` and `two(..)` can be called directly, with argument(s), and both return a promise for their completion:

```js
one( 21 )
.then( console.log, console.error );   // 42

var token = new CAF.cancelToken();

two( token, 21 )
.then( console.log, console.error );   // 42
```

If `token.cancel(..)` is executed while `two(..)` is still running, its promise will be rejected. If you pass a cancelation reason (any value, but typically a string) to `token.cancel(..)`, that will be passed as the promise rejection:

```js
two( token, 21 )
.then( console.log, console.error );    // Took too long!

setTimeout( function(){
    token.cancel( "Took too long!" );
}, 10 );
```

## npm Package

Because of a naming conflict, this utility's `npm` package name is `async-caf`, not `caf`. So, to install it:

```
npm install async-caf
```

And to require it in a node script:

```js
var CAF = require("async-caf");
```

## Builds

[![Build Status](https://travis-ci.org/getify/CAF.svg?branch=master)](https://travis-ci.org/getify/CAF)
[![npm Module](https://badge.fury.io/js/async-caf.svg)](https://www.npmjs.org/package/async-caf)

The distribution library file (`dist/caf.js`) comes pre-built with the npm package distribution, so you shouldn't need to rebuild it under normal circumstances.

However, if you download this repository via Git:

1. The included build utility (`scripts/build-core.js`) builds (and ~~minifies~~) `dist/caf.js` from source. **Note:** Minification is currently disabled. **The build utility expects Node.js version 6+.**

2. To install the build and test dependencies, run `npm install` from the project root directory.

    - **Note:** This `npm install` has the effect of running the build for you, so no further action should be needed on your part.

4. To manually run the build utility with npm:

    ```
    npm run build
    ```

5. To run the build utility directly without npm:

    ```
    node scripts/build-core.js
    ```

## Tests

A comprehensive test suite is included in this repository, as well as the npm package distribution. The default test behavior runs the test suite using `src/caf.src.js`.

1. You can run the tests in a browser by opening up `tests/index.html` (**requires ES6+ browser environment**).

2. The included Node.js test utility (`scripts/node-tests.js`) runs the test suite. **This test utility expects Node.js version 6+.**

3. Ensure the test dependencies are installed by running `npm install` from the project root directory.

    - **Note:** Starting with npm v5, the test utility is **not** run automatically during this `npm install`. With npm v4, the test utility automatically runs at this point.

4. To run the test utility with npm:

    ```
    npm test
    ```

    Other npm test scripts:

    * `npm run test:dist` will run the test suite against `dist/caf.js` instead of the default of `src/caf.src.js`.

    * `npm run test:package` will run the test suite as if the package had just been installed via npm. This ensures `package.json`:`main` properly references `dist/caf.js` for inclusion.

    * `npm run test:all` will run all three modes of the test suite.

5. To run the test utility directly without npm:

    ```
    node scripts/node-tests.js
    ```

### Test Coverage

[![Coverage Status](https://coveralls.io/repos/github/getify/caf/badge.svg?branch=master)](https://coveralls.io/github/getify/caf?branch=master)

If you have [Istanbul](https://github.com/gotwarlost/istanbul) already installed on your system (requires v1.0+), you can use it to check the test coverage:

```
npm run coverage
```

Then open up `coverage/lcov-report/index.html` in a browser to view the report.

To run Istanbul directly without npm:

```
istanbul cover scripts/node-tests.js
```

**Note:** The npm script `coverage:report` is only intended for use by project maintainers. It sends coverage reports to [Coveralls](https://coveralls.io/).

## License

All code and documentation are (c) 2018 Kyle Simpson and released under the [MIT License](http://getify.mit-license.org/). A copy of the MIT License [is also included](LICENSE.txt).
