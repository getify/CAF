# Cancelable Async Functions (CAF)

[![Build Status](https://travis-ci.org/getify/CAF.svg?branch=master)](https://travis-ci.org/getify/CAF)
[![npm Module](https://badge.fury.io/js/async-caf.svg)](https://www.npmjs.org/package/async-caf)
[![Dependencies](https://david-dm.org/getify/caf.svg)](https://david-dm.org/getify/caf)
[![devDependencies](https://david-dm.org/getify/caf/dev-status.svg)](https://david-dm.org/getify/caf)
[![Coverage Status](https://coveralls.io/repos/github/getify/caf/badge.svg?branch=master)](https://coveralls.io/github/getify/caf?branch=master)

**CAF** (/ˈkahf/) is a wrapper for `function*` generators that treats them like `async function`s, but with support for external cancelation.

## Environment Support

This utility uses ES6 (aka ES2015) features. If you need to support environments prior to ES6, transpile it first (with Babel, etc).

## At A Glance

**CAF** (Cancelable Async Functions) wraps a `function*` generator so it behaves like an `async function` that can be externally canceled:

```js
var token = new CAF.cancelToken();

// wrap a generator to make it look like a normal async
// function that when called, returns a promise.
var main = CAF( function *main(signal,url){
    var resp = yield ajax( url );

    // want to be able to cancel so we never get here?!?
    console.log( resp );
    return resp;
} );

// run the fake async function, listen to its
// returned promise
main( token.signal, "http://some.tld/other" )
.then( onResponse, onCancelOrError );

// only wait 5 seconds for the request!
setTimeout( function(){
    token.abort( "Request took too long!" );
}, 5000 );
```

Create a cancelation token (via `new CAF.cancelToken()`) to pass into your wrapped `function*` generator, and then if you cancel the token, the `function*` generator will abort itself immediately, even if it's presently waiting on a promise to resolve.

Moreover, the generator itself is provided the cancelation token's `signal`, so you can call another `function*` generator via **CAF** and pass along that shared `signal`. In this way, a single cancelation signal can cascade across all the **CAF**-wrapped functions in the chain of execution:

```js
var token = new CAF.cancelToken();

var one = CAF( function *one(signal,v){
    return yield two( signal, v );
} );

var two = CAF( function *two(signal,v){
    return yield three( signal, v );
} );

var three = CAF( function* three(signal,v){
    return yield ajax( `http://some.tld/?v=${v}` );
} );

one( token.signal, 42 );

// only wait 5 seconds for the request!
setTimeout( function(){
    token.abort( "Request took too long!" );
}, 5000 );
```

In this snippet, `one(..)` calls and waits on `two(..)`, `two(..)` calls and waits on `three(..)`, and `three(..)` calls and waits on `ajax(..)`. Because the same cancelation token is used for the 3 generators, if `token.abort()` is executed while they're all still paused, they will all immediately abort.

**Note:** In this example, the cancelation token has no effect on the actual `ajax(..)` call itself, since that utility ostensibly doesn't provide cancelation capability; the Ajax request itself would still run to its completion (or error or whatever). We've only canceled the `one(..)`, `two(..)`, and `three(..)` functions that were waiting to process its response. See [`AbortController(..)`](#abortcontroller) and [Manual Cancelation Signal Handling](#manual-cancelation-signal-handling) below for addressing this concern.

## Background/Motivation

Generally speaking, an `async function` and a `function*` generator (driven with a [generator-runner](https://github.com/getify/You-Dont-Know-JS/blob/master/async%20%26%20performance/ch4.md#promise-aware-generator-runner)) look very similar. For that reason, most people just prefer the `async function` form since it's a little nicer syntax and doesn't require a library for the runner.

However, there are limitations to `async function`s inherent to having the syntax and engine make implicit assumptions that you otherwise have to explicitly handle with `function*` generators.

One clear example of these limitations is that an `async function` cannot be externally canceled once it starts running. If you want to be able to cancel it, you have to intrusively modify its definition to have it consult an external value source -- like a boolean or promise -- at each line that you care about being a cancelation point. This is ugly and error-prone.

`function*` generators by contrast can be aborted at any time, using the iterator's `return(..)` method. But the downside of using `function*` generators is either needing a runner utility or the repetitive boilerplate of handling the iterator manually.

The best solution would be a `function*` generator that can be called like a normal `async function`, but with a cancelation token to signal it to cancel. That's what **CAF** provides.

The `CAF(..)` function takes a `function*` generator, and returns a regular function that expects any arguments, much the same as if it was a normal `async function`. Other than minor syntactic aesthetics, the most observable difference is that a **CAF**-wrapped function should be provided a cancelation token's `signal` as its first argument, with any other arguments passed subsequent, as desired.

## Overview

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

Both `one(..)` and `two(..)` can be called directly with argument(s), and both return a promise for their completion:

```js
one( 21 )
.then( console.log, console.error );   // 42

var token = new CAF.cancelToken();

two( token.signal, 21 )
.then( console.log, console.error );   // 42
```

If `token.abort(..)` is executed while `two(..)` is still running, the `signal`'s promise will be rejected. If you pass a cancelation reason (any value, but typically a string) to `token.abort(..)`, that will be the promise rejection reason:

```js
two( token, 21 )
.then( console.log, console.error );    // Took too long!

token.abort( "Took too long!" );
```

### `finally { .. }`

Canceling a **CAF**-wrapped `function*` generator that is paused causes it to abort right away, but if there's a pending `finally {..}` clause, that will still have a chance to run.

Moreover, a `return` of any non-`undefined` value in that pending `finally {..}` clause will override the promise rejection reason:

```js
var token = new CAF.cancelToken();

var main = CAF( function *main(signal,url){
    try {
        return yield ajax( url );
    }
    finally {
        return 42;
    }
} );

main( token.signal, "http://some.tld/other" )
.catch( console.log );   // 42 <-- not "Aborting!"

token.abort( "Aborting!" );
```

Whatever value is passed to `abort(..)`, if any, is normally set as the promise rejection reason. But in this case, `return 42` overrides the `"Aborting!"` rejection reason.

### `AbortController(..)`

`CAF.cancelToken(..)` instantiates [`AbortController`, the DOM standard](https://developer.mozilla.org/en-US/docs/Web/API/AbortController) for canceling/aborting operations like `fetch(..)` calls. As such, a cancelation token's `signal` can be passed directly to a DOM method like `fetch(..)`, which will respond to it accordingly:

```js
var token = new CAF.cancelToken();

var main = CAF(function *main(signal,url) {
    var resp = await fetch( url, { signal } );

    console.log( resp );
    return resp;
});

main( token.signal, "http://some.tld/other" )
.catch( console.log );   // "Aborting!"

token.abort( "Aborting!" );
```

**Note:** If the standard `AbortController` is not defined in the environment, it's [polyfilled](https://github.com/mo/abortcontroller-polyfill) by **CAF**. In such a case, `fetch(..)` and other such DOM methods will likely not actually respond to the cancelation signal.

### Manual Cancelation Signal Handling

Even if you aren't calling a cancelation signal-aware utility (like `fetch(..)`), you can still manually respond to the cancelation `signal` via its attached promise:

```js
var token = new CAF.cancelToken();

var main = CAF( function *main(signal,url){
    // listen to the signal's promise rejection directly
    signal.pr.catch( reason => {
        // reason == "Aborting!"
    } );

    var resp = yield ajax( url );

    console.log( resp );
    return resp;
} );

main( token.signal, "http://some.tld/other" )
.catch( console.log );   // "Aborting!"

token.abort( "Aborting!" );
```

**Note:** The `catch(..)` handler inside of `main(..)` will still run, even though `main(..)` itself will be aborted at its waiting `yield` statement. If there was a way to manually cancel the `ajax(..)` call, that code could run in the `catch(..)` handler.

And even if you aren't running a **CAF**-wrapped function, you can still respond to the cancelation `signal`'s promise manually to affect flow control:

```js
var token = new CAF.cancelToken();

// normal async function
async function main(signal,url) {
    try {
        var resp = await Promise.race( [
            ajax( url ),
            signal.pr
        ] );

        // this won't run if `signal.pr` rejects
        console.log( resp );
        return resp;
    }
    catch (err) {
        // err == "Aborting!"
    }
}

main( token.signal, "http://some.tld/other" )
.catch( console.log );   // "Aborting!"

token.abort( "Aborting!" );
```

**Note:** As discussed earlier, the `ajax(..)` call itself is not cancelation aware, and is thus not being aborted here. But we *are* aborting our waiting on the `ajax(..)` call. When `signal.pr` wins the `Promise.race(..)` race and creates an exception from its promise rejection, flow control jumps straight to the `catch (err) { .. }` clause.

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
