import { useState, useRef, useEffect } from 'react';
import type { SourcePlugin, SourceFilterState } from '../types/plugin';

interface Props {
  activeTab: 'browse' | 'library' | 'downloads';
  onTabChange: (tab: 'browse' | 'library' | 'downloads') => void;
  plugins: SourcePlugin[];
  sourceFilter: SourceFilterState;
  onToggleSourceFilter: (id: string) => void;
  onResetSourceFilter: () => void;
  downloadCount: number;
}

export function Navbar({
  activeTab,
  onTabChange,
  plugins,
  sourceFilter,
  onToggleSourceFilter,
  onResetSourceFilter,
  downloadCount,
}: Props) {
  const [isOpen, setIsOpen] = useState(false);
  const dropdownRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target as Node)) {
        setIsOpen(false);
      }
    }
    if (isOpen) {
      document.addEventListener('mousedown', handleClickOutside);
    }
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
    };
  }, [isOpen]);

  const included = plugins.filter((p) => sourceFilter[p.id] === 'include');
  const excluded = plugins.filter((p) => sourceFilter[p.id] === 'exclude');
  const hasCustomFilter = included.length > 0 || excluded.length > 0;

  let buttonLabel = `SOURCES: ALL (${plugins.length})`;
  let buttonBadgeClass = 'agBadgeBlue';

  if (included.length === 1 && excluded.length === 0) {
    buttonLabel = `SOURCE: ${included[0].name.toUpperCase()}`;
    buttonBadgeClass = 'agBadgeGreen';
  } else if (included.length > 0) {
    buttonLabel = `SOURCES: ${included.length} INCL${excluded.length > 0 ? ` (${excluded.length} EXCL)` : ''}`;
    buttonBadgeClass = 'agBadgeGreen';
  } else if (excluded.length > 0) {
    const activeCount = Math.max(0, plugins.length - excluded.length);
    buttonLabel = `SOURCES: ${activeCount} ACTIVE (${excluded.length} EXCL)`;
    buttonBadgeClass = 'agBadgePurple';
  }

  return (
    <header
      style={{
        display: 'flex',
        flexWrap: 'wrap',
        alignItems: 'center',
        justifyContent: 'space-between',
        padding: '12px 18px',
        backgroundColor: 'var(--card-bg)',
        borderBottom: '3px solid #000000',
        gap: '12px',
        position: 'relative',
        zIndex: 50,
      }}
    >
      <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
        <img src="./favicon.png" alt="logo" style={{ width: 24, height: 24, imageRendering: 'pixelated' }} />
        <span style={{ fontSize: '14px', letterSpacing: '1px', color: 'var(--text-light)', fontWeight: 'bold' }}>
          AGGREGATOR
        </span>
      </div>

      {/* Tri-state Custom Source Selection Menu */}
      <div ref={dropdownRef} style={{ position: 'relative' }}>
        <button
          type="button"
          onClick={() => setIsOpen((prev) => !prev)}
          className={hasCustomFilter ? 'agBtnPurple' : 'agBtnGray'}
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: '8px',
            fontSize: '10px',
            padding: '6px 12px',
          }}
          title="Click to customize source selection"
        >
          <span>{buttonLabel}</span>
          <span className={`agBadge ${buttonBadgeClass}`} style={{ fontSize: '7px', padding: '2px 4px' }}>
            {included.length > 0 ? `${included.length} IN` : excluded.length > 0 ? `${excluded.length} EX` : 'ALL'}
          </span>
          <span style={{ fontSize: '9px', opacity: 0.8 }}>{isOpen ? '▲' : '▼'}</span>
        </button>

        {isOpen && (
          <div
            style={{
              position: 'absolute',
              top: 'calc(100% + 6px)',
              left: 0,
              backgroundColor: 'var(--card-bg)',
              border: '2px solid #000000',
              boxShadow: '4px 4px 0px 0px #000000',
              minWidth: '290px',
              maxWidth: '340px',
              padding: '10px',
              display: 'flex',
              flexDirection: 'column',
              gap: '8px',
              zIndex: 100,
            }}
          >
            <div
              style={{
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'center',
                borderBottom: '2px solid #000000',
                paddingBottom: '6px',
              }}
            >
              <span style={{ fontSize: '10px', color: 'var(--text-light)', fontWeight: 'bold' }}>
                FILTER SOURCES
              </span>
              {hasCustomFilter && (
                <button
                  type="button"
                  className="agBtnGray"
                  onClick={onResetSourceFilter}
                  style={{ fontSize: '8px', padding: '3px 6px' }}
                >
                  RESET ALL
                </button>
              )}
            </div>

            <div style={{ fontSize: '8px', color: 'var(--text-muted)', lineHeight: '1.4' }}>
              Cycle per click: <span style={{ color: 'var(--green)' }}>[✓] Include</span> →{' '}
              <span style={{ color: 'var(--red)' }}>[✗] Exclude</span> →{' '}
              <span style={{ color: 'var(--text)' }}>[○] Reset</span>
            </div>

            <div style={{ display: 'flex', flexDirection: 'column', gap: '4px', maxHeight: '280px', overflowY: 'auto' }}>
              {plugins.length === 0 ? (
                <div style={{ fontSize: '9px', color: 'var(--text-muted)', padding: '12px 0', textAlign: 'center' }}>
                  NO SOURCES INSTALLED
                </div>
              ) : (
                plugins.map((p) => {
                  const state = sourceFilter[p.id]; // 'include' | 'exclude' | undefined
                  let rowBorder = '1px solid #2a2e39';
                  let icon = '○';
                  let iconColor = 'var(--text-muted)';
                  let badge = <span className="agBadge agBadgeGray" style={{ fontSize: '7px' }}>ALL</span>;

                  if (state === 'include') {
                    rowBorder = '1px solid var(--green-dark)';
                    icon = '✓';
                    iconColor = 'var(--green)';
                    badge = <span className="agBadge agBadgeGreen" style={{ fontSize: '7px' }}>INCLUDED</span>;
                  } else if (state === 'exclude') {
                    rowBorder = '1px solid var(--red-dark)';
                    icon = '✗';
                    iconColor = 'var(--red)';
                    badge = <span className="agBadge agBadgeRed" style={{ fontSize: '7px' }}>EXCLUDED</span>;
                  }

                  return (
                    <div
                      key={p.id}
                      onClick={() => onToggleSourceFilter(p.id)}
                      style={{
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'space-between',
                        padding: '6px 8px',
                        backgroundColor: state === 'include' ? '#0d281e' : state === 'exclude' ? '#2b1111' : '#14161c',
                        border: rowBorder,
                        cursor: 'pointer',
                        userSelect: 'none',
                        transition: 'background-color 0.1s ease',
                      }}
                    >
                      <div style={{ display: 'flex', alignItems: 'center', gap: '8px', overflow: 'hidden' }}>
                        <span style={{ fontSize: '11px', fontWeight: 'bold', color: iconColor, width: '12px', textAlign: 'center' }}>
                          {icon}
                        </span>
                        <span
                          style={{
                            fontSize: '9px',
                            color: state === 'exclude' ? 'var(--text-muted)' : 'var(--text-light)',
                            textDecoration: state === 'exclude' ? 'line-through' : 'none',
                            whiteSpace: 'nowrap',
                            overflow: 'hidden',
                            textOverflow: 'ellipsis',
                          }}
                        >
                          {p.name}
                        </span>
                      </div>
                      <div>{badge}</div>
                    </div>
                  );
                })
              )}
            </div>
          </div>
        )}
      </div>

      <nav style={{ display: 'flex', gap: '8px' }}>
        <button
          type="button"
          className={activeTab === 'browse' ? 'agBtnBlue' : 'agBtnGray'}
          onClick={() => onTabChange('browse')}
        >
          BROWSE
        </button>
        <button
          type="button"
          className={activeTab === 'library' ? 'agBtnPurple' : 'agBtnGray'}
          onClick={() => onTabChange('library')}
        >
          LIBRARY
        </button>
        <button
          type="button"
          className={activeTab === 'downloads' ? 'agBtnGreen' : 'agBtnGray'}
          onClick={() => onTabChange('downloads')}
        >
          DOWNLOADS {downloadCount > 0 ? `(${downloadCount})` : ''}
        </button>
      </nav>
    </header>
  );
}
