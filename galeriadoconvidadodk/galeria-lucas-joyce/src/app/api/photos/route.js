import { NextResponse } from 'next/server';
import { getSupabaseAdmin } from '@/lib/supabaseAdmin';
import { computeAvailablePosition } from '@/lib/positions';
import { thumbUrl } from '@/lib/config';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

const WEDDING_SLUG = process.env.NEXT_PUBLIC_WEDDING_SLUG || 'lucas-joyce';
const CLOUD_NAME = process.env.NEXT_PUBLIC_CLOUDINARY_CLOUD_NAME || 'dotko9ym';
const ALLOWED_FORMATS = ['jpg', 'jpeg', 'png', 'webp', 'heic', 'heif', 'avif'];
const MAX_BYTES = 12 * 1024 * 1024; // margem sobre os 10 MB do cliente

// ------------------------------------------------------------
// Proteção simples contra spam (por IP, em memória).
// Em produção séria, troque por Upstash/Redis ou o rate limit da Vercel.
// ------------------------------------------------------------
const buckets = new Map();
function rateLimit(ip, limit = 40, windowMs = 10 * 60 * 1000) {
  const now = Date.now();
  const bucket = buckets.get(ip) || [];
  const recent = bucket.filter((t) => now - t < windowMs);
  if (recent.length >= limit) return false;
  recent.push(now);
  buckets.set(ip, recent);
  return true;
}

/** GET /api/photos — fotos aprovadas e visíveis do casamento. */
export async function GET() {
  try {
    const supabase = getSupabaseAdmin();
    const { data, error } = await supabase
      .from('photos')
      .select(
        'id, guest_name, caption, secure_url, thumbnail_url, original_width, original_height, format, position_latitude, position_longitude, position_depth, rotation_z, visual_scale, created_at'
      )
      .eq('wedding_slug', WEDDING_SLUG)
      .eq('status', 'approved')
      .eq('is_hidden', false)
      .order('created_at', { ascending: true });

    if (error) throw error;
    return NextResponse.json({ photos: data || [] });
  } catch (err) {
    console.error('[GET /api/photos]', err);
    return NextResponse.json(
      { error: 'Não foi possível carregar a galeria agora.' },
      { status: 500 }
    );
  }
}

/**
 * POST /api/photos — registra no banco uma foto já enviada ao Cloudinary.
 * O backend valida a origem, calcula a posição persistente e grava.
 */
export async function POST(request) {
  try {
    const ip =
      request.headers.get('x-forwarded-for')?.split(',')[0]?.trim() ||
      request.headers.get('x-real-ip') ||
      'unknown';
    if (!rateLimit(ip)) {
      return NextResponse.json(
        { error: 'Muitos envios em pouco tempo. Aguarde alguns minutos.' },
        { status: 429 }
      );
    }

    const body = await request.json();
    const {
      cloudinary_public_id,
      secure_url,
      guest_name,
      caption,
      original_width,
      original_height,
      format,
      bytes,
    } = body || {};

    // ----- Validações -----
    const name = String(guest_name || '').trim().slice(0, 80);
    if (!name) {
      return NextResponse.json({ error: 'Informe o seu nome.' }, { status: 400 });
    }
    if (!cloudinary_public_id || !secure_url) {
      return NextResponse.json({ error: 'Dados do upload ausentes.' }, { status: 400 });
    }
    const expectedPrefix = `https://res.cloudinary.com/${CLOUD_NAME}/`;
    if (!String(secure_url).startsWith(expectedPrefix)) {
      return NextResponse.json({ error: 'Origem da imagem inválida.' }, { status: 400 });
    }
    const fmt = String(format || '').toLowerCase();
    if (fmt && !ALLOWED_FORMATS.includes(fmt)) {
      return NextResponse.json({ error: 'Formato de imagem não permitido.' }, { status: 400 });
    }
    if (Number(bytes) > MAX_BYTES) {
      return NextResponse.json({ error: 'Arquivo acima do limite permitido.' }, { status: 400 });
    }

    const supabase = getSupabaseAdmin();

    // Idempotência: se a foto já foi registrada, devolve o registro existente.
    const { data: existingPhoto } = await supabase
      .from('photos')
      .select('*')
      .eq('cloudinary_public_id', cloudinary_public_id)
      .maybeSingle();
    if (existingPhoto) {
      return NextResponse.json({ photo: existingPhoto, duplicated: true });
    }

    // Posições já ocupadas → calcula uma posição livre e persistente.
    const { data: occupied, error: occError } = await supabase
      .from('photos')
      .select('position_latitude, position_longitude')
      .eq('wedding_slug', WEDDING_SLUG);
    if (occError) throw occError;

    const pos = computeAvailablePosition(occupied || []);

    const record = {
      wedding_slug: WEDDING_SLUG,
      cloudinary_public_id,
      secure_url,
      original_url: secure_url,
      thumbnail_url: thumbUrl(secure_url),
      guest_name: name,
      caption: caption ? String(caption).trim().slice(0, 200) : null,
      original_width: Number(original_width) || 0,
      original_height: Number(original_height) || 0,
      format: fmt || null,
      bytes: Number(bytes) || 0,
      ...pos,
      status: 'approved',
    };

    const { data, error } = await supabase
      .from('photos')
      .insert(record)
      .select()
      .single();
    if (error) throw error;

    return NextResponse.json({ photo: data }, { status: 201 });
  } catch (err) {
    console.error('[POST /api/photos]', err);
    return NextResponse.json(
      { error: 'Não foi possível registrar a foto. Tente novamente.' },
      { status: 500 }
    );
  }
}
