"use strict";

var {
	TIMEOUT_TOKEN,

	cancelToken,
	signalPromise,
	processTokenOrSignal,
} = require("./shared.js");

// assign public API as CAG() function
module.exports = CAG;


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
			throw signal.reason || "Aborted";
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

function isPromise(pr) {
	return (pr && typeof pr == "object" && typeof pr.then == "function");
}

function deferred() {
	var resolve;
	var pr = new Promise(function c(res){
		resolve = res;
	});
	return { pr, resolve };
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
