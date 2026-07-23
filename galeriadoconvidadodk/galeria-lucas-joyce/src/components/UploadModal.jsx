'use client';

import { useEffect, useRef, useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  CLOUD_NAME,
  UPLOAD_PRESET,
  WEDDING_FOLDER,
  MAX_FILES_PER_BATCH,
  MAX_FILE_BYTES,
  ACCEPTED_TYPES,
  ACCEPTED_EXTENSIONS,
} from '@/lib/config';

const PENDING_KEY = 'galeria_lj_pendentes';
const NAME_KEY = 'galeria_lj_nome';

/** Fila de recuperação: uploads que chegaram ao Cloudinary mas não ao banco. */
export function readPendingQueue() {
  try {
    return JSON.parse(localStorage.getItem(PENDING_KEY) || '[]');
  } catch {
    return [];
  }
}
function writePendingQueue(list) {
  try {
    localStorage.setItem(PENDING_KEY, JSON.stringify(list));
  } catch {}
}

/** Registra a foto no banco pelo backend. Lança erro se falhar. */
export async function registerPhoto(record) {
  const res = await fetch('/api/photos', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(record),
  });
  const json = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(json.error || 'Falha ao registrar a foto.');
  return json.photo;
}

/** Tenta novamente registrar itens da fila de recuperação. */
export async function retryPendingQueue(onRegistered) {
  const queue = readPendingQueue();
  if (queue.length === 0) return;
  const remaining = [];
  for (const item of queue) {
    try {
      const photo = await registerPhoto(item);
      onRegistered?.(photo);
    } catch {
      remaining.push(item);
    }
  }
  writePendingQueue(remaining);
}

function validateFile(file) {
  const ext = (file.name.split('.').pop() || '').toLowerCase();
  const typeOk =
    ACCEPTED_TYPES.includes(file.type) ||
    (!file.type && ACCEPTED_EXTENSIONS.includes(ext));
  if (!typeOk) return 'Formato não permitido (use JPG, PNG, WEBP ou HEIC).';
  if (file.size > MAX_FILE_BYTES) return 'Arquivo acima de 10 MB.';
  return null;
}

/** Upload de um arquivo para o Cloudinary com progresso. */
function uploadToCloudinary(file, onProgress) {
  return new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    xhr.open('POST', `https://api.cloudinary.com/v1_1/${CLOUD_NAME}/image/upload`);
    xhr.upload.onprogress = (e) => {
      if (e.lengthComputable) onProgress(e.loaded / e.total);
    };
    xhr.onload = () => {
      try {
        const json = JSON.parse(xhr.responseText);
        if (xhr.status >= 200 && xhr.status < 300 && json.secure_url) resolve(json);
        else reject(new Error(json?.error?.message || 'Falha no envio da imagem.'));
      } catch {
        reject(new Error('Resposta inválida do serviço de imagens.'));
      }
    };
    xhr.onerror = () => reject(new Error('Sem conexão durante o envio.'));
    const form = new FormData();
    form.append('file', file);
    form.append('upload_preset', UPLOAD_PRESET);
    form.append('folder', WEDDING_FOLDER);
    xhr.send(form);
  });
}

