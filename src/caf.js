"use strict";

class cancelToken {
	constructor(controller = new AbortController()) {
		this.controller = controller;
		this.signal = controller.signal;
		var cleanup;
		// note: => arrow functions used here for lexical this
		var handleReject = (res,rej) => {
			var doRej = reason => {
				if (rej) {
					reason = (this.signal && this.signal.reason) ? this.signal.reason : reason;
					rej(reason);
					rej = null;
				}
			};
			this.signal.addEventListener("abort",doRej,false);
			cleanup = () => {
				/* istanbul ignore else */
				if (this.signal) {
					this.signal.removeEventListener("abort",doRej,false);
					/* istanbul ignore else */
					if (this.signal.pr) {
						this.signal.pr[CLEANUP_FN] = null;
					}
				}
				doRej = null;
			};
		};
		this.signal.pr = new Promise(handleReject);
		this.signal.pr[CLEANUP_FN] = cleanup;
		this.signal.pr.catch(cleanup);
		handleReject = cleanup = null;
	}
	abort(reason) {
		if (this.signal && !("reason" in this.signal)) {
			this.signal.reason = reason;
		}
		if (this.controller) {
			this.controller.abort();
		}
	}
	discard() {
		/* istanbul ignore else */
		if (this.signal) {
			/* istanbul ignore else */
			if (this.signal.pr) {
				/* istanbul ignore else */
				if (this.signal.pr[CLEANUP_FN]) {
					this.signal.pr[CLEANUP_FN]();
				}
				this.signal.pr = null;
			}
			this.signal = this.signal.reason = null;
		}
		this.controller = null;
	}
}

// assign public API to CAF namespace
module.exports = Object.assign(CAF,{
	cancelToken,
	delay,
	timeout,
	signalRace,
	signalAll,
});


// ***************************************

const TIMEOUT_TOKEN = Symbol("Timeout Token");
const CLEANUP_FN = Symbol("Cleanup Function");

function CAF(generatorFn) {
	return function instance(tokenOrSignal,...args){
		var signal, signalPr;
		({ tokenOrSignal, signal, signalPr, } = processTokenOrSignal(tokenOrSignal));

		// already aborted?
		if (signal.aborted) {
			return signalPr;
		}
		// listen for abort signal
		var cancelation = signalPr.catch(function onCancelation(reason){
			try {
				var ret = it.return();
				throw ((ret.value !== undefined) ? ret.value : reason);
			}
			// clean up memory
			finally {
				it = result = cancelation = completion = null;
			}
		});
		var { it, result, } = _runner.call(this,generatorFn,signal,...args);
		var completion = Promise.race([ result, cancelation, ]);
		if (
			// cancelation token passed in?
			tokenOrSignal !== signal &&
			// recognized special timeout token?
			tokenOrSignal[TIMEOUT_TOKEN]
		) {
			// cancel timeout-token upon instance completion/failure
			// to prevent timer hook from holding process open
			let doCancelTimer = function cancelTimer(){
				tokenOrSignal.abort();
				tokenOrSignal = doCancelTimer = null;
			};
			completion.then(doCancelTimer,doCancelTimer);
		}
		else {
			// silence unhandled rejection warnings
			completion.catch(() => {});
			tokenOrSignal = null;
		}
		signal = args = null; // clean up memory
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
				if (intv) {
					clearTimeout(intv);
					rej(`delay (${ms}) interrupted`);
				}
				res = rej = intv = signal = null;
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
	delay(timeoutToken.signal,duration).then(cleanup,cleanup);

	// branding
	Object.defineProperty(timeoutToken,TIMEOUT_TOKEN,{
		value: true,
		writable: false,
		enumerable: false,
		configurable: false,
	});

	return timeoutToken;


	// *********************************
	function cleanup() {
		timeoutToken.abort(message);
		timeoutToken = null;
	}
}

function signalRace(signals) {
	var token = new cancelToken();
	var prs = signals.map(signalPromise);
	var cleanups = prs.map(pr => pr[CLEANUP_FN]);
	Promise.race(prs).catch(function c(v){
		token.abort(v);
	})
	.then(function t(){
		for (let fn of cleanups) { fn(); }
		cleanups = token = null;
	});
	return token.signal;
}

function signalAll(signals) {
	var token = new cancelToken();
	var prs = signals.map(signalPromise);
	var cleanups = prs.map(pr => pr[CLEANUP_FN]);
	Promise.all(
		// avoid short-circuiting, wait for all to reject
		prs.map(function m(pr){
			return pr.catch(v => v);
		})
	)
	.then(function t(v){
		token.abort(v);
	})
	.then(function t(){
		for (let fn of cleanups) { fn(); }
		cleanups = token = null;
	});
	return token.signal;
}

function signalPromise(signal) {
	if (signal.pr) {
		return signal.pr;
	}

	var doRej;
	var pr = new Promise(function c(res,rej){
		signal.addEventListener("abort",rej,false);
		doRej = rej;
	});
	pr[CLEANUP_FN] = function cleanup(){
		if (signal) {
			signal.removeEventListener("abort",doRej,false);
			signal = null;
		}
		if (pr) {
			pr = pr[CLEANUP_FN] = doRej = null;
		}
	};
	pr.catch(pr[CLEANUP_FN]);
	return pr;
}

function processTokenOrSignal(tokenOrSignal) {
	// received a raw AbortController?
	if (tokenOrSignal instanceof AbortController) {
		tokenOrSignal = new cancelToken(tokenOrSignal);
	}

	var signal = (tokenOrSignal && tokenOrSignal instanceof cancelToken) ?
		tokenOrSignal.signal :
		tokenOrSignal;
	var signalPr = signalPromise(signal);

	return { tokenOrSignal, signal, signalPr, };
}

// thanks to Benjamin Gruenbaum (@benjamingr on GitHub) for
// big improvements here!
function _runner(gen,...args) {
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
