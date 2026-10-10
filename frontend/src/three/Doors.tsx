import { useRef, useMemo } from 'react';
import * as THREE from 'three';
import { useFrame } from '@react-three/fiber';
import { LAYOUT } from '@/config/layout';
import { director } from '@/sim/director';

export function Doors() {
  const refs = useRef<(THREE.Group | null)[]>([]);
  const open = useMemo(() => LAYOUT.doors.map(() => 0), []);

  useFrame((_, dt) => {
    LAYOUT.doors.forEach((d, i) => {
      let near = false;
      for (const rt of director.runtimes) {
        if (rt.state === 'gone') continue;
        if (Math.hypot(rt.x - d.x, rt.z - d.z) < 1.5) { near = true; break; }
      }
      open[i] = THREE.MathUtils.damp(open[i], near ? 1 : 0, 4, dt);
      const g = refs.current[i];
      if (g) g.position.x = -open[i] * (d.w / 2 - 0.05); // slide open along the wall
    });
  });

  return (
    <group>
      {LAYOUT.doors.map((d, i) => (
        <group key={d.id} position={[d.x, 0, d.z]}>
          <group ref={(el) => { refs.current[i] = el; }}>
            <mesh position={[0, 1.5, 0]} castShadow>
              <boxGeometry args={[d.w - 0.1, 2.1, 0.06]} />
              <meshStandardMaterial color="#dfe9ee" transparent opacity={0.35} roughness={0.1} metalness={0.3} />
            </mesh>
            <mesh position={[0, 1.5, 0.05]}>
              <boxGeometry args={[0.06, 2.1, 0.02]} />
              <meshStandardMaterial color="#8a9096" metalness={0.6} roughness={0.3} />
            </mesh>
          </group>
        </group>
      ))}
    </group>
  );
}
