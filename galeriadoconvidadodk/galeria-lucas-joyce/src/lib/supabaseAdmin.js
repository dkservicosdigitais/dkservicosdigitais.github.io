// Este módulo só deve ser importado por route handlers (servidor).
import { createClient } from '@supabase/supabase-js';

/**
 * Cliente Supabase com service_role. SOMENTE no servidor.
 * A service_role ignora o RLS — nunca importar em componentes de cliente.
 */
export function getSupabaseAdmin() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) {
    throw new Error(
      'Supabase não configurado: defina NEXT_PUBLIC_SUPABASE_URL e SUPABASE_SERVICE_ROLE_KEY.'
    );
  }
  return createClient(url, key, { auth: { persistSession: false } });
}

/**
 * Valida o token de acesso enviado pelo frontend e confirma
 * que o usuário é um dos noivos (ADMIN_EMAILS).
 */
export async function requireAdmin(request) {
  const header = request.headers.get('authorization') || '';
  const token = header.startsWith('Bearer ') ? header.slice(7) : null;
  if (!token) return { error: 'Não autenticado.', status: 401 };

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const anon = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!url || !anon) return { error: 'Supabase não configurado.', status: 500 };

  const authClient = createClient(url, anon, { auth: { persistSession: false } });
  const { data, error } = await authClient.auth.getUser(token);
  if (error || !data?.user) return { error: 'Sessão inválida.', status: 401 };

  const allowed = (process.env.ADMIN_EMAILS || '')
    .split(',')
    .map((e) => e.trim().toLowerCase())
    .filter(Boolean);

  const email = (data.user.email || '').toLowerCase();
  if (allowed.length > 0 && !allowed.includes(email)) {
    return { error: 'Este usuário não tem acesso à área dos noivos.', status: 403 };
  }
  return { user: data.user };
}
