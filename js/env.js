// Reads the project-root `env` file at runtime (public on static hosting).
// Only NOVEL_AI_TOKEN is consumed here.

let cached = null;
let loading = null;

export function loadEnv() {
  if (cached) return Promise.resolve(cached);
  if (loading) return loading;
  loading = fetch('./env', { cache: 'no-store' })
    .then((r) => (r.ok ? r.text() : ''))
    .then((text) => {
      const out = {};
      for (const line of text.split(/\r?\n/)) {
        const s = line.trim();
        if (!s || s.startsWith('#')) continue;
        const i = s.indexOf('=');
        if (i < 0) continue;
        const key = s.slice(0, i).trim();
        const val = s.slice(i + 1).trim().replace(/^["']|["']$/g, '');
        if (key) out[key] = val;
      }
      cached = out;
      return out;
    })
    .catch(() => {
      cached = {};
      return cached;
    })
    .finally(() => {
      loading = null;
    });
  return loading;
}
