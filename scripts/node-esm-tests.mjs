#!/usr/bin/env node

import { createRequire } from "module";
const require = createRequire(import.meta.url);

require("../dist/abortcontroller-polyfill-only.js");

import { CAF, CAG } from "../dist/esm/index.mjs";
global.CAF = CAF;
global.CAG = CAG;

global.QUnit = require("qunit");

require("../tests/qunit.config.js");
require("../tests/tests.js");

QUnit.start();