export default function UploadModal({ open, onClose, onUploaded }) {
  const [name, setName] = useState('');
  const [caption, setCaption] = useState('');
  const [items, setItems] = useState([]); // {file, preview, progress, state, error}
  const [sending, setSending] = useState(false);
  const [formError, setFormError] = useState('');
  const [dragOver, setDragOver] = useState(false);
  const inputRef = useRef(null);
  const nameInputRef = useRef(null);

  useEffect(() => {
    if (open) {
      setName(localStorage.getItem(NAME_KEY) || '');
      setTimeout(() => nameInputRef.current?.focus(), 350);
    } else {
      setItems((prev) => {
        prev.forEach((i) => URL.revokeObjectURL(i.preview));
        return [];
      });
      setCaption('');
      setFormError('');
      setSending(false);
    }
  }, [open]);

  useEffect(() => {
    const onKey = (e) => { if (e.key === 'Escape' && !sending) onClose(); };
    if (open) window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open, sending, onClose]);

  const addFiles = (fileList) => {
    setFormError('');
    const incoming = Array.from(fileList || []);
    const next = [...items];
    for (const file of incoming) {
      if (next.length >= MAX_FILES_PER_BATCH) {
        setFormError(`Máximo de ${MAX_FILES_PER_BATCH} fotos por envio.`);
        break;
      }
      const error = validateFile(file);
      next.push({
        id: `${file.name}-${file.size}-${Math.random().toString(36).slice(2, 8)}`,
        file,
        preview: URL.createObjectURL(file),
        progress: 0,
        state: error ? 'invalid' : 'ready',
        error,
      });
    }
    setItems(next);
  };

  const removeItem = (id) => {
    setItems((prev) => {
      const item = prev.find((i) => i.id === id);
      if (item) URL.revokeObjectURL(item.preview);
      return prev.filter((i) => i.id !== id);
    });
  };

  const totalProgress = items.length
    ? items.reduce((sum, i) => sum + (i.state === 'done' ? 1 : i.progress), 0) / items.length
    : 0;

  const handleSend = async () => {
    const guestName = name.trim();
    if (!guestName) { setFormError('Conte para os noivos quem você é: informe o seu nome.'); return; }
    const valid = items.filter((i) => i.state === 'ready' || i.state === 'error');
    if (valid.length === 0) { setFormError('Escolha ao menos uma foto.'); return; }

    localStorage.setItem(NAME_KEY, guestName);
    setSending(true);
    setFormError('');

    let successCount = 0;

    for (const item of valid) {
      const setItem = (patch) =>
        setItems((prev) => prev.map((i) => (i.id === item.id ? { ...i, ...patch } : i)));

      try {
        setItem({ state: 'uploading', error: null });

        // 1) Cloudinary — armazenamento permanente do arquivo.
        const cloud = await uploadToCloudinary(item.file, (p) =>
          setItem({ progress: p * 0.85 })
        );

        // 2) Banco de dados — a foto só é "enviada" após o registro.
        const record = {
          cloudinary_public_id: cloud.public_id,
          secure_url: cloud.secure_url,
          guest_name: guestName,
          caption: caption.trim() || null,
          original_width: cloud.width,
          original_height: cloud.height,
          format: cloud.format,
          bytes: cloud.bytes,
        };

        setItem({ progress: 0.92 });
        try {
          const photo = await registerPhoto(record);
          setItem({ progress: 1, state: 'done' });
          successCount += 1;
          onUploaded?.(photo);
        } catch (dbError) {
          // Cloudinary ok, banco falhou: uma nova tentativa imediata…
          try {
            const photo = await registerPhoto(record);
            setItem({ progress: 1, state: 'done' });
            successCount += 1;
            onUploaded?.(photo);
          } catch {
            // …e, se ainda falhar, entra na fila de recuperação.
            writePendingQueue([...readPendingQueue(), record]);
            setItem({ state: 'error', error: 'Registro pendente — tentaremos de novo.' });
          }
        }
      } catch (err) {
        setItem({ state: 'error', error: err.message || 'Falha no envio.' });
      }
    }

    setSending(false);
    if (successCount > 0) {
      onClose(successCount);
    }
  };

  return (
    <AnimatePresence>
      {open && (
        <motion.div
          className="modal-backdrop"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.4 }}
          onClick={(e) => { if (e.target === e.currentTarget && !sending) onClose(); }}
        >
          <motion.div
            className="modal"
            role="dialog"
            aria-modal="true"
            aria-label="Adicionar fotos à galeria"
            initial={{ opacity: 0, y: 26, scale: 0.98 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 16, scale: 0.98 }}
            transition={{ duration: 0.5, ease: [0.22, 1, 0.36, 1] }}
          >
            <h2>Deixe a sua memória</h2>
            <p className="sub">
              As fotos enviadas passam a fazer parte do universo de Lucas &amp; Joyce.
            </p>

            <div className="field">
              <label htmlFor="guest-name">Seu nome</label>
              <input
                id="guest-name"
                ref={nameInputRef}
                type="text"
                value={name}
                maxLength={80}
                placeholder="Como os noivos te conhecem"
                onChange={(e) => setName(e.target.value)}
                disabled={sending}
              />
            </div>

            <div className="field">
              <label htmlFor="guest-caption">Legenda (opcional)</label>
              <input
                id="guest-caption"
                type="text"
                value={caption}
                maxLength={200}
                placeholder="Uma frase para acompanhar as fotos"
                onChange={(e) => setCaption(e.target.value)}
                disabled={sending}
              />
            </div>

            <div
              className={`dropzone${dragOver ? ' drag' : ''}`}
              role="button"
              tabIndex={0}
              aria-label="Escolher fotos"
              onClick={() => inputRef.current?.click()}
              onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') inputRef.current?.click(); }}
              onDragOver={(e) => { e.preventDefault(); setDragOver(true); }}
              onDragLeave={() => setDragOver(false)}
              onDrop={(e) => { e.preventDefault(); setDragOver(false); addFiles(e.dataTransfer.files); }}
            >
              <span className="icon">
                <svg width="26" height="22" viewBox="0 0 26 22" fill="none" aria-hidden="true">
                  <rect x="1" y="4" width="24" height="17" rx="1.5" stroke="currentColor" />
                  <path d="M8 4l2-3h6l2 3" stroke="currentColor" />
                  <circle cx="13" cy="12.5" r="4.5" stroke="currentColor" />
                </svg>
              </span>
              <div>Toque para escolher as fotos, ou arraste até aqui</div>
              <small>JPG, PNG, WEBP ou HEIC · até 10 MB cada · até {MAX_FILES_PER_BATCH} por envio</small>
              <input
                ref={inputRef}
                type="file"
                accept="image/jpeg,image/png,image/webp,image/heic,image/heif,.heic,.heif"
                multiple
                hidden
                onChange={(e) => { addFiles(e.target.files); e.target.value = ''; }}
              />
            </div>

            {items.length > 0 && (
              <div className="thumbs">
                {items.map((item) => (
                  <div className="thumb" key={item.id}>
                    <img src={item.preview} alt="" />
                    {item.state === 'uploading' && (
                      <span className="bar" style={{ width: `${Math.round(item.progress * 100)}%` }} />
                    )}
                    {item.state === 'done' && <span className="state ok">enviada</span>}
                    {(item.state === 'error' || item.state === 'invalid') && (
                      <span className="state err" title={item.error}>falhou</span>
                    )}
                    {!sending && item.state !== 'done' && (
                      <button
                        className="remove"
                        aria-label="Remover foto"
                        onClick={() => removeItem(item.id)}
                      >
                        ×
                      </button>
                    )}
                  </div>
                ))}
              </div>
            )}

            {sending && (
              <div className="progress-total" aria-live="polite">
                <div className="track">
                  <div className="fill" style={{ width: `${Math.round(totalProgress * 100)}%` }} />
                </div>
                <div className="label">
                  <span>Enviando memórias…</span>
                  <span>{Math.round(totalProgress * 100)}%</span>
                </div>
              </div>
            )}

            {formError && <p className="form-error" role="alert">{formError}</p>}
            {items.some((i) => i.state === 'invalid' || i.state === 'error') && !formError && (
              <p className="form-error" role="alert">
                Algumas fotos não puderam ser enviadas — veja as marcações acima.
              </p>
            )}

            <div className="modal-actions">
              <button className="pill" onClick={() => onClose()} disabled={sending}>
                Cancelar
              </button>
              <button className="pill solid" onClick={handleSend} disabled={sending}>
                {sending ? 'Enviando…' : 'Adicionar à galeria'}
              </button>
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
