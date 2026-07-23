'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { largeUrl, downloadUrl, buildFileName } from '@/lib/config';

function formatDate(iso) {
  try {
    return new Date(iso).toLocaleDateString('pt-BR', {
      day: '2-digit',
      month: 'long',
      year: 'numeric',
    });
  } catch {
    return '';
  }
}

/**
 * Foto em destaque sobre o globo (que permanece visível, desfocado ao fundo).
 * Navegação: setas na tela, teclado (← → Esc) e gesto de deslizar no celular.
 */
export default function Lightbox({ photo, index, total, onPrev, onNext, onClose }) {
  const [loaded, setLoaded] = useState(false);
  const touch = useRef(null);

  useEffect(() => setLoaded(false), [photo?.id]);

  const handleKey = useCallback(
    (e) => {
      if (e.key === 'ArrowLeft') onPrev();
      else if (e.key === 'ArrowRight') onNext();
      else if (e.key === 'Escape') onClose();
    },
    [onPrev, onNext, onClose]
  );

  useEffect(() => {
    window.addEventListener('keydown', handleKey);
    return () => window.removeEventListener('keydown', handleKey);
  }, [handleKey]);

  if (!photo) return null;

  const fileName = buildFileName(photo.guest_name, photo.created_at, index + 1, photo.format);

  const onTouchStart = (e) => {
    touch.current = { x: e.touches[0].clientX, y: e.touches[0].clientY };
  };
  const onTouchEnd = (e) => {
    if (!touch.current) return;
    const dx = e.changedTouches[0].clientX - touch.current.x;
    const dy = e.changedTouches[0].clientY - touch.current.y;
    touch.current = null;
    if (Math.abs(dx) > 56 && Math.abs(dx) > Math.abs(dy) * 1.4) {
      if (dx > 0) onPrev();
      else onNext();
    }
  };

  return (
    <motion.div
      className="lightbox"
      role="dialog"
      aria-modal="true"
      aria-label={`Foto de ${photo.guest_name}`}
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      transition={{ duration: 0.5, ease: [0.22, 1, 0.36, 1] }}
      onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}
      onTouchStart={onTouchStart}
      onTouchEnd={onTouchEnd}
    >
      <button className="lightbox-close" onClick={onClose} aria-label="Fechar foto">
        <svg width="16" height="16" viewBox="0 0 16 16" fill="none" aria-hidden="true">
          <path d="M1 1l14 14M15 1L1 15" stroke="currentColor" strokeWidth="1.2" />
        </svg>
      </button>

      {total > 1 && (
        <>
          <button className="lightbox-arrow prev" onClick={onPrev} aria-label="Foto anterior">
            <svg width="20" height="16" viewBox="0 0 20 16" fill="none" aria-hidden="true">
              <path d="M19 8H1M8 1L1 8l7 7" stroke="currentColor" strokeWidth="1.2" />
            </svg>
          </button>
          <button className="lightbox-arrow next" onClick={onNext} aria-label="Próxima foto">
            <svg width="20" height="16" viewBox="0 0 20 16" fill="none" aria-hidden="true">
              <path d="M1 8h18M12 1l7 7-7 7" stroke="currentColor" strokeWidth="1.2" />
            </svg>
          </button>
        </>
      )}

      <AnimatePresence mode="wait">
        <motion.figure
          key={photo.id}
          className="lightbox-figure"
          initial={{ opacity: 0, scale: 0.94 }}
          animate={{ opacity: 1, scale: 1 }}
          exit={{ opacity: 0, scale: 1.03 }}
          transition={{ duration: 0.45, ease: [0.22, 1, 0.36, 1] }}
        >
          <div className="lightbox-img-wrap">
            {!loaded && (
              <div style={{ position: 'absolute', inset: 0, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                <span className="loader-dot" aria-label="Carregando foto" />
              </div>
            )}
            <img
              src={largeUrl(photo.secure_url)}
              alt={photo.caption || `Memória enviada por ${photo.guest_name}`}
              onLoad={() => setLoaded(true)}
              style={{ opacity: loaded ? 1 : 0, transition: 'opacity 0.6s' }}
              draggable={false}
            />
          </div>

          <figcaption className="lightbox-caption">
            <div className="by">
              <i>por</i> <strong>{photo.guest_name}</strong>
            </div>
            <div className="meta">{formatDate(photo.created_at)}</div>
            {photo.caption && <p className="legend">“{photo.caption}”</p>}
          </figcaption>

          <div className="lightbox-actions">
            <a
              className="pill"
              href={downloadUrl(photo.secure_url, fileName)}
              download={fileName}
              rel="noopener"
            >
              <svg width="13" height="14" viewBox="0 0 13 14" fill="none" aria-hidden="true">
                <path d="M6.5 1v9M2.5 6.5l4 4 4-4M1 13h11" stroke="currentColor" strokeWidth="1.1" />
              </svg>
              Baixar esta foto
            </a>
          </div>
        </motion.figure>
      </AnimatePresence>

      <div className="lightbox-index" aria-hidden="true">
        {String(index + 1).padStart(2, '0')} — {String(total).padStart(2, '0')}
      </div>
    </motion.div>
  );
}
