import { useState, useEffect, useRef } from 'react';
import videojs from 'video.js';
import 'video.js/dist/video-js.css';
import type { SourcePlugin, EpisodeItem, StreamSource } from '../types/plugin';

type VideoJsPlayer = ReturnType<typeof videojs>;

interface Props {
  episode: EpisodeItem;
  allEpisodes: EpisodeItem[];
  plugin: SourcePlugin | undefined;
  onClose: () => void;
  onSelectEpisode: (ep: EpisodeItem) => void;
}

export function PlayerModal({
  episode,
  allEpisodes,
  plugin,
  onClose,
  onSelectEpisode,
}: Props) {
  const [streams, setStreams] = useState<StreamSource[]>([]);
  const [activeStream, setActiveStream] = useState<string>('');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [proxyLoading, setProxyLoading] = useState(false);
  const [audioType, setAudioType] = useState<'sub' | 'dub'>('sub');

  const videoNodeRef = useRef<HTMLVideoElement | null>(null);
  const playerRef = useRef<VideoJsPlayer | null>(null);

  const currentIndex = allEpisodes.findIndex((e) => e.id === episode.id);
  const prevEp = currentIndex > 0 ? allEpisodes[currentIndex - 1] : null;
  const nextEp = currentIndex >= 0 && currentIndex < allEpisodes.length - 1 ? allEpisodes[currentIndex + 1] : null;

  async function handleBackgroundProxy() {
    type ExtensionRuntime = {
      runtime?: {
        sendMessage(msg: unknown): Promise<{ status?: string; url?: string }>;
      };
    };
    const browserAPI = (globalThis as unknown as { browser?: ExtensionRuntime; chrome?: ExtensionRuntime }).browser ||
      (globalThis as unknown as { browser?: ExtensionRuntime; chrome?: ExtensionRuntime }).chrome;
    if (!browserAPI?.runtime?.sendMessage) {
      setError('Background extension API unavailable in this context.');
      return;
    }
    setProxyLoading(true);
    setError(null);
    try {
      const res = await browserAPI.runtime.sendMessage({
        action: 'STREAM_BACKGROUND_TAB',
        url: episode.url,
      });
      if (res?.status === 'FOUND' && res.url) {
        const bgStream: StreamSource = {
          quality: `Proxy Stream (${audioType.toUpperCase()})`,
          url: res.url,
          type: audioType,
        };
        setStreams((prev) => [bgStream, ...prev]);
        setActiveStream(res.url);
      } else {
        setError('Background proxy timed out or stream was not detected.');
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Background proxy request failed');
    } finally {
      setProxyLoading(false);
    }
  }

  function handleAudioTypeChange(type: 'sub' | 'dub') {
    setAudioType(type);
    const matching = streams.filter((s) => s.type === type);
    if (matching.length > 0) {
      setActiveStream(matching[0].url);
    }
  }

  useEffect(() => {
    let active = true;
    async function loadStreams() {
      if (!plugin) {
        setError('Plugin unavailable');
        setLoading(false);
        return;
      }
      try {
        setLoading(true);
        setError(null);
        const data = await plugin.getStreams(episode.id);
        if (active) {
          setStreams(data);
          if (data.length > 0) {
            const hasSub = data.some((s) => s.type === 'sub');
            const initialType = hasSub ? 'sub' : (data[0].type || 'sub');
            setAudioType(initialType);
            const firstOfType = data.find((s) => s.type === initialType);
            setActiveStream(firstOfType ? firstOfType.url : data[0].url);
          } else {
            setError('No video streams found for this episode.');
          }
        }
      } catch (err) {
        if (active) {
          setError(err instanceof Error ? err.message : 'Failed to retrieve video streams');
        }
      } finally {
        if (active) setLoading(false);
      }
    }
    loadStreams();
    return () => {
      active = false;
    };
  }, [episode.id, plugin]);

  const isEmbed =
    activeStream.includes('embed.php') ||
    activeStream.includes('/player/?') ||
    (activeStream.includes('megavid.buzz') && !activeStream.includes('aniwatchtv.site')) ||
    (!activeStream.includes('.m3u8') && !activeStream.includes('.mp4') && !activeStream.includes('aniwatchtv.site'));

  useEffect(() => {
    if (isEmbed) {
      if (playerRef.current && !playerRef.current.isDisposed()) {
        playerRef.current.dispose();
        playerRef.current = null;
      }
      return;
    }

    if (!videoNodeRef.current || !activeStream) return;

    const streamType = (activeStream.includes('.m3u8') || activeStream.includes('aniwatchtv.site'))
      ? 'application/x-mpegURL'
      : 'video/mp4';

    const currentStreamObj = streams.find((s) => s.url === activeStream);
    const subTracks = currentStreamObj?.subtitles?.map((st) => ({
      kind: 'captions',
      label: st.label,
      src: st.file,
      default: st.label.toLowerCase().includes('english'),
    })) || [];

    if (!playerRef.current) {
      playerRef.current = videojs(videoNodeRef.current, {
        autoplay: true,
        controls: true,
        responsive: true,
        fluid: false,
        playbackRates: [0.5, 0.75, 1, 1.25, 1.5, 2],
        controlBar: {
          playToggle: true,
          volumePanel: { inline: false },
          currentTimeDisplay: true,
          timeDivider: true,
          durationDisplay: true,
          progressControl: true,
          playbackRateMenuButton: true,
          subsCapsButton: true,
          pictureInPictureToggle: true,
          fullscreenToggle: true,
        },
        tracks: subTracks,
        sources: [
          {
            src: activeStream,
            type: streamType,
          },
        ],
      });
    } else {
      playerRef.current.src({ src: activeStream, type: streamType });
      const oldTracks = playerRef.current.remoteTextTracks() as unknown as Record<number, unknown> & { length: number };
      if (oldTracks) {
        for (let i = oldTracks.length - 1; i >= 0; i--) {
          const t = oldTracks[i];
          if (t) playerRef.current.removeRemoteTextTrack(t as never);
        }
      }
      for (const t of subTracks) {
        playerRef.current.addRemoteTextTrack(t, false);
      }
      playerRef.current.play();
    }
  }, [activeStream, isEmbed, streams]);

  useEffect(() => {
    return () => {
      if (playerRef.current && !playerRef.current.isDisposed()) {
        playerRef.current.dispose();
        playerRef.current = null;
      }
    };
  }, []);

  const hasSub = streams.some((s) => s.type === 'sub');
  const hasDub = streams.some((s) => s.type === 'dub');
  const hasBothAudio = hasSub && hasDub;
  const filteredStreams = hasBothAudio
    ? streams.filter((s) => s.type === audioType)
    : streams;

  return (
    <div className="agModalOverlay" onClick={onClose}>
      <div
        className="agModal"
        onClick={(e) => e.stopPropagation()}
        style={{ maxWidth: '1000px', width: '95vw', padding: '14px' }}
      >
        <div
          style={{
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
            gap: '8px',
          }}
        >
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: '8px',
              minWidth: 0,
              flex: 1,
              overflow: 'hidden',
            }}
          >
            <span
              style={{
                fontSize: '12px',
                color: 'var(--text-light)',
                fontWeight: 'bold',
                whiteSpace: 'nowrap',
                overflow: 'hidden',
                textOverflow: 'ellipsis',
              }}
              title={`EP ${episode.number} ${episode.title ? `- ${episode.title}` : ''}`}
            >
              EP {episode.number} {episode.title ? `- ${episode.title}` : ''}
            </span>
            <span className="agBadge agBadgePurple" style={{ flexShrink: 0 }}>
              {plugin?.name}
            </span>
          </div>

          <div style={{ display: 'flex', gap: '8px', alignItems: 'center', flexShrink: 0 }}>
            {hasBothAudio && (
              <div style={{ display: 'flex', gap: '4px' }}>
                <button
                  type="button"
                  className={audioType === 'sub' ? 'agBtnCyan' : 'agBtnGray'}
                  onClick={() => handleAudioTypeChange('sub')}
                  style={{ fontSize: '9px', padding: '4px 8px' }}
                >
                  SUB
                </button>
                <button
                  type="button"
                  className={audioType === 'dub' ? 'agBtnCyan' : 'agBtnGray'}
                  onClick={() => handleAudioTypeChange('dub')}
                  style={{ fontSize: '9px', padding: '4px 8px' }}
                >
                  DUB
                </button>
              </div>
            )}

            <select
              className="agSelect"
              value={proxyLoading ? '__sniffing__' : activeStream}
              onChange={(e) => {
                if (e.target.value === '__sniff_proxy__') {
                  handleBackgroundProxy();
                } else {
                  setActiveStream(e.target.value);
                }
              }}
              style={{ fontSize: '9px', padding: '4px 6px', maxWidth: '240px' }}
            >
              {filteredStreams.map((s, idx) => (
                <option key={`${s.quality}-${idx}`} value={s.url}>
                  {s.quality.toUpperCase()}
                </option>
              ))}
              <option value="__sniff_proxy__" disabled={proxyLoading}>
                {proxyLoading ? '⚡ SNIFFING IN BG TAB...' : '⚡ SNIFF STREAM (PROXY)'}
              </option>
            </select>

            <button
              type="button"
              className="agBtnRed"
              onClick={onClose}
              style={{ fontSize: '9px', padding: '4px 8px', flexShrink: 0 }}
            >
              CLOSE [X]
            </button>
          </div>
        </div>

        <div
          style={{
            width: '100%',
            height: '520px',
            maxHeight: '65vh',
            backgroundColor: '#000000',
            border: '2px solid #000000',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            position: 'relative',
            overflow: 'hidden',
          }}
        >
          {loading && !proxyLoading && (
            <div style={{ color: 'var(--blue)', fontSize: '12px' }}>
              EXTRACTING VIDEO STREAM...
            </div>
          )}

          {proxyLoading && (
            <div style={{ color: 'var(--yellow)', fontSize: '12px' }}>
              INTERCEPTING STREAM VIA BACKGROUND PROXY...
            </div>
          )}

          {error && !proxyLoading && (
            <div style={{ color: 'var(--red)', fontSize: '11px', textAlign: 'center', padding: '20px' }}>
              <div>{error}</div>
              <div style={{ marginTop: '12px', display: 'flex', gap: '8px', justifyContent: 'center' }}>
                <button
                  type="button"
                  className="agBtnYellow"
                  onClick={handleBackgroundProxy}
                  style={{ fontSize: '9px', padding: '6px 12px' }}
                >
                  RETRY VIA BACKGROUND PROXY
                </button>
                <a
                  href={episode.url}
                  target="_blank"
                  rel="noreferrer"
                  className="agBtnCyan"
                  style={{ fontSize: '9px', padding: '6px 12px' }}
                >
                  OPEN ON SOURCE SITE
                </a>
              </div>
            </div>
          )}

          {!loading && !error && activeStream && (
            isEmbed ? (
              <iframe
                key={activeStream}
                src={activeStream}
                allowFullScreen
                allow="autoplay; encrypted-media; picture-in-picture; fullscreen"
                sandbox="allow-scripts allow-same-origin allow-forms allow-presentation"
                style={{ width: '100%', height: '100%', border: 0 }}
              />
            ) : (
              <div data-vjs-player style={{ width: '100%', height: '100%' }}>
                <video
                  ref={videoNodeRef}
                  className="video-js vjs-default-skin vjs-big-play-centered"
                  playsInline
                  style={{ width: '100%', height: '100%' }}
                />
              </div>
            )
          )}
        </div>

        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <button
            type="button"
            className="agBtnGray"
            disabled={!prevEp}
            onClick={() => prevEp && onSelectEpisode(prevEp)}
            style={{ fontSize: '9px', padding: '6px 10px' }}
          >
            &lt; PREV EP
          </button>

          <span style={{ fontSize: '9px', color: 'var(--text-muted)' }}>
            EPISODE {episode.number} OF {allEpisodes.length}
          </span>

          <button
            type="button"
            className="agBtnGray"
            disabled={!nextEp}
            onClick={() => nextEp && onSelectEpisode(nextEp)}
            style={{ fontSize: '9px', padding: '6px 10px' }}
          >
            NEXT EP &gt;
          </button>
        </div>
      </div>
    </div>
  );
}
