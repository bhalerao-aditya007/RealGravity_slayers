import { useMemo, useRef, useEffect } from 'react';
import * as THREE from 'three';
import { useFrame } from '@react-three/fiber';
import { LAYOUT } from '@/config/layout';
import { partsFor, Part, CHAIR_TYPES } from '@/config/furnitureDefs';
import { matFor, bpLineMat, isBlueprint, deptColor, ledMat } from './materials';
import { carpetTexture, blueprintTexture } from './textures';
import { useStore } from '@/state/store';
import { BAY_ZONES } from '@/state/departments';
import { WALL_H } from '@/config/office';

const geoCache: Record<string, THREE.BufferGeometry> = {};
function geoFor(g: string) {
  if (!geoCache[g]) {
    if (g === 'box') geoCache[g] = new THREE.BoxGeometry(1, 1, 1);
    else if (g === 'cyl') geoCache[g] = new THREE.CylinderGeometry(0.5, 0.5, 1, 10);
    else geoCache[g] = new THREE.SphereGeometry(0.5, 12, 10);
  }
  return geoCache[g];
}
const yAxis = new THREE.Vector3(0, 1, 0);

function useInstancer(list: THREE.Matrix4[]) {
  const ref = useRef<THREE.InstancedMesh>(null);
  useEffect(() => {
    const im = ref.current; if (!im) return;
    list.forEach((m, i) => im.setMatrixAt(i, m));
    im.instanceMatrix.needsUpdate = true;
  }, [list]);
  return ref;
}

