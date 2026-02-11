import { redirect } from 'next/navigation';

export const runtime = 'edge';

export default function AnalyticsArtistRedirect({
  params,
}: {
  params: { artist: string };
}) {
  redirect(`/admin/analytics?mode=artist&artist_slug=${encodeURIComponent(params.artist)}`);
}
