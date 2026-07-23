'use client';

import Link from 'next/link';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { getSupabase } from '@/lib/supabaseClient';
import { transformedUrl, downloadUrl, buildFileName, largeUrl } from '@/lib/config';
import Lightbox from '@/components/Lightbox';

function formatBytes(bytes) {
  if (!bytes) return '0 MB';
  const mb = bytes / (1024 * 1024);
  if (mb < 1024) return `${mb.toFixed(1)} MB`;
  return `${(mb / 1024).toFixed(2)} GB`;
}

function formatDateTime(iso) {
  try {
    return new Date(iso).toLocaleString('pt-BR', {
      day: '2-digit', month: '2-digit', year: 'numeric',
      hour: '2-digit', minute: '2-digit',
    });
  } catch { return ''; }
}

/* ------------------------------------------------------------ */
/* Login                                                         */
/* ------------------------------------------------------------ */
function Login({ onSession }) {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  const handleSubmit = async () => {
    setBusy(true);
    setError('');
    const supabase = getSupabase();
    if (!supabase) {
      setError('O acesso ainda não foi configurado. Fale com quem publicou o site.');
      setBusy(false);
      return;
    }
    const { data, error: authError } = await supabase.auth.signInWithPassword({
      email: email.trim(),
      password,
    });
    if (authError || !data?.session) {
      setError('E-mail ou senha incorretos.');
      setBusy(false);
      return;
    }
    onSession(data.session);
  };

  return (
    <div className="login-wrap">
      <motion.div
        className="login"
        initial={{ opacity: 0, y: 18 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.7, ease: [0.22, 1, 0.36, 1] }}
      >
        <p className="eyebrow">Área reservada</p>
        <h1>Lucas &amp; Joyce</h1>
        <form onSubmit={(e) => { e.preventDefault(); handleSubmit(); }}>
          <div className="field">
            <label htmlFor="email">E-mail</label>
            <input
              id="email" type="text" inputMode="email" autoComplete="username"
              value={email} onChange={(e) => setEmail(e.target.value)}
            />
          </div>
          <div className="field">
            <label htmlFor="password">Senha</label>
            <input
              id="password" type="password" autoComplete="current-password"
              value={password} onChange={(e) => setPassword(e.target.value)}
              style={{ fontFamily: 'var(--sans)', letterSpacing: '0.2em' }}
            />
          </div>
          {error && <p className="form-error" role="alert">{error}</p>}
          <div className="modal-actions" style={{ justifyContent: 'space-between', alignItems: 'center' }}>
            <Link className="nav-link" href="/">← Galeria</Link>
            <button type="submit" className="pill solid" disabled={busy}>
              {busy ? 'Entrando…' : 'Entrar'}
            </button>
          </div>
        </form>
      </motion.div>
    </div>
  );
}

