"use strict";

const CLEANUP_FN = Symbol("Cleanup Function");
const TIMEOUT_TOKEN = Symbol("Timeout Token");
const REASON = Symbol("Signal Reason");
const UNSET = Symbol("Unset");

class cancelToken {
	constructor(controller = new AbortController()) {
		this.controller = controller;
		this.signal = controller.signal;
		// `AbortSignal` only recently got `reason`
		this.signalHasReasonDefined = !!Object.getOwnPropertyDescriptor(
			Object.getPrototypeOf(this.signal),
			"reason"
		);
		this.signal[REASON] = UNSET;
		var cleanup;
		// note: => arrow functions used here for lexical this
		var initPromise = (res,rej) => {
			var doRej = () => {
				if (rej && this.signal) {
					let reason = this._getSignalReason();
					reason = (
						(reason !== UNSET && !isNativeAbortException(reason)) ?
							reason :
							UNSET
					);

					// make sure `reason` is tracked, especially
					// for older `AbortSignal` where it's a CAF-only
					// extension
					this._trackSignalReason(reason);

					rej(reason !== UNSET ? reason : undefined);
				}
				rej = null;
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
		this.signal.pr = new Promise(initPromise);
		this.signal.pr[CLEANUP_FN] = cleanup;
		this.signal.pr.catch(cleanup);
		initPromise = cleanup = null;
	}
	abort(...args) {
		var reason = (args.length > 0 ? args[0] : UNSET);
		this._trackSignalReason(reason);
		if (this.controller) {
			/* istanbul ignore next */
			if (this.signalHasReasonDefined && reason !== UNSET) {
				this.controller.abort(reason);
			}
			else {
				this.controller.abort();
			}
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
			this.signal[REASON] = null;
			/* istanbul ignore else */
			if (!this.signalHasReasonDefined) {
				this.signal.reason = null;
			}
			this.signal = null;
		}
		this.controller = null;
	}
	_trackSignalReason(reason) {
		if (this.signal && reason !== UNSET) {
			// for older `AbortSignal` where `reason`
			// was a CAF-only extension
			if (!this.signalHasReasonDefined && !("reason" in this.signal)) {
				this.signal.reason = reason;
			}
			// keep internal `reason` tracking in sync
			if (this.signal[REASON] === UNSET) {
				this.signal[REASON] = reason;
			}
		}
	}
	_getSignalReason() {
		/* istanbul ignore next */
		return (
			(this.signal && this.signal.aborted) ? (
				this.signalHasReasonDefined ? this.signal.reason :
				this.signal[REASON]
			) :
			UNSET
		);
	}
}

module.exports = {
	CLEANUP_FN,
	TIMEOUT_TOKEN,
	UNSET,

	cancelToken,
	signalPromise,
	processTokenOrSignal,
	deferred,
	isFunction,
	isPromise,
	isNativeAbortException,
	invokeAbort,
};
module.exports.CLEANUP_FN = CLEANUP_FN;
module.exports.TIMEOUT_TOKEN = TIMEOUT_TOKEN;
module.exports.UNSET = UNSET;

module.exports.cancelToken = cancelToken;
module.exports.signalPromise = signalPromise;
module.exports.processTokenOrSignal = processTokenOrSignal;
module.exports.deferred = deferred;
module.exports.isFunction = isFunction;
module.exports.isPromise = isPromise;
module.exports.isNativeAbortException = isNativeAbortException;
module.exports.invokeAbort = invokeAbort;


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
		doRej = () => {
			/* istanbul ignore next */
			if (rej && signal) {
				let reason = (
					(
						signal.aborted &&
						("reason" in signal) &&
						!isNativeAbortException(signal.reason)
					) ?
						signal.reason :
						UNSET
				);
				rej(reason !== UNSET ? reason : undefined);
			}
			rej = null;
		};
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

function isNativeAbortException(v) {
	/* istanbul ignore next */
	return (typeof v == "object" && v instanceof Error && v.name == "AbortError");
}

function invokeAbort(ctx,reason) {
	/* istanbul ignore else */
	if (!isNativeAbortException(reason) && reason !== UNSET) {
		ctx.abort(reason);
	}
	else {
		ctx.abort();
	}
}
