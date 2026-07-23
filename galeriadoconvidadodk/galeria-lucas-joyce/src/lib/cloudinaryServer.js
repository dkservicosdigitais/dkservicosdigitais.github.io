// Este módulo só deve ser importado por route handlers (servidor).
import crypto from 'crypto';

const CLOUD_NAME = process.env.NEXT_PUBLIC_CLOUDINARY_CLOUD_NAME || 'dotko9ym';

/**
 * Exclui uma imagem no Cloudinary usando a Admin API assinada.
 * Executa SOMENTE no backend — depende de CLOUDINARY_API_KEY/SECRET.
 */
export async function destroyCloudinaryImage(publicId) {
  const apiKey = process.env.CLOUDINARY_API_KEY;
  const apiSecret = process.env.CLOUDINARY_API_SECRET;
  if (!apiKey || !apiSecret) {
    throw new Error(
      'Cloudinary não configurado: defina CLOUDINARY_API_KEY e CLOUDINARY_API_SECRET no backend.'
    );
  }

  const timestamp = Math.floor(Date.now() / 1000);
  const toSign = `invalidate=true&public_id=${publicId}&timestamp=${timestamp}${apiSecret}`;
  const signature = crypto.createHash('sha1').update(toSign).digest('hex');

  const body = new URLSearchParams({
    public_id: publicId,
    invalidate: 'true',
    timestamp: String(timestamp),
    api_key: apiKey,
    signature,
  });

  const res = await fetch(
    `https://api.cloudinary.com/v1_1/${CLOUD_NAME}/image/destroy`,
    { method: 'POST', body }
  );
  const json = await res.json().catch(() => ({}));
  if (!res.ok || (json.result && json.result !== 'ok' && json.result !== 'not found')) {
    throw new Error(`Falha ao excluir no Cloudinary: ${json.result || res.status}`);
  }
  return json;
}