/* ------------------------------------------------------------ */
/* Painel                                                        */
/* ------------------------------------------------------------ */
export default function NoivosPage() {
  const [session, setSession] = useState(undefined); // undefined = verificando
  const [photos, setPhotos] = useState([]);
  const [stats, setStats] = useState(null);
  const [loading, setLoading] = useState(true);
  const [query, setQuery] = useState('');
  const [order, setOrder] = useState('recentes');
  const [selected, setSelected] = useState(new Set());
  const [confirmDelete, setConfirmDelete] = useState(null); // photo | 'selecionadas'
  const [openPhotoId, setOpenPhotoId] = useState(null);
  const [zipBusy, setZipBusy] = useState(false);
  const [toast, setToast] = useState(null);
  const toastTimer = useRef(null);

  const showToast = useCallback((text, isError = false) => {
    clearTimeout(toastTimer.current);
    setToast({ text, isError });
    toastTimer.current = setTimeout(() => setToast(null), 4000);
  }, []);

  // Sessão
  useEffect(() => {
    const supabase = getSupabase();
    if (!supabase) { setSession(null); return; }
    supabase.auth.getSession().then(({ data }) => setSession(data.session ?? null));
    const { data: sub } = supabase.auth.onAuthStateChange((_e, s) => setSession(s ?? null));
    return () => sub.subscription.unsubscribe();
  }, []);

  const authFetch = useCallback(
    async (url, options = {}) => {
      const token = session?.access_token;
      const res = await fetch(url, {
        ...options,
        headers: {
          ...(options.headers || {}),
          Authorization: `Bearer ${token}`,
          ...(options.body && !(options.body instanceof FormData)
            ? { 'Content-Type': 'application/json' }
            : {}),
        },
      });
      return res;
    },
    [session]
  );

  const loadAll = useCallback(async () => {
    if (!session) return;
    setLoading(true);
    try {
      const res = await authFetch('/api/admin/photos');
      const json = await res.json();
      if (!res.ok) throw new Error(json.error);
      setPhotos(json.photos || []);
      setStats(json.stats || null);
    } catch (err) {
      showToast(err.message || 'Não foi possível carregar as fotos.', true);
    } finally {
      setLoading(false);
    }
  }, [session, authFetch, showToast]);

  useEffect(() => { if (session) loadAll(); }, [session, loadAll]);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    let list = photos;
    if (q) list = list.filter((p) => p.guest_name.toLowerCase().includes(q));
    list = [...list].sort((a, b) =>
      order === 'recentes'
        ? new Date(b.created_at) - new Date(a.created_at)
        : new Date(a.created_at) - new Date(b.created_at)
    );
    return list;
  }, [photos, query, order]);

  const patchPhoto = async (photo, patch, successMsg) => {
    try {
      const res = await authFetch(`/api/admin/photos/${photo.id}`, {
        method: 'PATCH',
        body: JSON.stringify(patch),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error);
      setPhotos((prev) => prev.map((p) => (p.id === photo.id ? json.photo : p)));
      if (successMsg) showToast(successMsg);
    } catch (err) {
      showToast(err.message || 'Não foi possível atualizar.', true);
    }
  };

  const deletePhotos = async (ids) => {
    setConfirmDelete(null);
    for (const id of ids) {
      try {
        const res = await authFetch(`/api/admin/photos/${id}`, { method: 'DELETE' });
        const json = await res.json().catch(() => ({}));
        if (!res.ok) throw new Error(json.error);
        setPhotos((prev) => prev.filter((p) => p.id !== id));
        setSelected((prev) => { const n = new Set(prev); n.delete(id); return n; });
      } catch (err) {
        showToast(err.message || 'Falha ao excluir uma foto.', true);
        return;
      }
    }
    showToast(ids.length === 1 ? 'Foto excluída.' : `${ids.length} fotos excluídas.`);
    loadAll();
  };

  const downloadZip = async (ids = null) => {
    setZipBusy(true);
    showToast('Preparando o arquivo… isso pode levar alguns instantes.');
    try {
      const res = await authFetch('/api/admin/download-all', {
        method: 'POST',
        body: JSON.stringify(ids ? { ids } : {}),
      });
      if (!res.ok) {
        const json = await res.json().catch(() => ({}));
        throw new Error(json.error || 'Falha ao gerar o arquivo.');
      }
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = 'galeria-lucas-e-joyce.zip';
      document.body.appendChild(a);
      a.click();
      a.remove();
      setTimeout(() => URL.revokeObjectURL(url), 30000);
      showToast('Download iniciado.');
    } catch (err) {
      showToast(err.message, true);
    } finally {
      setZipBusy(false);
    }
  };

  const toggleSelect = (id) =>
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });

  const openIndex = filtered.findIndex((p) => p.id === openPhotoId);
  const openPhoto = openIndex >= 0 ? filtered[openIndex] : null;

  // ---------- estados de tela ----------
  if (session === undefined) {
    return (
      <div className="login-wrap">
        <span className="loader-dot" aria-label="Verificando acesso" />
      </div>
    );
  }
  if (!session) return <Login onSession={setSession} />;

  return (
    <div className="admin">
      <header className="admin-head">
        <div>
          <p className="eyebrow">Área dos noivos</p>
          <h1>
            Nossas memórias, <i>guardadas</i>
          </h1>
        </div>
        <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
          <Link className="pill" href="/">Ver galeria</Link>
          <button className="pill solid" onClick={() => downloadZip()} disabled={zipBusy || photos.length === 0}>
            {zipBusy ? 'Preparando…' : 'Baixar todas as fotos'}
          </button>
          <button
            className="pill"
            onClick={async () => { await getSupabase()?.auth.signOut(); }}
          >
            Sair
          </button>
        </div>
      </header>

      {stats && (
        <section className="stats" aria-label="Resumo da galeria">
          <div className="stat"><div className="num">{stats.total}</div><div className="lbl">Fotos</div></div>
          <div className="stat"><div className="num">{stats.guests}</div><div className="lbl">Convidados</div></div>
          <div className="stat"><div className="num">{stats.favorites}</div><div className="lbl">Favoritas</div></div>
          <div className="stat"><div className="num">{formatBytes(stats.bytes)}</div><div className="lbl">Espaço utilizado</div></div>
        </section>
      )}

      <div className="admin-toolbar">
        <input
          type="text"
          placeholder="Pesquisar pelo nome do convidado…"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          aria-label="Pesquisar pelo nome do convidado"
        />
        <button
          className="pill"
          onClick={() => setOrder((o) => (o === 'recentes' ? 'antigas' : 'recentes'))}
        >
          {order === 'recentes' ? 'Mais recentes' : 'Mais antigas'}
        </button>
        <button
          className="pill"
          onClick={() =>
            setSelected((prev) =>
              prev.size === filtered.length ? new Set() : new Set(filtered.map((p) => p.id))
            )
          }
          disabled={filtered.length === 0}
        >
          {selected.size === filtered.length && filtered.length > 0
            ? 'Limpar seleção'
            : 'Selecionar todas'}
        </button>
      </div>

      {loading ? (
        <div className="empty"><span className="loader-dot" style={{ display: 'inline-block', marginRight: 12 }} />Carregando as memórias…</div>
      ) : filtered.length === 0 ? (
        <div className="empty">
          {query
            ? 'Nenhuma foto encontrada com esse nome.'
            : 'Ainda não há fotos — compartilhe o site com os convidados.'}
        </div>
      ) : (
        <div className="admin-grid">
          {filtered.map((photo) => {
            const isSelected = selected.has(photo.id);
            return (
              <article
                key={photo.id}
                className={`card${isSelected ? ' selected' : ''}${photo.is_hidden ? ' hidden-photo' : ''}`}
              >
                <div className="photo" onClick={() => setOpenPhotoId(photo.id)}>
                  <img
                    src={transformedUrl(photo.secure_url, 'c_fill,w_480,h_600,q_auto,f_auto')}
                    alt={photo.caption || `Foto de ${photo.guest_name}`}
                    loading="lazy"
                  />
                  <div className="badges">
                    {photo.is_favorite && <span className="badge gold">Favorita</span>}
                    {photo.is_hidden && <span className="badge">Oculta</span>}
                    {photo.status === 'pending' && <span className="badge">Pendente</span>}
                    {photo.status === 'rejected' && <span className="badge red">Rejeitada</span>}
                  </div>
                  <button
                    className="select-box"
                    aria-label={isSelected ? 'Remover da seleção' : 'Selecionar foto'}
                    aria-pressed={isSelected}
                    onClick={(e) => { e.stopPropagation(); toggleSelect(photo.id); }}
                  >
                    <svg width="11" height="9" viewBox="0 0 11 9" fill="none" aria-hidden="true">
                      <path d="M1 4.5L4 7.5L10 1" stroke="currentColor" strokeWidth="1.6" />
                    </svg>
                  </button>
                </div>
                <div className="info">
                  <div className="name">{photo.guest_name}</div>
                  <div className="date">{formatDateTime(photo.created_at)}</div>
                </div>
                <div className="row">
                  <a
                    className="icon-btn"
                    title="Baixar em resolução original"
                    href={downloadUrl(photo.secure_url, buildFileName(photo.guest_name, photo.created_at, 1, photo.format))}
                    download
                  >
                    <svg width="14" height="15" viewBox="0 0 13 14" fill="none" aria-hidden="true">
                      <path d="M6.5 1v9M2.5 6.5l4 4 4-4M1 13h11" stroke="currentColor" strokeWidth="1.1" />
                    </svg>
                  </a>
                  <button
                    className={`icon-btn${photo.is_favorite ? ' gold' : ''}`}
                    title={photo.is_favorite ? 'Remover das favoritas' : 'Favoritar'}
                    onClick={() => patchPhoto(photo, { is_favorite: !photo.is_favorite })}
                  >
                    <svg width="15" height="14" viewBox="0 0 15 14" fill={photo.is_favorite ? 'currentColor' : 'none'} aria-hidden="true">
                      <path d="M7.5 12.5S1.5 9 1.5 4.9C1.5 2.9 3 1.5 4.7 1.5c1.2 0 2.3.7 2.8 1.7.5-1 1.6-1.7 2.8-1.7 1.7 0 3.2 1.4 3.2 3.4 0 4.1-6 7.6-6 7.6z" stroke="currentColor" strokeWidth="1" />
                    </svg>
                  </button>
                  <button
                    className="icon-btn"
                    title={photo.is_hidden ? 'Mostrar na galeria' : 'Ocultar da galeria'}
                    onClick={() =>
                      patchPhoto(photo, { is_hidden: !photo.is_hidden },
                        photo.is_hidden ? 'Foto visível novamente.' : 'Foto oculta da galeria.')
                    }
                  >
                    <svg width="16" height="12" viewBox="0 0 16 12" fill="none" aria-hidden="true">
                      <path d="M1 6s2.7-4.5 7-4.5S15 6 15 6s-2.7 4.5-7 4.5S1 6 1 6z" stroke="currentColor" strokeWidth="1" />
                      <circle cx="8" cy="6" r="2" stroke="currentColor" strokeWidth="1" />
                      {photo.is_hidden && <path d="M2 11L14 1" stroke="currentColor" strokeWidth="1" />}
                    </svg>
                  </button>
                  <button
                    className="icon-btn red"
                    title="Excluir"
                    onClick={() => setConfirmDelete(photo)}
                  >
                    <svg width="13" height="14" viewBox="0 0 13 14" fill="none" aria-hidden="true">
                      <path d="M1 3.5h11M4.5 3.5V2a1 1 0 011-1h2a1 1 0 011 1v1.5M2.5 3.5l.7 8.6a1 1 0 001 .9h4.6a1 1 0 001-.9l.7-8.6" stroke="currentColor" strokeWidth="1" />
                    </svg>
                  </button>
                </div>
              </article>
            );
          })}
        </div>
      )}

      {/* barra de ações para seleção múltipla */}
      <AnimatePresence>
        {selected.size > 0 && (
          <motion.div
            className="selection-bar"
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: 16 }}
            transition={{ duration: 0.35 }}
          >
            <span className="count">
              {selected.size} {selected.size === 1 ? 'selecionada' : 'selecionadas'}
            </span>
            <button className="pill solid" onClick={() => downloadZip([...selected])} disabled={zipBusy}>
              Baixar selecionadas
            </button>
            <button className="pill danger" onClick={() => setConfirmDelete('selecionadas')}>
              Excluir
            </button>
            <button className="pill" onClick={() => setSelected(new Set())}>
              Limpar
            </button>
          </motion.div>
        )}
      </AnimatePresence>

      {/* confirmação de exclusão */}
      <AnimatePresence>
        {confirmDelete && (
          <motion.div
            className="modal-backdrop"
            initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
            onClick={(e) => { if (e.target === e.currentTarget) setConfirmDelete(null); }}
          >
            <motion.div
              className="confirm" role="alertdialog" aria-modal="true"
              initial={{ opacity: 0, scale: 0.96 }} animate={{ opacity: 1, scale: 1 }} exit={{ opacity: 0, scale: 0.96 }}
            >
              <h3>Excluir para sempre?</h3>
              <p>
                {confirmDelete === 'selecionadas'
                  ? `As ${selected.size} fotos selecionadas serão removidas do site e do armazenamento. Essa ação não pode ser desfeita.`
                  : `A foto enviada por ${confirmDelete.guest_name} será removida do site e do armazenamento. Essa ação não pode ser desfeita.`}
              </p>
              <div className="modal-actions">
                <button className="pill" onClick={() => setConfirmDelete(null)}>Manter</button>
                <button
                  className="pill danger"
                  onClick={() =>
                    deletePhotos(confirmDelete === 'selecionadas' ? [...selected] : [confirmDelete.id])
                  }
                >
                  Excluir
                </button>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* foto aberta dentro do painel */}
      <AnimatePresence>
        {openPhoto && (
          <Lightbox
            photo={openPhoto}
            index={openIndex}
            total={filtered.length}
            onPrev={() => setOpenPhotoId(filtered[(openIndex - 1 + filtered.length) % filtered.length].id)}
            onNext={() => setOpenPhotoId(filtered[(openIndex + 1) % filtered.length].id)}
            onClose={() => setOpenPhotoId(null)}
          />
        )}
      </AnimatePresence>

      <AnimatePresence>
        {toast && (
          <motion.div
            className={`toast${toast.isError ? ' error' : ''}`}
            role="status"
            initial={{ opacity: 0, y: 14 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: 10 }}
          >
            {toast.text}
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
