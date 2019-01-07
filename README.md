# Cancelable Async Flows (CAF)

[![Build Status](https://travis-ci.org/getify/CAF.svg?branch=master)](https://travis-ci.org/getify/CAF)
[![npm Module](https://badge.fury.io/js/caf.svg)](https://www.npmjs.org/package/caf)
[![Dependencies](https://david-dm.org/getify/caf.svg)](https://david-dm.org/getify/caf)
[![devDependencies](https://david-dm.org/getify/caf/dev-status.svg)](https://david-dm.org/getify/caf?type=dev)
[![Coverage Status](https://coveralls.io/repos/github/getify/caf/badge.svg?branch=master)](https://coveralls.io/github/getify/caf?branch=master)

**CAF** (/ˈkahf/) is a wrapper for `function*` generators that treats them like `async function`s, but with support for external cancelation via tokens. In this way, you can express flows of synchronous-looking asynchronous logic that are still cancelable (**C**ancelable **A**sync **F**lows).

## Environment Support

This utility uses ES6 (aka ES2015) features. If you need to support environments prior to ES6, transpile it first (with Babel, etc).

## At A Glance

**CAF** (**C**ancelable **A**sync **F**lows) wraps a `function*` generator so it looks and behaves like an `async function`, but that can be externally canceled using a cancelation token:

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

// run the wrapped async-looking function, listen to its
// returned promise
main( token.signal, "http://some.tld/other" )
.then( onResponse, onCancelOrError );

// only wait 5 seconds for the ajax request!
setTimeout( function onElapsed(){
    token.abort( "Request took too long!" );
}, 5000 );
```

Create a cancelation token (via `new CAF.cancelToken()`) to pass into your wrapped `function*` generator, and then if you cancel the token, the `function*` generator will abort itself immediately, even if it's presently waiting on a promise to resolve.

The generator receives the cancelation token's `signal`, so from inside it you can call another `function*` generator via **CAF** and pass along that shared `signal`. In this way, a single cancelation signal can cascade across and cancel all the **CAF**-wrapped functions in a chain of execution:

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
setTimeout( function onElapsed(){
    token.abort( "Request took too long!" );
}, 5000 );
```

In this snippet, `one(..)` calls and waits on `two(..)`, `two(..)` calls and waits on `three(..)`, and `three(..)` calls and waits on `ajax(..)`. Because the same cancelation token is used for the 3 generators, if `token.abort()` is executed while they're all still paused, they will all immediately abort.

**Note:** The cancelation token has no effect on the actual `ajax(..)` call itself here, since that utility ostensibly doesn't provide cancelation capability; the Ajax request itself would still run to its completion (or error or whatever). We've only canceled the `one(..)`, `two(..)`, and `three(..)` functions that were waiting to process its response. See [`AbortController(..)`](#abortcontroller) and [Manual Cancelation Signal Handling](#manual-cancelation-signal-handling) below for addressing this limitation.

## Background/Motivation

Generally speaking, an `async function` and a `function*` generator (driven with a [generator-runner](https://github.com/getify/You-Dont-Know-JS/blob/master/async%20%26%20performance/ch4.md#promise-aware-generator-runner)) look very similar. For that reason, most people just prefer the `async function` form since it's a little nicer syntax and doesn't require a library for the runner.

However, there are limitations to `async function`s that come from having the syntax and engine make implicit assumptions that otherwise would have been handled by a `function*` generator runner.

One unfortunate limitation is that an `async function` cannot be externally canceled once it starts running. If you want to be able to cancel it, you have to intrusively modify its definition to have it consult an external value source -- like a boolean or promise -- at each line that you care about being a potential cancelation point. This is ugly and error-prone.

`function*` generators by contrast can be aborted at any time, using the iterator's `return(..)` method and/or by just not resuming the generator iterator instance with `next()`. But the downside of using `function*` generators is either needing a runner utility or the repetitive boilerplate of handling the iterator manually.

**CAF** provides a useful compromise: a `function*` generator that can be called like a normal `async function`, but which supports a cancelation token.

The `CAF(..)` utility wraps a `function*` generator with a normal promise-returing function, just as if it was an `async function`. Other than minor syntactic aesthetics, the major observable difference is that a **CAF**-wrapped function must be provided a cancelation token's `signal` as its first argument, with any other arguments passed subsequent, as desired.

## Overview

In the following snippet, the two functions are essentially equivalent; `one(..)` is an actual `async function`, whereas `two(..)` is a wrapper around a generator, but will behave like an async function in that it also returns a promise:

```js
async function one(v) {
    await delay( 100 );
    return v * 2;
}

var two = CAF( function *two(signal,v){
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

### Delays & Timeouts

One of the most common use-cases for cancelation of an async task is because too much time passes and a timeout threshold is passed.

As shown earlier, you can implement that sort of logic with a `cancelToken()` instance and a manual call to the environment's `setTimeout(..)`. However, there are some subtle but important downsides to doing this kind of thing manually. These downsides are harder to spot in the browser, but are more obvious in Node.js

Consider this code:

```js
function delay(ms) {
    return new Promise( function c(res){
        setTimeout( res, ms );
    } );
}

var token = new CAF.cancelToken();

var main = CAF( function *main(signal,ms){
    yield delay( ms );
    console.log( "All done!" );
} );

main( token.signal, 100 );

// only wait 5 seconds for the request!
delay( 5000 ).then( function onElapsed(){
    token.abort( "Request took too long!" );
} );
```

The `main(..)` function delays for `100`ms and then completes. But there's no logic that clears the timeout set from `delay( 5000 )`, so it will continue to hold pending until that amount of time expires.

Of course, the `token.abort(..)` call at that point is moot, and is thus silently ignored. But the problem is the timer still running, which keeps a Node.js process alive even if the rest of the program has completed. The symptoms of this would be running a Node.js program from the command line and observing it "hang" for a bit at the end instead of exiting right away. Try the above code to see this in action.

There's two complications that make avoiding this downside tricky:

1. The `delay(..)` helper shown, which is a promisified version of `setTimeout(..)`, is basically what you can produce by using [Node.js's `util.promisify(..)`](https://nodejs.org/dist/latest-v8.x/docs/api/util.html#util_util_promisify_original) against `setTimeout(..)`. However, that timer itself is not cancelable. You can't access the timer handle (return value from `setTimeout(..)`) to call `clearTimeout(..)` on it. So, you can't stop the timer early even if you wanted to.

2. If instead you set up your own timer externally, you need to keep track of the timer's handle so you can call `clearTimeout(..)` if the async task completes successfully before the timeout expires. This is manual and error-prone, as it's far too easy to forget.

Instead of inventing solutions to these problems, **CAF** provides two utilities for managing cancelable delays and timeout cancelations: `CAF.delay(..)` and `CAF.timeout(..)`.

#### `CAF.delay(..)`

What we need is a promisified `setTimeout(..)`, like `delay(..)` we saw in the previous section, but that can still be canceled. `CAF.delay(..)`  provides us such functionality:

```js
var discardTimeout = new CAF.cancelToken();

// a promise that waits 5 seconds
CAF.delay( discardTimeout.signal, 5000 )
.then(
    function onElapsed(msg){
        // msg: "delayed: 5000"
    },
    function onInterrupted(reason){
        // reason: "delay (5000) interrupted"
    }
);
```

As you can see, `CAF.delay(..)` receives a cancelation token signal to cancel the timeout early when needed. If you need to cancel the timeout early, abort the cancelation token:

```js
discardTimeout.abort();     // cancel the `CAF.delay()` timeout
```

The promise returned from `CAF.delay(..)` is fulfilled if the full time amount elapses, with a message such as `"delayed: 5000"`. But if the timeout is aborted via the cancelation token, the promise is rejected with a reason like `"delay (5000) interrupted"`.

Passing the cancelation token to `CAF.delay(..)` is optional; if omitted, `CAF.delay(..)` works just like a regular promisified `setTimeout(..)`:

```
// promise that waits 200 ms
CAF.delay( 200 )
.then( function onElapsed(){
    console.log( "Some time went by!" );
} );
```

#### `CAF.timeout(..)`

While `CAF.delay(..)` provides a cancelable timeout promise, it's still overly manual to connect the dots between a **CAF**-wrapped function and the timeout-abort process. **CAF** provides `CAF.timeout(..)` to streamline this common use-case:

```js
var timeoutToken = CAF.timeout( 5000, "Took too long!" );

var main = CAF( function *main(signal,ms){
    yield CAF.delay( signal, ms );
    console.log( "All done!" );
} );

main( timeoutToken, 100 );   // NOTE: pass the whole token, not just the .signal !!
```

`CAF.timeout(..)` creates an instance of `cancelationToken(..)` that's set to `abort()` after the specified amount of time, optionally using the cancelation reason you provide.

Note that you should pass the full `timeoutToken` token to the **CAF**-wrapped function (`main(..)`), instead of just passing `timeoutToken.signal`. By doing so, **CAF** wires the token and the **CAF**-wrapped function together, so that each one stops the other, whichever one happens first. No more hanging timeouts!

Also note that `main(..)` still receives just the `signal` as its first argument, which is suitable to pass along to other cancelable async functions, such as `CAF.delay(..)` as shown.

`timeoutToken` is a regular cancelation token as created by `CAF.cancelToken()`. As such, you can call `abort(..)` on it directly, if necessary. You can also access `timeoutToken.signal` to access its signal, and `timeoutToken.signal.pr` to access the promise that's rejected when the signal is aborted.

### `finally { .. }`

Canceling a **CAF**-wrapped `function*` generator that is paused causes it to abort right away, but if there's a pending `finally {..}` clause, it will always still have a chance to run.

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
.catch( console.log );     // 42 <-- not "Aborting!"

token.abort( "Aborting!" );
```

Whatever value is passed to `abort(..)`, if any, is normally set as the promise rejection reason. But in this case, `return 42` overrides the `"Aborting!"` rejection reason.

### `AbortController(..)`

`CAF.cancelToken(..)` instantiates [`AbortController`, the DOM standard](https://developer.mozilla.org/en-US/docs/Web/API/AbortController) for canceling/aborting operations like `fetch(..)` calls. As such, a **CAF** cancelation token's `signal` can be passed directly to a DOM method like `fetch(..)` to control its cancelation:

```js
var token = new CAF.cancelToken();

var main = CAF(function *main(signal,url) {
    var resp = yield fetch( url, { signal } );

    console.log( resp );
    return resp;
});

main( token.signal, "http://some.tld/other" )
.catch( console.log );   // "Aborting!"

token.abort( "Aborting!" );
```

**Note:** If the standard `AbortController` is not defined in the environment, it's [polyfilled](https://github.com/mo/abortcontroller-polyfill) by **CAF**. But in such a case, `fetch(..)` and other such DOM methods will likely not actually respond to the cancelation signal.

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

**Note:** The `catch(..)` handler inside of `main(..)` will still run, even though `main(..)` itself will be aborted at its waiting `yield` statement. If there was a way to manually cancel the `ajax(..)` call, that code should be placed in the `catch(..)` handler.

Even if you aren't running a **CAF**-wrapped function, you can still respond to the cancelation `signal`'s promise manually to affect flow control:

```js
var token = new CAF.cancelToken();

// normal async function, not CAF-wrapped
async function main(signal,url) {
    try {
        var resp = await Promise.race( [
            ajax( url ),
            signal.pr       // listening to the cancelation
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

**Note:** As discussed earlier, the `ajax(..)` call itself is not cancelation-aware, and is thus not being canceled here. But we *are* ending our waiting on the `ajax(..)` call. When `signal.pr` wins the `Promise.race(..)` race and creates an exception from its promise rejection, flow control jumps straight to the `catch (err) { .. }` clause.

### Beware Of Token Reuse

Beware of creating a single cancelation token that is reused for separate chains of function calls. Unexpected results are likely, and they can be extremely difficult to debug.

As illustrated earlier, it's totally OK and intended that a single cancelation token `signal` be shared across all the functions in **one** chain of calls (`A` -> `B` -> `C`). But reusing the same token **across two or more chains of calls** (`A` -> `B` -> `C` ***and*** `D` -> `E` -> `F`) is asking for trouble.

Imagine a scenario where you make two separate `fetch(..)` calls, one after the other, and the second one runs too long so you cancel it via a timeout:

```js
var one = CAF( function *one(signal){
    signal.pr.catch( reason => {
        console.log( `one: ${reason}` );
    } );

    return yield fetch( "http://some.tld/", {signal} );
} );

var two = CAF( function *two(signal,v){
    signal.pr.catch( reason => {
        console.log( `two: ${reason}` );
    } );

    return yield fetch( `http://other.tld/?v=${v}`, {signal} );
} );

var token = CAF.cancelToken();

one( token.signal )
.then( function(v){
    // only wait 3 seconds for this request
    setTimeout( function(){
        token.abort( "Second response too slow." );
    }, 3000 );

    return two( token.signal, v );
} )
.then( console.log, console.error );

// one: Second response too slow.   <-- Oops!
// two: Second response too slow.
// Second response too slow.
```

When you call `token.abort(..)` to cancel the second `fetch(..)` call in `two(..)`, the `signal.pr.catch(..)` handler in `one(..)` still gets called, even though `one(..)` is already finished. That's why `"one: Second response too slow."` prints unexpectedly.

The underlying gotcha is that a cancelation token's `signal` has a single `pr` promise associated with it, and there's no way to reset a promise or "unregister" `then(..)` / `catch(..)` handlers attached to it once you don't need them anymore. So if you reuse the token, you're reusing the `pr` promise, and all registered promise handlers will be fired, even old ones you likely don't intend.

The above snippet illustrates this problem with `signal.pr.catch(..)`, but any of the other ways of listening to a promise -- such as `yield` / `await`, `Promise.all(..)` / `Promise.race(..)`, etc -- are all susceptible to the unexpected behavior.

The safe and proper approach is to always create a new cancelation token for each chain of **CAF**-wrapped function calls. For good measure, always unset any references to a token once it's no longer needed; thus, you won't accidentally reuse it, and the JS engine can properly garbage collect it.

## npm Package

Prior to version 4.0.0, the package name was "async-caf", but starting with version 4.0.0, the name has been simplified to "caf". So, to install this package from `npm`:

```
npm install caf
```

And to require it in a node script:

```js
var CAF = require("caf");
```

## Builds

[![Build Status](https://travis-ci.org/getify/CAF.svg?branch=master)](https://travis-ci.org/getify/CAF)
[![npm Module](https://badge.fury.io/js/caf.svg)](https://www.npmjs.org/package/caf)

The distribution library file (`dist/caf.js`) comes pre-built with the npm package distribution, so you shouldn't need to rebuild it under normal circumstances.

However, if you download this repository via Git:

1. The included build utility (`scripts/build-core.js`) builds (and minifies) `dist/caf.js` from source. **The build utility expects Node.js version 6+.**

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

All code and documentation are (c) 2019 Kyle Simpson and released under the [MIT License](http://getify.mit-license.org/). A copy of the MIT License [is also included](LICENSE.txt).
