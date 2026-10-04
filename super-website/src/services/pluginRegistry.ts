import type { SourcePlugin } from '../types/plugin';

const pluginMap = new Map<string, SourcePlugin>();

interface StorageArea {
  get(key: string): Promise<Record<string, unknown>>;
}

interface ExtensionAPI {
  storage?: {
    local?: StorageArea;
  };
}

const browserAPI = (globalThis as unknown as { browser?: ExtensionAPI; chrome?: ExtensionAPI }).browser ||
  (globalThis as unknown as { browser?: ExtensionAPI; chrome?: ExtensionAPI }).chrome;

function instantiatePlugin(code: string): SourcePlugin | null {
  try {
    const executableCode = code
      .replace(/\bexport\s+default\s+([a-zA-Z0-9_$]+)\s*;?/g, 'module.exports = $1; module.exports.default = $1;')
      .replace(/\bexport\s+default\s+/g, 'module.exports.default = ')
      .replace(/\bexport\s+(const|let|var|function|class)\s+/g, '$1 ');

    const fn = new Function('module', 'exports', executableCode);
    const mockModule = { exports: {} as Record<string, unknown> };
    fn(mockModule, mockModule.exports);

    const plugin = (mockModule.exports.default || mockModule.exports) as SourcePlugin;
    if (plugin && typeof plugin.id === 'string' && typeof plugin.search === 'function') {
      return plugin;
    }
  } catch (err) {}
  return null;
}

export async function loadPlugins(): Promise<SourcePlugin[]> {
  pluginMap.clear();

  try {
    let installed: Record<string, { code?: string }> = {};

    if (browserAPI?.storage?.local) {
      const data = await browserAPI.storage.local.get('aggregator_installed_plugins');
      installed = (data.aggregator_installed_plugins as Record<string, { code?: string }>) || {};
    } else {
      const raw = localStorage.getItem('aggregator_installed_plugins');
      if (raw) {
        installed = JSON.parse(raw);
      }
    }

    for (const id in installed) {
      const item = installed[id];
      if (item && item.code) {
        const plugin = instantiatePlugin(item.code);
        if (plugin) {
          pluginMap.set(plugin.id, plugin);
        }
      }
    }
  } catch (err) {}

  return Array.from(pluginMap.values());
}

export function getAllPlugins(): SourcePlugin[] {
  return Array.from(pluginMap.values());
}

export function getPluginById(id: string): SourcePlugin | undefined {
  return pluginMap.get(id);
}

export function registerPlugin(plugin: SourcePlugin): void {
  pluginMap.set(plugin.id, plugin);
}
