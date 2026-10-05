import type { SourcePlugin, MediaItem, EpisodeItem, StreamSource } from '../types/plugin';

const pluginMap = new Map<string, SourcePlugin>();

interface StorageArea {
  get(key: string | string[]): Promise<Record<string, unknown>>;
}

interface ExtensionAPI {
  storage?: {
    local?: StorageArea;
    onChanged?: {
      addListener(callback: (changes: Record<string, unknown>, areaName: string) => void): void;
    };
  };
  runtime?: {
    sendMessage(message: unknown): Promise<unknown>;
    getURL?(path: string): string;
  };
}

const browserAPI = (globalThis as unknown as { browser?: ExtensionAPI; chrome?: ExtensionAPI }).browser ||
  (globalThis as unknown as { browser?: ExtensionAPI; chrome?: ExtensionAPI }).chrome;

function getCandidateUrls(relativePath: string): string[] {
  const urls: string[] = [];
  if (browserAPI?.runtime?.getURL) {
    try {
      urls.push(browserAPI.runtime.getURL(relativePath));
    } catch (e) {}
  }
  urls.push(`./${relativePath}`);
  urls.push(`/${relativePath}`);
  urls.push(`../../${relativePath}`);
  urls.push(`../../../${relativePath}`);
  urls.push(`../../../../${relativePath}`);
  return urls;
}

let sandboxFrame: HTMLIFrameElement | null = null;
let sandboxReadyPromise: Promise<void> | null = null;
let resolveSandboxReady: (() => void) | null = null;
let isMessageListenerSetup = false;

const pendingCalls = new Map<
  string,
  {
    resolve: (val: unknown) => void;
    reject: (err: unknown) => void;
  }
>();

const pendingRegistrations = new Map<
  string,
  {
    resolve: (meta: {
      id: string;
      name: string;
      baseUrl: string;
      version: string;
      hasHome: boolean;
    }) => void;
    reject: (err: unknown) => void;
  }
>();

function setupSandboxMessageListener() {
  if (isMessageListenerSetup || typeof window === 'undefined') return;
  isMessageListenerSetup = true;

  window.addEventListener('message', async (event) => {
    if (!event.data) return;

    if (event.data.action === 'SANDBOX_READY') {
      if (resolveSandboxReady) {
        resolveSandboxReady();
        resolveSandboxReady = null;
      }
    } else if (event.data.action === 'PROXY_FETCH') {
      const { reqId, url, init } = event.data;
      try {
        const res = await fetch(url, init);
        const body = await res.text();
        const headers: Record<string, string> = {};
        try {
          res.headers.forEach((val, key) => {
            headers[key] = val;
          });
        } catch (e) {}

        sandboxFrame?.contentWindow?.postMessage(
          {
            action: 'PROXY_FETCH_RESPONSE',
            reqId,
            status: res.status,
            statusText: res.statusText,
            ok: res.ok,
            headers,
            body,
          },
          '*'
        );
      } catch (err) {
        sandboxFrame?.contentWindow?.postMessage(
          {
            action: 'PROXY_FETCH_RESPONSE',
            reqId,
            status: 500,
            statusText: 'Network Error',
            ok: false,
            headers: {},
            body: (err as Error).message,
          },
          '*'
        );
      }
    } else if (event.data.action === 'PROXY_MESSAGE') {
      const { reqId, message } = event.data;
      try {
        const response = await browserAPI?.runtime?.sendMessage(message);
        sandboxFrame?.contentWindow?.postMessage(
          {
            action: 'PROXY_MESSAGE_RESPONSE',
            reqId,
            response,
          },
          '*'
        );
      } catch (err) {
        sandboxFrame?.contentWindow?.postMessage(
          {
            action: 'PROXY_MESSAGE_RESPONSE',
            reqId,
            response: { status: 'ERROR', error: (err as Error).message },
          },
          '*'
        );
      }
    } else if (event.data.action === 'PLUGIN_REGISTERED') {
      const { pluginId, success, meta, error } = event.data;
      const pending = pendingRegistrations.get(pluginId);
      if (pending) {
        pendingRegistrations.delete(pluginId);
        if (success && meta) {
          pending.resolve(meta);
        } else {
          pending.reject(new Error(error || 'Failed to register plugin in sandbox'));
        }
      }
    } else if (event.data.action === 'EXECUTE_PLUGIN_METHOD_RESPONSE') {
      const { reqId, success, result, error } = event.data;
      const pending = pendingCalls.get(reqId);
      if (pending) {
        pendingCalls.delete(reqId);
        if (success) {
          pending.resolve(result);
        } else {
          pending.reject(new Error(error || 'Method execution failed'));
        }
      }
    }
  });
}

