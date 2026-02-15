import SmartLinkPage from '@/components/SmartLinkPage';
import { fallbackReleaseData } from '@/lib/config';
import { createTrackingAuthToken } from '@/lib/tracking-auth';

export default async function Home() {
  const trackingAuthToken = await createTrackingAuthToken('/');
  return (
    <SmartLinkPage
      releaseData={{
        ...fallbackReleaseData,
        trackingAuthToken,
      }}
    />
  );
}
