import { useRef, useMemo } from 'react';
import * as THREE from 'three';
import { useFrame, useThree } from '@react-three/fiber';
import { director } from '@/sim/director';
import { buildRig, Rig } from './AgentRig';
import { useStore } from '@/state/store';
import { cameraCtl } from './cameraCtl';

export function AgentsLayer() {
  const rigs = useRef(new Map<string, Rig>());
  const sceneRef = useRef<THREE.Group>(null);
  const { camera } = useThree();
  const camPos = useMemo(() => new THREE.Vector3(), []);

  useFrame((_, dt) => {
    const s = useStore.getState();
    const speed = s.paused ? 0 : s.speed;
    const step = Math.min(dt, 0.05) * speed;
    const sub = Math.max(1, Math.ceil(step / 0.033));
    for (let i = 0; i < sub; i++) director.update(step / sub);

    camera.getWorldPosition(camPos);
    const seen = new Set<string>();
    for (const rt of director.runtimes) {
      if (rt.state === 'gone') continue;
      seen.add(rt.id);
      let rig = rigs.current.get(rt.id);
      if (!rig) {
        rig = buildRig(rt.def.avatar_seed, rt.def.department, rt.def.role);
        rigs.current.set(rt.id, rig);
        sceneRef.current?.add(rig.group);
      }
      const dist = camPos.distanceTo(new THREE.Vector3(rt.x, 1, rt.z));
      rig.group.visible = dist < s.settings.lodDist + 24;
      const activity = rt.celebrateT > 0 ? 'celebrate' : rt.activity;
      rig.update(rt.x, rt.z, rt.heading, {
        seated: rt.state === 'seated' || rt.state === 'sitdown' || rt.state === 'standup',
        walkBlend: rt.state === 'walk' ? Math.min(1, rt.speed / 0.8) : 0,
        phase: rt.phase, speed: rt.speed, activity, carry: rt.carry, t: director.time,
      }, Math.min(dt, 0.05));
    }
    for (const [id, rig] of rigs.current) {
      if (!seen.has(id)) { sceneRef.current?.remove(rig.group); rig.dispose(); rigs.current.delete(id); }
    }
    if (s.followId) {
      const rt = director.rt(s.followId);
      if (rt && rt.state !== 'gone') cameraCtl.follow(s.followId);
    }
  });

  return <group ref={sceneRef} onClick={undefined} />;
}
