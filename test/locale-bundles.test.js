import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

// This is the shape check a contributed locale PR is expected to pass (see
// README's Internationalization section / CLAUDE.md): every locales/*.json
// file gets validated here, the same way export.test.js hand-checks the
// export payload's shape — no schema-validation library, matching this
// project's zero-dependency convention.

const LOCALES_DIR = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', 'locales');
const REQUIRED_META = ['code', 'endonym', 'englishName', 'direction', 'targetsVersion'];

function bundleFiles() {
  return fs.readdirSync(LOCALES_DIR).filter((file) => file.endsWith('.json') && file !== 'manifest.json');
}

function readBundle(file) {
  return JSON.parse(fs.readFileSync(path.join(LOCALES_DIR, file), 'utf8'));
}

// en.json is the single source of truth for English strings — no separate
// .js copy to keep in sync.
const en = readBundle('en.json');

test('at least one contributed locale bundle exists to validate', () => {
  assert.ok(bundleFiles().length > 0);
});

test('every locale bundle file is valid JSON with the required top-level shape', () => {
  bundleFiles().forEach((file) => {
    const bundle = readBundle(file);
    assert.ok(bundle.meta, `${file} is missing "meta"`);
    assert.ok(bundle.strings, `${file} is missing "strings"`);
  });
});

test('every locale bundle has all required meta fields, a valid direction, and a plausible BCP-47 code', () => {
  bundleFiles().forEach((file) => {
    const { meta } = readBundle(file);
    REQUIRED_META.forEach((key) => {
      assert.ok(key in meta, `${file} is missing meta.${key}`);
    });
    assert.ok(['ltr', 'rtl'].includes(meta.direction), `${file} has an invalid meta.direction: ${meta.direction}`);
    assert.match(meta.code, /^[a-z]{2,3}(-[A-Z][a-z]{3})?(-[A-Z]{2})?$/, `${file}'s meta.code "${meta.code}" isn't a plausible BCP-47 tag`);
  });
});

test('every locale bundle only references sections/keys that exist in locales/en.json (catches typos)', () => {
  bundleFiles().forEach((file) => {
    if (file === 'en.json') return; // it IS the reference, nothing to check against itself
    const { strings } = readBundle(file);
    Object.entries(strings).forEach(([section, sectionStrings]) => {
      assert.ok(en.strings[section], `${file} has an unknown strings section "${section}" (not in locales/en.json)`);
      Object.keys(sectionStrings).forEach((key) => {
        assert.ok(
          key in en.strings[section],
          `${file}'s strings.${section} has an unknown key "${key}" (not in locales/en.json — check for a typo)`
        );
      });
    });
  });
});

test('every value in every locale bundle is a string (no accidental objects/numbers)', () => {
  bundleFiles().forEach((file) => {
    const { strings } = readBundle(file);
    Object.entries(strings).forEach(([section, sectionStrings]) => {
      Object.entries(sectionStrings).forEach(([key, value]) => {
        assert.equal(typeof value, 'string', `${file}'s strings.${section}.${key} should be a string, got ${typeof value}`);
      });
    });
  });
});

test('the qaa and qab mock bundles are complete (cover every key in locales/en.json)', () => {
  ['qaa.json', 'qab.json'].forEach((file) => {
    if (!fs.existsSync(path.join(LOCALES_DIR, file))) return;
    const { strings } = readBundle(file);
    Object.entries(en.strings).forEach(([section, sectionStrings]) => {
      Object.keys(sectionStrings).forEach((key) => {
        assert.ok(
          strings[section] && key in strings[section],
          `${file} is missing strings.${section}.${key} — it's meant to be a complete bundle`
        );
      });
    });
  });
});
