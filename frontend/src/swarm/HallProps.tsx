import { useMemo, useRef, useEffect } from 'react';
import * as THREE from 'three';
import { useFrame } from '@react-three/fiber';
import { HallLayout } from './hallLayout';
import { useStore } from '@/state/store';

function ringShape(outer: [number, number][], well: [number, number][] | null): THREE.Shape {
  const s = new THREE.Shape();
  outer.forEach(([x, z], i) => (i === 0 ? s.moveTo(x, z) : s.lineTo(x, z)));
  s.closePath();
  if (well) {
    const h = new THREE.Path();
    well.forEach(([x, z], i) => (i === 0 ? h.moveTo(x, z) : h.lineTo(x, z)));
    h.closePath();
    s.holes.push(h);
  }
  return s;
}
function textTexture(lines: { text: string; color?: string; size?: number }[], w: number, h: number, bg = '#FAF7F2') {
  const c = document.createElement('canvas'); c.width = w; c.height = h;
  const g = c.getContext('2d')!;
  g.fillStyle = bg; g.fillRect(0, 0, w, h);
  let y = 0;
  for (const l of lines) {
    g.fillStyle = l.color ?? '#2B2B2E';
    g.font = `${l.size ?? 24}px "Space Grotesk", sans-serif`;
    g.fillText(l.text, 12, y += (l.size ?? 24) + 8);
  }
  return new THREE.CanvasTexture(c);
}

type V3 = [number, number, number];


import { roleAt, roleCss } from './roles';

function SwarmChair({ x, z, face, roleId }: { x: number; z: number; face: number; roleId?: string }) {
  const accent = roleId ? roleCss(roleId) : '#2B2B2E';
  return (
    <group position={[x, 0, z]} rotation={[0, face, 0]}>
      {/* 5-wheel star base */}
      <mesh position={[0, 0.02, 0]}>
        <cylinderGeometry args={[0.22, 0.25, 0.04, 10]} />
        <meshStandardMaterial color="#2B2B2E" metalness={0.7} roughness={0.3} />
      </mesh>
      {/* Chrome stem */}
      <mesh position={[0, 0.18, 0]}>
        <cylinderGeometry args={[0.025, 0.025, 0.32, 8]} />
        <meshStandardMaterial color="#888890" metalness={0.8} roughness={0.2} />
      </mesh>
      {/* Ergonomic seat cushion */}
      <mesh position={[0, 0.38, 0]} castShadow receiveShadow>
        <boxGeometry args={[0.46, 0.07, 0.44]} />
        <meshStandardMaterial color={accent} roughness={0.5} />
      </mesh>
      {/* Contoured backrest situated at -Z (behind the seated agent's back) */}
      <mesh position={[0, 0.64, -0.19]} rotation={[0.08, 0, 0]} castShadow>
        <boxGeometry args={[0.42, 0.46, 0.05]} />
        <meshStandardMaterial color="#24262b" roughness={0.4} />
      </mesh>
      {/* Armrests */}
      <mesh position={[-0.23, 0.48, -0.02]}>
        <boxGeometry args={[0.03, 0.15, 0.26]} />
        <meshStandardMaterial color="#32343a" roughness={0.3} />
      </mesh>
      <mesh position={[0.23, 0.48, -0.02]}>
        <boxGeometry args={[0.03, 0.15, -0.02]} />
        <meshStandardMaterial color="#32343a" roughness={0.3} />
      </mesh>
    </group>
  );
}

function ModeratorLectern({ seat }: { seat: any }) {
  const fx = Math.sin(seat.face), fz = Math.cos(seat.face);
  const lx = seat.x + fx * 0.55, lz = seat.z + fz * 0.55;
  return (
    <group position={[lx, 0, lz]} rotation={[0, seat.face, 0]}>
      {/* Base */}
      <mesh position={[0, 0.02, 0]} receiveShadow>
        <boxGeometry args={[0.65, 0.04, 0.45]} />
        <meshStandardMaterial color="#1f1f22" />
      </mesh>
      {/* Dark modern body */}
      <mesh position={[0, 0.52, 0]} castShadow>
        <boxGeometry args={[0.48, 1.0, 0.3]} />
        <meshStandardMaterial color="#2B2B2E" roughness={0.4} />
      </mesh>
      {/* Slanted reading top */}
      <mesh position={[0, 1.04, 0]} rotation={[-0.22, 0, 0]} castShadow>
        <boxGeometry args={[0.62, 0.04, 0.42]} />
        <meshStandardMaterial color="#8a6240" roughness={0.4} />
      </mesh>
      {/* Accent strip */}
      <mesh position={[0, 1.05, 0.18]}>
        <boxGeometry args={[0.62, 0.03, 0.02]} />
        <meshStandardMaterial color="#E4572E" />
      </mesh>
    </group>
  );
}

