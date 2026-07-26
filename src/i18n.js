/**
 * Minimal, dependency-free string lookup. A locale bundle is a plain nested
 * object (see locales/en.js); `key` is a dot path into it, e.g.
 * "interpret.fully-dephased".
 */

function getPath(bundle, path) {
  return path.split('.').reduce((node, segment) => (node == null ? undefined : node[segment]), bundle);
}

function interpolate(template, params) {
  return template.replace(/\{(\w+)\}/g, (match, name) =>
    Object.prototype.hasOwnProperty.call(params, name) ? String(params[name]) : match
  );
}

/**
 * Look up `key` in `bundle`, falling back to `fallbackBundle` per-key when
 * missing. This is what lets a partial or outdated locale bundle keep
 * working indefinitely: it just shows the fallback language for whatever
 * key it doesn't have yet, rather than breaking or needing maintainer
 * intervention every time a new string is added elsewhere in the app.
 * If neither bundle has the key, the key itself is returned so a missing
 * translation is visibly obvious rather than silently blank.
 */
export function translate(bundle, fallbackBundle, key, params = {}) {
  const template = getPath(bundle, key) ?? getPath(fallbackBundle, key);
  if (template == null) return key;
  return interpolate(template, params);
}

export { getPath, interpolate };
