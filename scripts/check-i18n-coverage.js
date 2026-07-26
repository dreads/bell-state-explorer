#!/usr/bin/env node
/**
 * Heuristic guard against new hardcoded, user-visible strings that bypass
 * the i18n system (locales/en.js + data-i18n + t()/translate()/interpolate()).
 *
 * This is NOT a full HTML/JS parser — it's deliberately conservative and
 * scoped to the exact patterns this project uses, so it catches real
 * regressions without pretending to be a general-purpose linter. Mark a
 * genuinely non-translatable element with the `data-i18n-exempt` attribute
 * (see index.html's language-name <option> and the four qubit/phase/family
 * buttons for examples) rather than special-casing it in this script —
 * the exemption should live next to the markup it exempts, not drift out
 * of sync in a second file.
 *
 * Run: npm run lint:i18n
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import en from '../locales/en.js';

const ROOT = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const problems = [];

function getPath(obj, dotPath) {
  return dotPath.split('.').reduce((node, segment) => (node == null ? undefined : node[segment]), obj);
}

// ---------------------------------------------------------------------
// 1. index.html: known text-bearing tags must carry data-i18n, unless
//    marked data-i18n-exempt or genuinely empty/symbol-only in the source
//    (JS-managed content that's set on the very first synchronous render).
// ---------------------------------------------------------------------
const html = fs.readFileSync(path.join(ROOT, 'index.html'), 'utf8');

const TEXT_TAGS = ['h1', 'h2', 'h3', 'legend', 'label', 'button', 'caption', 'option', 'p', 'div', 'span'];
const tagPattern = new RegExp(`<(${TEXT_TAGS.join('|')})\\b([^>]*)>([^<]*)</\\1>`, 'g');

let m;
while ((m = tagPattern.exec(html))) {
  const [, tag, attrs, text] = m;
  if (/\bdata-i18n=/.test(attrs)) continue;
  if (/\bdata-i18n-exempt\b/.test(attrs)) continue;
  if (!/[a-zA-Z]{2,}/.test(text)) continue; // no real word content: icons, ket notation, empty JS-managed slots
  problems.push(
    `index.html: <${tag}> has untagged text ${JSON.stringify(text.trim())} — ` +
    `add data-i18n="namespace.key" (and the key to locales/en.js), or data-i18n-exempt if it's ` +
    `genuinely not translatable content.`
  );
}

// ---------------------------------------------------------------------
// 2. <title>/<meta name="description"> aren't data-i18n-tagged (app.js's
//    applyStaticText() sets them specially since they don't use
//    textContent), so they can silently drift from the real source of
//    truth if only one copy gets edited. Keep them byte-identical.
// ---------------------------------------------------------------------
const titleMatch = html.match(/<title>([^<]*)<\/title>/);
if (titleMatch && titleMatch[1] !== en.strings.ui.docTitle) {
  problems.push(
    `index.html <title> ("${titleMatch[1]}") no longer matches locales/en.js ui.docTitle ` +
    `("${en.strings.ui.docTitle}") — update both together.`
  );
}
const metaMatch = html.match(/<meta name="description" content="([^"]*)"/);
if (metaMatch && metaMatch[1] !== en.strings.ui.metaDescription) {
  problems.push('index.html <meta name="description"> no longer matches locales/en.js ui.metaDescription — update both together.');
}

// ---------------------------------------------------------------------
// 3. Every data-i18n="key" in index.html must resolve to a real key in
//    locales/en.js — a typo here silently renders the raw key at runtime
//    (see src/i18n.js translate()'s last-resort fallback).
// ---------------------------------------------------------------------
const i18nAttrPattern = /data-i18n="([^"]+)"/g;
while ((m = i18nAttrPattern.exec(html))) {
  const key = m[1];
  if (getPath(en.strings, key) === undefined) {
    problems.push(`index.html: data-i18n="${key}" does not resolve to any key in locales/en.js`);
  }
}

// ---------------------------------------------------------------------
// 4. src/*.js: flag `.textContent = "literal"` assignments — the exact
//    anti-pattern for text that bypasses translate()/t()/interpolate().
//    Renderer modules' DEFAULT_STRINGS objects are plain object-literal
//    properties, not .textContent assignments, so they never trigger this
//    on their own; template literals containing ${...} (ket notation like
//    `|${q0}⟩`) are deliberately not flagged — see state.js's NOT-
//    TRANSLATABLE precedent for math notation.
// ---------------------------------------------------------------------
const SRC_DIR = path.join(ROOT, 'src');
const literalAssignPattern = /\.textContent\s*=\s*(['"])((?:(?!\1).)*)\1|\.textContent\s*=\s*`([^`$]*)`/;

fs.readdirSync(SRC_DIR)
  .filter((file) => file.endsWith('.js'))
  .forEach((file) => {
    const lines = fs.readFileSync(path.join(SRC_DIR, file), 'utf8').split('\n');
    lines.forEach((line, i) => {
      const found = line.match(literalAssignPattern);
      if (!found) return;
      const text = found[2] ?? found[3] ?? '';
      if (!/[a-zA-Z]{2,}/.test(text)) return; // symbols/identifiers only
      problems.push(`src/${file}:${i + 1}: hardcoded .textContent literal ${JSON.stringify(text)} — use t()/translate()/interpolate() instead.`);
    });
  });

// ---------------------------------------------------------------------
if (problems.length) {
  console.error(`i18n coverage check found ${problems.length} issue(s):\n`);
  problems.forEach((p) => console.error(`  - ${p}`));
  console.error(
    '\nIf a finding is a false positive for genuinely non-translatable content, add ' +
    'data-i18n-exempt (HTML) next to it rather than adjusting this script\'s logic.'
  );
  process.exit(1);
} else {
  console.log('i18n coverage check: no hardcoded strings or drifted keys found.');
}
