import type { SourcePlugin } from '../types/plugin';

interface Props {
  activeTab: 'browse' | 'library' | 'downloads';
  onTabChange: (tab: 'browse' | 'library' | 'downloads') => void;
  plugins: SourcePlugin[];
  activePluginId: string;
  onPluginChange: (id: string) => void;
  downloadCount: number;
}

export function Navbar({
  activeTab,
  onTabChange,
  plugins,
  activePluginId,
  onPluginChange,
  downloadCount,
}: Props) {
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
      }}
    >
      <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
        <img src="./favicon.png" alt="logo" style={{ width: 24, height: 24, imageRendering: 'pixelated' }} />
        <span style={{ fontSize: '14px', letterSpacing: '1px', color: 'var(--text-light)', fontWeight: 'bold' }}>
          AGGREGATOR
        </span>
      </div>

      <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
        <span style={{ fontSize: '9px', color: 'var(--text-muted)' }}>SOURCE:</span>
        <select
          className="agSelect"
          value={activePluginId}
          onChange={(e) => onPluginChange(e.target.value)}
          style={{ fontSize: '10px', padding: '4px 8px' }}
        >
          <option value="all">ALL SOURCES (GLOBAL)</option>
          {plugins.map((p) => (
            <option key={p.id} value={p.id}>
              {p.name}
            </option>
          ))}
        </select>
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
