import { useRef, useMemo } from 'react';
import * as THREE from 'three';
import { useFrame } from '@react-three/fiber';
import { fx } from '@/sim/effects';
import { director } from '@/sim/director';
import { LAYOUT } from '@/config/layout';
import { useStore } from '@/state/store';

const MAX = 16;
export function FxLayer() {
  const envRef = useRef<THREE.InstancedMesh>(null);
  const courRef = useRef<THREE.InstancedMesh>(null);
  const stampRef = useRef<THREE.Group>(null);
  const flowRef = useRef<THREE.InstancedMesh>(null);
  const depRef = useRef<THREE.LineSegments>(null);
  const dummy = useMemo(() => new THREE.Object3D(), []);
  const color = useMemo(() => new THREE.Color(), []);

  // delegation flow polylines (manager -> leads -> bays)
  const flowLines = useMemo(() => {
    const segs: { a: THREE.Vector3; b: THREE.Vector3 }[] = [];
    const mgr = { x: 1, z: -22 };
    const leads: Record<string, { x: number; z: number }> = {
      research: { x: -38.5, z: -8.5 }, engineering: { x: 38.5, z: -8.5 },
      data: { x: -39.5, z: 29.5 }, content: { x: 39.5, z: 29.5 },
    };
    const midZ = -2.4;
    for (const l of Object.values(leads)) {
      segs.push({ a: new THREE.Vector3(mgr.x, 2.6, mgr.z), b: new THREE.Vector3(mgr.x, 2.6, midZ) });
      segs.push({ a: new THREE.Vector3(mgr.x, 2.6, midZ), b: new THREE.Vector3(l.x, 2.6, midZ) });
      segs.push({ a: new THREE.Vector3(l.x, 2.6, midZ), b: new THREE.Vector3(l.x, 2.6, l.z) });
    }
    return segs;
  }, []);
  const flowGeom = useMemo(() => {
    const pts: number[] = [];
    for (const s of flowLines) pts.push(s.a.x, s.a.y, s.a.z, s.b.x, s.b.y, s.b.z);
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(pts, 3));
    return g;
  }, [flowLines]);

  useFrame((_, dt) => {
    const s = useStore.getState();
    // envelopes (paper arcs)
    const env = envRef.current;
    if (env) {
      let i = 0;
      for (const e of fx.envelopes) {
        const t = e.t / e.dur;
        const x = THREE.MathUtils.lerp(e.x0, e.x1, t);
        const z = THREE.MathUtils.lerp(e.z0, e.z1, t);
        const h = Math.hypot(e.x1 - e.x0, e.z1 - e.z0);
        const y = 2.4 + Math.sin(t * Math.PI) * Math.max(0.8, h * 0.16);
        dummy.position.set(x, y, z);
        dummy.rotation.set(t * 6, t * 4, t * 8);
        dummy.updateMatrix();
        env.setMatrixAt(i++, dummy.matrix);
        if (i >= MAX) break;
      }
      for (; i < MAX; i++) { dummy.position.set(0, -10, 0); dummy.updateMatrix(); env.setMatrixAt(i, dummy.matrix); }
      env.instanceMatrix.needsUpdate = true;
    }
    // couriers
    const cour = courRef.current;
    if (cour) {
      let i = 0;
      for (const c of fx.couriers) {
        const total = c.path.length;
        if (total < 2) continue;
        const t = (c.t / c.dur) * (total - 1);
        const i0 = Math.min(total - 2, Math.floor(t));
        const f = t - i0;
        const a = c.path[i0], b = c.path[i0 + 1];
        dummy.position.set(THREE.MathUtils.lerp(a.x, b.x, f), 1.1, THREE.MathUtils.lerp(a.z, b.z, f));
        dummy.rotation.set(0, Math.atan2(b.x - a.x, b.z - a.z), 0);
        dummy.updateMatrix();
        cour.setMatrixAt(i++, dummy.matrix);
        if (i >= 8) break;
      }
      for (; i < 8; i++) { dummy.position.set(0, -10, 0); dummy.updateMatrix(); cour.setMatrixAt(i, dummy.matrix); }
      cour.instanceMatrix.needsUpdate = true;
    }
    // stamps
    if (stampRef.current) {
      stampRef.current.children.forEach((ch, i) => {
        const st = fx.stamps[i];
        if (!st) { ch.visible = false; return; }
        ch.visible = true;
        ch.position.set(st.x, 1.7 + st.t * 0.35, st.z);
        ch.rotation.z = st.t * 1.2;
        const mat = (ch as THREE.Mesh).material as THREE.MeshBasicMaterial;
        mat.opacity = Math.max(0, 1 - st.t / 2.2);
        mat.color.set(st.ok ? 0x2f9e6e : 0xd64545);
      });
    }
    // flows
    if (flowRef.current) {
      const on = s.flows;
      flowRef.current.visible = on;
      flowGeom; // lines static; arrows move
      if (on) {
        const t = performance.now() / 1000;
        const speed = 1 + s.gate.in_flight * 0.6;
        let i = 0;
        for (const seg of flowLines) {
          const f = ((t * speed * 0.25 + i * 0.13) % 1);
          dummy.position.lerpVectors(seg.a, seg.b, f);
          dummy.rotation.set(Math.PI / 2, 0, Math.atan2(seg.b.x - seg.a.x, seg.b.z - seg.a.z) - Math.PI / 2 + Math.PI);
          dummy.updateMatrix();
          flowRef.current.setMatrixAt(i++, dummy.matrix);
        }
        for (; i < 16; i++) { dummy.position.set(0, -10, 0); dummy.updateMatrix(); flowRef.current.setMatrixAt(i, dummy.matrix); }
        flowRef.current.instanceMatrix.needsUpdate = true;
      }
    }
    // dependency dotted lines: waiting agent -> blocking task owner
    if (depRef.current) {
      const pts: number[] = [];
      for (const t of Object.values(s.tasks)) {
        if (t.status !== 'waiting' && t.status !== 'pending') continue;
        if (t.status !== 'waiting') continue;
        const waiter = director.pos(t.assigned_agent ?? '');
        const blockerId = t.depends_on.map((d) => s.tasks[d]).find((d) => d && d.status !== 'done');
        const blocker = blockerId ? director.pos(blockerId.assigned_agent ?? '') : null;
        if (waiter && blocker) {
          pts.push(waiter.x, 2.0, waiter.z, blocker.x, 2.0, blocker.z);
        }
      }
      depRef.current.geometry.setAttribute('position', new THREE.Float32BufferAttribute(pts, 3));
      depRef.current.visible = pts.length > 0;
    }
  });

  return (
    <group>
      <instancedMesh ref={envRef} args={[undefined, undefined, MAX]}>
        <boxGeometry args={[0.24, 0.02, 0.17]} />
        <meshStandardMaterial color="#faf7f2" />
      </instancedMesh>
      <instancedMesh ref={courRef} args={[undefined, undefined, 8]}>
        <coneGeometry args={[0.1, 0.22, 6]} />
        <meshBasicMaterial color="#e4a13a" />
      </instancedMesh>
      <group ref={stampRef}>
        {Array.from({ length: 6 }).map((_, i) => (
          <mesh key={i} visible={false}>
            <circleGeometry args={[0.22, 20]} />
            <meshBasicMaterial transparent side={THREE.DoubleSide} />
          </mesh>
        ))}
      </group>
      <lineSegments geometry={flowGeom}>
        <lineBasicMaterial color="#e4572e" transparent opacity={0.28} />
      </lineSegments>
      <instancedMesh ref={flowRef} args={[undefined, undefined, 16]} visible={false}>
        <coneGeometry args={[0.12, 0.3, 4]} />
        <meshBasicMaterial color="#e4572e" />
      </instancedMesh>
      <lineSegments ref={depRef} visible={false}>
        <lineDashedMaterial color="#e0a13a" dashSize={0.3} gapSize={0.22} />
      </lineSegments>
    </group>
  );
}
