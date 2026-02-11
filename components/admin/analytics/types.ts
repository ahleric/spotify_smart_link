export type AnalyticsMode = 'artist' | 'song';
export type AnalyticsRangePreset = 'today' | 'yesterday' | 'week' | 'month' | 'custom';

export type SummaryResponse = {
  ok: boolean;
  empty?: boolean;
  reason?: string;
  message?: string;
  range?: {
    range: AnalyticsRangePreset;
    days: number;
    startIso: string;
    endIso: string;
    startDate: string;
    endDate: string;
  };
  totals?: {
    view: number;
    click: number;
    openSuccess: number;
    qualified: number;
    openFallback: number;
  };
  rates?: {
    clickRatePct: number;
    openSuccessRatePct: number;
    qualifiedRatePct: number;
  };
  windows?: {
    openSuccessRateStart: string;
    qualifiedRateStart: string;
  };
};

export type TimeseriesResponse = {
  ok: boolean;
  empty?: boolean;
  series: Array<{
    day: string;
    view: number;
    click: number;
    openSuccess: number;
    qualified: number;
    openFallback: number;
    clickRatePct: number;
    openSuccessRatePct: number | null;
    qualifiedRatePct: number | null;
  }>;
};

export type CampaignsResponse = {
  ok: boolean;
  empty?: boolean;
  rows: Array<{
    key: string;
    utmSource: string;
    utmMedium: string;
    adSetId: string;
    adId: string;
    adSetName: string;
    adName: string;
    view: number;
    click: number;
    openSuccess: number;
    qualified: number;
    openFallback: number;
    clickRatePct: number;
    openSuccessRatePct: number;
    qualifiedRatePct: number;
  }>;
};

export type RouteHealthResponse = {
  ok: boolean;
  empty?: boolean;
  rows: Array<{
    key: string;
    os: string;
    inAppBrowser: string;
    strategy: string;
    reason: string;
    click: number;
    openAttempt: number;
    openSuccess: number;
    openFallback: number;
    openSuccessRatePct: number;
    fallbackRatePct: number;
  }>;
};

export type HighIntentResponse = {
  ok: boolean;
  empty?: boolean;
  rows: Array<{
    audienceKey: string;
    lastSeenAt: string;
    lastQualifiedAt: string | null;
    utmSource: string;
    utmCampaign: string;
    utmContent: string;
    utmTerm: string;
    view: number;
    click: number;
    openSuccess: number;
    qualified: number;
    audienceTier: string;
  }>;
};
