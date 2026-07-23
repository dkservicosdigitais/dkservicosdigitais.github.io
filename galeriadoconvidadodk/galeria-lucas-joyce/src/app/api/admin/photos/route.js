import { NextResponse } from 'next/server';
import { getSupabaseAdmin, requireAdmin } from '@/lib/supabaseAdmin';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

const WEDDING_SLUG = process.env.NEXT_PUBLIC_WEDDING_SLUG || 'lucas-joyce';

/** GET /api/admin/photos — todas as fotos + estatísticas (área dos noivos). */
export async function GET(request) {
  const auth = await requireAdmin(request);
  if (auth.error) {
    return NextResponse.json({ error: auth.error }, { status: auth.status });
  }

  try {
    const supabase = getSupabaseAdmin();
    const { data, error } = await supabase
      .from('photos')
      .select('*')
      .eq('wedding_slug', WEDDING_SLUG)
      .order('created_at', { ascending: false });
    if (error) throw error;

    const photos = data || [];
    const guests = new Set(photos.map((p) => p.guest_name.trim().toLowerCase()));
    const totalBytes = photos.reduce((sum, p) => sum + (Number(p.bytes) || 0), 0);

    return NextResponse.json({
      photos,
      stats: {
        total: photos.length,
        guests: guests.size,
        bytes: totalBytes,
        favorites: photos.filter((p) => p.is_favorite).length,
      },
    });
  } catch (err) {
    console.error('[GET /api/admin/photos]', err);
    return NextResponse.json(
      { error: 'Não foi possível carregar as fotos.' },
      { status: 500 }
    );
  }
}
