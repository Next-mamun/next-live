import { createClient } from '@supabase/supabase-js';

const getValidSupabaseUrl = () => {
  let raw = 
    (typeof import.meta !== 'undefined' && (import.meta as any).env ? (import.meta as any).env.VITE_SUPABASE_URL : '') ||
    process.env.VITE_SUPABASE_URL ||
    process.env.NEXT_PUBLIC_SUPABASE_URL || 
    'https://zdrubxtuxotqyasmsuqz.supabase.co';

  if (!raw || typeof raw !== 'string') {
    return 'https://zdrubxtuxotqyasmsuqz.supabase.co';
  }

  raw = raw.trim();
  if (raw.startsWith('http://') || raw.startsWith('https://')) {
    return raw;
  }
  // If it's just the project ref (e.g. zdrubxtuxotqyasmsuqz)
  return `https://${raw}${raw.includes('.') ? '' : '.supabase.co'}`;
};

const supabaseUrl = getValidSupabaseUrl();

const supabaseAnonKey = 
  (typeof import.meta !== 'undefined' && (import.meta as any).env ? (import.meta as any).env.VITE_SUPABASE_ANON_KEY : '') ||
  process.env.VITE_SUPABASE_ANON_KEY ||
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || 
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InpkcnVieHR1eG90cXlhc21zdXF6Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzE0MjYwMjUsImV4cCI6MjA4NzAwMjAyNX0.bmabhbjLx_ZUmW0wJRx9fUY8Noiv9dz8i-pzWe-PEyI';

export const supabase = createClient(supabaseUrl, supabaseAnonKey, {
  auth: {
    persistSession: true,
    autoRefreshToken: true,
  },
  realtime: {
    params: {
      eventsPerSecond: 25,
    },
  },
});

