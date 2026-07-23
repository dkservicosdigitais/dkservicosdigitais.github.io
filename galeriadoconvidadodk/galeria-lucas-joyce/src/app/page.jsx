'use client';

import dynamic from 'next/dynamic';
import Link from 'next/link';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import Intro from '@/components/Intro';
import Lightbox from '@/components/Lightbox';
import UploadModal, { retryPendingQueue } from '@/components/UploadModal';
import { getSupabase } from '@/lib/supabaseClient';
import { WEDDING_SLUG } from '@/lib/config';

const GlobeScene = dynamic(() => import('@/components/GlobeScene'), { ssr: false });

const POLL_INTERVAL = 45000; // fallback quando o tempo real não está disponível

export default function GalleryPage() {
  const [photos, setPhotos] = useState([]);
  const [loading, setLoading] = useState(true);
  const [introDone, setIntroDone] = useState(false);
  const [selectedId, setSelectedId] = useState(null);
  const [uploadOpen, setUploadOpen] = useState(false);
  const [toast, setToast] = useState(null);
  const [dragged, setDragged] = useState(false);
  const newIds = useRef(new Set());
  const toastTimer = useRef(null);

  const showToast = useCallback((text, isError = false) => {
    clearTimeout(toastTimer.current);
    setToast({ text, isError });
    toastTimer.current = setTimeout(() => setToast(null), 4200);
  }, []);

  /** Insere/atualiza uma foto na lista sem tocar nas demais. */
  const upsertPhoto = useCallback((photo, markNew = true) => {
    if (!photo) return;
    setPhotos((prev) => {
      const exists = prev.some((p) => p.id === photo.id);
      if (exists) return prev.map((p) => (p.id === photo.id ? { ...p, ...photo } : p));
      if (markNew) newIds.current.add(photo.id);
      return [...prev, photo];
    });
  }, []);

  const removePhoto = useCallback((id) => {
    setPhotos((prev) => prev.filter((p) => p.id !== id));
    setSelectedId((sel) => (sel === id ? null : sel));
  }, []);

  /** Carrega a galeria persistida (banco → Cloudinary). */
  const loadPhotos = useCallback(async (silent = false) => {
    try {
      const res = await fetch('/api/photos', { cache: 'no-store' });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error);
      setPhotos((prev) => {
        // preserva a ordem/objetos existentes; adiciona apenas as novas
        const byId = new Map(prev.map((p) => [p.id, p]));
        const incoming = json.photos || [];
        const incomingIds = new Set(incoming.map((p) => p.id));
        const kept = prev.filter((p) => incomingIds.has(p.id));
        const added = incoming.filter((p) => !byId.has(p.id));
        return [...kept, ...added];
      });
    } catch (err) {
      if (!silent) showToast('Não foi possível carregar a galeria agora.', true);
    } finally {
      setLoading(false);
    }
  }, [showToast]);

  // Carga inicial + fila de recuperação de registros pendentes.
  useEffect(() => {
    loadPhotos();
    retryPendingQueue((photo) => upsertPhoto(photo));
  }, [loadPhotos, upsertPhoto]);

  // Tempo real via Supabase; se indisponível, atualização periódica.
  useEffect(() => {
    const supabase = getSupabase();
    let pollId = null;
    let channel = null;

    const startPolling = () => {
      if (!pollId) pollId = setInterval(() => loadPhotos(true), POLL_INTERVAL);
    };

    if (supabase) {
      channel = supabase
        .channel('galeria-fotos')
        .on(
          'postgres_changes',
          {
            event: '*',
            schema: 'public',
            table: 'photos',
            filter: `wedding_slug=eq.${WEDDING_SLUG}`,
          },
          (payload) => {
            if (payload.eventType === 'INSERT') {
              const p = payload.new;
              if (p.status === 'approved' && !p.is_hidden) upsertPhoto(p);
            } else if (payload.eventType === 'UPDATE') {
              const p = payload.new;
              if (p.status !== 'approved' || p.is_hidden) removePhoto(p.id);
              else upsertPhoto(p, false);
            } else if (payload.eventType === 'DELETE' && payload.old?.id) {
              removePhoto(payload.old.id);
            }
          }
        )
        .subscribe((status) => {
          if (status !== 'SUBSCRIBED') startPolling();
        });
    } else {
      startPolling();
    }

    return () => {
      if (pollId) clearInterval(pollId);
      if (channel) getSupabase()?.removeChannel(channel);
    };
  }, [loadPhotos, upsertPhoto, removePhoto]);

  const selectedIndex = useMemo(
    () => photos.findIndex((p) => p.id === selectedId),
    [photos, selectedId]
  );
  const selectedPhoto = selectedIndex >= 0 ? photos[selectedIndex] : null;

  const goPrev = useCallback(() => {
    if (photos.length === 0) return;
    setSelectedId((sel) => {
      const i = photos.findIndex((p) => p.id === sel);
      return photos[(i - 1 + photos.length) % photos.length].id;
    });
  }, [photos]);

  const goNext = useCallback(() => {
    if (photos.length === 0) return;
    setSelectedId((sel) => {
      const i = photos.findIndex((p) => p.id === sel);
      return photos[(i + 1) % photos.length].id;
    });
  }, [photos]);

  const handleUploadClose = (successCount) => {
    setUploadOpen(false);
    if (successCount > 0) {
      showToast(
        successCount === 1
          ? 'Sua memória foi adicionada à galeria.'
          : `${successCount} memórias foram adicionadas à galeria.`
      );
    }
  };

  const count = photos.length;

  return (
    <main>
      <GlobeScene
        photos={photos}
        introDone={introDone}
        selectedPhoto={selectedPhoto}
        onSelectPhoto={(p) => setSelectedId(p.id)}
        onUserDrag={() => setDragged(true)}
        newIds={newIds.current}
      />

      <Intro onFinish={() => setIntroDone(true)} />

      <div className={`chrome${introDone ? ' visible' : ''}`}>
        <header className="topbar">
          <Link className="brand" href="/" aria-label="Galeria de Convidados — Lucas e Joyce">
            Lucas <em>&amp;</em> Joyce
          </Link>
          <nav className="nav" aria-label="Navegação principal">
            <a
              className="nav-link"
              href="#galeria"
              onClick={(e) => { e.preventDefault(); setSelectedId(null); }}
            >
              Galeria
            </a>
            <button className="nav-link gold" onClick={() => setUploadOpen(true)}>
              Adicionar fotos
            </button>
            <Link className="nav-link ghost" href="/noivos">
              Noivos
            </Link>
          </nav>
        </header>

        <footer className="bottombar">
          <p className="counter" aria-live="polite">
            {loading ? (
              <span style={{ display: 'inline-flex', gap: 8, alignItems: 'center' }}>
                <span className="loader-dot" /> Carregando memórias…
              </span>
            ) : (
              <>
                <strong>{count}</strong>{' '}
                {count === 1 ? 'memória compartilhada' : 'memórias compartilhadas'}
              </>
            )}
          </p>
          <p className={`drag-hint${dragged ? ' hide' : ''}`} aria-hidden="true">
            Arraste para explorar nossas memórias
          </p>
        </footer>
      </div>

      <AnimatePresence>
        {selectedPhoto && (
          <Lightbox
            photo={selectedPhoto}
            index={selectedIndex}
            total={photos.length}
            onPrev={goPrev}
            onNext={goNext}
            onClose={() => setSelectedId(null)}
          />
        )}
      </AnimatePresence>

      <UploadModal
        open={uploadOpen}
        onClose={handleUploadClose}
        onUploaded={(photo) => upsertPhoto(photo)}
      />

      <AnimatePresence>
        {toast && (
          <motion.div
            className={`toast${toast.isError ? ' error' : ''}`}
            role="status"
            initial={{ opacity: 0, y: 14 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: 10 }}
            transition={{ duration: 0.4 }}
          >
            {toast.text}
          </motion.div>
        )}
      </AnimatePresence>
    </main>
  );
}
