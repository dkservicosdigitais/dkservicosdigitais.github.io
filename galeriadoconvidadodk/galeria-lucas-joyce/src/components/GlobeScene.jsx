'use client';

import { Canvas, useFrame, useThree } from '@react-three/fiber';
import { useEffect, useMemo, useRef, useState } from 'react';
import * as THREE from 'three';
import { thumbUrl } from '@/lib/config';

const GLOBE_RADIUS = 10;
const CAMERA_START = 47; // durante a abertura
const CAMERA_HOME = 26;  // exploração
const CAMERA_FOCUS = 18; // foto em destaque
const ZOOM_MIN = 15;
const ZOOM_MAX = 40;

/** Converte latitude/longitude (graus) em direção unitária na esfera. */
export function latLonToDir(lat, lon) {
  const phi = THREE.MathUtils.degToRad(90 - lat);
  const theta = THREE.MathUtils.degToRad(lon);
  return new THREE.Vector3(
    Math.sin(phi) * Math.sin(theta),
    Math.cos(phi),
    Math.sin(phi) * Math.cos(theta)
  );
}

/* ------------------------------------------------------------ */
/* Globo em aramado                                              */
/* ------------------------------------------------------------ */
function Wireframe() {
  const inner = useRef();
  useFrame(({ clock }) => {
    if (inner.current) {
      // respiração muito sutil do aramado interno
      const s = 1 + Math.sin(clock.elapsedTime * 0.4) * 0.004;
      inner.current.scale.setScalar(s);
    }
  });
  return (
    <group>
      <mesh>
        <sphereGeometry args={[GLOBE_RADIUS, 40, 28]} />
        <meshBasicMaterial
          color="#4a4438"
          wireframe
          transparent
          opacity={0.16}
          depthWrite={false}
        />
      </mesh>
      <mesh ref={inner}>
        <sphereGeometry args={[GLOBE_RADIUS * 0.985, 20, 14]} />
        <meshBasicMaterial
          color="#c9a96a"
          wireframe
          transparent
          opacity={0.05}
          depthWrite={false}
        />
      </mesh>
    </group>
  );
}

/* ------------------------------------------------------------ */
/* Uma foto no globo                                             */
/* ------------------------------------------------------------ */
function PhotoNode({ photo, index, onSelect, dragState, isNew }) {
  const groupRef = useRef();
  const floatRef = useRef();
  const [texture, setTexture] = useState(null);
  const spawnRef = useRef({ start: null, done: !isNew });

  const dir = useMemo(
    () => latLonToDir(photo.position_latitude, photo.position_longitude),
    [photo.position_latitude, photo.position_longitude]
  );

  const { position, quaternion, size } = useMemo(() => {
    const pos = dir
      .clone()
      .multiplyScalar(GLOBE_RADIUS * (photo.position_depth || 1) * 1.06);
    const q = new THREE.Quaternion().setFromUnitVectors(
      new THREE.Vector3(0, 0, 1),
      dir
    );
    const aspect =
      photo.original_width && photo.original_height
        ? photo.original_width / photo.original_height
        : 0.8;
    const base = 3.1 * (photo.visual_scale || 1);
    const w = aspect >= 1 ? base : base * aspect;
    const h = aspect >= 1 ? base / aspect : base;
    return { position: pos, quaternion: q, size: [w, h] };
  }, [dir, photo]);

  // Carrega a miniatura da foto como textura (com tratamento de erro).
  useEffect(() => {
    let alive = true;
    const loader = new THREE.TextureLoader();
    loader.setCrossOrigin('anonymous');
    loader.load(
      photo.thumbnail_url || thumbUrl(photo.secure_url),
      (tex) => {
        if (!alive) { tex.dispose(); return; }
        tex.colorSpace = THREE.SRGBColorSpace;
        tex.anisotropy = 4;
        setTexture(tex);
      },
      undefined,
      () => {} // mantém o placeholder em caso de falha
    );
    return () => { alive = false; };
  }, [photo.thumbnail_url, photo.secure_url]);

  useEffect(() => () => { texture?.dispose(); }, [texture]);

  // Flutuação apenas visual — a posição persistente não muda.
  useFrame(({ clock }) => {
    const t = clock.elapsedTime;
    if (floatRef.current) {
      floatRef.current.position.z = Math.sin(t * 0.6 + index * 1.7) * 0.09;
      floatRef.current.rotation.z =
        (photo.rotation_z || 0) + Math.sin(t * 0.4 + index) * 0.012;
    }
    // entrada com fade + escala para fotos novas
    const spawn = spawnRef.current;
    if (!spawn.done && groupRef.current) {
      if (spawn.start === null) spawn.start = t;
      const k = Math.min(1, (t - spawn.start) / 0.9);
      const eased = 1 - Math.pow(1 - k, 3);
      groupRef.current.scale.setScalar(0.4 + 0.6 * eased);
      if (k >= 1) { spawn.done = true; groupRef.current.scale.setScalar(1); }
    }
  });

  const handleClick = (e) => {
    e.stopPropagation();
    if (dragState.current.moved > 7) return; // era um arraste, não um clique
    onSelect(photo);
  };

  return (
    <group ref={groupRef} position={position} quaternion={quaternion}>
      <group ref={floatRef}>
        {/* moldura champagne sutil */}
        <mesh position={[0, 0, -0.015]}>
          <planeGeometry args={[size[0] + 0.1, size[1] + 0.1]} />
          <meshBasicMaterial color="#c9a96a" transparent opacity={0.28} />
        </mesh>
        <mesh
          onClick={handleClick}
          onPointerOver={() => (document.body.style.cursor = 'pointer')}
          onPointerOut={() => (document.body.style.cursor = '')}
        >
          <planeGeometry args={size} />
          {texture ? (
            <meshBasicMaterial map={texture} toneMapped={false} />
          ) : (
            <meshBasicMaterial color="#1c1a17" transparent opacity={0.85} />
          )}
        </mesh>
      </group>
    </group>
  );
}

