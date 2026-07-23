export const CLOUD_NAME =
  process.env.NEXT_PUBLIC_CLOUDINARY_CLOUD_NAME || 'dotko9ym';

export const UPLOAD_PRESET =
  process.env.NEXT_PUBLIC_CLOUDINARY_UPLOAD_PRESET || 'fotos_casamento';

export const WEDDING_SLUG =
  process.env.NEXT_PUBLIC_WEDDING_SLUG || 'lucas-joyce';

export const WEDDING_FOLDER = `casamentos/${WEDDING_SLUG}`;

export const MAX_FILES_PER_BATCH = 20;
export const MAX_FILE_BYTES = 10 * 1024 * 1024; // 10 MB

export const ACCEPTED_TYPES = [
  'image/jpeg',
  'image/jpg',
  'image/png',
  'image/webp',
  'image/heic',
  'image/heif',
];

export const ACCEPTED_EXTENSIONS = ['jpg', 'jpeg', 'png', 'webp', 'heic', 'heif'];

/**
 * Insere uma transformação na URL de entrega do Cloudinary.
 * https://res.cloudinary.com/<cloud>/image/upload/<transform>/<public_id>
 */
export function transformedUrl(secureUrl, transform) {
  if (!secureUrl) return secureUrl;
  return secureUrl.replace('/image/upload/', `/image/upload/${transform}/`);
}

/** Miniatura leve para as texturas do globo. */
export function thumbUrl(secureUrl) {
  return transformedUrl(secureUrl, 'c_limit,w_512,q_auto:eco,f_auto');
}

/** Versão grande para a foto aberta (lightbox). */
export function largeUrl(secureUrl) {
  return transformedUrl(secureUrl, 'c_limit,w_1600,q_auto:good,f_auto');
}

/** Nome de arquivo organizado: lucas-joyce_joao_2026-07-23_001.jpg */
export function buildFileName(guestName, createdAt, seq, format) {
  const slugName = String(guestName || 'convidado')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-zA-Z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .toLowerCase()
    .slice(0, 40) || 'convidado';
  const date = new Date(createdAt || Date.now()).toISOString().slice(0, 10);
  const n = String(seq ?? 1).padStart(3, '0');
  const ext = (format || 'jpg').toLowerCase();
  return `${WEDDING_SLUG}_${slugName}_${date}_${n}.${ext}`;
}

/** URL de download do arquivo original com nome amigável. */
export function downloadUrl(secureUrl, fileName) {
  const base = fileName ? fileName.replace(/\.[a-z0-9]+$/i, '') : 'foto';
  return transformedUrl(secureUrl, `fl_attachment:${base}`);
}
