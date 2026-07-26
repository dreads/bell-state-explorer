import { test } from 'node:test';
import assert from 'node:assert/strict';
import { expandCandidates, loadManifest, loadLocaleBundle, detectLocale } from '../src/locale-loader.js';

test('expandCandidates inserts each tag\'s base language right after it', () => {
  assert.deepEqual(expandCandidates(['pt-BR', 'en']), ['pt-BR', 'pt', 'en']);
});

test('expandCandidates dedupes when the base language repeats', () => {
  assert.deepEqual(expandCandidates(['en-US', 'en']), ['en-US', 'en']);
});

test('expandCandidates leaves already-bare language codes alone', () => {
  assert.deepEqual(expandCandidates(['fr', 'de']), ['fr', 'de']);
});

test('expandCandidates handles an empty list', () => {
  assert.deepEqual(expandCandidates([]), []);
});

function fakeFetch(routes) {
  return async (url) => {
    if (!(url in routes)) return { ok: false };
    const body = routes[url];
    return { ok: true, json: async () => body };
  };
}

test('loadManifest returns the parsed array on success', async () => {
  const fetchImpl = fakeFetch({ 'locales/manifest.json': [{ code: 'en', endonym: 'English' }] });
  assert.deepEqual(await loadManifest(fetchImpl), [{ code: 'en', endonym: 'English' }]);
});

test('loadManifest returns [] when the file is missing', async () => {
  const fetchImpl = fakeFetch({});
  assert.deepEqual(await loadManifest(fetchImpl), []);
});

test('loadManifest returns [] when the file is not a JSON array', async () => {
  const fetchImpl = fakeFetch({ 'locales/manifest.json': { not: 'an array' } });
  assert.deepEqual(await loadManifest(fetchImpl), []);
});

test('loadManifest returns [] when fetch itself throws', async () => {
  const fetchImpl = async () => { throw new Error('network down'); };
  assert.deepEqual(await loadManifest(fetchImpl), []);
});

test('loadLocaleBundle returns the parsed bundle on success', async () => {
  const bundle = { meta: { code: 'fr' }, strings: {} };
  const fetchImpl = fakeFetch({ 'locales/fr.json': bundle });
  assert.deepEqual(await loadLocaleBundle('fr', fetchImpl), bundle);
});

test('loadLocaleBundle returns null on a 404', async () => {
  const fetchImpl = fakeFetch({});
  assert.equal(await loadLocaleBundle('xx', fetchImpl), null);
});

test('detectLocale returns the first candidate that resolves', async () => {
  const bundle = { meta: { code: 'fr' }, strings: {} };
  const fetchImpl = fakeFetch({ 'locales/fr.json': bundle });
  assert.deepEqual(await detectLocale(['de', 'fr', 'en'], fetchImpl), { code: 'fr', bundle });
});

test('detectLocale stops at "en" without fetching lower-priority candidates', async () => {
  let calls = 0;
  const fetchImpl = async (url) => { calls += 1; return { ok: false }; };
  const result = await detectLocale(['xx', 'en', 'fr'], fetchImpl);
  assert.equal(result, null);
  // 'xx' is tried (miss), then 'en' short-circuits before 'fr' is ever fetched.
  assert.equal(calls, 1);
});

test('detectLocale returns null when nothing matches and "en" never appears', async () => {
  const fetchImpl = fakeFetch({});
  assert.equal(await detectLocale(['de', 'it'], fetchImpl), null);
});
