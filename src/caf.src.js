(function UMD(name,context,definition){
	/* istanbul ignore next */if (typeof define === "function" && define.amd) { define(definition); }
	/* istanbul ignore next */else if (typeof module !== "undefined" && module.exports) { module.exports = definition(); }
	/* istanbul ignore next */else { context[name] = definition(name,context); }
})("CAF",this,function DEF(name,context){
	"use strict";

	cancelToken.prototype.cancel = cancel;
	cancelToken.prototype.listen = listen;
	CAF.cancelToken = cancelToken;

	return CAF;


	// ***************************************
	// Private

	function CAF(generatorFn) {
		return function instance(cancelToken,...args){
			var trigger;
			var canceled = new Promise(function c(_,rej){
				trigger = rej;
			});
			var { it, pr } = _runner.call(this,generatorFn,cancelToken,...args);
			cancelToken.listen(function onCancel(reason){
				try { var ret = it.return(); } catch (err) {}
				trigger(ret.value !== undefined ? ret.value : reason);
				it = pr = trigger = null;
			});
			var race = Promise.race([ pr, canceled ]);
			race.catch(_=>1);	// silence unhandled rejection warnings
			return race;
		};
	}

	function cancelToken() {
		this.canceled = false;
		this.cancelationReason = undefined;
		this.listeners = [];
	}
	function cancel(reason) {
		this.cancelationReason = reason;
		this.canceled = true;
		// note: running in LIFO instead of FIFO order
		// to ensure that cascaded cancelations run in
		// expected order
		while (this.listeners.length > 0) {
			let cb = this.listeners.pop();
			try { cb(reason); } catch (err) {}
		}
	}
	function listen(cb) {
		if (this.canceled) {
			try { cb(this.cancelationReason); } catch (err) {}
		}
		else {
			this.listeners.push(cb);
		}
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
