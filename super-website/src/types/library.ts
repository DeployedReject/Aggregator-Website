import type { MediaItem } from './plugin';

export interface LibraryItem {
  media: MediaItem;
  pluginId: string;
  category: string;
  addedAt: number;
  lastWatchedEpisodeId?: string;
  lastWatchedEpisodeNum?: number;
  lastWatchedAt?: number;
}

export type DefaultCategory =
  | 'Watching'
  | 'Plan to Watch'
  | 'Completed'
  | 'On Hold'
  | 'Dropped';

export const DEFAULT_CATEGORIES: string[] = [
  'Watching',
  'Plan to Watch',
  'Completed',
  'On Hold',
  'Dropped',
];

export type DownloadStatus = 'queued' | 'downloading' | 'completed' | 'failed';

export interface DownloadItem {
  id: string;
  title: string;
  episodeNum: number;
  url: string;
  pluginId: string;
  status: DownloadStatus;
  progress: number;
  createdAt: number;
  browserDownloadId?: number;
}
