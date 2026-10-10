import { useRef, useMemo, useState } from 'react';
import * as THREE from 'three';
import { useFrame, ThreeEvent } from '@react-three/fiber';
import { Html } from '@react-three/drei';
import { HallLayout } from './hallLayout';
import { swarmDirector } from './directorRef';
import { buildRig, Rig } from '@/three/AgentRig';
import { useStore } from '@/state/store';
import { roleCss } from './roles';

export function SwarmAgents({ layout: _layout }: { layout: HallLayout }) {
  const rigs = useRef(new Map<string, Rig>());
  const groupRef = useRef<THREE.Group>(null);
  const colliderRef = useRef<THREE.InstancedMesh>(null);
  const spotRef = useRef<THREE.Mesh>(null);
  const [hover, setHover] = useState<string | null>(null);
  const dummy = useMemo(() => new THREE.Object3D(), []);
  const idBySlot = useRef<string[]>([]);

  // Light-weight tick so labels/bubbles (React-rendered) refresh ~4x/s without re-rendering every frame.
  const [, setTick] = useState(0);
  const tickAcc = useRef(0);

  useFrame((_, dt) => {
    const s = useStore.getState();
    const speed = s.paused ? 0 : s.speed;
    const step = Math.min(dt, 0.05) * speed;
    const sub = Math.max(1, Math.ceil(step / 0.033));
    for (let i = 0; i < sub; i++) swarmDirector.update(step / sub);

    const seen = new Set<string>();
    idBySlot.current = [];
    for (const rt of swarmDirector.runtimes) {
      if (rt.state === 'gone') continue;
      seen.add(rt.id);
      let rig = rigs.current.get(rt.id);
      if (!rig) {
        const role = rt.isMod ? null : rt.roleId;
        rig = buildRig(rt.seed, role, rt.isMod ? 'manager' : 'worker');
        rigs.current.set(rt.id, rig);
        groupRef.current?.add(rig.group);
      }
      rig.update(rt.x, rt.z, rt.heading, {
        seated: ['seated', 'sitdown', 'standup', 'slot'].includes(rt.state),
        walkBlend: ['door', 'lane', 'radial', 'walkSlot'].includes(rt.state) ? Math.min(1, rt.speed / 0.8) : 0,
        phase: rt.phase, speed: rt.speed, activity: rt.activity, carry: rt.carry,
        t: swarmDirector.time,
      }, Math.min(dt, 0.05));
      idBySlot.current.push(rt.id);
    }
    for (const [id, rig] of rigs.current) {
      if (!seen.has(id)) { groupRef.current?.remove(rig.group); rig.dispose(); rigs.current.delete(id); }
    }
    // colliders for hover/click (index order matches idBySlot)
    const im = colliderRef.current;
    if (im) {
      let k = 0;
      for (const id of idBySlot.current) {
        const rt = swarmDirector.rt(id)!;
        dummy.position.set(rt.x, 0.9, rt.z); dummy.scale.set(1, 1, 1); dummy.updateMatrix();
        im.setMatrixAt(k++, dummy.matrix);
      }
      im.count = k;
      im.instanceMatrix.needsUpdate = true;
    }
    // speaker spotlight
    if (spotRef.current) {
      const sp = swarmDirector.speakingId ? swarmDirector.rt(swarmDirector.speakingId) : null;
      spotRef.current.visible = !!sp;
      if (sp) spotRef.current.position.set(sp.x, 0.02, sp.z);
    }
    tickAcc.current += dt;
    if (tickAcc.current > 0.25) { tickAcc.current = 0; setTick((n) => (n + 1) & 0xffff); }
  });

  const selected = useStore((s) => s.selected);
  const reportOpen = useStore((s) => s.reportOpen);
  const inspectorOpen = useStore((s) => s.inspectorOpen);
  const bubbleAgents = swarmDirector.runtimes.filter((r) => r.bubble).slice(0, 3);

  const onPick = (e: ThreeEvent<MouseEvent>) => {
    e.stopPropagation();
    const id = idBySlot.current[(e as any).instanceId];
    if (id) useStore.setState({ selected: id, inspectorOpen: true } as any);
  };
  const onHover = (e: any) => {
    const id = idBySlot.current[e.instanceId];
    setHover(id ?? null);
  };

  const labelIds = [...new Set([swarmDirector.speakingId, hover, selected].filter(Boolean) as string[])];
  const agentsRec = useStore.getState().swarm.agents;

  return (
    <group>
      <group ref={groupRef} />
      <instancedMesh ref={colliderRef} args={[undefined, undefined, 60]}
        onClick={onPick} onPointerMove={onHover} onPointerOut={() => setHover(null)}>
        <capsuleGeometry args={[0.35, 1.0, 4, 6]} />
        <meshBasicMaterial visible={false} />
      </instancedMesh>
      <mesh ref={spotRef} rotation={[-Math.PI / 2, 0, 0]} visible={false}>
        <ringGeometry args={[0.42, 0.55, 28]} />
        <meshBasicMaterial color="#f5d78e" transparent opacity={0.75} />
      </mesh>
      {/* labels: speaker, hover, selected — never everyone */}
      {labelIds.map((id) => {
        const rt = swarmDirector.rt(id); if (!rt) return null;
        const a = agentsRec[id];
        return (
          <Html key={id} position={[rt.x, 2.15, rt.z]} center distanceFactor={12}>
            <div className="rounded-full px-2 py-0.5 border shadow-sm flex items-center gap-1"
              style={{ background: 'rgba(250,247,242,0.94)', borderColor: '#e8dfd0' }}>
              <span className="rounded-full" style={{ width: 7, height: 7, background: rt.isMod ? 'var(--accent)' : roleCss(rt.roleId) }} />
              <span className="text-[11px] font-medium whitespace-nowrap" style={{ color: '#2B2B2E' }}>{a?.name ?? id}</span>
              <span className="text-[9px] font-mono text-ink/45">{rt.isMod ? 'MOD' : a?.department}</span>
            </div>
          </Html>
        );
      })}

      {/* speech bubbles, max 3: hidden when report modal is open to prevent UI overlap */}
      {!reportOpen && !inspectorOpen && bubbleAgents.map((rt) => (
        <Html key={`b${rt.id}`} position={[rt.x, 2.45, rt.z]} center distanceFactor={12}>
          <div className="max-w-[200px] rounded-lg px-2.5 py-1.5 text-[11px] leading-snug shadow-md pointer-events-none select-none"
            style={{ background: '#2B2B2E', color: '#FAF7F2' }}>
            {rt.bubble!.text.length > 80 ? rt.bubble!.text.slice(0, 80) + '...' : rt.bubble!.text}
          </div>
        </Html>
      ))}
    </group>
  );
}
