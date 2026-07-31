/**
 * Discovers and loads locale bundles, including English (locales/<code>.json,
 * `en` is not special-cased here — see app.js's ensureEnglish(), which fetches
 * it via loadLocaleBundle('en') the same as any other locale). `detectLocale`
 * below still treats "en" as a stopping point rather than a fetch target,
 * since English never needs auto-detecting — it's the built-in default.
 * `null`/`[]` throughout means "nothing found, default render stands."
 */

/**
 * Expand a browser language-preference list into an ordered list of
 * candidate locale codes to probe: each tag, then its base language,
 * deduped, order preserved. Pure — no network, no DOM.
 *   expandCandidates(['pt-BR', 'en']) -> ['pt-BR', 'pt', 'en']
 */
export function expandCandidates(languages) {
  const seen = new Set();
  const candidates = [];
  for (const tag of languages) {
    const base = tag.split('-')[0];
    for (const code of [tag, base]) {
      if (!seen.has(code)) {
        seen.add(code);
        candidates.push(code);
      }
    }
  }
  return candidates;
}

async function fetchJSON(url, fetchImpl) {
  try {
    const response = await fetchImpl(url);
    if (!response.ok) return null;
    return await response.json();
  } catch {
    return null;
  }
}

/**
 * Strips full-line `//` comments (only when `//` is the first non-whitespace
 * on the line, so it can never misfire on a value that merely contains
 * "//" somewhere). Lets locales/manifest.json use ordinary JS-style
 * comments to toggle entries by hand, even though JSON itself has no
 * comment syntax — this file is a dev/maintainer toggle list, not
 * contributed content, so it's the one place that convenience is worth it.
 */
function stripLineComments(text) {
  return text
    .split('\n')
    .filter((line) => !line.trim().startsWith('//'))
    .join('\n');
}

/**
 * Fetch locales/manifest.json — the list of locales offered in the language
 * picker. Returns [] on any failure (missing file, bad JSON, network error)
 * so a broken or absent manifest never breaks the app; the picker just ends
 * up offering only English.
 */
export async function loadManifest(fetchImpl = fetch, url = 'locales/manifest.json') {
  try {
    const response = await fetchImpl(url);
    if (!response.ok) return [];
    const manifest = JSON.parse(stripLineComments(await response.text()));
    return Array.isArray(manifest) ? manifest : [];
  } catch {
    return [];
  }
}

/**
 * Fetch a single locale bundle by code. Returns null if it doesn't exist or
 * fails to parse. This is what makes a locally-copied bundle file "just
 * work": detectLocale() below calls this directly, independent of the
 * manifest, so a file dropped into locales/ is found without editing
 * manifest.json at all — the manifest only affects what shows up as a
 * pickable option, not what's detectable.
 */
export async function loadLocaleBundle(code, fetchImpl = fetch, baseUrl = 'locales/') {
  return fetchJSON(`${baseUrl}${code}.json`, fetchImpl);
}

/**
 * Try each candidate derived from `languages`, in preference order, until
 * one resolves to an actual bundle file. Stops and returns null as soon as
 * "en" is reached in the candidate list — English is already the
 * guaranteed default, so nothing lower-priority than it is worth trying.
 */
export async function detectLocale(languages, fetchImpl = fetch, baseUrl = 'locales/') {
  for (const code of expandCandidates(languages)) {
    if (code === 'en') return null;
    const bundle = await loadLocaleBundle(code, fetchImpl, baseUrl);
    if (bundle) return { code, bundle };
  }
  return null;
}
