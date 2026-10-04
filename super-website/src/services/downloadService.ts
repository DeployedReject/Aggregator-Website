import type { DownloadItem } from '../types/library';

type BrowserWithDownloads = {
  browser?: {
    downloads?: {
      download(options: { url: string; filename?: string; saveAs?: boolean }): Promise<number>;
    };
  };
  chrome?: {
    downloads?: {
      download(options: { url: string; filename?: string; saveAs?: boolean }, cb?: (id: number) => void): void;
    };
  };
};

const browserObj = (globalThis as unknown as BrowserWithDownloads).browser ||
  (globalThis as unknown as BrowserWithDownloads).chrome;

let downloadQueue: DownloadItem[] = [];
const listeners: Array<(items: DownloadItem[]) => void> = [];

function notify(): void {
  for (const fn of listeners) {
    fn([...downloadQueue]);
  }
}

function sanitize(name: string): string {
  return name.replace(/[^a-z0-9_\-\. ]/gi, '_').trim();
}

export function subscribeDownloads(fn: (items: DownloadItem[]) => void): () => void {
  listeners.push(fn);
  fn([...downloadQueue]);
  return () => {
    const idx = listeners.indexOf(fn);
    if (idx >= 0) listeners.splice(idx, 1);
  };
}

export function getDownloads(): DownloadItem[] {
  return [...downloadQueue];
}

export async function downloadEpisode(
  title: string,
  episodeNum: number,
  streamUrl: string,
  pluginId: string
): Promise<DownloadItem> {
  const cleanTitle = sanitize(title);
  const ext = streamUrl.includes('.m3u8') ? 'm3u8' : 'mp4';
  const filename = `anime/${cleanTitle}/ep_${episodeNum}.${ext}`;
  const id = `${cleanTitle}_ep_${episodeNum}_${Date.now()}`;

  const item: DownloadItem = {
    id,
    title,
    episodeNum,
    url: streamUrl,
    pluginId,
    status: 'downloading',
    progress: 0,
    createdAt: Date.now(),
  };

  downloadQueue = [item, ...downloadQueue];
  notify();

  try {
    if (browserObj?.downloads?.download) {
      const dlId = await new Promise<number>((resolve, reject) => {
        const res = browserObj.downloads!.download(
          { url: streamUrl, filename, saveAs: false },
          (id) => {
            if (id !== undefined) resolve(id);
            else reject(new Error('Download failed to start'));
          }
        );
        if ((res as unknown) instanceof Promise) {
          ((res as unknown) as Promise<number>).then(resolve).catch(reject);
        }
      });
      item.browserDownloadId = dlId;
      item.status = 'completed';
      item.progress = 100;
    } else {
      const a = document.createElement('a');
      a.href = streamUrl;
      a.download = `ep_${episodeNum}.${ext}`;
      a.target = '_blank';
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      item.status = 'completed';
      item.progress = 100;
    }
  } catch {
    item.status = 'failed';
  }

  notify();
  return item;
}

export function clearDownloads(): void {
  downloadQueue = [];
  notify();
}