async function ensureSandbox(): Promise<boolean> {
  if (typeof document === 'undefined') return false;

  if (sandboxFrame && sandboxFrame.parentNode) {
    if (sandboxReadyPromise) {
      await sandboxReadyPromise;
      return true;
    }
    return true;
  }

  setupSandboxMessageListener();

  sandboxReadyPromise = new Promise<void>((resolve) => {
    resolveSandboxReady = resolve;
  });

  const frame = document.createElement('iframe');
  frame.id = 'aggregator-sandbox';
  frame.style.display = 'none';

  let srcUrl = './sandbox.html';
  if (browserAPI?.runtime?.getURL) {
    try {
      srcUrl = browserAPI.runtime.getURL('generator/sandbox.html');
    } catch (e) {}
  }
  frame.src = srcUrl;

  document.body.appendChild(frame);
  sandboxFrame = frame;

  const timeoutPromise = new Promise<void>((resolve) => {
    setTimeout(() => {
      resolve();
    }, 1500);
  });

  frame.onload = () => {
    try {
      frame.contentWindow?.postMessage({ action: 'PING_SANDBOX' }, '*');
    } catch (e) {}
  };

  try {
    frame.contentWindow?.postMessage({ action: 'PING_SANDBOX' }, '*');
  } catch (e) {}

  await Promise.race([sandboxReadyPromise, timeoutPromise]);
  return true;
}

function callSandboxMethod<T>(pluginId: string, method: string, args: unknown[]): Promise<T> {
  const reqId = 'call_' + Math.random().toString(36).substring(2);
  return new Promise<T>((resolve, reject) => {
    pendingCalls.set(reqId, {
      resolve: (val) => resolve(val as T),
      reject,
    });

    if (!sandboxFrame?.contentWindow) {
      pendingCalls.delete(reqId);
      reject(new Error('Sandbox iframe is not available'));
      return;
    }

    sandboxFrame.contentWindow.postMessage(
      {
        action: 'EXECUTE_PLUGIN_METHOD',
        reqId,
        pluginId,
        method,
        args,
      },
      '*'
    );

    setTimeout(() => {
      if (pendingCalls.has(reqId)) {
        pendingCalls.delete(reqId);
        reject(new Error(`Timeout executing ${method} on plugin ${pluginId}`));
      }
    }, 30000);
  });
}

function registerInSandbox(
  pluginId: string,
  code: string
): Promise<{ id: string; name: string; baseUrl: string; version: string; hasHome: boolean }> {
  return new Promise((resolve, reject) => {
    pendingRegistrations.set(pluginId, { resolve, reject });

    if (!sandboxFrame?.contentWindow) {
      pendingRegistrations.delete(pluginId);
      reject(new Error('Sandbox frame not available'));
      return;
    }

    sandboxFrame.contentWindow.postMessage(
      {
        action: 'REGISTER_PLUGIN',
        pluginId,
        code,
      },
      '*'
    );

    setTimeout(() => {
      if (pendingRegistrations.has(pluginId)) {
        pendingRegistrations.delete(pluginId);
        reject(new Error(`Timeout registering plugin ${pluginId} in sandbox`));
      }
    }, 10000);
  });
}

function tryDirectInstantiation(code: string): SourcePlugin | null {
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
  } catch (e) {}
  return null;
}

async function createPluginFromCode(pluginId: string, code: string): Promise<SourcePlugin | null> {
  const direct = tryDirectInstantiation(code);
  if (direct) {
    return direct;
  }

  await ensureSandbox();

  try {
    const meta = await registerInSandbox(pluginId, code);
    const proxy: SourcePlugin = {
      id: meta.id,
      name: meta.name,
      baseUrl: meta.baseUrl,
      version: meta.version || '1.0.0',
      search: (query: string): Promise<MediaItem[]> =>
        callSandboxMethod<MediaItem[]>(meta.id, 'search', [query]),
      getEpisodes: (mediaId: string): Promise<EpisodeItem[]> =>
        callSandboxMethod<EpisodeItem[]>(meta.id, 'getEpisodes', [mediaId]),
      getStreams: (episodeId: string): Promise<StreamSource[]> =>
        callSandboxMethod<StreamSource[]>(meta.id, 'getStreams', [episodeId]),
      getHome: meta.hasHome
        ? (): Promise<MediaItem[]> => callSandboxMethod<MediaItem[]>(meta.id, 'getHome', [])
        : undefined,
    };
    return proxy;
  } catch (e) {
    return null;
  }
}

