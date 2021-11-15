"use strict";

const CLEANUP_FN = Symbol("Cleanup Function");
const TIMEOUT_TOKEN = Symbol("Timeout Token");

class cancelToken {
	constructor(controller = new AbortController()) {
		this.controller = controller;
		this.signal = controller.signal;
		var cleanup;
		// note: => arrow functions used here for lexical this
		var handleReject = (res,rej) => {
			var doRej = () => {
				if (rej) {
					var reason = (
						(this.signal && this.signal.reason) ?
							this.signal.reason :
							undefined
					);
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

module.exports = {
	CLEANUP_FN,
	TIMEOUT_TOKEN,
	cancelToken,
	signalPromise,
	processTokenOrSignal,
	deferred,
	isFunction,
	isPromise,
};
module.exports.CLEANUP_FN = CLEANUP_FN;
module.exports.TIMEOUT_TOKEN = TIMEOUT_TOKEN;
module.exports.cancelToken = cancelToken;
module.exports.signalPromise = signalPromise;
module.exports.processTokenOrSignal = processTokenOrSignal;
module.exports.deferred = deferred;
module.exports.isFunction = isFunction;
module.exports.isPromise = isPromise;


// ***************************************

function signalPromise(signal) {
	if (signal.pr) {
		return signal.pr;
	}

	// the rest of this is only used by signalRace/signalAll
	// in cases where native AbortController signals are
	// passed in, rather than signals vended by CAF
	var doRej;
	var pr = new Promise(function c(res,rej){
		doRej = () => rej();
		signal.addEventListener("abort",doRej,false);
	});
	pr[CLEANUP_FN] = function cleanup(){
		/* istanbul ignore else */
		if (signal) {
			signal.removeEventListener("abort",doRej,false);
			signal = null;
		}
		/* istanbul ignore else */
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

function deferred() {
	var resolve, pr = new Promise(res => resolve = res);
	return { pr, resolve };
}

function isFunction(v) {
	return typeof v == "function";
}

function isPromise(pr) {
	return (pr && typeof pr == "object" && typeof pr.then == "function");
}
