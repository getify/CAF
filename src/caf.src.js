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
			this.signal.pr = new Promise((_,rej)=>this.rej = rej);
			// silence unhandled rejection warnings
			this.signal.pr.catch(_=>1);
		}
		abort(reason) {
			this.rej(reason);
			this.controller.abort();
		}
	}

	CAF.cancelToken = cancelToken;

	return CAF;


	// ***************************************
	// Private

	function CAF(generatorFn) {
		return function instance(signal,...args){
			// listen for cancelation signal
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
			completion.catch(_=>1);	// silence unhandled rejection warnings
			signal = args = null; // clean up memory
			return completion;
		};
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
