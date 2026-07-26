/**
 * Discovers and loads locale bundles contributed via PR (locales/<code>.json).
 * English itself is never fetched — it's the static `locales/en.js` import
 * and always available — so every function here is about finding something
 * *other than* English, with `null`/`[]` meaning "nothing found, use English."
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
 * Fetch locales/manifest.json — the list of locales offered in the language
 * picker. Returns [] on any failure (missing file, bad JSON, network error)
 * so a broken or absent manifest never breaks the app; the picker just ends
 * up offering only English.
 */
export async function loadManifest(fetchImpl = fetch, url = 'locales/manifest.json') {
  const manifest = await fetchJSON(url, fetchImpl);
  return Array.isArray(manifest) ? manifest : [];
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