export function HallProps({ layout }: { layout: HallLayout }) {
  const L = layout;
  const tableGeo = useMemo(() => {
    const g = new THREE.ExtrudeGeometry(ringShape(L.table.outer, L.table.well), { depth: 0.06, bevelEnabled: false });
    g.rotateX(-Math.PI / 2);
    return g;
  }, [L]);
  const stripeGeo = useMemo(() => {
    const s = new THREE.Shape();
    L.table.outer.forEach(([x, z], i) => (i === 0 ? s.moveTo(x, z) : s.lineTo(x, z)));
    const g = new THREE.ExtrudeGeometry(s, { depth: 0.015, bevelEnabled: false });
    g.rotateX(-Math.PI / 2);
    return g;
  }, [L]);

  const pendants = useMemo(() => {
    const n = Math.max(6, Math.round(L.n / 4) * 2);
    const pts: THREE.Vector3[] = [];
    for (let i = 0; i < n; i++) {
      const t = (i / n) * Math.PI * 2;
      pts.push(new THREE.Vector3(L.a * 0.72 * Math.cos(t), L.hall.height - 1.3, L.b * 0.72 * Math.sin(t)));
    }
    return pts;
  }, [L]);

  // Screen texture is created once (useMemo, not useEffect) so the material has it on first render.
  const screenTex = useMemo(
    () => textTexture([{ text: 'SWARM HALL', size: 40, color: '#E4572E' }, { text: 'awaiting topic…', size: 26, color: '#8a8a8f' }], 512, 160, '#2B2B2E'),
    [],
  );
  useEffect(() => () => screenTex.dispose(), [screenTex]);
  const lastKey = useRef('');
  useFrame(() => {
    const s = useStore.getState();
    const phase = s.swarm.phase || 'frame';
    const topic = s.swarm.topic?.slice(0, 46) ?? '';
    const seated = Object.keys(s.swarm.agents).length;
    const key = `${phase}|${topic}|${s.swarm.round}|${seated}`;
    if (key === lastKey.current) return; // only repaint when something changed
    lastKey.current = key;
    const c = screenTex.image as HTMLCanvasElement;
    const g = c.getContext('2d')!;
    g.fillStyle = '#2B2B2E'; g.fillRect(0, 0, 512, 160);
    g.fillStyle = '#E4572E'; g.font = '600 40px "Space Grotesk"'; g.fillText(`PHASE · ${phase.toUpperCase()}`, 14, 46);
    g.fillStyle = '#FAF7F2'; g.font = '26px Inter'; g.fillText(topic, 14, 96);
    g.fillStyle = '#8a8a8f'; g.font = '20px "JetBrains Mono"'; g.fillText(`round ${s.swarm.round} · ${seated} seated`, 14, 132);
    screenTex.needsUpdate = true;
  });

  const cornerX = L.walls.east - 1.5, cornerZ = L.hall.depth / 2 - 1.5;
  const plants: [number, number][] = [[-cornerX, -cornerZ], [-cornerX, cornerZ], [cornerX, cornerZ], [cornerX, -cornerZ]];

  const stubs: { p: V3; s: V3 }[] = [
    { p: [0, 0.45, L.walls.north], s: [L.hall.width, 0.9, 0.3] },
    { p: [0, 0.45, L.walls.south], s: [L.hall.width, 0.9, 0.3] },
    { p: [L.walls.west, 0.45, 0], s: [0.3, 0.9, L.hall.depth] },
    { p: [L.walls.east, 0.45, 0], s: [0.3, 0.9, L.hall.depth] },
  ];
  const glass: { p: V3; s: V3 }[] = [
    { p: [0, (0.9 + L.hall.height) / 2, L.walls.north], s: [L.hall.width, L.hall.height - 0.9, 0.08] },
    { p: [L.walls.west, (0.9 + L.hall.height) / 2, 0], s: [0.08, L.hall.height - 0.9, L.hall.depth] },
    { p: [L.walls.east, (0.9 + L.hall.height) / 2, 0], s: [0.08, L.hall.height - 0.9, L.hall.depth] },
  ];
  const screens: { p: V3; ry: number }[] = [
    { p: [L.walls.west + 0.2, 2.4, 0], ry: Math.PI / 2 },
    { p: [L.walls.east - 0.2, 2.4, 0], ry: -Math.PI / 2 },
  ];

  return (
    <group>
      {/* floor */}
      <mesh rotation={[-Math.PI / 2, 0, 0]} receiveShadow>
        <planeGeometry args={[L.hall.width, L.hall.depth]} />
        <meshStandardMaterial color="#d9d2c4" roughness={0.95} />
      </mesh>
      {/* table */}
      <mesh geometry={tableGeo} position={[0, 0.68, 0]} castShadow receiveShadow>
        <meshStandardMaterial color={0x8a6240} roughness={0.6} />
      </mesh>
      <mesh geometry={stripeGeo} position={[0, 0.7, 0]}>
        <meshStandardMaterial color="#E4572E" roughness={0.6} />
      </mesh>
      {/* table pedestal */}
      <mesh position={[0, 0.35, 0]} castShadow>
        <cylinderGeometry args={[0.12, 0.12, 0.68, 8]} />
        <meshStandardMaterial color={0x2b2b2e} />
      </mesh>
      {/* walls: stubs + glass band */}
      {stubs.map((w, i) => (
        <mesh key={i} position={w.p} castShadow receiveShadow><boxGeometry args={w.s} /><meshStandardMaterial color="#ded5c6" roughness={0.9} /></mesh>
      ))}
      {glass.map((w, i) => (
        <mesh key={`g${i}`} position={w.p}><boxGeometry args={w.s} /><meshStandardMaterial color="#cfe0e8" transparent opacity={0.14} roughness={0.1} /></mesh>
      ))}
      {/* wall screens (west + east) */}
      {screens.map((w, i) => (
        <mesh key={`s${i}`} position={w.p} rotation={[0, w.ry, 0]}>
          <planeGeometry args={[4.2, 1.3]} />
          <meshBasicMaterial map={screenTex} />
        </mesh>
      ))}
      {/* door (south centre) */}
      <mesh position={[0, 1.05, L.walls.south - 0.02]}>
        <boxGeometry args={[L.door.w - 0.1, 2.1, 0.06]} />
        <meshStandardMaterial color="#dfe9ee" transparent opacity={0.4} roughness={0.1} />
      </mesh>
      {/* pendant ring lights */}
      {pendants.map((p, i) => (
        <group key={i} position={p}>
          <mesh><cylinderGeometry args={[0.16, 0.22, 0.16, 10]} /><meshBasicMaterial color="#f5e7c8" /></mesh>
          <mesh position={[0, 0.5, 0]}><cylinderGeometry args={[0.012, 0.012, 1, 6]} /><meshStandardMaterial color="#7d8288" /></mesh>
        </group>
      ))}
            {/* Swarm Participant Chairs */}
      {L.seats.map((s) => (
        <SwarmChair key={`chair_${s.index}`} x={s.x} z={s.z} face={s.face} roleId={roleAt(s.index).id} />
      ))}
      {/* Moderator Chair & Lectern */}
      <SwarmChair x={L.moderatorSeat.x} z={L.moderatorSeat.z} face={L.moderatorSeat.face} roleId="strategist" />
      <ModeratorLectern seat={L.moderatorSeat} />
      <CoffeeCorner layout={L} />
      {/* plants at the four corners */}
      {plants.map(([x, z], i) => (
        <group key={`p${i}`} position={[x, 0, z]}>
          <mesh position={[0, 0.17, 0]}><cylinderGeometry args={[0.22, 0.17, 0.34, 8]} /><meshStandardMaterial color={0xb46a4a} /></mesh>
          <mesh position={[0, 0.62, 0]}><sphereGeometry args={[0.34, 10, 8]} /><meshStandardMaterial color={0x5d8a4a} /></mesh>
        </group>
      ))}
    </group>
  );
}

