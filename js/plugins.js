// Plugin registry: lets you bolt custom tools / actions / panels onto the studio.

export const registry = {
  tools: [],
  resultActions: [],
  settingsPanels: [],
  promptTransforms: [],
  startup: [],
};

export function registerPlugin(plugin) {
  if (!plugin || !plugin.id) throw new Error('plugin.id is required');
  if (registry.tools.some((t) => t.id === plugin.id)) return;
  const p = { ...plugin };
  if (Array.isArray(p.tools)) registry.tools.push(...p.tools.map((t) => ({ ...t, pluginId: p.id })));
  if (Array.isArray(p.resultActions)) registry.resultActions.push(...p.resultActions.map((t) => ({ ...t, pluginId: p.id })));
  if (Array.isArray(p.settingsPanels)) registry.settingsPanels.push(...p.settingsPanels.map((t) => ({ ...t, pluginId: p.id })));
  if (Array.isArray(p.promptTransforms)) registry.promptTransforms.push(...p.promptTransforms.map((t) => ({ ...t, pluginId: p.id })));
  if (typeof p.startup === 'function') registry.startup.push(p);
}

export function applyPromptTransforms(prompt, state) {
  let out = prompt;
  for (const fn of registry.promptTransforms) {
    try {
      const next = fn(out, state);
      if (typeof next === 'string') out = next;
    } catch (e) {
      console.warn('[plugin] prompt transform failed', e);
    }
  }
  return out;
}

export async function loadPlugins() {
  try {
    await import('../plugins/index.js');
  } catch (e) {
    console.warn('No external plugins loaded:', e.message);
  }
}

export function pluginCount() {
  const ids = new Set([...registry.tools.map((t) => t.pluginId), ...registry.resultActions.map((t) => t.pluginId), ...registry.settingsPanels.map((t) => t.pluginId)]);
  return ids.size;
}
