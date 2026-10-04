import { useState, type FormEvent } from 'react';
import type { LibraryItem } from '../types/library';
import type { MediaItem } from '../types/plugin';

interface Props {
  library: LibraryItem[];
  categories: string[];
  onSelectMedia: (item: MediaItem) => void;
  onRemoveMedia: (mediaId: string) => void;
  onAddCategory: (category: string) => void;
  onChangeCategory: (mediaId: string, category: string) => void;
}

export function LibraryView({
  library,
  categories,
  onSelectMedia,
  onRemoveMedia,
  onAddCategory,
  onChangeCategory,
}: Props) {
  const [selectedCategory, setSelectedCategory] = useState('ALL');
  const [isAdding, setIsAdding] = useState(false);
  const [catInput, setCatInput] = useState('');

  function handleCreateCategory(e: FormEvent) {
    e.preventDefault();
    if (!catInput.trim()) return;
    onAddCategory(catInput.trim());
    setSelectedCategory(catInput.trim());
    setCatInput('');
    setIsAdding(false);
  }

  const filtered = selectedCategory === 'ALL'
    ? library
    : library.filter((item) => item.category === selectedCategory);

  return (
    <div style={{ padding: '20px', maxWidth: '1200px', margin: '0 auto', width: '100%' }}>
      <div
        style={{
          display: 'flex',
          gap: '8px',
          alignItems: 'center',
          flexWrap: 'wrap',
          marginBottom: '24px',
          borderBottom: '2px solid #000000',
          paddingBottom: '14px',
        }}
      >
        <button
          type="button"
          className={selectedCategory === 'ALL' ? 'agBtnBlue' : 'agBtnGray'}
          style={{ fontSize: '9px', padding: '6px 10px' }}
          onClick={() => setSelectedCategory('ALL')}
        >
          ALL ({library.length})
        </button>

        {categories.map((cat) => {
          const count = library.filter((item) => item.category === cat).length;
          return (
            <button
              key={cat}
              type="button"
              className={selectedCategory === cat ? 'agBtnPurple' : 'agBtnGray'}
              style={{ fontSize: '9px', padding: '6px 10px' }}
              onClick={() => setSelectedCategory(cat)}
            >
              {cat.toUpperCase()} ({count})
            </button>
          );
        })}

        {isAdding ? (
          <form onSubmit={handleCreateCategory} style={{ display: 'inline-flex', gap: '6px' }}>
            <input
              type="text"
              className="agInput"
              placeholder="Category name"
              value={catInput}
              onChange={(e) => setCatInput(e.target.value)}
              style={{ padding: '4px 6px', fontSize: '9px', width: '120px' }}
              autoFocus
            />
            <button type="submit" className="agBtnGreen" style={{ fontSize: '9px', padding: '4px 8px' }}>
              ADD
            </button>
            <button
              type="button"
              className="agBtnRed"
              style={{ fontSize: '9px', padding: '4px 8px' }}
              onClick={() => setIsAdding(false)}
            >
              X
            </button>
          </form>
        ) : (
          <button
            type="button"
            className="agBtnGreen"
            style={{ fontSize: '9px', padding: '6px 10px' }}
            onClick={() => setIsAdding(true)}
          >
            + NEW
          </button>
        )}
      </div>

      {filtered.length === 0 ? (
        <div style={{ textAlign: 'center', padding: '40px 0', fontSize: '11px', color: 'var(--text-muted)' }}>
          NO ANIME IN THIS CATEGORY YET. BROWSE TO ADD TITLES.
        </div>
      ) : (
        <div
          style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(auto-fill, minmax(200px, 1fr))',
            gap: '16px',
          }}
        >
          {filtered.map((item) => (
            <div
              key={item.media.id}
              className="agCard"
              style={{
                display: 'flex',
                flexDirection: 'column',
                justifyContent: 'space-between',
              }}
            >
              <div
                style={{ cursor: 'pointer' }}
                onClick={() => onSelectMedia(item.media)}
              >
                <div style={{ width: '100%', height: '240px', backgroundColor: '#111317', overflow: 'hidden', marginBottom: '8px' }}>
                  {item.media.coverUrl ? (
                    <img
                      src={item.media.coverUrl}
                      alt={item.media.title}
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
                  {item.media.title}
                </div>
              </div>

              <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', marginTop: '6px' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <span className="agBadge agBadgeBlue">{item.pluginId}</span>
                  {item.lastWatchedEpisodeNum !== undefined && (
                    <span className="agBadge agBadgeGreen">EP {item.lastWatchedEpisodeNum}</span>
                  )}
                </div>

                <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                  <span style={{ fontSize: '8px', color: 'var(--text-muted)' }}>CAT:</span>
                  <select
                    className="agSelect"
                    value={item.category}
                    onChange={(e) => onChangeCategory(item.media.id, e.target.value)}
                    style={{ fontSize: '9px', padding: '4px', width: '100%' }}
                  >
                    {categories.map((c) => (
                      <option key={c} value={c}>
                        {c}
                      </option>
                    ))}
                  </select>
                </div>

                <div style={{ display: 'flex', gap: '6px' }}>
                  <button
                    type="button"
                    className="agBtnPurple"
                    style={{ flex: 1, fontSize: '9px', padding: '5px' }}
                    onClick={() => onSelectMedia(item.media)}
                  >
                    OPEN
                  </button>
                  <button
                    type="button"
                    className="agBtnRed"
                    style={{ fontSize: '9px', padding: '5px 8px' }}
                    onClick={() => onRemoveMedia(item.media.id)}
                  >
                    DEL
                  </button>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