export async function loadPlugins(): Promise<SourcePlugin[]> {
  pluginMap.clear();

  let uninstalled = new Set<string>();
  let installed: Record<string, { id?: string; name?: string; code?: string }> = {};

  if (browserAPI?.storage?.local) {
    try {
      const data = await browserAPI.storage.local.get([
        'aggregator_installed_plugins',
        'aggregator_uninstalled_plugins',
      ]);
      if (data && data.aggregator_installed_plugins) {
        installed = {
          ...installed,
          ...(data.aggregator_installed_plugins as Record<string, { id?: string; name?: string; code?: string }>),
        };
      }
      if (data && Array.isArray(data.aggregator_uninstalled_plugins)) {
        uninstalled = new Set(data.aggregator_uninstalled_plugins.map(String));
      }
    } catch (e) {}
  }

  if (Object.keys(installed).length === 0 && browserAPI?.runtime?.sendMessage) {
    try {
      const bgData = (await browserAPI.runtime.sendMessage({
        action: 'GET_INSTALLED_PLUGINS',
      })) as Record<string, { id?: string; name?: string; code?: string }>;
      if (bgData && typeof bgData === 'object') {
        installed = { ...installed, ...bgData };
      }
    } catch (e) {}
  }

  try {
    const raw = localStorage.getItem('aggregator_installed_plugins');
    if (raw) {
      const localData = JSON.parse(raw);
      if (localData && typeof localData === 'object') {
        installed = { ...localData, ...installed };
      }
    }
  } catch (e) {}

  if (installed['www_animeonsen_xyz']) {
    const old = installed['www_animeonsen_xyz'];
    delete installed['www_animeonsen_xyz'];
    installed['animeonsen'] = {
      ...old,
      id: 'animeonsen',
      name: 'AnimeOnsen',
      code: (old.code || '').replace(/["']www_animeonsen_xyz["']/g, '"animeonsen"').replace(/["']WWW Provider["']/g, '"AnimeOnsen"'),
    };
  }

  for (const id in installed) {
    if (uninstalled.has(id)) continue;
    const item = installed[id];
    if (item && item.code && !pluginMap.has(id)) {
      const plugin = await createPluginFromCode(item.id || id, item.code);
      if (plugin) {
        pluginMap.set(plugin.id, plugin);
      }
    }
  }

  let pluginFiles: string[] = [];
  const jsonCandidates = getCandidateUrls('plugins/plugins.json');

  for (const jsonUrl of jsonCandidates) {
    try {
      const res = await fetch(jsonUrl, { cache: 'no-store' });
      if (res.ok) {
        const list = await res.json();
        if (Array.isArray(list) && list.length > 0) {
          pluginFiles = list;
          break;
        }
      }
    } catch (e) {}
  }

  const candidateFiles = pluginFiles;

  for (const file of candidateFiles) {
    const derivedId = file.replace(/\.js$/i, '').toLowerCase();
    if (uninstalled.has(derivedId) || pluginMap.has(derivedId)) continue;

    const fileCandidates = getCandidateUrls(`plugins/${file}`);
    for (const url of fileCandidates) {
      try {
        const res = await fetch(url, { cache: 'no-store' });
        if (res.ok) {
          const code = await res.text();
          if (code && (code.includes('search') || code.includes('export default') || code.includes('module.exports'))) {
            const plugin = await createPluginFromCode(derivedId, code);
            if (plugin) {
              pluginMap.set(plugin.id, plugin);
              break;
            }
          }
        }
      } catch (e) {}
    }
  }

  return Array.from(pluginMap.values());
}

export function subscribePluginChanges(callback: (plugins: SourcePlugin[]) => void): () => void {
  const handler = async () => {
    const list = await loadPlugins();
    callback(list);
  };

  if (browserAPI?.storage?.onChanged) {
    try {
      browserAPI.storage.onChanged.addListener(handler);
    } catch (e) {}
  }

  if (typeof window !== 'undefined') {
    window.addEventListener('focus', handler);
  }

  return () => {
    if (typeof window !== 'undefined') {
      window.removeEventListener('focus', handler);
    }
  };
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
