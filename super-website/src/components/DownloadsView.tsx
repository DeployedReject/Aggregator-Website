import type { DownloadItem } from '../types/library';

interface Props {
  downloads: DownloadItem[];
  onClearDownloads: () => void;
}

export function DownloadsView({ downloads, onClearDownloads }: Props) {
  return (
    <div style={{ padding: '20px', maxWidth: '1000px', margin: '0 auto', width: '100%' }}>
      <div
        style={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          marginBottom: '20px',
          borderBottom: '2px solid #000000',
          paddingBottom: '12px',
        }}
      >
        <span style={{ fontSize: '13px', color: 'var(--text-light)', fontWeight: 'bold' }}>
          DOWNLOADS ({downloads.length})
        </span>
        {downloads.length > 0 && (
          <button
            type="button"
            className="agBtnRed"
            onClick={onClearDownloads}
            style={{ fontSize: '9px', padding: '6px 10px' }}
          >
            CLEAR LIST
          </button>
        )}
      </div>

      {downloads.length === 0 ? (
        <div style={{ textAlign: 'center', padding: '40px 0', fontSize: '11px', color: 'var(--text-muted)' }}>
          NO ACTIVE OR PAST DOWNLOADS.
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
          {downloads.map((item) => (
            <div
              key={item.id}
              className="agCard"
              style={{
                display: 'flex',
                flexWrap: 'wrap',
                justifyContent: 'space-between',
                alignItems: 'center',
                gap: '10px',
              }}
            >
              <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
                <span style={{ fontSize: '11px', color: 'var(--text-light)' }}>
                  {item.title} - EP {item.episodeNum}
                </span>
                <span style={{ fontSize: '8px', color: 'var(--text-muted)' }}>
                  {new Date(item.createdAt).toLocaleTimeString()}
                </span>
              </div>

              <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                <span
                  className={
                    item.status === 'completed'
                      ? 'agBadge agBadgeGreen'
                      : item.status === 'downloading'
                      ? 'agBadge agBadgeBlue'
                      : 'agBadge agBadgeRed'
                  }
                >
                  {item.status.toUpperCase()}
                </span>

                <a
                  href={item.url}
                  target="_blank"
                  rel="noreferrer"
                  download
                  className="agBtnCyan"
                  style={{ fontSize: '9px', padding: '4px 8px' }}
                >
                  OPEN STREAM
                </a>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
