'use client';

import { useEffect, useState } from 'react';

/**
 * Abertura cinematográfica.
 * Etapas: ruído → globo surge ao fundo (na cena 3D) → título com distorção
 * → estabiliza → "Lucas & Joyce" → instrução → câmera avança (onFinish).
 */
export default function Intro({ onFinish }) {
  const [phase, setPhase] = useState(0);
  const [done, setDone] = useState(false);

  useEffect(() => {
    const reduced =
      typeof window !== 'undefined' &&
      window.matchMedia('(prefers-reduced-motion: reduce)').matches;

    const t = [];
    const schedule = (fn, ms) => t.push(setTimeout(fn, reduced ? Math.min(ms, 400) : ms));

    schedule(() => setPhase(1), 900);   // título surge com distorção
    schedule(() => setPhase(2), 2500);  // "Lucas & Joyce"
    schedule(() => setPhase(3), 3600);  // instrução
    schedule(() => {
      setDone(true);                    // câmera avança, abertura some
      onFinish?.();
    }, reduced ? 1600 : 5300);

    return () => t.forEach(clearTimeout);
  }, [onFinish]);

  const title = 'Galeria de Convidados';

  return (
    <div className={`intro${done ? ' done' : ''}`} aria-hidden={done}>
      <h1 className={`intro-title${phase >= 1 ? ' show' : ''}`} data-text={title}>
        {title}
        <span className="slice s1" data-text={title} aria-hidden="true" />
        <span className="slice s2" data-text={title} aria-hidden="true" />
        <span className="slice s3" data-text={title} aria-hidden="true" />
      </h1>

      <p className={`intro-names${phase >= 2 ? ' show' : ''}`}>Lucas &amp; Joyce</p>

      <div className={`intro-hint${phase >= 3 ? ' show' : ''}`}>
        <svg width="34" height="20" viewBox="0 0 34 20" fill="none" aria-hidden="true">
          <path d="M1 10h32M6 4l-5 6 5 6M28 4l5 6-5 6" stroke="currentColor" strokeWidth="1" />
        </svg>
        <span>Arraste para explorar nossas memórias</span>
      </div>
    </div>
  );
}
