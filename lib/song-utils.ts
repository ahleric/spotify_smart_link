function normalizeSegment(input: string) {
  return input
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
}

export function normalizeSlug(input: string) {
  return input
    .split('/')
    .map((part) => normalizeSegment(part))
    .filter(Boolean)
    .join('/');
}

export function buildDefaultSlug(artist: string, title: string) {
  const artistPart = normalizeSegment(artist);
  const titlePart = normalizeSegment(title);
  return [artistPart, titlePart].filter(Boolean).join('/');
}

export function buildArtistSlug(name: string) {
  return normalizeSegment(name);
}

export function buildSongSlug(title: string) {
  return normalizeSegment(title);
}

export function deriveSpotifyDeepLink(webUrl: string) {
  const url = webUrl.trim();
  if (!url) return '';

  // 已是深链格式
  if (url.startsWith('spotify://')) return url;
  if (url.startsWith('spotify:')) {
    const parts = url.split(':').filter(Boolean);
    if (parts.length >= 2) {
      const [type, id] = parts.slice(-2);
      return `spotify://${type}/${id}`;
    }
  }

  // open.spotify.com/track/{id}
  const match = url.match(
    /open\.spotify\.com\/(?:intl-[a-z]{2}\/)?(track|album|playlist)\/([a-zA-Z0-9]+)/,
  );
  if (match) {
    const [, type, id] = match;
    return `spotify://${type}/${id}`;
  }

  return '';
}
