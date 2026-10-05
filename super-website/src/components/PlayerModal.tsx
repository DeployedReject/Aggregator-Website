import { useState, useEffect, useRef } from 'react';
import videojs from 'video.js';
import 'video.js/dist/video-js.css';
import { MediaPlayer, type MediaPlayerClass } from 'dashjs';
import type { SourcePlugin, EpisodeItem, StreamSource } from '../types/plugin';

type VideoJsPlayer = ReturnType<typeof videojs>;

interface Props {
  episode: EpisodeItem;
  allEpisodes: EpisodeItem[];
  plugin: SourcePlugin | undefined;
  onClose: () => void;
  onSelectEpisode: (ep: EpisodeItem) => void;
}

interface CustomSubtitle {
  label: string;
  src: string;
}

function isDirectStream(s: StreamSource): boolean {
  if (!s || !s.url) return false;
  const u = s.url.toLowerCase();
  const q = (s.quality || '').toLowerCase();
  if (q.includes('(embed)') || q.includes('[player embed]')) return false;
  if (u.includes('embed.php') || u.includes('/player/?') || u.includes('/embed/')) return false;
  if (u.includes('.m3u8') || u.includes('.mpd') || u.includes('.mp4') || u.includes('.webm') || u.includes('aniwatchtv.site') || u.includes('animeonsen.xyz')) return true;
  return false;
}

function cleanQualityLabel(raw: string): string {
  if (!raw) return 'Auto';
  const match = raw.match(/\b(\d{3,4}p)\b/i);
  if (match) return match[1].toLowerCase();
  if (/auto/i.test(raw)) return 'Auto';
  if (/default/i.test(raw)) return 'Default';
  return raw.replace(/\[.*?\]|\(.*?\)/g, '').trim() || 'Auto';
}

