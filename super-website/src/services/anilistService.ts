export interface AniListTrendingItem {
  id: number;
  title: string;
  coverUrl: string;
}

interface AniListResponse {
  data?: {
    Page?: {
      media?: Array<{
        id: number;
        title?: {
          english?: string | null;
          romaji?: string | null;
        };
        coverImage?: {
          large?: string | null;
          medium?: string | null;
        };
      }>;
    };
  };
}

const GRAPHQL_QUERY = `
query ($perPage: Int) {
  Page(page: 1, perPage: $perPage) {
    media(sort: TRENDING_DESC, type: ANIME) {
      id
      title {
        english
        romaji
      }
      coverImage {
        large
        medium
      }
    }
  }
}
`;

export async function fetchTrendingAnime(limit = 12): Promise<AniListTrendingItem[]> {
  const res = await fetch('https://graphql.anilist.co', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Accept: 'application/json',
    },
    body: JSON.stringify({
      query: GRAPHQL_QUERY,
      variables: { perPage: limit },
    }),
  });

  if (!res.ok) {
    throw new Error(`AniList request failed: ${res.status}`);
  }

  const json = (await res.json()) as AniListResponse;
  const list = json?.data?.Page?.media || [];

  return list.map((item) => ({
    id: item.id,
    title: item.title?.english || item.title?.romaji || 'Unknown Title',
    coverUrl: item.coverImage?.large || item.coverImage?.medium || '',
  }));
}
