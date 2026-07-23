import { NextResponse } from 'next/server';
import { getSupabaseAdmin, requireAdmin } from '@/lib/supabaseAdmin';
import { destroyCloudinaryImage } from '@/lib/cloudinaryServer';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

const WEDDING_SLUG = process.env.NEXT_PUBLIC_WEDDING_SLUG || 'lucas-joyce';

/**
 * PATCH /api/admin/photos/[id]
 * Corpo: { is_favorite?, is_hidden?, status? }
 */
export async function PATCH(request, { params }) {
  const auth = await requireAdmin(request);
  if (auth.error) {
    return NextResponse.json({ error: auth.error }, { status: auth.status });
  }

  try {
    const body = await request.json();
    const patch = {};
    if (typeof body.is_favorite === 'boolean') patch.is_favorite = body.is_favorite;
    if (typeof body.is_hidden === 'boolean') patch.is_hidden = body.is_hidden;
    if (['pending', 'approved', 'rejected'].includes(body.status)) {
      patch.status = body.status;
    }
    if (Object.keys(patch).length === 0) {
      return NextResponse.json({ error: 'Nada para atualizar.' }, { status: 400 });
    }

    const supabase = getSupabaseAdmin();
    const { data, error } = await supabase
      .from('photos')
      .update(patch)
      .eq('id', params.id)
      .eq('wedding_slug', WEDDING_SLUG)
      .select()
      .single();
    if (error) throw error;

    return NextResponse.json({ photo: data });
  } catch (err) {
    console.error('[PATCH /api/admin/photos/:id]', err);
    return NextResponse.json(
      { error: 'Não foi possível atualizar a foto.' },
      { status: 500 }
    );
  }
}

/**
 * DELETE /api/admin/photos/[id]
 * Exclui no Cloudinary (backend, assinado) e depois no banco.
 */
export async function DELETE(request, { params }) {
  const auth = await requireAdmin(request);
  if (auth.error) {
    return NextResponse.json({ error: auth.error }, { status: auth.status });
  }

  try {
    const supabase = getSupabaseAdmin();
    const { data: photo, error: findError } = await supabase
      .from('photos')
      .select('id, cloudinary_public_id')
      .eq('id', params.id)
      .eq('wedding_slug', WEDDING_SLUG)
      .single();
    if (findError || !photo) {
      return NextResponse.json({ error: 'Foto não encontrada.' }, { status: 404 });
    }

    // 1) Remove o arquivo no Cloudinary (nunca pelo frontend).
    await destroyCloudinaryImage(photo.cloudinary_public_id);

    // 2) Remove o registro no banco.
    const { error: delError } = await supabase
      .from('photos')
      .delete()
      .eq('id', photo.id);
    if (delError) throw delError;

    return NextResponse.json({ ok: true });
  } catch (err) {
    console.error('[DELETE /api/admin/photos/:id]', err);
    return NextResponse.json(
      { error: 'Não foi possível excluir a foto.' },
      { status: 500 }
    );
  }
}
