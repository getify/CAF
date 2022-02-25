"use strict";

const CLEANUP_FN = Symbol("Cleanup Function");
const TIMEOUT_TOKEN = Symbol("Timeout Token");
const REASON = Symbol("Signal Reason");
const UNSET = Symbol("Unset");
const [
	SIGNAL_HAS_REASON_DEFINED,
	MISSING_REASON_EXCEPTION,
] = (function featureDetect(){
	var testAC = new AbortController();
	var hasSignalNativelyDefined = !!Object.getOwnPropertyDescriptor(
		Object.getPrototypeOf(testAC.signal),
		"reason"
	);
	try {
		testAC.abort();
	}
	catch (err) {}
	return [
		hasSignalNativelyDefined,

		// some versions of Node (~16.14) unfortunately define
		// `signal.reason` natively but do NOT have it default
		// to the DOMException if missing, so we need to detect
		isNativeAbortException(testAC.signal.reason),
	];
})();

class cancelToken {
	constructor(controller = new AbortController()) {
		this.controller = controller;
		this.signal = controller.signal;
		this.signal[REASON] = UNSET;
		var cleanup;
		// note: => arrow functions used here for lexical this
		var initPromise = (res,rej) => {
			var doRej = () => {
				if (rej && this.signal) {
					let reason = getSignalReason(this.signal);

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
			if (SIGNAL_HAS_REASON_DEFINED && reason !== UNSET) {
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
			delete this.signal[REASON];
			/* istanbul ignore next */
			if (!SIGNAL_HAS_REASON_DEFINED) {
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
			/* istanbul ignore next */
			if (!SIGNAL_HAS_REASON_DEFINED && !("reason" in this.signal)) {
				this.signal.reason = reason;
			}
			// keep internal `reason` tracking in sync
			if (this.signal[REASON] === UNSET) {
				this.signal[REASON] = reason;
			}
		}
	}
}

module.exports = {
	CLEANUP_FN,
	TIMEOUT_TOKEN,
	UNSET,

	getSignalReason,
	cancelToken,
	signalPromise,
	processTokenOrSignal,
	deferred,
	isFunction,
	isPromise,
	invokeAbort,
};
module.exports.CLEANUP_FN = CLEANUP_FN;
module.exports.TIMEOUT_TOKEN = TIMEOUT_TOKEN;
module.exports.UNSET = UNSET;

module.exports.getSignalReason = getSignalReason;
module.exports.cancelToken = cancelToken;
module.exports.signalPromise = signalPromise;
module.exports.processTokenOrSignal = processTokenOrSignal;
module.exports.deferred = deferred;
module.exports.isFunction = isFunction;
module.exports.isPromise = isPromise;
module.exports.invokeAbort = invokeAbort;


// ***************************************

function getSignalReason(signal) {
	/* istanbul ignore next */
	return (
		(signal && signal.aborted) ? (
			(SIGNAL_HAS_REASON_DEFINED && MISSING_REASON_EXCEPTION) ? (
				!isNativeAbortException(signal.reason) ? signal.reason : UNSET
			) :
			(REASON in signal) ? signal[REASON] :
			UNSET
		) :
		UNSET
	);
}

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
				let reason = getSignalReason(signal);
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