/* ------------------------------------------------------------ */
/* Controlador: arraste, inércia, zoom, foco cinematográfico     */
/* ------------------------------------------------------------ */
function Controller({ groupRef, introDone, selectedPhoto, onUserDrag }) {
  const { gl, camera } = useThree();
  const dragState = useRef({ moved: 0 });
  const velocity = useRef({ x: 0, y: 0 });
  const zoom = useRef({ target: CAMERA_START });
  const focus = useRef({ active: false, targetQ: null, savedQ: null, savedZoom: CAMERA_HOME, restoring: false });
  const pointers = useRef(new Map());
  const pinch = useRef(0);

  // Câmera avança quando a abertura termina.
  useEffect(() => {
    if (introDone) zoom.current.target = CAMERA_HOME;
  }, [introDone]);

  // Entra/sai do modo de foco quando uma foto é selecionada.
  useEffect(() => {
    const f = focus.current;
    if (selectedPhoto) {
      if (!f.active) {
        f.savedQ = groupRef.current.quaternion.clone();
        f.savedZoom = zoom.current.target;
      }
      const dir = latLonToDir(
        selectedPhoto.position_latitude,
        selectedPhoto.position_longitude
      );
      // rotaciona o globo até a foto ficar de frente para a câmera
      f.targetQ = new THREE.Quaternion().setFromUnitVectors(
        dir,
        new THREE.Vector3(0, 0, 1)
      );
      f.active = true;
      f.restoring = false;
      velocity.current.x = 0;
      velocity.current.y = 0;
      zoom.current.target = CAMERA_FOCUS;
    } else if (f.active) {
      f.active = false;
      f.restoring = true;
      zoom.current.target = f.savedZoom;
    }
  }, [selectedPhoto, groupRef]);

  // Eventos de ponteiro e roda.
  useEffect(() => {
    const el = gl.domElement;

    const down = (e) => {
      pointers.current.set(e.pointerId, { x: e.clientX, y: e.clientY });
      dragState.current.moved = 0;
      if (pointers.current.size === 2) {
        const [a, b] = [...pointers.current.values()];
        pinch.current = Math.hypot(a.x - b.x, a.y - b.y);
      }
      el.setPointerCapture?.(e.pointerId);
    };

    const move = (e) => {
      const prev = pointers.current.get(e.pointerId);
      if (!prev) return;
      const dx = e.clientX - prev.x;
      const dy = e.clientY - prev.y;
      pointers.current.set(e.pointerId, { x: e.clientX, y: e.clientY });

      if (pointers.current.size === 2) {
        // pinça = zoom
        const [a, b] = [...pointers.current.values()];
        const dist = Math.hypot(a.x - b.x, a.y - b.y);
        if (pinch.current > 0) {
          zoom.current.target = THREE.MathUtils.clamp(
            zoom.current.target * (pinch.current / dist),
            ZOOM_MIN,
            ZOOM_MAX
          );
        }
        pinch.current = dist;
        return;
      }

      if (focus.current.active) return; // foto aberta: globo pausado
      dragState.current.moved += Math.abs(dx) + Math.abs(dy);
      if (dragState.current.moved > 4) onUserDrag?.();
      focus.current.restoring = false; // arrastar cancela o retorno automático

      const k = 0.0042;
      applyRotation(dx * k, dy * k * 0.8);
      velocity.current.x = dx * k;
      velocity.current.y = dy * k * 0.8;
    };

    const up = (e) => {
      pointers.current.delete(e.pointerId);
      pinch.current = 0;
    };

    const wheel = (e) => {
      e.preventDefault();
      zoom.current.target = THREE.MathUtils.clamp(
        zoom.current.target + e.deltaY * 0.014,
        ZOOM_MIN,
        ZOOM_MAX
      );
    };

    const applyRotation = (rx, ry) => {
      const q = new THREE.Quaternion().setFromEuler(
        new THREE.Euler(ry, rx, 0, 'XYZ')
      );
      groupRef.current.quaternion.premultiply(q);
    };

    el.addEventListener('pointerdown', down);
    el.addEventListener('pointermove', move);
    el.addEventListener('pointerup', up);
    el.addEventListener('pointercancel', up);
    el.addEventListener('wheel', wheel, { passive: false });
    return () => {
      el.removeEventListener('pointerdown', down);
      el.removeEventListener('pointermove', move);
      el.removeEventListener('pointerup', up);
      el.removeEventListener('pointercancel', up);
      el.removeEventListener('wheel', wheel);
    };
  }, [gl, groupRef, onUserDrag]);

  useFrame((_, delta) => {
    const group = groupRef.current;
    if (!group) return;
    const f = focus.current;
    const d = Math.min(delta, 0.05);

    if (f.active && f.targetQ) {
      // aproxima a foto escolhida com suavidade
      group.quaternion.slerp(f.targetQ, 1 - Math.pow(0.0015, d));
    } else if (f.restoring && f.savedQ) {
      // ao fechar, restaura a rotação e o zoom anteriores
      group.quaternion.slerp(f.savedQ, 1 - Math.pow(0.004, d));
      if (group.quaternion.angleTo(f.savedQ) < 0.01) f.restoring = false;
    } else {
      // rotação ambiente muito lenta + inércia do arraste
      const idle = 0.018 * d;
      const q = new THREE.Quaternion().setFromEuler(
        new THREE.Euler(velocity.current.y, velocity.current.x + idle, 0, 'XYZ')
      );
      group.quaternion.premultiply(q);
      const damp = Math.pow(0.0025, d); // inércia macia
      velocity.current.x *= damp;
      velocity.current.y *= damp;
    }

    // zoom com amortecimento
    camera.position.z = THREE.MathUtils.damp(
      camera.position.z,
      zoom.current.target,
      3.2,
      d
    );
    // parallax delicado seguindo o ponteiro
    camera.lookAt(0, 0, 0);
  });

  return null;
}

