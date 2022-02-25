"use strict";

var CAF = require("./caf.js");
var {
	TIMEOUT_TOKEN,
	UNSET,

	getSignalReason,
	cancelToken,
	signalPromise,
	processTokenOrSignal,
	deferred,
	isFunction,
	isPromise,
} = require("./shared.js");

// wrap the public API method
onceEvent = CAF(onceEvent);

// assign public API as CAG() function
module.exports = Object.assign(CAG,{
	onEvent,
	onceEvent,
});
module.exports.onEvent = onEvent;
module.exports.onceEvent = onceEvent;


// ***************************************

var awaiteds = new WeakSet();
const unset = Symbol("unset");
const returned = Symbol("returned");
const canceled = Symbol("canceled");

function CAG(generatorFn) {
	return function instance(tokenOrSignal,...args){
		var signal, signalPr;
		({ tokenOrSignal, signal, signalPr, } = processTokenOrSignal(tokenOrSignal));

		// already aborted?
		if (signal.aborted) {
			let reason = getSignalReason(signal);
			reason = reason !== UNSET ? reason : "Aborted";
			throw reason;
		}

		var def = deferred();
		var { it, ait, } = runner(generatorFn,def.pr,onComplete,signal,...args);
		var aitRet = ait.return;
		ait.return = doReturn;

		return ait;


		// ***************************

		function onComplete() {
			if (
				tokenOrSignal &&
				// cancellation token passed in?
				tokenOrSignal !== signal &&
				// recognized special timeout token?
				tokenOrSignal[TIMEOUT_TOKEN]
			) {
				// cancel timeout-token upon instance completion/failure
				// to prevent timer hook from holding process open
				tokenOrSignal.abort();
			}

			// need to cleanup?
			if (ait) {
				ait.return = aitRet;
				tokenOrSignal = def = it = ait = aitRet = null;
			}
		}

		function doReturn(v) {
			try {
				def.pr.resolved = true;
				def.resolve(returned);
				return Promise.resolve(it.return(v));
			}
			finally {
				aitRet.call(ait);
				onComplete();
			}
		}
	};
}

function onEvent(token,el,evtName,evtOpts = false) {
	var started = false;
	var prStack;
	var resStack;
	var ait = CAG(eventStream)(token,el,evtName,evtOpts);
	ait.start = start;
	return ait;


	// *********************************

	function start() {
		if (!started) {
			started = true;
			prStack = [];
			resStack = [];

			/* istanbul ignore next: setup event listener */
			if (isFunction(el.addEventListener)) {
				el.addEventListener(evtName,handler,evtOpts);
			}
			else if (isFunction(el.addListener)) {
				el.addListener(evtName,handler);
			}
			else if (isFunction(el.on)) {
				el.on(evtName,handler);
			}
		}
	}

	function *eventStream({ pwait }){
		if (!started) {
			start();
		}

		try {
			while (true) {
				if (prStack.length == 0) {
					let { pr, resolve } = deferred();
					prStack.push(pr);
					resStack.push(resolve);
				}
				yield (yield pwait(prStack.shift()));
			}
		}
		finally {
			/* istanbul ignore next: remove event listener */
			if (isFunction(el.removeEventListener)) {
				el.removeEventListener(evtName,handler,evtOpts);
			}
			else if (isFunction(el.removeListener)) {
				el.removeListener(evtName,handler);
			}
			else if (isFunction(el.off)) {
				el.off(evtName,handler);
			}
			prStack.length = resStack.length = 0;
		}
	}

	function handler(evt) {
		if (resStack.length > 0) {
			let resolve = resStack.shift();
			resolve(evt);
		}
		else {
			let { pr, resolve, } = deferred();
			prStack.push(pr);
			resolve(evt);
		}
	}
}

function *onceEvent(signal,el,evtName,extra = false) {
	try {
		var evtStream = onEvent(signal,el,evtName,extra);
		return (yield evtStream.next()).value;
	}
	finally {
		evtStream.return();
	}
}

function pwait(v) {
	var pr = Promise.resolve(v);
	awaiteds.add(pr);
	return pr;
}

function runner(gen,complete,onComplete,signal,...args) {
	// initialize the generator in the current context
	var it = gen.call(this,{ signal, pwait },...args);
	gen = args = null;

	var canceledPr = signal.pr.catch(reason => {
		throw {
			[canceled]: true,
			reason,
		};
	});
	// silence spurious uncaught rejection warnings
	canceledPr.catch(() => {});

	return {
		it,
		ait: (async function *runner(){
			var res;
			var excp = unset;

			try {
				while (!complete.resolved) {
					if (excp !== unset) {
						res = excp;
						excp = unset;
						res = it.throw(res);
					}
					else {
						res = it.next(res);
					}

					if (isPromise(res.value)) {
						if (awaiteds.has(res.value)) {
							awaiteds.delete(res.value);
							try {
								res = await Promise.race([
									complete,
									canceledPr,
									res.value,
								]);
								if (res === returned) {
									return;
								}
							}
							catch (err) {
								// cancellation token aborted?
								if (err[canceled]) {
									let ret = it.return();
									throw ((ret.value !== undefined) ? ret.value : err.reason);
								}

								excp = err;
							}
						}
						else {
							res = yield res.value;
						}
					}
					else if (res.done) {
						return res.value;
					}
					else {
						res = yield res.value;
					}
				}
			}
			finally {
				it = complete = null;
				onComplete();
			}
		})(),
	};
}
