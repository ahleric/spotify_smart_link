export type SongRow = {
  id: string;
  artist_id: string;
  slug: string;
  song_slug?: string | null;
  artist_name: string;
  track_title: string;
  cover_image_url: string;
  spotify_web_link: string;
  spotify_deep_link: string;
  meta_pixel_id?: string | null;
  facebook_access_token?: string | null;
  created_at?: string | null;
};

export type ArtistRow = {
  id: string;
  slug: string;
  name: string;
  photo_url?: string | null;
  meta_pixel_id?: string | null;
  facebook_access_token?: string | null;
  created_at?: string | null;
};
