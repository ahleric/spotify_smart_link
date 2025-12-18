import SmartLinkPage from '@/components/SmartLinkPage';
import { fallbackReleaseData } from '@/lib/config';

export default function Home() {
  return <SmartLinkPage releaseData={fallbackReleaseData} />;
}
