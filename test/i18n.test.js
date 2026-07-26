import { test } from 'node:test';
import assert from 'node:assert/strict';
import { translate, getPath, interpolate } from '../src/i18n.js';

const en = { greeting: { hello: 'Hello, {name}!' }, farewell: 'Goodbye.' };
const partial = { greeting: { hello: 'Salut, {name} !' } };

test('getPath resolves a dot path into a nested bundle', () => {
  assert.equal(getPath(en, 'greeting.hello'), 'Hello, {name}!');
  assert.equal(getPath(en, 'farewell'), 'Goodbye.');
});

test('getPath returns undefined for a missing path without throwing', () => {
  assert.equal(getPath(en, 'greeting.missing'), undefined);
  assert.equal(getPath(en, 'nope.nested.deep'), undefined);
});

test('interpolate substitutes named placeholders', () => {
  assert.equal(interpolate('Hello, {name}!', { name: 'Ada' }), 'Hello, Ada!');
  assert.equal(interpolate('{a} and {b}', { a: 1, b: 2 }), '1 and 2');
});

test('interpolate leaves an unmatched placeholder visible rather than blanking it', () => {
  assert.equal(interpolate('Hello, {name}!', {}), 'Hello, {name}!');
});

test('translate resolves a key present in the primary bundle', () => {
  assert.equal(translate(partial, en, 'greeting.hello', { name: 'Ada' }), 'Salut, Ada !');
});

test('translate falls back per-key to the fallback bundle when missing', () => {
  assert.equal(translate(partial, en, 'farewell'), 'Goodbye.');
});

test('translate returns the key itself when neither bundle has it', () => {
  assert.equal(translate(partial, en, 'nothing.here'), 'nothing.here');
});

test('translate defaults params to an empty object', () => {
  assert.equal(translate(en, en, 'farewell'), 'Goodbye.');
});