function convertSrtToVtt(srtText: string): string {
  let vtt = 'WEBVTT\n\n';
  vtt += srtText
    .replace(/\r\n|\r/g, '\n')
    .replace(/(\d\d:\d\d:\d\d),(\d\d\d)/g, '$1.$2');
  return vtt;
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
  const [audioType, setAudioType] = useState<'sub' | 'dub'>('sub');
  const [customSubtitles, setCustomSubtitles] = useState<CustomSubtitle[]>([]);
  const [showSubModal, setShowSubModal] = useState(false);
  const [subUrlInput, setSubUrlInput] = useState('');
  const [subStatusMessage, setSubStatusMessage] = useState<string | null>(null);

  const videoNodeRef = useRef<HTMLVideoElement | null>(null);
  const playerRef = useRef<VideoJsPlayer | null>(null);
  const dashPlayerRef = useRef<MediaPlayerClass | null>(null);
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  const currentIndex = allEpisodes.findIndex((e) => e.id === episode.id);
  const prevEp = currentIndex > 0 ? allEpisodes[currentIndex - 1] : null;
  const nextEp = currentIndex >= 0 && currentIndex < allEpisodes.length - 1 ? allEpisodes[currentIndex + 1] : null;

  async function resolveViaBackground(): Promise<StreamSource | null> {
    type ExtensionRuntime = {
      runtime?: {
        sendMessage(msg: unknown): Promise<{ status?: string; url?: string }>;
      };
    };
    const browserAPI = (globalThis as unknown as { browser?: ExtensionRuntime; chrome?: ExtensionRuntime }).browser ||
      (globalThis as unknown as { browser?: ExtensionRuntime; chrome?: ExtensionRuntime }).chrome;
    if (!browserAPI?.runtime?.sendMessage) return null;
    try {
      const res = await browserAPI.runtime.sendMessage({
        action: 'STREAM_BACKGROUND_TAB',
        url: episode.url,
      });
      if (res?.status === 'FOUND' && res.url) {
        return {
          quality: 'Auto',
          url: res.url,
          type: audioType,
        };
      }
    } catch {
      return null;
    }
    return null;
  }

  async function handleRetry() {
    setLoading(true);
    setError(null);
    try {
      const bgStream = await resolveViaBackground();
      if (bgStream) {
        setStreams((prev) => [bgStream, ...prev]);
        setActiveStream(bgStream.url);
        return;
      }
      if (plugin) {
        const data = await plugin.getStreams(episode.id);
        const valid = data.filter(isDirectStream);
        if (valid.length > 0) {
          setStreams(valid);
          setActiveStream(valid[0].url);
          return;
        }
      }
      setError('Unable to load video stream.');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Stream request failed');
    } finally {
      setLoading(false);
    }
  }

  function handleAudioTypeChange(type: 'sub' | 'dub') {
    setAudioType(type);
    const matching = streams.filter((s) => s.type === type);
    if (matching.length > 0) {
      setActiveStream(matching[0].url);
    }
  }

  function handleSubtitleFileUpload(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (ev) => {
      let content = (ev.target?.result as string) || '';
      if (file.name.toLowerCase().endsWith('.srt') || (!content.startsWith('WEBVTT') && !content.includes('-->'))) {
        content = convertSrtToVtt(content);
      }
      const blob = new Blob([content], { type: 'text/vtt' });
      const blobUrl = URL.createObjectURL(blob);
      const label = file.name.replace(/\.[^/.]+$/, '');
      const newSub: CustomSubtitle = { label: `Uploaded: ${label}`, src: blobUrl };
      setCustomSubtitles((prev) => [...prev, newSub]);
      setSubStatusMessage(`Loaded: ${file.name}`);
      setTimeout(() => {
        setSubStatusMessage(null);
        setShowSubModal(false);
      }, 1200);
    };
    reader.readAsText(file);
    if (fileInputRef.current) fileInputRef.current.value = '';
  }

  async function handleAddSubtitleUrl() {
    if (!subUrlInput.trim()) return;
    const url = subUrlInput.trim();
    setSubStatusMessage('Fetching subtitle...');
    try {
      const res = await fetch(url);
      if (res.ok) {
        let content = await res.text();
        if (url.toLowerCase().endsWith('.srt') || !content.startsWith('WEBVTT')) {
          content = convertSrtToVtt(content);
        }
        const blob = new Blob([content], { type: 'text/vtt' });
        const blobUrl = URL.createObjectURL(blob);
        const newSub: CustomSubtitle = { label: `URL: ${url.split('/').pop() || 'Subtitle'}`, src: blobUrl };
        setCustomSubtitles((prev) => [...prev, newSub]);
        setSubStatusMessage('Subtitle attached successfully!');
      } else {
        const newSub: CustomSubtitle = { label: `URL Subtitle`, src: url };
        setCustomSubtitles((prev) => [...prev, newSub]);
        setSubStatusMessage('Subtitle URL registered.');
      }
    } catch {
      const newSub: CustomSubtitle = { label: `Custom Subtitle`, src: url };
      setCustomSubtitles((prev) => [...prev, newSub]);
      setSubStatusMessage('Subtitle linked directly.');
    }
    setSubUrlInput('');
    setTimeout(() => {
      setSubStatusMessage(null);
      setShowSubModal(false);
    }, 1200);
  }

  useEffect(() => {
    let active = true;
    async function loadStreams() {
      if (!plugin) {
        setError('Source plugin unavailable');
        setLoading(false);
        return;
      }
      try {
        setLoading(true);
        setError(null);
        const data = await plugin.getStreams(episode.id);
        const valid = data.filter(isDirectStream);
        if (active) {
          if (valid.length > 0) {
            setStreams(valid);
            const hasSub = valid.some((s) => s.type === 'sub');
            const initialType = hasSub ? 'sub' : (valid[0].type || 'sub');
            setAudioType(initialType);
            const ofType = valid.filter((s) => s.type === initialType);
            setActiveStream(ofType[0] ? ofType[0].url : valid[0].url);
          } else {
            const bgStream = await resolveViaBackground();
            if (active && bgStream) {
              setStreams([bgStream]);
              setActiveStream(bgStream.url);
            } else if (active) {
              setError('No video streams found for this episode.');
            }
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

  useEffect(() => {
    if (!videoNodeRef.current || !activeStream) return;

    const isDash = activeStream.includes('.mpd') || activeStream.includes('animeonsen.xyz');
    const isHls = activeStream.includes('.m3u8') || activeStream.includes('aniwatchtv.site');
    const isWebm = activeStream.includes('.webm');
    const streamType = isHls ? 'application/x-mpegURL' : isDash ? 'application/dash+xml' : isWebm ? 'video/webm' : 'video/mp4';

    const currentStreamObj = streams.find((s) => s.url === activeStream);

    // Register headers with proxy gateway if available
    if (currentStreamObj?.headers) {
      type ExtensionRuntime = {
        runtime?: {
          sendMessage(msg: unknown): Promise<unknown>;
        };
      };
      const browserAPI = (globalThis as unknown as { browser?: ExtensionRuntime; chrome?: ExtensionRuntime }).browser ||
        (globalThis as unknown as { browser?: ExtensionRuntime; chrome?: ExtensionRuntime }).chrome;
      if (browserAPI?.runtime?.sendMessage) {
        browserAPI.runtime.sendMessage({
          action: 'REGISTER_STREAM_HEADERS',
          url: currentStreamObj.url,
          headers: currentStreamObj.headers,
        }).catch(() => {});
      }
    }

    const streamSubTracks = (currentStreamObj?.subtitles || [])
      .filter((st) => !st.file.endsWith('.wasm'))
      .map((st) => ({
        kind: 'captions' as const,
        label: st.label || 'Sub',
        src: st.file,
        default: (st.label || '').toLowerCase().includes('english') || (st.label || '').toLowerCase().includes('eng'),
      }));

    const customTracks = customSubtitles.map((cs) => ({
      kind: 'captions' as const,
      label: cs.label,
      src: cs.src,
      default: true,
    }));

    const allSubTracks = [...streamSubTracks, ...customTracks];

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
      });
    }

    if (dashPlayerRef.current) {
      dashPlayerRef.current.reset();
      dashPlayerRef.current.destroy();
      dashPlayerRef.current = null;
    }

    if (isDash) {
      const videoEl = videoNodeRef.current;
      if (videoEl) {
        dashPlayerRef.current = MediaPlayer().create();
        dashPlayerRef.current.initialize(videoEl, activeStream, true);
      }
    } else {
      playerRef.current.src({ src: activeStream, type: streamType });
      const oldTracks = playerRef.current.remoteTextTracks() as unknown as Record<number, unknown> & { length: number };
      if (oldTracks) {
        for (let i = oldTracks.length - 1; i >= 0; i--) {
          const t = oldTracks[i];
          if (t) playerRef.current.removeRemoteTextTrack(t as never);
        }
      }
      for (const t of allSubTracks) {
        const trackEl = playerRef.current.addRemoteTextTrack(t, false) as unknown as { track?: { mode: string } };
        if (t.default && trackEl?.track) {
          trackEl.track.mode = 'showing';
        }
      }
      playerRef.current.play()?.catch?.(() => {});
    }
  }, [activeStream, streams, customSubtitles]);

  useEffect(() => {
    return () => {
      if (dashPlayerRef.current) {
        dashPlayerRef.current.reset();
        dashPlayerRef.current.destroy();
        dashPlayerRef.current = null;
      }
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
            marginBottom: '10px',
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

            <button
              type="button"
              className={customSubtitles.length > 0 ? 'agBtnCyan' : 'agBtnGray'}
              onClick={() => setShowSubModal(true)}
              style={{ fontSize: '9px', padding: '4px 8px', display: 'flex', alignItems: 'center', gap: '3px' }}
              title="Add manual subtitles (.vtt or .srt)"
            >
              + SUB {customSubtitles.length > 0 ? `(${customSubtitles.length})` : ''}
            </button>

            {filteredStreams.length > 0 && (
              <select
                className="agSelect"
                value={activeStream}
                onChange={(e) => setActiveStream(e.target.value)}
                style={{ fontSize: '9px', padding: '4px 8px', maxWidth: '120px' }}
              >
                {filteredStreams.map((s, idx) => (
                  <option key={`${s.url}-${idx}`} value={s.url}>
                    {cleanQualityLabel(s.quality)}
                  </option>
                ))}
              </select>
            )}

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

        {/* Video Player Box with Persistent Canvas and Floating Overlays */}
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
          {loading && (
            <div
              style={{
                position: 'absolute',
                inset: 0,
                backgroundColor: 'rgba(0, 0, 0, 0.85)',
                display: 'flex',
                flexDirection: 'column',
                alignItems: 'center',
                justifyContent: 'center',
                zIndex: 10,
                color: 'var(--blue)',
                fontSize: '12px',
                fontWeight: 'bold',
                gap: '8px',
              }}
            >
              <div>Loading video stream...</div>
              <div style={{ fontSize: '10px', color: 'var(--text-muted)' }}>
                EP {episode.number} {episode.title ? `- ${episode.title}` : ''}
              </div>
            </div>
          )}

          {error && !loading && (
            <div
              style={{
                position: 'absolute',
                inset: 0,
                backgroundColor: 'rgba(0, 0, 0, 0.9)',
                display: 'flex',
                flexDirection: 'column',
                alignItems: 'center',
                justifyContent: 'center',
                zIndex: 10,
                color: 'var(--red)',
                fontSize: '11px',
                textAlign: 'center',
                padding: '20px',
              }}
            >
              <div style={{ fontWeight: 'bold', marginBottom: '8px' }}>{error}</div>
              <div style={{ marginTop: '12px', display: 'flex', gap: '8px', justifyContent: 'center' }}>
                <button
                  type="button"
                  className="agBtnYellow"
                  onClick={handleRetry}
                  style={{ fontSize: '9px', padding: '6px 12px' }}
                >
                  Retry
                </button>
                <a
                  href={episode.url}
                  target="_blank"
                  rel="noreferrer"
                  className="agBtnCyan"
                  style={{ fontSize: '9px', padding: '6px 12px' }}
                >
                  Open in browser
                </a>
              </div>
            </div>
          )}

          <div data-vjs-player style={{ width: '100%', height: '100%' }}>
            <video
              ref={videoNodeRef}
              className="video-js vjs-default-skin vjs-big-play-centered"
              playsInline
              style={{ width: '100%', height: '100%' }}
            />
          </div>
        </div>

        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: '10px' }}>
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

        {/* Manual Subtitles Popover / Modal */}
        {showSubModal && (
          <div
            style={{
              position: 'fixed',
              inset: 0,
              backgroundColor: 'rgba(0,0,0,0.7)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              zIndex: 9999,
            }}
            onClick={() => setShowSubModal(false)}
          >
            <div
              className="agModal"
              onClick={(e) => e.stopPropagation()}
              style={{ width: '420px', maxWidth: '90vw', padding: '16px', border: '2px solid var(--blue)' }}
            >
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '12px' }}>
                <span style={{ fontSize: '12px', fontWeight: 'bold', color: 'var(--blue)' }}>
                  ADD MANUAL SUBTITLE
                </span>
                <button
                  type="button"
                  className="agBtnRed"
                  onClick={() => setShowSubModal(false)}
                  style={{ fontSize: '8px', padding: '2px 6px' }}
                >
                  X
                </button>
              </div>

              <div style={{ fontSize: '10px', color: 'var(--text-muted)', marginBottom: '12px' }}>
                Upload a local subtitle file (.vtt or .srt) or enter a direct WebVTT / SRT subtitle URL.
              </div>

              {subStatusMessage && (
                <div style={{ fontSize: '10px', color: 'var(--yellow)', marginBottom: '10px' }}>
                  {subStatusMessage}
                </div>
              )}

              <div style={{ marginBottom: '14px' }}>
                <label style={{ fontSize: '10px', color: 'var(--text-light)', display: 'block', marginBottom: '4px' }}>
                  1. Upload .vtt / .srt file:
                </label>
                <input
                  type="file"
                  ref={fileInputRef}
                  accept=".vtt,.srt"
                  onChange={handleSubtitleFileUpload}
                  style={{ fontSize: '10px', color: 'var(--text-light)' }}
                />
              </div>

              <div style={{ marginBottom: '14px' }}>
                <label style={{ fontSize: '10px', color: 'var(--text-light)', display: 'block', marginBottom: '4px' }}>
                  2. Or enter Subtitle URL:
                </label>
                <div style={{ display: 'flex', gap: '6px' }}>
                  <input
                    type="text"
                    className="agInput"
                    value={subUrlInput}
                    onChange={(e) => setSubUrlInput(e.target.value)}
                    placeholder="https://example.com/subtitles.vtt"
                    style={{ fontSize: '10px', flex: 1, padding: '4px 8px' }}
                  />
                  <button
                    type="button"
                    className="agBtnCyan"
                    onClick={handleAddSubtitleUrl}
                    style={{ fontSize: '9px', padding: '4px 10px' }}
                  >
                    Load URL
                  </button>
                </div>
              </div>

              {customSubtitles.length > 0 && (
                <div>
                  <div style={{ fontSize: '10px', color: 'var(--text-light)', marginBottom: '4px', fontWeight: 'bold' }}>
                    Active Custom Subtitles:
                  </div>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '4px', maxHeight: '100px', overflowY: 'auto' }}>
                    {customSubtitles.map((cs, idx) => (
                      <div
                        key={idx}
                        style={{
                          fontSize: '9px',
                          display: 'flex',
                          justifyContent: 'space-between',
                          alignItems: 'center',
                          backgroundColor: 'rgba(255,255,255,0.05)',
                          padding: '4px 8px',
                          borderRadius: '2px',
                        }}
                      >
                        <span style={{ color: 'var(--text-light)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                          {cs.label}
                        </span>
                        <button
                          type="button"
                          className="agBtnRed"
                          onClick={() => setCustomSubtitles((prev) => prev.filter((_, i) => i !== idx))}
                          style={{ fontSize: '7px', padding: '2px 4px' }}
                        >
                          Remove
                        </button>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

