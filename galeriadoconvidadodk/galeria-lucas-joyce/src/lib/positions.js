/**
 * Posicionamento persistente das fotos no globo.
 *
 * Cada foto recebe latitude/longitude UMA única vez, no momento do envio.
 * A distribuição usa a espiral do ângulo de ouro (esfera de Fibonacci),
 * que espalha pontos uniformemente, com uma leve variação aleatória e
 * verificação de distância mínima para evitar sobreposição.
 */

const GOLDEN_ANGLE = 137.50776405003785; // graus

/** Distância angular (graus) entre dois pontos lat/lon na esfera. */
export function angularDistance(lat1, lon1, lat2, lon2) {
  const d = Math.PI / 180;
  const a =
    Math.sin(lat1 * d) * Math.sin(lat2 * d) +
    Math.cos(lat1 * d) * Math.cos(lat2 * d) * Math.cos((lon1 - lon2) * d);
  return (Math.acos(Math.min(1, Math.max(-1, a))) * 180) / Math.PI;
}

function candidateAt(index, jitterSeed) {
  // Esfera de Fibonacci: y uniforme em [-0.88, 0.88] (evita os polos,
  // onde as fotos ficariam de cabeça para baixo para a câmera).
  const total = Math.max(index + 12, 24);
  const t = (index + 0.5) / total; // 0..1
  const y = (1 - 2 * t) * 0.88;
  const lat = (Math.asin(y) * 180) / Math.PI;
  const lon = ((index * GOLDEN_ANGLE + jitterSeed * 47) % 360) - 180;
  return { lat, lon };
}

/**
 * Calcula uma posição livre considerando as posições já ocupadas.
 * @param {Array<{position_latitude:number, position_longitude:number}>} existing
 */
export function computeAvailablePosition(existing) {
  const occupied = (existing || []).map((p) => ({
    lat: p.position_latitude,
    lon: p.position_longitude,
  }));

  const count = occupied.length;
  // Distância mínima diminui suavemente conforme o globo enche.
  const minDist = Math.max(8, 42 - Math.sqrt(count) * 3.2);

  const jitterSeed = Math.random();
  let best = null;
  let bestScore = -1;

  for (let attempt = 0; attempt < 64; attempt++) {
    const idx = count + attempt;
    const c = candidateAt(idx, jitterSeed);
    // Jitter suave para não parecer uma grade perfeita.
    const lat = Math.max(-80, Math.min(80, c.lat + (Math.random() - 0.5) * 6));
    const lon = c.lon + (Math.random() - 0.5) * 8;

    let nearest = Infinity;
    for (const o of occupied) {
      const dist = angularDistance(lat, lon, o.lat, o.lon);
      if (dist < nearest) nearest = dist;
      if (nearest < minDist * 0.5) break;
    }

    if (nearest >= minDist) {
      best = { lat, lon };
      break;
    }
    if (nearest > bestScore) {
      bestScore = nearest;
      best = { lat, lon };
    }
  }

  return {
    position_latitude: Number(best.lat.toFixed(4)),
    position_longitude: Number((((best.lon + 540) % 360) - 180).toFixed(4)),
    position_depth: Number((1 + Math.random() * 0.06).toFixed(4)),
    rotation_x: 0,
    rotation_y: 0,
    rotation_z: Number(((Math.random() - 0.5) * 0.06).toFixed(4)),
    visual_scale: Number((0.92 + Math.random() * 0.18).toFixed(4)),
  };
}
