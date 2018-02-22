(function UMD(name,context,definition){
	/* istanbul ignore next */if (typeof define === "function" && define.amd) { define(definition); }
	/* istanbul ignore next */else if (typeof module !== "undefined" && module.exports) { module.exports = definition(name,context); }
	/* istanbul ignore next */else { context[name] = definition(name,context); }
})("CAF",this,function DEF(name,context){
	"use strict";

	class cancelToken {
		constructor() {
			this.controller = new AbortController();
			this.signal = this.controller.signal;
			// note: => arrow function used here for lexical this
			this.signal.pr = new Promise((_,rej)=>this.rej = rej);
			// silence unhandled rejection warnings
			this.signal.pr.catch(Function.prototype);
		}
		abort(reason) {
			this.rej(reason);
			this.controller.abort();
		}
	}

	const TIMEOUT_TOKEN = Symbol("Timeout Token");

	CAF.cancelToken = cancelToken;
	CAF.delay = delay;
	CAF.timeout = timeout;

	return CAF;


	// ***************************************

	function CAF(generatorFn) {
		return function instance(tokenOrSignal,...args){
			var signal = (tokenOrSignal instanceof cancelToken) ?
				tokenOrSignal.signal :
				tokenOrSignal;

			// already aborted?
			if (signal.aborted) {
				return signal.pr;
			}
			// listen for abort signal
			var cancelation = signal.pr.catch(function onCancelation(reason){
				try {
					var ret = it.return();
					throw (ret.value !== undefined ? ret.value : reason);
				}
				// clean up memory
				finally { it = result = cancelation = completion = null; }
			});
			var { it, result } = _runner.call(this,generatorFn,signal,...args);
			var completion = Promise.race([ result, cancelation ]);
			if (
				// cancelation token passed in?
				tokenOrSignal !== signal &&
				// recognized special timeout token?
				tokenOrSignal[TIMEOUT_TOKEN]
			) {
				// cancel timeout upon instance completion
				completion.then(
					function t(){tokenOrSignal.abort();},
					function c(){tokenOrSignal.abort();}
				);
			}
			else {
				// silence unhandled rejection warnings
				completion.catch(Function.prototype);
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
			[ms,tokenOrSignal] = [tokenOrSignal,ms];
		}

		var signal = (tokenOrSignal && tokenOrSignal instanceof cancelToken) ?
			tokenOrSignal.signal :
			tokenOrSignal;

		// already aborted?
		if (signal && signal.aborted) {
			return signal.pr;
		}

		return new Promise(function c(res,rej){
			if (signal) {
				signal.pr.catch(function onAbort(){
					if (intv) {
						clearTimeout(intv);
						rej(`delay (${ms}) interrupted`);
					}
					res = rej = intv = signal = null;
				});
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
			})()
		};
	}

});
