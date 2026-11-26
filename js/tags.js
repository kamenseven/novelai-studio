// Local Danbooru tag dictionary for instant autocomplete.
// data/tags.json is built by dev/fetch_tags.py (top ~20k tags by post count).

export const TAG_CATEGORIES = {
  0: { key: 'general', label: '通用', color: '#5aa0ff' },
  1: { key: 'artist', label: '画师', color: '#ff9f43' },
  3: { key: 'copyright', label: '作品', color: '#c084fc' },
  4: { key: 'character', label: '角色', color: '#39d3b1' },
  5: { key: 'meta', label: '元', color: '#8b93a8' },
};

let entries = null;
let loading = null;

function normalize(raw) {
  return raw.reduce((acc, [name, cat, count]) => {
    const display = name.replace(/_/g, ' ');
    acc.push({
      raw: name,
      display,
      lower: display.toLowerCase(),
      rawLower: name.toLowerCase(),
      cat,
      count,
    });
    return acc;
  }, []);
}

export function loadTags() {
  if (entries) return Promise.resolve(entries);
  if (loading) return loading;
  loading = fetch('./data/tags.json', { cache: 'force-cache' })
    .then((r) => {
      if (!r.ok) throw new Error('tag data ' + r.status);
      return r.json();
    })
    .then((d) => {
      entries = normalize(d.tags || []);
      return entries;
    })
    .catch((e) => {
      console.warn('tag dictionary unavailable:', e.message);
      entries = [];
      return entries;
    })
    .finally(() => {
      loading = null;
    });
  return loading;
}

export function tagsLoaded() {
  return !!entries;
}

export function searchTags(query, limit = 10) {
  if (!entries || !query) return [];
  const q = query.toLowerCase().trim();
  if (!q) return [];
  const qUnderscore = q.replace(/\s+/g, '_');
  const out = [];
  for (const e of entries) {
    let score = 0;
    if (e.lower.startsWith(q)) score = 100;
    else if (e.rawLower.startsWith(qUnderscore)) score = 98;
    else if (e.lower.includes(' ' + q)) score = 72;
    else if (e.lower.includes(q)) score = 45;
    else if (e.rawLower.includes(qUnderscore)) score = 40;
    if (!score) continue;
    out.push({ e, score: score + Math.log10(e.count + 10) });
  }
  out.sort((a, b) => b.score - a.score);
  return out.slice(0, limit).map(({ e }) => ({
    tag: e.display,
    label: e.display,
    category: e.cat,
    count: e.count,
    source: 'local',
  }));
}

export function tagCount(name) {
  if (!entries) return 0;
  const lower = name.replace(/_/g, ' ').toLowerCase();
  const hit = entries.find((e) => e.lower === lower);
  return hit ? hit.count : 0;
}

export function formatTagCount(n) {
  if (!n) return '';
  if (n >= 1e6) return (n / 1e6).toFixed(1).replace(/\.0$/, '') + 'M';
  if (n >= 1e3) return (n / 1e3).toFixed(1).replace(/\.0$/, '') + 'k';
  return String(n);
}
