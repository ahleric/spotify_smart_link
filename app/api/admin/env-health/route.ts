import { NextResponse } from 'next/server';

export const runtime = 'edge';

type EnvCheck = {
  name: string;
  required: boolean;
  present: boolean;
};

const REQUIRED_ENV = [
  'NEXT_PUBLIC_SUPABASE_URL',
  'NEXT_PUBLIC_SUPABASE_ANON_KEY',
  'SUPABASE_SERVICE_ROLE_KEY',
  'TRACK_EVENT_SIGNING_SECRET',
  'ADMIN_USERNAME',
  'ADMIN_PASSWORD',
] as const;

const RECOMMENDED_ENV = [
  'NEXT_PUBLIC_META_PIXEL_ID',
  'FB_ACCESS_TOKEN',
  'META_ADS_READ_TOKEN',
  'META_ADS_ACCESS_TOKEN',
  'FB_ADS_READ_TOKEN',
] as const;

function hasValue(name: string) {
  const value = process.env[name];
  return Boolean(value && value.trim().length > 0);
}

export async function GET() {
  const checks: EnvCheck[] = [
    ...REQUIRED_ENV.map((name) => ({
      name,
      required: true,
      present: hasValue(name),
    })),
    ...RECOMMENDED_ENV.map((name) => ({
      name,
      required: false,
      present: hasValue(name),
    })),
  ];

  const missingRequired = checks
    .filter((item) => item.required && !item.present)
    .map((item) => item.name);

  const missingRecommended = checks
    .filter((item) => !item.required && !item.present)
    .map((item) => item.name);

  return NextResponse.json({
    ok: missingRequired.length === 0,
    summary: {
      requiredTotal: REQUIRED_ENV.length,
      requiredPresent: REQUIRED_ENV.length - missingRequired.length,
      recommendedTotal: RECOMMENDED_ENV.length,
      recommendedPresent: RECOMMENDED_ENV.length - missingRecommended.length,
    },
    missingRequired,
    missingRecommended,
    checks,
  });
}
