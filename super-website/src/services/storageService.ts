import type { LibraryItem } from '../types/library';
import { DEFAULT_CATEGORIES } from '../types/library';

interface StorageArea {
  get(key: string): Promise<Record<string, unknown>>;
  set(items: Record<string, unknown>): Promise<void>;
}

interface ExtensionAPI {
  storage?: {
    local?: StorageArea;
  };
}

const browserAPI = (globalThis as unknown as { browser?: ExtensionAPI; chrome?: ExtensionAPI }).browser ||
  (globalThis as unknown as { browser?: ExtensionAPI; chrome?: ExtensionAPI }).chrome;

const LIB_KEY = 'aggregator_library';
const CAT_KEY = 'aggregator_categories';
const SRC_KEY = 'aggregator_active_source';

async function getItem<T>(key: string, fallback: T): Promise<T> {
  if (browserAPI?.storage?.local) {
    const res = await browserAPI.storage.local.get(key);
    return res[key] !== undefined ? (res[key] as T) : fallback;
  }
  const val = localStorage.getItem(key);
  if (!val) return fallback;
  try {
    return JSON.parse(val) as T;
  } catch {
    return fallback;
  }
}

async function setItem<T>(key: string, val: T): Promise<void> {
  if (browserAPI?.storage?.local) {
    await browserAPI.storage.local.set({ [key]: val });
    return;
  }
  localStorage.setItem(key, JSON.stringify(val));
}

export async function loadLibrary(): Promise<LibraryItem[]> {
  return getItem<LibraryItem[]>(LIB_KEY, []);
}

export async function saveLibrary(items: LibraryItem[]): Promise<void> {
  await setItem(LIB_KEY, items);
}

export async function addToLibrary(item: LibraryItem): Promise<void> {
  const lib = await loadLibrary();
  const idx = lib.findIndex((entry) => entry.media.id === item.media.id);
  if (idx >= 0) {
    lib[idx] = item;
  } else {
    lib.unshift(item);
  }
  await saveLibrary(lib);
}

export async function removeFromLibrary(mediaId: string): Promise<void> {
  const lib = await loadLibrary();
  const filtered = lib.filter((entry) => entry.media.id !== mediaId);
  await saveLibrary(filtered);
}

export async function updateWatchProgress(
  mediaId: string,
  epId: string,
  epNum: number
): Promise<void> {
  const lib = await loadLibrary();
  const item = lib.find((entry) => entry.media.id === mediaId);
  if (item) {
    item.lastWatchedEpisodeId = epId;
    item.lastWatchedEpisodeNum = epNum;
    item.lastWatchedAt = Date.now();
    await saveLibrary(lib);
  }
}

export async function loadCategories(): Promise<string[]> {
  return getItem<string[]>(CAT_KEY, [...DEFAULT_CATEGORIES]);
}

export async function saveCategories(cats: string[]): Promise<void> {
  await setItem(CAT_KEY, cats);
}

export async function addCategory(category: string): Promise<string[]> {
  const trimmed = category.trim();
  if (!trimmed) return loadCategories();
  const cats = await loadCategories();
  if (!cats.includes(trimmed)) {
    cats.push(trimmed);
    await saveCategories(cats);
  }
  return cats;
}

export async function loadActiveSourceId(): Promise<string | null> {
  return getItem<string | null>(SRC_KEY, null);
}

export async function saveActiveSourceId(id: string): Promise<void> {
  await setItem(SRC_KEY, id);
}
