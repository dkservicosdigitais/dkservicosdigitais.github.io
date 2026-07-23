import { PassThrough, Readable } from 'stream';
import archiver from 'archiver';
import { getSupabaseAdmin, requireAdmin } from '@/lib/supabaseAdmin';
import { buildFileName } from '@/lib/config';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';
export const maxDuration = 300; // Vercel: até 5 min para casamentos grandes

const WEDDING_SLUG = process.env.NEXT_PUBLIC_WEDDING_SLUG || 'lucas-joyce';

/**
 * POST /api/admin/download-all
 * Corpo opcional: { ids: [uuid, ...] } para baixar apenas as selecionadas.
 * Gera um ZIP em streaming no backend — nada é montado no navegador.
 */
export async function POST(request) {
  const auth = await requireAdmin(request);
  if (auth.error) {
    return new Response(JSON.stringify({ error: auth.error }), {
      status: auth.status,
      headers: { 'Content-Type': 'application/json' },
    });
  }

  let ids = null;
  try {
    const body = await request.json();
    if (Array.isArray(body?.ids) && body.ids.length > 0) ids = body.ids;
  } catch {
    // corpo vazio = todas as fotos
  }

  try {
    const supabase = getSupabaseAdmin();
    let query = supabase
      .from('photos')
      .select('id, guest_name, original_url, secure_url, format, created_at')
      .eq('wedding_slug', WEDDING_SLUG)
      .eq('status', 'approved')
      .order('created_at', { ascending: true });
    if (ids) query = query.in('id', ids);

    const { data: photos, error } = await query;
    if (error) throw error;
    if (!photos || photos.length === 0) {
      return new Response(JSON.stringify({ error: 'Nenhuma foto para baixar.' }), {
        status: 404,
        headers: { 'Content-Type': 'application/json' },
      });
    }

    const zipStream = new PassThrough();
    const archive = archiver('zip', { zlib: { level: 1 } }); // fotos já são comprimidas
    archive.on('error', (err) => zipStream.destroy(err));
    archive.pipe(zipStream);

    // Anexa os originais um a um, em fluxo, sem estourar a memória.
    (async () => {
      let seq = 0;
      for (const photo of photos) {
        seq += 1;
        const url = photo.original_url || photo.secure_url;
        try {
          const res = await fetch(url);
          if (!res.ok || !res.body) continue;
          const name = buildFileName(photo.guest_name, photo.created_at, seq, photo.format);
          archive.append(Readable.fromWeb(res.body), { name });
        } catch (err) {
          console.error(`[download-all] falha em ${photo.id}:`, err.message);
        }
      }
      archive.finalize();
    })();

    return new Response(Readable.toWeb(zipStream), {
      status: 200,
      headers: {
        'Content-Type': 'application/zip',
        'Content-Disposition': `attachment; filename="galeria-${WEDDING_SLUG.replace('lucas-joyce', 'lucas-e-joyce')}.zip"`,
        'Cache-Control': 'no-store',
      },
    });
  } catch (err) {
    console.error('[POST /api/admin/download-all]', err);
    return new Response(
      JSON.stringify({ error: 'Não foi possível gerar o arquivo.' }),
      { status: 500, headers: { 'Content-Type': 'application/json' } }
    );
  }
}
