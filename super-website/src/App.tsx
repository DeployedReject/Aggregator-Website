import { useState, useEffect, useMemo } from 'react';
import type { SourcePlugin, MediaItem, EpisodeItem, SourceFilterState } from './types/plugin';
import type { LibraryItem, DownloadItem } from './types/library';
import { loadPlugins, getPluginById, subscribePluginChanges } from './services/pluginRegistry';
import {
  loadLibrary,
  addToLibrary,
  removeFromLibrary,
  updateWatchProgress,
  loadCategories,
  addCategory,
  loadActiveSourceId,
  loadSourceFilter,
  saveSourceFilter,
} from './services/storageService';
import {
  subscribeDownloads,
  downloadEpisode,
  clearDownloads,
} from './services/downloadService';
import { Navbar } from './components/Navbar';
import { BrowseView } from './components/BrowseView';
import { LibraryView } from './components/LibraryView';
import { DownloadsView } from './components/DownloadsView';
import { MediaModal } from './components/MediaModal';
import { PlayerModal } from './components/PlayerModal';

export default function App() {
  const [plugins, setPlugins] = useState<SourcePlugin[]>([]);
  const [sourceFilter, setSourceFilter] = useState<SourceFilterState>({});
  const [activeTab, setActiveTab] = useState<'browse' | 'library' | 'downloads'>('browse');
  const [library, setLibrary] = useState<LibraryItem[]>([]);
  const [categories, setCategories] = useState<string[]>([]);
  const [downloads, setDownloads] = useState<DownloadItem[]>([]);
  const [selectedMediaState, setSelectedMediaState] = useState<{
    media: MediaItem;
    plugin: SourcePlugin;
  } | null>(null);
  const [playingState, setPlayingState] = useState<{
    episode: EpisodeItem;
    allEpisodes: EpisodeItem[];
    plugin: SourcePlugin;
  } | null>(null);

  useEffect(() => {
    async function init() {
      const all = await loadPlugins();
      setPlugins(all);

      const [savedFilter, savedSource] = await Promise.all([
        loadSourceFilter(),
        loadActiveSourceId(),
      ]);
      if (savedFilter && Object.keys(savedFilter).length > 0) {
        setSourceFilter(savedFilter);
      } else if (savedSource && savedSource !== 'all') {
        setSourceFilter({ [savedSource]: 'include' });
      }

      const [lib, cats] = await Promise.all([loadLibrary(), loadCategories()]);
      setLibrary(lib);
      setCategories(cats);

      const ext = globalThis as unknown as {
        browser?: { runtime?: { sendMessage(msg: unknown): Promise<unknown> } };
        chrome?: { runtime?: { sendMessage(msg: unknown): Promise<unknown> } };
      };
      const extAPI = ext.browser || ext.chrome;
      if (extAPI?.runtime?.sendMessage) {
        extAPI.runtime.sendMessage({ action: 'SYNC_AD_RULES' }).catch(() => {});
      }
    }
    init();

    const unsubDownloads = subscribeDownloads((items) => setDownloads(items));
    const unsubPlugins = subscribePluginChanges((updated) => setPlugins(updated));
    return () => {
      unsubDownloads();
      unsubPlugins();
    };
  }, []);

  async function handleToggleSourceFilter(id: string) {
    const current = sourceFilter[id];
    let next: 'include' | 'exclude' | undefined = undefined;
    if (!current) {
      next = 'include'; // 1st click: selects / includes
    } else if (current === 'include') {
      next = 'exclude'; // 2nd click: excludes
    } else {
      next = undefined; // 3rd click: deselects / neutral
    }

    const updated: SourceFilterState = { ...sourceFilter };
    if (next) {
      updated[id] = next;
    } else {
      delete updated[id];
    }
    setSourceFilter(updated);
    await saveSourceFilter(updated);
  }

  async function handleResetSourceFilter() {
    setSourceFilter({});
    await saveSourceFilter({});
  }

  const effectivePlugins = useMemo(() => {
    const includes = plugins.filter((p) => sourceFilter[p.id] === 'include');
    const excludes = new Set(plugins.filter((p) => sourceFilter[p.id] === 'exclude').map((p) => p.id));

    if (includes.length > 0) {
      return includes.filter((p) => !excludes.has(p.id));
    }
    return plugins.filter((p) => !excludes.has(p.id));
  }, [plugins, sourceFilter]);

  async function handleAddToLibrary(media: MediaItem, category: string, pluginId: string) {
    const item: LibraryItem = {
      media,
      pluginId,
      category,
      addedAt: Date.now(),
    };
    await addToLibrary(item);
    const updated = await loadLibrary();
    setLibrary(updated);
  }

  async function handleRemoveFromLibrary(mediaId: string) {
    await removeFromLibrary(mediaId);
    const updated = await loadLibrary();
    setLibrary(updated);
  }

  async function handleAddCategory(cat: string) {
    const updatedCats = await addCategory(cat);
    setCategories(updatedCats);
  }

  async function handleChangeCategory(mediaId: string, category: string) {
    const item = library.find((entry) => entry.media.id === mediaId);
    if (!item) return;
    item.category = category;
    await addToLibrary(item);
    const updated = await loadLibrary();
    setLibrary(updated);
  }

  async function handlePlayEpisode(ep: EpisodeItem, allEps: EpisodeItem[], plugin: SourcePlugin) {
    setPlayingState({ episode: ep, allEpisodes: allEps, plugin });
    if (selectedMediaState) {
      await updateWatchProgress(selectedMediaState.media.id, ep.id, ep.number);
      const updated = await loadLibrary();
      setLibrary(updated);
    }
  }

  async function handleDownloadEpisode(media: MediaItem, ep: EpisodeItem, plugin: SourcePlugin) {
    try {
      const streams = await plugin.getStreams(ep.id);
      if (streams.length > 0) {
        await downloadEpisode(media.title, ep.number, streams[0].url, plugin.id);
      } else {
        alert('Could not find download stream for this episode.');
      }
    } catch (err) {
      alert(`Download failed: ${err instanceof Error ? err.message : 'Unknown error'}`);
    }
  }

  function handleOpenLibraryItem(libItem: LibraryItem) {
    const plugin = getPluginById(libItem.pluginId) || plugins[0];
    if (plugin) {
      setSelectedMediaState({ media: libItem.media, plugin });
    }
  }

  const selectedMediaLibraryItem = selectedMediaState
    ? library.find((item) => item.media.id === selectedMediaState.media.id)
    : undefined;

  const isTrial = typeof window !== 'undefined' && (
    new URLSearchParams(window.location.search).get('trial') === 'true' ||
    new URLSearchParams(window.location.search).has('trialPluginId')
  );

  return (
    <div style={{ minHeight: '100vh', display: 'flex', flexDirection: 'column' }}>
      <Navbar
        activeTab={activeTab}
        onTabChange={setActiveTab}
        plugins={plugins}
        sourceFilter={sourceFilter}
        onToggleSourceFilter={handleToggleSourceFilter}
        onResetSourceFilter={handleResetSourceFilter}
        downloadCount={downloads.filter((d) => d.status === 'downloading').length}
      />

      {isTrial && (
        <div
          style={{
            backgroundColor: '#1b143f',
            borderBottom: '2px solid var(--purple)',
            color: 'var(--purple)',
            padding: '8px 16px',
            fontSize: '11px',
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
            fontWeight: 'bold',
          }}
        >
          <span>
            [TRIAL MODE: Isolated Test for {plugins[0]?.name || 'Newly Generated Plugin'}]
          </span>
          <span style={{ fontSize: '10px', color: 'var(--text-light)', fontWeight: 'normal' }}>
            Test browsing, searching & playback here. Return to the Generator tab to Approve [✓] or Report Issues [✗].
          </span>
        </div>
      )}

      <main style={{ flex: 1, display: 'flex', flexDirection: 'column' }}>
        {activeTab === 'browse' && (
          <BrowseView
            plugins={plugins}
            activePlugins={effectivePlugins}
            library={library}
            onSelectMedia={(media, plugin) => setSelectedMediaState({ media, plugin })}
            onOpenLibraryItem={handleOpenLibraryItem}
          />
        )}

        {activeTab === 'library' && (
          <LibraryView
            library={library}
            categories={categories}
            onSelectMedia={(media) => {
              const item = library.find((entry) => entry.media.id === media.id);
              if (item) handleOpenLibraryItem(item);
            }}
            onRemoveMedia={handleRemoveFromLibrary}
            onAddCategory={handleAddCategory}
            onChangeCategory={handleChangeCategory}
          />
        )}

        {activeTab === 'downloads' && (
          <DownloadsView
            downloads={downloads}
            onClearDownloads={clearDownloads}
          />
        )}
      </main>

      {selectedMediaState && (
        <MediaModal
          media={selectedMediaState.media}
          plugin={selectedMediaState.plugin}
          categories={categories}
          libraryItem={selectedMediaLibraryItem}
          onClose={() => setSelectedMediaState(null)}
          onAddToLibrary={(media, category) =>
            handleAddToLibrary(media, category, selectedMediaState.plugin.id)
          }
          onRemoveFromLibrary={handleRemoveFromLibrary}
          onPlayEpisode={(ep, all) =>
            handlePlayEpisode(ep, all, selectedMediaState.plugin)
          }
          onDownloadEpisode={(media, ep) =>
            handleDownloadEpisode(media, ep, selectedMediaState.plugin)
          }
        />
      )}

      {playingState && (
        <PlayerModal
          episode={playingState.episode}
          allEpisodes={playingState.allEpisodes}
          plugin={playingState.plugin}
          onClose={() => setPlayingState(null)}
          onSelectEpisode={(ep) =>
            handlePlayEpisode(ep, playingState.allEpisodes, playingState.plugin)
          }
        />
      )}
    </div>
  );
}