/* ------------------------------------------------------------ */
/* Cena exportada                                                */
/* ------------------------------------------------------------ */
export default function GlobeScene({
  photos,
  introDone,
  selectedPhoto,
  onSelectPhoto,
  onUserDrag,
  newIds,
}) {
  const groupRef = useRef();
  const dragState = useRef({ moved: 0 });

  return (
    <div className="stage" aria-label="Globo de memórias — arraste para explorar">
      <Canvas
        dpr={[1, 2]}
        camera={{ fov: 46, position: [0, 0, CAMERA_START], near: 0.1, far: 200 }}
        gl={{ antialias: true, alpha: true }}
        onPointerMissed={() => {}}
      >
        <color attach="background" args={['#0a0908']} />
        <fog attach="fog" args={['#0a0908', 26, 62]} />
        <ambientLight intensity={1} />
        <group ref={groupRef}>
          <Wireframe />
          {photos.map((photo, i) => (
            <PhotoNode
              key={photo.id}
              photo={photo}
              index={i}
              onSelect={onSelectPhoto}
              dragState={dragState}
              isNew={newIds?.has(photo.id)}
            />
          ))}
        </group>
        <Controller
          groupRef={groupRef}
          introDone={introDone}
          selectedPhoto={selectedPhoto}
          onUserDrag={onUserDrag}
        />
        <SharedDragState dragState={dragState} />
      </Canvas>
    </div>
  );
}

/** Compartilha a medição de arraste entre Controller e cliques nas fotos. */
function SharedDragState({ dragState }) {
  const { gl } = useThree();
  useEffect(() => {
    const el = gl.domElement;
    const down = () => { dragState.current.moved = 0; };
    const move = (e) => {
      if (e.buttons || e.pointerType === 'touch') {
        dragState.current.moved += Math.abs(e.movementX || 0) + Math.abs(e.movementY || 0);
      }
    };
    el.addEventListener('pointerdown', down);
    el.addEventListener('pointermove', move);
    return () => {
      el.removeEventListener('pointerdown', down);
      el.removeEventListener('pointermove', move);
    };
  }, [gl, dragState]);
  return null;
}
