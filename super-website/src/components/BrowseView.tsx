import { useState, useEffect, type FormEvent } from 'react';
import type { SourcePlugin, MediaItem } from '../types/plugin';
import type { LibraryItem } from '../types/library';
import { fetchTrendingAnime, type AniListTrendingItem } from '../services/anilistService';

interface Props {
  plugins: SourcePlugin[];
  activePluginId: string;
  library: LibraryItem[];
  onSelectMedia: (item: MediaItem, plugin: SourcePlugin) => void;
  onOpenLibraryItem: (item: LibraryItem) => void;
}

interface SourceResultGroup {
  plugin: SourcePlugin;
  items: MediaItem[];
  error?: string;
}

export function BrowseView({
  plugins,
  activePluginId,
  library,
  onSelectMedia,
  onOpenLibraryItem,
}: Props) {
  const [query, setQuery] = useState('');
  const [trending, setTrending] = useState<AniListTrendingItem[]>([]);
  const [loadingTrending, setLoadingTrending] = useState(true);
  const [trendingError, setTrendingError] = useState<string | null>(null);

  const [pluginHomeItems, setPluginHomeItems] = useState<SourceResultGroup[]>([]);
  const [searchResults, setSearchResults] = useState<SourceResultGroup[]>([]);
  const [isSearching, setIsSearching] = useState(false);
  const [hasSearched, setHasSearched] = useState(false);

  useEffect(() => {
    let active = true;
    async function loadTrending() {
      try {
        setLoadingTrending(true);
        const data = await fetchTrendingAnime(12);
        if (active) {
          setTrending(data);
          setTrendingError(null);
        }
      } catch (err) {
        if (active) {
          setTrendingError(err instanceof Error ? err.message : 'Failed to load trending anime');
        }
      } finally {
        if (active) setLoadingTrending(false);
      }
    }
    loadTrending();
    return () => {
      active = false;
    };
  }, []);

  useEffect(() => {
    let active = true;
    async function loadPluginHomes() {
      const homePlugins = plugins.filter((p) => typeof p.getHome === 'function');
      if (homePlugins.length === 0) return;
      const results = await Promise.all(
        homePlugins.map(async (plugin) => {
          try {
            const items = await plugin.getHome!();
            return { plugin, items };
          } catch {
            return { plugin, items: [] };
          }
        })
      );
      if (active) {
        setPluginHomeItems(results.filter((r) => r.items.length > 0));
      }
    }
    loadPluginHomes();
    return () => {
      active = false;
    };
  }, [plugins]);

  async function performSearch(searchQuery: string) {
    const q = searchQuery.trim();
    if (!q) return;

    setIsSearching(true);
    setHasSearched(true);

    const targetPlugins = activePluginId && activePluginId !== 'all'
      ? plugins.filter((p) => p.id === activePluginId)
      : plugins;

    const promises = targetPlugins.map(async (plugin) => {
      try {
        const items = await plugin.search(q);
        return { plugin, items };
      } catch (err) {
        return {
          plugin,
          items: [],
          error: err instanceof Error ? err.message : 'Search failed',
        };
      }
    });

    const settled = await Promise.all(promises);
    setSearchResults(settled);
    setIsSearching(false);
  }

  function handleFormSubmit(e: FormEvent) {
    e.preventDefault();
    performSearch(query);
  }

  function handleTrendingClick(title: string) {
    setQuery(title);
    performSearch(title);
  }

  function handleClearSearch() {
    setQuery('');
    setHasSearched(false);
    setSearchResults([]);
  }

  const totalResults = searchResults.reduce((acc, g) => acc + g.items.length, 0);
  const targetPlugins = activePluginId && activePluginId !== 'all'
    ? plugins.filter((p) => p.id === activePluginId)
    : plugins;

  return (
    <div style={{ padding: '20px', maxWidth: '1200px', margin: '0 auto', width: '100%' }}>
      <form
        onSubmit={handleFormSubmit}
        style={{
          display: 'flex',
          gap: '10px',
          marginBottom: '24px',
          justifyContent: 'center',
          flexWrap: 'wrap',
        }}
      >
        <input
          type="text"
          className="agInput"
          placeholder="Search all sources..."
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          style={{ width: '340px', maxWidth: '100%' }}
        />
        <button type="submit" className="agBtnBlue" disabled={isSearching}>
          {isSearching ? 'SEARCHING...' : 'GLOBAL SEARCH'}
        </button>
        {hasSearched && (
          <button
            type="button"
            className="agBtnGray"
            onClick={handleClearSearch}
            style={{ fontSize: '10px' }}
          >
            HOME
          </button>
        )}
      </form>

      {isSearching && (
        <div style={{ textAlign: 'center', padding: '40px 0', fontSize: '12px', color: 'var(--blue)' }}>
          QUERYING SOURCES SIMULTANEOUSLY...
        </div>
      )}

      {hasSearched && !isSearching && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '30px' }}>
          {totalResults === 0 ? (
            <div style={{ textAlign: 'center', padding: '40px 0', fontSize: '11px', color: 'var(--text-muted)' }}>
              {targetPlugins.length === 0
                ? 'NO SOURCES INSTALLED. OPEN THE EXTENSION MENU TO INSTALL SOURCES.'
                : `NO RESULTS FOUND ACROSS ${searchResults.length} SOURCE(S).`}
            </div>
          ) : (
            searchResults.map((group) => {
              if (group.items.length === 0 && !group.error) return null;
              return (
                <section key={group.plugin.id} style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
                  <div
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      gap: '10px',
                      borderBottom: '2px solid #000000',
                      paddingBottom: '8px',
                    }}
                  >
                    <span style={{ fontSize: '13px', color: 'var(--text-light)', fontWeight: 'bold' }}>
                      {group.plugin.name}
                    </span>
                    <span className="agBadge agBadgePurple">
                      {group.items.length} RESULTS
                    </span>
                    {group.error && (
                      <span className="agBadge agBadgeRed">
                        {group.error}
                      </span>
                    )}
                  </div>

                  <div
                    style={{
                      display: 'grid',
                      gridTemplateColumns: 'repeat(auto-fill, minmax(180px, 1fr))',
                      gap: '16px',
                    }}
                  >
                    {group.items.map((item) => (
                      <div
                        key={item.id}
                        className="agCard"
                        onClick={() => onSelectMedia(item, group.plugin)}
                        style={{
                          display: 'flex',
                          flexDirection: 'column',
                          justifyContent: 'space-between',
                          cursor: 'pointer',
                        }}
                      >
                        <div style={{ width: '100%', height: '230px', backgroundColor: '#111317', overflow: 'hidden', marginBottom: '8px' }}>
                          {item.coverUrl ? (
                            <img
                              src={item.coverUrl}
                              alt={item.title}
                              style={{ width: '100%', height: '100%', objectFit: 'cover' }}
                              loading="lazy"
                            />
                          ) : (
                            <div style={{ display: 'flex', height: '100%', alignItems: 'center', justifyContent: 'center', fontSize: '9px', color: 'var(--text-muted)' }}>
                              NO POSTER
                            </div>
                          )}
                        </div>
                        <div style={{ fontSize: '10px', color: 'var(--text-light)', marginBottom: '10px', lineHeight: '1.4', wordBreak: 'break-word' }}>
                          {item.title}
                        </div>
                        <button
                          type="button"
                          className="agBtnPurple"
                          style={{ width: '100%', fontSize: '9px', padding: '6px' }}
                          onClick={(e) => {
                            e.stopPropagation();
                            onSelectMedia(item, group.plugin);
                          }}
                        >
                          EPISODES
                        </button>
                      </div>
                    ))}
                  </div>
                </section>
              );
            })
          )}
        </div>
      )}

      {!hasSearched && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '32px' }}>
          {pluginHomeItems.map((group) => (
            <section key={group.plugin.id} style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
              <div
                style={{
                  display: 'flex',
                  justifyContent: 'space-between',
                  alignItems: 'center',
                  borderBottom: '2px solid #000000',
                  paddingBottom: '8px',
                }}
              >
                <span style={{ fontSize: '13px', color: 'var(--text-light)', fontWeight: 'bold' }}>
                  FEATURED FROM {group.plugin.name.toUpperCase()}
                </span>
                <span className="agBadge agBadgeBlue">
                  {group.items.length} TITLES
                </span>
              </div>

              <div
                style={{
                  display: 'grid',
                  gridTemplateColumns: 'repeat(auto-fill, minmax(170px, 1fr))',
                  gap: '14px',
                }}
              >
                {group.items.map((item) => (
                  <div
                    key={item.id}
                    className="agCard"
                    onClick={() => onSelectMedia(item, group.plugin)}
                    style={{
                      display: 'flex',
                      flexDirection: 'column',
                      justifyContent: 'space-between',
                      cursor: 'pointer',
                    }}
                  >
                    <div style={{ width: '100%', height: '220px', backgroundColor: '#111317', overflow: 'hidden', marginBottom: '8px' }}>
                      {item.coverUrl ? (
                        <img
                          src={item.coverUrl}
                          alt={item.title}
                          style={{ width: '100%', height: '100%', objectFit: 'cover' }}
                          loading="lazy"
                        />
                      ) : (
                        <div style={{ display: 'flex', height: '100%', alignItems: 'center', justifyContent: 'center', fontSize: '9px', color: 'var(--text-muted)' }}>
                          NO POSTER
                        </div>
                      )}
                    </div>
                    <div style={{ fontSize: '10px', color: 'var(--text-light)', marginBottom: '8px', lineHeight: '1.4' }}>
                      {item.title}
                    </div>
                    <button
                      type="button"
                      className="agBtnPurple"
                      style={{ width: '100%', fontSize: '8px', padding: '5px' }}
                      onClick={(e) => {
                        e.stopPropagation();
                        onSelectMedia(item, group.plugin);
                      }}
                    >
                      VIEW EPISODES
                    </button>
                  </div>
                ))}
              </div>
            </section>
          ))}

          {library.length > 0 && (
            <section style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
              <div
                style={{
                  display: 'flex',
                  justifyContent: 'space-between',
                  alignItems: 'center',
                  borderBottom: '2px solid #000000',
                  paddingBottom: '8px',
                }}
              >
                <span style={{ fontSize: '13px', color: 'var(--text-light)', fontWeight: 'bold' }}>
                  CONTINUE FROM YOUR LIBRARY
                </span>
                <span className="agBadge agBadgeGreen">
                  {library.length} SAVED
                </span>
              </div>

              <div
                style={{
                  display: 'grid',
                  gridTemplateColumns: 'repeat(auto-fill, minmax(180px, 1fr))',
                  gap: '14px',
                }}
              >
                {library.slice(0, 6).map((libItem) => (
                  <div
                    key={libItem.media.id}
                    className="agCard"
                    onClick={() => onOpenLibraryItem(libItem)}
                    style={{
                      display: 'flex',
                      flexDirection: 'column',
                      justifyContent: 'space-between',
                      cursor: 'pointer',
                    }}
                  >
                    <div style={{ width: '100%', height: '220px', backgroundColor: '#111317', overflow: 'hidden', marginBottom: '8px' }}>
                      {libItem.media.coverUrl ? (
                        <img
                          src={libItem.media.coverUrl}
                          alt={libItem.media.title}
                          style={{ width: '100%', height: '100%', objectFit: 'cover' }}
                          loading="lazy"
                        />
                      ) : (
                        <div style={{ display: 'flex', height: '100%', alignItems: 'center', justifyContent: 'center', fontSize: '9px', color: 'var(--text-muted)' }}>
                          NO POSTER
                        </div>
                      )}
                    </div>
                    <div style={{ fontSize: '10px', color: 'var(--text-light)', marginBottom: '8px', lineHeight: '1.4' }}>
                      {libItem.media.title}
                    </div>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                      <span className="agBadge agBadgePurple" style={{ fontSize: '8px' }}>
                        {libItem.category}
                      </span>
                      {libItem.lastWatchedEpisodeNum !== undefined && (
                        <span className="agBadge agBadgeGreen" style={{ fontSize: '8px' }}>
                          EP {libItem.lastWatchedEpisodeNum}
                        </span>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            </section>
          )}

          <section style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
            <div
              style={{
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'center',
                borderBottom: '2px solid #000000',
                paddingBottom: '8px',
              }}
            >
              <span style={{ fontSize: '13px', color: 'var(--text-light)', fontWeight: 'bold' }}>
                TRENDING NOW (ANILIST)
              </span>
              <span style={{ fontSize: '9px', color: 'var(--text-muted)' }}>
                CLICK TO SEARCH SOURCES
              </span>
            </div>

            {loadingTrending && (
              <div style={{ textAlign: 'center', padding: '30px 0', fontSize: '11px', color: 'var(--blue)' }}>
                LOADING POPULAR TITLES FROM ANILIST...
              </div>
            )}

            {trendingError && (
              <div style={{ textAlign: 'center', padding: '20px 0', fontSize: '11px', color: 'var(--red)' }}>
                {trendingError}
              </div>
            )}

            {!loadingTrending && !trendingError && (
              <div
                style={{
                  display: 'grid',
                  gridTemplateColumns: 'repeat(auto-fill, minmax(170px, 1fr))',
                  gap: '14px',
                }}
              >
                {trending.map((item) => (
                  <div
                    key={item.id}
                    className="agCard"
                    onClick={() => handleTrendingClick(item.title)}
                    style={{
                      display: 'flex',
                      flexDirection: 'column',
                      justifyContent: 'space-between',
                      cursor: 'pointer',
                    }}
                  >
                    <div style={{ width: '100%', height: '220px', backgroundColor: '#111317', overflow: 'hidden', marginBottom: '8px' }}>
                      {item.coverUrl ? (
                        <img
                          src={item.coverUrl}
                          alt={item.title}
                          style={{ width: '100%', height: '100%', objectFit: 'cover' }}
                          loading="lazy"
                        />
                      ) : (
                        <div style={{ display: 'flex', height: '100%', alignItems: 'center', justifyContent: 'center', fontSize: '9px', color: 'var(--text-muted)' }}>
                          NO POSTER
                        </div>
                      )}
                    </div>
                    <div style={{ fontSize: '10px', color: 'var(--text-light)', marginBottom: '8px', lineHeight: '1.4' }}>
                      {item.title}
                    </div>
                    <button
                      type="button"
                      className="agBtnCyan"
                      style={{ width: '100%', fontSize: '8px', padding: '5px' }}
                      onClick={(e) => {
                        e.stopPropagation();
                        handleTrendingClick(item.title);
                      }}
                    >
                      SEARCH SOURCES
                    </button>
                  </div>
                ))}
              </div>
            )}
          </section>
        </div>
      )}
    </div>
  );
}
