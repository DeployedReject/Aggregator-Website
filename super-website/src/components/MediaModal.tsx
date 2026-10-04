import { useState, useEffect } from 'react';
import type { SourcePlugin, MediaItem, EpisodeItem } from '../types/plugin';
import type { LibraryItem } from '../types/library';

interface Props {
  media: MediaItem;
  plugin: SourcePlugin | undefined;
  categories: string[];
  libraryItem: LibraryItem | undefined;
  onClose: () => void;
  onAddToLibrary: (media: MediaItem, category: string) => void;
  onRemoveFromLibrary: (mediaId: string) => void;
  onPlayEpisode: (ep: EpisodeItem, allEps: EpisodeItem[]) => void;
  onDownloadEpisode: (media: MediaItem, ep: EpisodeItem) => void;
}

export function MediaModal({
  media,
  plugin,
  categories,
  libraryItem,
  onClose,
  onAddToLibrary,
  onRemoveFromLibrary,
  onPlayEpisode,
  onDownloadEpisode,
}: Props) {
  const [episodes, setEpisodes] = useState<EpisodeItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [selectedCat, setSelectedCat] = useState<string>(
    libraryItem?.category || categories[0] || 'Watching'
  );
  const [epFilter, setEpFilter] = useState('');

  useEffect(() => {
    let active = true;
    async function fetchEpisodes() {
      if (!plugin) {
        setError('Source plugin unavailable');
        setLoading(false);
        return;
      }
      try {
        setLoading(true);
        const data = await plugin.getEpisodes(media.id);
        if (active) {
          setEpisodes(data);
          setError(null);
        }
      } catch (err) {
        if (active) {
          setError(err instanceof Error ? err.message : 'Failed to load episodes');
        }
      } finally {
        if (active) setLoading(false);
      }
    }
    fetchEpisodes();
    return () => {
      active = false;
    };
  }, [media.id, plugin]);

  const filteredEpisodes = epFilter
    ? episodes.filter((ep) =>
        ep.number.toString().includes(epFilter) ||
        (ep.title && ep.title.toLowerCase().includes(epFilter.toLowerCase()))
      )
    : episodes;

  return (
    <div className="agModalOverlay" onClick={onClose}>
      <div className="agModal" onClick={(e) => e.stopPropagation()}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <span style={{ fontSize: '13px', color: 'var(--text-light)', fontWeight: 'bold' }}>
            DETAILS
          </span>
          <button
            type="button"
            className="agBtnRed"
            onClick={onClose}
            style={{ fontSize: '9px', padding: '4px 8px' }}
          >
            CLOSE [X]
          </button>
        </div>

        <div style={{ display: 'flex', gap: '16px', flexWrap: 'wrap' }}>
          <div style={{ width: '130px', height: '180px', backgroundColor: '#111317', flexShrink: 0 }}>
            {media.coverUrl ? (
              <img
                src={media.coverUrl}
                alt={media.title}
                style={{ width: '100%', height: '100%', objectFit: 'cover' }}
              />
            ) : (
              <div style={{ display: 'flex', height: '100%', alignItems: 'center', justifyContent: 'center', fontSize: '9px', color: 'var(--text-muted)' }}>
                NO COVER
              </div>
            )}
          </div>

          <div style={{ display: 'flex', flexDirection: 'column', gap: '10px', flex: 1, minWidth: '220px' }}>
            <h2 style={{ fontSize: '14px', color: 'var(--text-light)', lineHeight: '1.4' }}>
              {media.title}
            </h2>

            <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
              <span className="agBadge agBadgeBlue">
                {plugin?.name || 'UNKNOWN SOURCE'}
              </span>
              <span className="agBadge agBadgePurple">
                {episodes.length} EPS
              </span>
            </div>

            <div style={{ display: 'flex', gap: '8px', alignItems: 'center', flexWrap: 'wrap', marginTop: '6px' }}>
              <select
                className="agSelect"
                value={selectedCat}
                onChange={(e) => setSelectedCat(e.target.value)}
                style={{ fontSize: '10px', padding: '6px' }}
              >
                {categories.map((cat) => (
                  <option key={cat} value={cat}>
                    {cat}
                  </option>
                ))}
              </select>

              <button
                type="button"
                className="agBtnGreen"
                onClick={() => onAddToLibrary(media, selectedCat)}
                style={{ fontSize: '10px', padding: '6px 12px' }}
              >
                {libraryItem ? 'UPDATE CATEGORY' : '+ ADD TO LIBRARY'}
              </button>

              {libraryItem && (
                <button
                  type="button"
                  className="agBtnRed"
                  onClick={() => onRemoveFromLibrary(media.id)}
                  style={{ fontSize: '10px', padding: '6px 10px' }}
                >
                  REMOVE
                </button>
              )}
            </div>
          </div>
        </div>

        <div style={{ borderTop: '2px solid #000000', paddingTop: '12px', display: 'flex', flexDirection: 'column', gap: '10px' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '8px' }}>
            <span style={{ fontSize: '11px', color: 'var(--text-light)' }}>
              EPISODES ({episodes.length})
            </span>
            {episodes.length > 10 && (
              <input
                type="text"
                className="agInput"
                placeholder="Filter ep #..."
                value={epFilter}
                onChange={(e) => setEpFilter(e.target.value)}
                style={{ padding: '4px 8px', fontSize: '9px', width: '120px' }}
              />
            )}
          </div>

          {loading && (
            <div style={{ textAlign: 'center', padding: '30px 0', fontSize: '11px', color: 'var(--blue)' }}>
              FETCHING EPISODE LIST...
            </div>
          )}

          {error && (
            <div style={{ textAlign: 'center', padding: '20px 0', fontSize: '11px', color: 'var(--red)' }}>
              {error}
            </div>
          )}

          {!loading && !error && filteredEpisodes.length === 0 && (
            <div style={{ textAlign: 'center', padding: '20px 0', fontSize: '10px', color: 'var(--text-muted)' }}>
              NO EPISODES AVAILABLE.
            </div>
          )}

          <div
            style={{
              display: 'grid',
              gridTemplateColumns: 'repeat(auto-fill, minmax(130px, 1fr))',
              gap: '8px',
              maxHeight: '360px',
              overflowY: 'auto',
              padding: '4px',
            }}
          >
            {filteredEpisodes.map((ep) => {
              const isWatched = libraryItem?.lastWatchedEpisodeId === ep.id;
              return (
                <div
                  key={ep.id}
                  className="agCard"
                  style={{
                    padding: '8px',
                    display: 'flex',
                    flexDirection: 'column',
                    justifyContent: 'space-between',
                    gap: '6px',
                    borderColor: isWatched ? 'var(--green-dark)' : '#000000',
                  }}
                >
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <span style={{ fontSize: '10px', color: 'var(--text-light)', fontWeight: 'bold' }}>
                      EP {ep.number}
                    </span>
                    {isWatched && (
                      <span className="agBadge agBadgeGreen" style={{ fontSize: '7px', padding: '2px 4px' }}>
                        SEEN
                      </span>
                    )}
                  </div>

                  <div style={{ display: 'flex', gap: '4px' }}>
                    <button
                      type="button"
                      className="agBtnPurple"
                      title="Play Episode"
                      onClick={() => onPlayEpisode(ep, episodes)}
                      style={{
                        flex: 1,
                        padding: '6px 4px',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                      }}
                    >
                      <svg width="12" height="12" viewBox="0 0 24 24" fill="currentColor">
                        <polygon points="5 3 19 12 5 21 5 3" />
                      </svg>
                    </button>
                    <button
                      type="button"
                      className="agBtnCyan"
                      title="Download Episode"
                      onClick={() => onDownloadEpisode(media, ep)}
                      style={{
                        padding: '6px 8px',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                      }}
                    >
                      <svg
                        width="12"
                        height="12"
                        viewBox="0 0 24 24"
                        fill="none"
                        stroke="currentColor"
                        strokeWidth="2.5"
                        strokeLinecap="round"
                        strokeLinejoin="round"
                      >
                        <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
                        <polyline points="7 10 12 15 17 10" />
                        <line x1="12" y1="15" x2="12" y2="3" />
                      </svg>
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      </div>
    </div>
  );
}
