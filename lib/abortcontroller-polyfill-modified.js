// polyfill for AbortController, adapted from: https://github.com/mo/abortcontroller-polyfill

/* istanbul ignore next */
(function UMD(context,definition){
	if (typeof define === "function" && define.amd) { define(definition); }
	else { definition(context); }
})(typeof global !== "undefined" ? global : typeof self !== "undefined" ? self : this,function DEF(context){
	"use strict";

	if (context.AbortController) {
		return;
	}

	class Emitter {
		constructor() {
			const delegate = typeof document != "undefined" ?
				document.createDocumentFragment() :
				{};
			const methods = ["addEventListener", "dispatchEvent", "removeEventListener"];
			methods.forEach(method =>
				this[method] = (...args) => (delegate[method] && delegate[method](...args))
			);
		}
	}

	class AbortSignal extends Emitter {
		constructor() {
			super();
			this.aborted = false;
		}
		toString() {
			return "[object AbortSignal]";
		}
	}

	class AbortController {
		constructor() {
			this.signal = new AbortSignal();
		}
		abort() {
			this.signal.aborted = true;
			try {
				this.signal.dispatchEvent(new Event("abort"));
			} catch (e) {
				if (typeof document != "undefined") {
					// For Internet Explorer 11:
					const event = document.createEvent("Event");
					event.initEvent("abort", false, true);
					this.signal.dispatchEvent(event);
				}
			}
		}
		toString() {
			return "[object AbortController]";
		}
	}

	if (typeof Symbol !== "undefined" && Symbol.toStringTag) {
		// These are necessary to make sure that we get correct output for:
		// Object.prototype.toString.call(new AbortController())
		AbortController.prototype[Symbol.toStringTag] = "AbortController";
		AbortSignal.prototype[Symbol.toStringTag] = "AbortSignal";
	}

	context.AbortController = AbortController;
	context.AbortSignal = AbortSignal;
});
