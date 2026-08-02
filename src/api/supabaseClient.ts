import { createClient, type SupabaseClient } from '@supabase/supabase-js';

type SupabaseRuntimeConfig = {
  supabaseUrl: string;
  supabaseAnonKey: string;
};

let client: SupabaseClient | null = null;
let configPromise: Promise<SupabaseRuntimeConfig> | null = null;

function readBuildTimeConfig(): SupabaseRuntimeConfig | null {
  const supabaseUrl = String(import.meta.env.VITE_SUPABASE_URL || '').trim();
  const supabaseAnonKey = String(import.meta.env.VITE_SUPABASE_ANON_KEY || '').trim();
  if (!supabaseUrl || !supabaseAnonKey) return null;
  return { supabaseUrl, supabaseAnonKey };
}

async function loadRuntimeConfig(): Promise<SupabaseRuntimeConfig> {
  const buildConfig = readBuildTimeConfig();
  if (buildConfig) return buildConfig;

  const response = await fetch('/api/config', { cache: 'no-store' });
  if (!response.ok) {
    throw new Error('Không tải được cấu hình Supabase từ server.');
  }

  const data = (await response.json()) as Partial<SupabaseRuntimeConfig>;
  const supabaseUrl = String(data.supabaseUrl || '').trim();
  const supabaseAnonKey = String(data.supabaseAnonKey || '').trim();
  if (!supabaseUrl || !supabaseAnonKey) {
    throw new Error('Server chưa cấu hình Supabase (SUPABASE_URL / SUPABASE_ANON_KEY).');
  }

  return { supabaseUrl, supabaseAnonKey };
}

export function isSupabaseConfiguredSync(): boolean {
  return readBuildTimeConfig() !== null;
}

export async function isSupabaseConfigured(): Promise<boolean> {
  if (readBuildTimeConfig()) return true;
  try {
    await resolveSupabaseConfig();
    return true;
  } catch {
    return false;
  }
}

async function resolveSupabaseConfig(): Promise<SupabaseRuntimeConfig> {
  if (!configPromise) {
    configPromise = loadRuntimeConfig().catch(err => {
      configPromise = null;
      throw err;
    });
  }
  return configPromise;
}

export async function getSupabase(): Promise<SupabaseClient> {
  if (client) return client;
  const config = await resolveSupabaseConfig();
  client = createClient(config.supabaseUrl, config.supabaseAnonKey);
  return client;
}

export function getSupabaseConfigErrorMessage(error: unknown): string {
  const message = error instanceof Error ? error.message : String(error);
  if (message.includes('supabaseUrl is required') || message.includes('cấu hình Supabase')) {
    return 'Thiếu cấu hình Supabase trên server. Liên hệ quản trị viên để thiết lập SUPABASE_URL và SUPABASE_ANON_KEY.';
  }
  return message || 'Không thể kết nối Supabase.';
}
