#!/usr/bin/env node
/* RELIC WARS — headless test runner.
   Concatenates the pure-rule scripts and the test body into one scope. */
'use strict';
const fs = require('fs');
const path = require('path');
const vm = require('vm');

const root = path.join(__dirname, '..');
const src = [
  fs.readFileSync(path.join(root, 'js/engine.js'), 'utf8'),
  fs.readFileSync(path.join(root, 'js/ai.js'), 'utf8'),
  fs.readFileSync(path.join(__dirname, 'tests.js'), 'utf8'),
].join('\n;\n');

const sandbox = { console, JSON, Math, Object, Array, String, Number, Set, Error, parseInt, isNaN };
vm.createContext(sandbox);
try {
  vm.runInContext(src, sandbox, { filename: 'relicwars-tests.js' });
  process.exit(0);
} catch (e) {
  console.error(e);
  process.exit(1);
}
