import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import { supabaseConfig } from './config';

const { url, anonKey, serviceRoleKey } = supabaseConfig;

const clientOptions = {
  auth: {
    persistSession: false,
    autoRefreshToken: false,
  },
};

let cachedAnonClient: SupabaseClient | null = null;
let cachedServiceClient: SupabaseClient | null = null;

function ensureConfig() {
  if (!url || !anonKey) {
    throw new Error('缺少 Supabase URL 或匿名密钥，请在 .env.local 中配置。');
  }
}

export function getSupabaseClient(mode: 'anon' | 'service' = 'anon'): SupabaseClient {
  ensureConfig();
  if (mode === 'service') {
    if (!cachedServiceClient) {
      const key = serviceRoleKey || anonKey;
      cachedServiceClient = createClient(url, key, clientOptions);
    }
    return cachedServiceClient;
  }

  if (!cachedAnonClient) {
    cachedAnonClient = createClient(url, anonKey, clientOptions);
  }
  return cachedAnonClient;
}
