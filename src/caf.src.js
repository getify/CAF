(function UMD(name,context,definition){
	/* istanbul ignore next */if (typeof define === "function" && define.amd) { define(definition); }
	/* istanbul ignore next */else if (typeof module !== "undefined" && module.exports) { module.exports = definition(name,context); }
	/* istanbul ignore next */else { context[name] = definition(name,context); }
})("CAF",this,function DEF(name,context){
	"use strict";

	class cancelToken {
		constructor() {
			this.controller = new AbortController();
			this.pr = new Promise((_,rej)=>this.rej = rej);
			// silence unhandled rejection warnings
			this.pr.catch(_=>1);
		}
		abort(reason) {
			this.rej(reason);
			this.controller.abort();
		}
		get signal() {
			this.controller.signal.pr = this.pr;
			return this.controller.signal;
		}
	}

	CAF.cancelToken = cancelToken;

	return CAF;


	// ***************************************
	// Private

	function CAF(generatorFn) {
		return function instance(signal,...args){
			var cancelation = signal.pr.catch(function onCancel(reason){
				try {
					var ret = it.return();
					throw ret.value !== undefined ? ret.value : reason;
				}
				finally { it = success = cancelation = null; }
			});
			var { it, success } = _runner.call(this,generatorFn,signal,...args);
			var completion = Promise.race([ success, cancelation ]);
			completion.catch(_=>1);	// silence unhandled rejection warnings
			return completion;
		};
	}

	// thanks to Benjamin Gruenbaum (@benjamingr on GitHub) for
	// big improvements here!
	function _runner(gen,...args) {
		// initialize the generator in the current context
		var it = gen.apply(this,args);

		// return a promise for the generator completing
		return {
			it,
			success: (function handleNext(value){
					// this `try` is only necessary to catch
					// an immediate exception on the first iteration
					// of the generator.
					try {
						// run to the next yielded value
						var next = it.next(value);

						return (function handleResult(next){
							// generator has completed running?
							if (next.done) {
								return Promise.resolve(next.value);
							}
							// otherwise keep going
							else {
								return Promise.resolve(next.value)
									.then(
										// resume the async loop on
										// success, sending the resolved
										// value back into the generator
										handleNext,

										// if `value` is a rejected
										// promise, propagate error back
										// into the generator for its own
										// error handling
										function handleErr(err) {
											return Promise.resolve(
												it.throw(err)
											)
											.then(handleResult);
										}
									);
							}
						})(next);
					}
					catch (err) {
						// immediate exception becomes rejection
						return Promise.reject(err);
					}
				})()
		};
	}

});
