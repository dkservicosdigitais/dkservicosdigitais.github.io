'use client';

import { createClient } from '@supabase/supabase-js';

let client = null;

/**
 * Cliente Supabase para o navegador (chave anônima).
 * Criado de forma preguiçosa para não quebrar o build sem variáveis.
 */
export function getSupabase() {
  if (client) return client;
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const anon = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!url || !anon) return null;
  client = createClient(url, anon, {
    auth: { persistSession: true, autoRefreshToken: true },
    realtime: { params: { eventsPerSecond: 5 } },
  });
  return client;
}