export function StaticOffice() {
  const floorRef = useRef<THREE.Mesh>(null);
  const ledRef = useRef<THREE.InstancedMesh>(null);
  const panelsGroup = useRef<THREE.Group>(null);
  const carpetTex = useMemo(() => carpetTexture(), []);
  const bpTex = useMemo(() => blueprintTexture(), []);
  const departments = useStore((s) => s.departments);
  const triage = useStore((s) => s.triage);

  const { buckets, wallStub, wallGlass, panels, ledCount } = useMemo(() => {
    const buckets = new Map<string, { geo: string; mat: string; list: THREE.Matrix4[] }>();
    const push = (key: string, geo: string, mat: string, m: THREE.Matrix4) => {
      if (!buckets.has(key)) buckets.set(key, { geo, mat, list: [] });
      buckets.get(key)!.list.push(m);
    };
    const itemRot = new THREE.Quaternion();
    const partRotQ = new THREE.Quaternion();
    for (const it of LAYOUT.items) {
      // chairs render entirely through the dynamic Chairs layer (so they can slide on sit/stand)
      if (CHAIR_TYPES.has(it.type)) continue;
      let parts: Part[];
      try { parts = partsFor(it); } catch { continue; }
      itemRot.setFromAxisAngle(yAxis, it.rot);
      for (const p of parts) {
        let mk = p.m;
        if (mk === 'dept') mk = it.dept ? `dept_${it.dept}` : 'oat';
        const px = it.x + p.p[0] * Math.cos(it.rot) + p.p[2] * Math.sin(it.rot);
        const pz = it.z - p.p[0] * Math.sin(it.rot) + p.p[2] * Math.cos(it.rot);
        const q = itemRot.clone();
        if (p.ry) { partRotQ.setFromAxisAngle(yAxis, p.ry); q.multiply(partRotQ); }
        if (p.g === 'cyl' && p.s[0] !== p.s[2]) { /* uniform cylinders only */ }
        const sx = p.g === 'cyl' || p.g === 'sph' ? p.s[0] * 2 : p.s[0];
        const sy = p.s[1];
        const sz = p.g === 'cyl' || p.g === 'sph' ? (p.g === 'sph' ? p.s[2] * 2 : p.s[0] * 2) : p.s[2];
        push(`${p.g}|${mk}`, p.g, mk,
          new THREE.Matrix4().compose(new THREE.Vector3(px, p.p[1], pz), q, new THREE.Vector3(sx, sy, sz)));
      }
    }
    const wallStub: THREE.Matrix4[] = [], wallGlass: THREE.Matrix4[] = [];
    for (const w of LAYOUT.walls) {
      const len = Math.hypot(w.x1 - w.x0, w.z1 - w.z0);
      const cx = (w.x0 + w.x1) / 2, cz = (w.z0 + w.z1) / 2;
      const alongX = Math.abs(w.x1 - w.x0) >= Math.abs(w.z1 - w.z0);
      wallStub.push(new THREE.Matrix4().compose(new THREE.Vector3(cx, 0.45, cz), new THREE.Quaternion(),
        new THREE.Vector3(alongX ? len : 0.3, 0.9, alongX ? 0.3 : len)));
      wallGlass.push(new THREE.Matrix4().compose(new THREE.Vector3(cx, (0.9 + WALL_H) / 2, cz), new THREE.Quaternion(),
        new THREE.Vector3(alongX ? len : 0.12, WALL_H - 0.9, alongX ? 0.12 : len)));
    }
    const panels: THREE.Matrix4[] = [];
    for (let x = -42; x <= 42; x += 7) for (let z = -30; z <= 30; z += 6.5)
      panels.push(new THREE.Matrix4().compose(new THREE.Vector3(x, 2.95, z), new THREE.Quaternion(), new THREE.Vector3(1.5, 0.06, 0.5)));
    const ledCount = LAYOUT.items.filter((i) => i.type === 'rack').length * 2;
    return { buckets: Array.from(buckets.entries()), wallStub, wallGlass, panels, ledCount };
  }, []);

  const stubRef = useInstancer(wallStub);
  const glassRef = useInstancer(wallGlass);
  const panelRef = useInstancer(panels);
  const ledMatrices = useMemo(() => {
    const out: THREE.Matrix4[] = [];
    for (const rk of LAYOUT.items.filter((i) => i.type === 'rack'))
      for (const dy of [0.85, 1.35]) out.push(new THREE.Matrix4().makeTranslation(rk.x, dy, rk.z + 0.43));
    return out;
  }, []);
  // FIX F10: the LED mesh needs its static matrices too (the original built them but never applied them,
  // so every LED sat at the origin); per-frame colors are set in useFrame below.
  useEffect(() => {
    const im = ledRef.current; if (!im) return;
    ledMatrices.forEach((m, i) => im.setMatrixAt(i, m));
    im.instanceMatrix.needsUpdate = true;
  }, [ledMatrices]);

  useFrame(({ camera }) => {
    const s = useStore.getState();
    if (floorRef.current) {
      const mat = floorRef.current.material as THREE.MeshStandardMaterial;
      const want = s.view === 'blueprint' ? bpTex : carpetTex;
      if (mat.map !== want) { mat.map = want; mat.needsUpdate = true; }
    }
    if (ledRef.current && ledRef.current.instanceColor) {
      const gate = s.gate;
      const t = performance.now() / 1000;
      const color = new THREE.Color();
      for (let i = 0; i < ledCount; i++) {
        const busy = gate.in_flight > 0;
        const on = busy ? Math.sin(t * 6 + i * 2.4) > -0.3 : Math.sin(t * 1.5 + i) > 0.7;
        color.set(on ? (gate.backoff_active ? 0xd64545 : 0x35d07f) : 0x173226);
        ledRef.current.setColorAt(i, color);
      }
      ledRef.current.instanceColor.needsUpdate = true;
    }
    if (panelsGroup.current) panelsGroup.current.visible = camera.position.y < 42 && s.view !== 'blueprint';
  });

  const deptIds = Object.keys(departments);
  const occupied = new Set(deptIds.map((id) => departments[id].bay));
  const vacantZones = triage ? Object.entries(BAY_ZONES).filter(([bay]) => !occupied.has(bay)).map(([, z]) => z) : [];

  return (
    <group>
      <mesh ref={floorRef} rotation={[-Math.PI / 2, 0, 0]} receiveShadow>
        <planeGeometry args={[96, 70]} />
        <meshStandardMaterial map={carpetTex} roughness={0.95} />
      </mesh>
      {/* tenant carpet strips (run departments) */}
      {deptIds.map((id) => {
        const z = LAYOUT.zones.find((zn) => zn.id === BAY_ZONES[departments[id].bay])!;
        return (
          <mesh key={id} rotation={[-Math.PI / 2, 0, 0]} position={[(z.x0 + z.x1) / 2, 0.008, (z.z0 + z.z1) / 2]} receiveShadow>
            <planeGeometry args={[8, z.z1 - z.z0 - 3]} />
            <meshStandardMaterial color={deptColor(id).getStyle()} transparent opacity={0.15} roughness={1} />
          </mesh>
        );
      })}
      {/* vacant wings: dimmed while a run is active */}
      {vacantZones.map((zid) => {
        const z = LAYOUT.zones.find((zn) => zn.id === zid)!;
        return (
          <mesh key={`v_${zid}`} rotation={[-Math.PI / 2, 0, 0]} position={[(z.x0 + z.x1) / 2, 0.02, (z.z0 + z.z1) / 2]}>
            <planeGeometry args={[z.x1 - z.x0, z.z1 - z.z0]} />
            <meshBasicMaterial color="#2B2B2E" transparent opacity={0.12} depthWrite={false} />
          </mesh>
        );
      })}
      <instancedMesh ref={stubRef} args={[geoFor('box'), matFor('wallSolid'), Math.max(1, wallStub.length)]} castShadow receiveShadow />
      <instancedMesh ref={glassRef} args={[geoFor('box'), matFor('skyglass'), Math.max(1, wallGlass.length)]} />
      <group ref={panelsGroup}>
        <instancedMesh ref={panelRef} args={[geoFor('box'), matFor('lampGlow'), Math.max(1, panels.length)]} />
      </group>
      <instancedMesh ref={ledRef} args={[geoFor('box'), ledMat(), Math.max(1, ledCount)]} />
      {buckets.map(([key, b]) => (
        <FurnBucket key={key} geo={b.geo} matKey={b.mat} list={b.list} />
      ))}
    </group>
  );
}

function FurnBucket({ geo, matKey, list }: { geo: string; matKey: string; list: THREE.Matrix4[] }) {
  const ref = useRef<THREE.InstancedMesh>(null);
  const mat = useMemo(() => matFor(matKey), [matKey]);
  useEffect(() => {
    const im = ref.current; if (!im) return;
    list.forEach((m, i) => im.setMatrixAt(i, m));
    im.instanceMatrix.needsUpdate = true;
  }, [list]);
  useFrame(() => { if (ref.current) ref.current.material = isBlueprint() ? bpLineMat : mat; });
  if (!list.length) return null;
  return <instancedMesh ref={ref} args={[geoFor(geo), mat, list.length]} castShadow receiveShadow />;
}
