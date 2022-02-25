"use strict";

var {
	CLEANUP_FN,
	TIMEOUT_TOKEN,
	UNSET,

	getSignalReason,
	cancelToken,
	signalPromise,
	processTokenOrSignal,
	isFunction,
	invokeAbort,
} = require("./shared.js");

// assign public API as CAF namespace
module.exports = Object.assign(CAF,{
	cancelToken,
	delay,
	timeout,
	signalRace,
	signalAll,
	tokenCycle,
});
module.exports.cancelToken = cancelToken;
module.exports.delay = delay;
module.exports.timeout = timeout;
module.exports.signalRace = signalRace;
module.exports.signalAll = signalAll;
module.exports.tokenCycle = tokenCycle;


// ***************************************


function CAF(generatorFn) {
	return function instance(tokenOrSignal,...args){
		var signal, signalPr;
		({ tokenOrSignal, signal, signalPr, } = processTokenOrSignal(tokenOrSignal));

		// already aborted?
		if (signal.aborted) {
			return signalPr;
		}
		// listen for abort signal
		var cancellation = signalPr.catch(function onCancellation(r){
			var reason = getSignalReason(signal);
			reason = reason !== UNSET ? reason : r;
			try {
				var ret = it.return();
				/* istanbul ignore next */
				throw (
					(ret.value !== undefined) ? ret.value :
					reason !== UNSET ? reason :
					undefined
				);
			}
			// clean up memory
			finally {
				it = result = cancellation = completion = null;
			}
		});
		var { it, result, } = runner.call(this,generatorFn,signal,...args);
		var completion = Promise.race([ result, cancellation, ]);
		if (
			// cancellation token passed in?
			tokenOrSignal !== signal &&
			// recognized special timeout token?
			tokenOrSignal[TIMEOUT_TOKEN]
		) {
			// cancel timeout-token upon instance completion/failure
			// to prevent timer hook from holding process open
			let doCancelTimer = function cancelTimer(v){
				invokeAbort(tokenOrSignal,v);
				/* istanbul ignore else */
				if (isFunction(tokenOrSignal.discard)) {
					tokenOrSignal.discard();
				}
				tokenOrSignal = doCancelTimer = null;
			};
			completion.then(doCancelTimer,doCancelTimer);
		}
		else {
			// silence unhandled rejection warnings
			completion.catch(() => {});
			tokenOrSignal = null;
		}
		args = null; // clean up memory
		return completion;
	};
}

function delay(tokenOrSignal,ms) {
	// was delay ms passed first?
	if (
		typeof tokenOrSignal == "number" &&
		typeof ms != "number"
	) {
		// swap arguments
		[ms,tokenOrSignal,] = [tokenOrSignal,ms,];
	}

	var signal, signalPr;
	if (tokenOrSignal) {
		({ tokenOrSignal, signal, signalPr, } = processTokenOrSignal(tokenOrSignal));
	}

	// already aborted?
	if (signal && signal.aborted) {
		return signalPr;
	}

	return new Promise(function c(res,rej){
		if (signal) {
			signalPr.catch(function onAbort(){
				if (rej && signal && intv) {
					let reason = getSignalReason(signal);
					clearTimeout(intv);
					rej(reason !== UNSET ? reason : `delay (${ms}) interrupted`);
					res = rej = intv = signal = null;
				}
			});
			signalPr = null;
		}

		var intv = setTimeout(function onTimeout(){
			res(`delayed: ${ms}`);
			res = rej = intv = signal = null;
		},ms);
	});
}

function timeout(duration,message = "Timeout") {
	duration = Number(duration) || 0;
	var timeoutToken = new cancelToken();
	delay(timeoutToken.signal,duration)
		.then(() => cleanup(message),cleanup);

	// branding
	Object.defineProperty(timeoutToken,TIMEOUT_TOKEN,{
		value: true,
		writable: false,
		enumerable: false,
		configurable: false,
	});

	return timeoutToken;


	// *********************************
	function cleanup(...args) {
		/* istanbul ignore next */
		invokeAbort(timeoutToken,args.length > 0 ? args[0] : UNSET);
		timeoutToken.discard();
		timeoutToken = null;
	}
}

function splitSignalPRs(signals) {
	return signals.reduce(
		function split(prsTuple,signal) {
			var pr = signalPromise(signal);
			prsTuple[0].push(pr);
			if (!signal.pr) {
				prsTuple[1].push(pr);
			}
			return prsTuple;
		},
		[ /*allPrs=*/[], /*barePrs=*/[] ]
	);
}

function triggerAndCleanup(overallPR,token,barePRs) {
	overallPR
	.then(function t(reason){
		invokeAbort(token,reason);
		token.discard();
		token = null;
	})
	.then(function t(){
		for (let pr of barePRs) {
			if (pr[CLEANUP_FN]) {
				pr[CLEANUP_FN]();
			}
		}
		barePRs = null;
	});
}

function prCatch(pr) {
	return pr.catch(v => v);
}

function signalRace(signals) {
	var token = new cancelToken();
	var [ allPRs, barePRs ] = splitSignalPRs(signals);

	triggerAndCleanup(
		prCatch(Promise.race(allPRs)),
		token,
		barePRs
	);

	return token.signal;
}

function signalAll(signals) {
	var token = new cancelToken();
	var [ allPRs, barePRs ] = splitSignalPRs(signals);

	triggerAndCleanup(
		Promise.all(
			// avoid short-circuiting, wait for all promises
			// to reject
			allPRs.map(prCatch)
		),
		token,
		barePRs
	);

	return token.signal;
}

function tokenCycle() {
	var prevToken;
	return function getNextToken(...args){
		if (prevToken) {
			/* istanbul ignore next */
			invokeAbort(prevToken,args.length > 0 ? args[0] : UNSET);
			prevToken.discard();
		}
		return (prevToken = new cancelToken());
	};
}

// thanks to Benjamin Gruenbaum (@benjamingr on GitHub) for
// big improvements here!
function runner(gen,...args) {
	// initialize the generator in the current context
	var it = gen.apply(this,args);
	gen = args = null; // clean up memory

	return {
		it,
		// a promise for the generator completing
		result: (function getNextResult(curValue){
			// NOTE: this `try` is only necessary to catch
			// an immediate exception on the first iteration
			// of the generator. The below .then(..) would
			// catch any subsequent exceptions.
			try {
				// run to the next yielded value
				var nextResult = it.next(curValue);
				curValue = null; // clean up memory
			}
			catch (err) {
				// exception becomes rejection
				return Promise.reject(err);
			}

			return (function processResult(nextResult){
				var prNext = Promise.resolve(nextResult.value);

				// generator no longer running?
				if (nextResult.done) {
					it = null;
				}
				// otherwise keep going
				else {
					prNext = prNext.then(
						// resume on fulfillment, sending the
						// fulfilled value back into the generator
						getNextResult,

						// if we receive a rejected promise,
						// throw the reason as exception back
						// into the generator for its own error
						// handling (if any)
						function onRejection(reason){
							return Promise.resolve(
								it.throw(reason)
							)
							.then(processResult);
						}
					);
					// clean up memory
					prNext.catch(function cleanup(){ it = null; });
				}

				nextResult = null; // clean up memory
				return prNext;
			})(nextResult);
		})(),
	};
}