function CoffeeCorner({ layout: L }: { layout: HallLayout }) {
  const cx = L.coffeeCorner.counter.x;
  return (
    <group>
      <mesh position={[cx, 0.45, 0]} castShadow><boxGeometry args={[0.7, 0.9, 5]} /><meshStandardMaterial color={0xe8dfd0} /></mesh>
      <mesh position={[cx + 0.1, 0.93, -1.6]} castShadow><boxGeometry args={[0.7, 0.55, 0.55]} /><meshStandardMaterial color={0x2b2b2e} /></mesh>
      <mesh position={[cx + 0.1, 0.6, 2.2]}><boxGeometry args={[0.45, 1.1, 0.45]} /><meshStandardMaterial color={0xfaf7f2} /></mesh>
      {[L.coffeeCorner.slots[0], L.coffeeCorner.slots[1]].map((s, i) => (
        <group key={i} position={[s.x, 0, s.z]}>
          <mesh position={[0, 0.62, 0]}><cylinderGeometry args={[0.19, 0.19, 0.06, 10]} /><meshStandardMaterial color={0x8a6240} /></mesh>
          <mesh position={[0, 0.3, 0]}><cylinderGeometry args={[0.03, 0.03, 0.6, 6]} /><meshStandardMaterial color={0x7d8288} /></mesh>
        </group>
      ))}
    </group>
  );
}
