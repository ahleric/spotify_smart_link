const DEFAULT_TTL_SECONDS = 12 * 60 * 60;

type TrackingTokenPayload = {
  v: 1;
  path: string;
  iat: number;
  exp: number;
};

type VerifyTrackingTokenResult =
  | { ok: true; reason: 'ok' | 'secret_not_configured'; payload?: TrackingTokenPayload }
  | { ok: false; reason: 'missing_token' | 'invalid_format' | 'invalid_signature' | 'invalid_payload' | 'expired' | 'path_mismatch' };

function getTrackingSecret() {
  return (process.env.TRACK_EVENT_SIGNING_SECRET || '').trim();
}

function toBase64Url(bytes: Uint8Array) {
  let binary = '';
  for (let index = 0; index < bytes.length; index += 1) {
    binary += String.fromCharCode(bytes[index]);
  }
  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/g, '');
}

function fromBase64Url(input: string) {
  const base64 = input.replace(/-/g, '+').replace(/_/g, '/');
  const padded = base64 + '==='.slice((base64.length + 3) % 4);
  const binary = atob(padded);
  const bytes = new Uint8Array(binary.length);
  for (let index = 0; index < binary.length; index += 1) {
    bytes[index] = binary.charCodeAt(index);
  }
  return bytes;
}

function normalizeTrackingPath(pathname: string) {
  const trimmed = pathname.trim();
  if (!trimmed) return '';
  let normalized = trimmed.replace(/[?#].*$/, '');
  if (!normalized.startsWith('/')) normalized = `/${normalized}`;
  normalized = normalized.replace(/\/{2,}/g, '/');
  if (normalized.length > 1 && normalized.endsWith('/')) {
    normalized = normalized.slice(0, -1);
  }
  return normalized;
}

async function signPayload(payloadBase64Url: string, secret: string) {
  const encoder = new TextEncoder();
  const key = await crypto.subtle.importKey(
    'raw',
    encoder.encode(secret),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign'],
  );
  const signature = await crypto.subtle.sign('HMAC', key, encoder.encode(payloadBase64Url));
  return toBase64Url(new Uint8Array(signature));
}

function safeCompare(left: string, right: string) {
  if (left.length !== right.length) return false;
  let mismatch = 0;
  for (let index = 0; index < left.length; index += 1) {
    mismatch |= left.charCodeAt(index) ^ right.charCodeAt(index);
  }
  return mismatch === 0;
}

function parsePayload(payloadBase64Url: string) {
  try {
    const decoded = new TextDecoder().decode(fromBase64Url(payloadBase64Url));
    const payload = JSON.parse(decoded) as TrackingTokenPayload;
    if (payload?.v !== 1) return null;
    if (!payload.path || typeof payload.path !== 'string') return null;
    if (!Number.isFinite(payload.iat) || !Number.isFinite(payload.exp)) return null;
    return payload;
  } catch {
    return null;
  }
}

export function isTrackingSignatureEnabled() {
  return Boolean(getTrackingSecret());
}

export async function createTrackingAuthToken(pathname: string, ttlSeconds = DEFAULT_TTL_SECONDS) {
  const secret = getTrackingSecret();
  const normalizedPath = normalizeTrackingPath(pathname);
  if (!secret || !normalizedPath) return '';

  const now = Math.floor(Date.now() / 1000);
  const payload: TrackingTokenPayload = {
    v: 1,
    path: normalizedPath,
    iat: now,
    exp: now + Math.max(60, Math.floor(ttlSeconds)),
  };

  const payloadBase64Url = toBase64Url(new TextEncoder().encode(JSON.stringify(payload)));
  const signature = await signPayload(payloadBase64Url, secret);
  return `${payloadBase64Url}.${signature}`;
}

export async function verifyTrackingAuthToken(token: string, expectedPath: string): Promise<VerifyTrackingTokenResult> {
  const secret = getTrackingSecret();
  if (!secret) {
    return { ok: true, reason: 'secret_not_configured' };
  }

  const normalizedPath = normalizeTrackingPath(expectedPath);
  if (!token.trim()) return { ok: false, reason: 'missing_token' };
  const [payloadBase64Url, signature] = token.split('.');
  if (!payloadBase64Url || !signature) {
    return { ok: false, reason: 'invalid_format' };
  }

  const expectedSignature = await signPayload(payloadBase64Url, secret);
  if (!safeCompare(signature, expectedSignature)) {
    return { ok: false, reason: 'invalid_signature' };
  }

  const payload = parsePayload(payloadBase64Url);
  if (!payload) return { ok: false, reason: 'invalid_payload' };

  const now = Math.floor(Date.now() / 1000);
  if (payload.exp < now - 30) return { ok: false, reason: 'expired' };

  if (normalizedPath && payload.path !== normalizedPath) {
    return { ok: false, reason: 'path_mismatch' };
  }

  return { ok: true, reason: 'ok', payload };
}

