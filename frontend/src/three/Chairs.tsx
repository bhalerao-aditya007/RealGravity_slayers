import { useRef, useEffect, useMemo } from 'react';
import * as THREE from 'three';
import { useFrame } from '@react-three/fiber';
import { LAYOUT } from '@/config/layout';
import { CHAIR_TYPES } from '@/config/furnitureDefs';
import { director } from '@/sim/director';
import { deptColor } from './materials';
import { tenantColor } from '@/state/departments';
import { useStore } from '@/state/store';

function chairGeometry() {
  const parts: THREE.BufferGeometry[] = [];
  const cushion = new THREE.BoxGeometry(0.46, 0.07, 0.44); cushion.translate(0, 0.36, 0);
  const back = new THREE.BoxGeometry(0.44, 0.5, 0.07); back.translate(0, 0.66, 0.2);
  const stem = new THREE.CylinderGeometry(0.03, 0.03, 0.32, 8); stem.translate(0, 0.16, 0);
  const base = new THREE.CylinderGeometry(0.26, 0.26, 0.04, 10); base.translate(0, 0.02, 0);
  parts.push(cushion, back, stem, base);
  const g = new THREE.BufferGeometry();
  // manual merge (positions + normals only)
  const geos = parts.map((p) => p.toNonIndexed());
  let total = 0; for (const p of geos) total += p.attributes.position.count;
  const pos = new Float32Array(total * 3), nor = new Float32Array(total * 3);
  let o = 0;
  for (const p of geos) {
    pos.set(p.attributes.position.array as Float32Array, o * 3);
    nor.set(p.attributes.normal.array as Float32Array, o * 3);
    o += p.attributes.position.count;
  }
  g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  g.setAttribute('normal', new THREE.BufferAttribute(nor, 3));
  return g;
}

export function Chairs() {
  const chairs = useMemo(() => LAYOUT.items.filter((i) => CHAIR_TYPES.has(i.type)), []);
  const geom = useMemo(() => chairGeometry(), []);
  const ref = useRef<THREE.InstancedMesh>(null);
  const dummy = useMemo(() => new THREE.Object3D(), []);
  const dirty = useRef(true);
  const departments = useStore((s) => s.departments);

  useFrame(() => {
    const im = ref.current; if (!im) return;
    if (director.chairOffsets.size || dirty.current) {
      chairs.forEach((c, i) => {
        const off = director.chairOffsets.get(c.id) ?? 0;
        dummy.position.set(c.x + Math.sin(c.rot) * off, 0, c.z + Math.cos(c.rot) * off);
        dummy.rotation.y = c.rot;
        dummy.updateMatrix();
        im.setMatrixAt(i, dummy.matrix);
      });
      im.instanceMatrix.needsUpdate = true;
      dirty.current = director.chairOffsets.size > 0;
    }
  });

  // tint: chairs in a wing take the color of that wing's tenant department this run
  useEffect(() => {
    const im = ref.current; if (!im) return;
    const c = new THREE.Color();
    chairs.forEach((ch, i) => {
      c.set(ch.dept ? (tenantColor(ch.dept) ?? deptColor(ch.dept)).getHex() : 0xe8dfd0);
      im.setColorAt(i, c);
    });
    if (im.instanceColor) im.instanceColor.needsUpdate = true;
  }, [chairs, departments]);

  return <instancedMesh ref={ref} args={[geom, undefined, chairs.length]} castShadow receiveShadow>
    <meshStandardMaterial roughness={0.85} vertexColors={false} />
  </instancedMesh>;
}
