(function UMD(name,context,definition){
	/* istanbul ignore next */if (typeof define === "function" && define.amd) { define(definition); }
	/* istanbul ignore next */else if (typeof module !== "undefined" && module.exports) { module.exports = definition(name,context); }
	/* istanbul ignore next */else { context[name] = definition(name,context); }
})("CAF",this,function DEF(name,context){
	"use strict";

	class cancelSignal extends AbortSignal {
		constructor() {
			super();
			this.pr = new Promise((_,rej)=>this.rej = rej);
			this.pr.catch(_=>1);	// silence unhandled rejection warnings
		}
	}

	class cancelToken extends AbortController {
		constructor() {
			super();
			this.signal = new cancelSignal();
		}
		abort(reason) {
			super.abort();
			this.signal.rej(reason);
		}
	}

	CAF.cancelToken = cancelToken;

	return CAF;


	// ***************************************
	// Private

	function CAF(generatorFn) {
		return function instance(cancelToken,...args){
			var { it, pr } = _runner.call(this,generatorFn,cancelToken,...args);
			var cancel = cancelToken.pr.catch(function onCancel(reason){
				try {
					var ret = it.return();
					throw ret.value !== undefined ? ret.value : reason;
				}
				finally { it = pr = cancel = null; }
			});
			var race = Promise.race([ pr, cancel ]);
			race.catch(_=>1);	// silence unhandled rejection warnings
			return race;
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
			pr: Promise.resolve(
					(function handleNext(value){
						// run to the next yielded value
						var next = it.next(value);

						return (function handleResult(next){
							// generator has completed running?
							if (next.done) {
								return next.value;
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
					})()
				)
		};
	}

});
