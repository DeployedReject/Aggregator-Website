export interface MediaItem {
  id: string;
  title: string;
  coverUrl: string;
  url: string;
}

export interface EpisodeItem {
  id: string;
  number: number;
  title?: string;
  url: string;
}

export interface StreamSource {
  quality: string;
  url: string;
  subtitles?: { file: string; label: string }[];
  headers?: Record<string, string>;
  type?: 'sub' | 'dub';
}

export interface SourcePlugin {
  id: string;
  name: string;
  baseUrl: string;
  version: string;
  search(query: string): Promise<MediaItem[]>;
  getEpisodes(mediaId: string): Promise<EpisodeItem[]>;
  getStreams(episodeId: string): Promise<StreamSource[]>;
  getHome?(): Promise<MediaItem[]>;
}
