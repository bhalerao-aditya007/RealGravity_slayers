import { useMemo, useRef, useEffect } from 'react';
import * as THREE from 'three';
import { useFrame } from '@react-three/fiber';
import { HallLayout, cardPos } from './hallLayout';
import { useStore } from '@/state/store';

export const voteFx: { from: { x: number; z: number }; ideaId: string; t: number }[] = [];
const MAX_CARDS = 24;

function cardTexture(text: string, accent: string, votes?: number) {
  const c = document.createElement('canvas'); c.width = 256; c.height = 128;
  const g = c.getContext('2d')!;
  g.fillStyle = '#FAF7F2'; g.fillRect(0, 0, 256, 128);
  g.strokeStyle = accent; g.lineWidth = 6; g.strokeRect(3, 3, 250, 122);
  g.fillStyle = '#2B2B2E'; g.font = '600 17px Inter';
  const words = text.split(' '); let line = '', y = 30;
  for (const w of words) {
    if ((line + w).length > 30) { g.fillText(line, 14, y); y += 22; line = ''; if (y > 100) break; }
    line += w + ' ';
  }
  if (y <= 100) g.fillText(line, 14, y);
  if (votes != null) { g.fillStyle = accent; g.font = '700 22px "JetBrains Mono"'; g.fillText(`${votes}✓`, 210, 116); }
  return new THREE.CanvasTexture(c);
}

export function IdeaBoard({ layout }: { layout: HallLayout }) {
  const group = useRef<THREE.Group>(null);
  const cardMeshes = useRef<THREE.Mesh[]>([]);
  const tokenRef = useRef<THREE.InstancedMesh>(null);
  const dummy = useMemo(() => new THREE.Object3D(), []);
  const boardY = 1.55;

  // Subscribe at the top level (hooks must not be called inside useMemo deps).
  const ideaCount = useStore((s) => s.swarm.ideaOrder.length);
  const clusterCount = useStore((s) => s.swarm.clusterOrder.length);
  const tally = useStore((s) => s.swarm.tally);
  const accent = useStore((s) => s.accent);
  const hiddenCount = Math.max(0, ideaCount - MAX_CARDS);

  const cardData = useMemo(() => {
    const s = useStore.getState().swarm;
    const ids = s.ideaOrder;
    const clusterOf = new Map<string, { idx: number; id: string }>();
    s.clusterOrder.forEach((cid, ci) => s.clusters[cid]?.idea_ids.forEach((iid) => clusterOf.set(iid, { idx: ci, id: cid })));
    const nClusters = s.clusterOrder.length;
    const memberCount = new Map<string, number>();
    const memberIdx = new Map<string, number>();
    for (const cid of s.clusterOrder) {
      const list = s.clusters[cid]?.idea_ids ?? [];
      list.forEach((iid, mi) => { memberIdx.set(iid, mi); memberCount.set(iid, list.length); });
    }
    const out: { id: string; text: string; pos: { x: number; z: number }; votes: number; agentId: string; tex: THREE.CanvasTexture }[] = [];
    ids.forEach((iid, i) => {
      if (i >= MAX_CARDS) return;
      const idea = s.ideas[iid]; if (!idea) return;
      const cl = clusterOf.get(iid);
      const pos = cl
        ? cardPos(i, cl.idx, nClusters, memberIdx.get(iid) ?? 0, memberCount.get(iid) ?? 1)
        : cardPos(i, 0, 1, i, ids.length);
      const votes = tally?.scores.find((x) => x.idea_id === iid)?.votes ?? 0;
      out.push({ id: iid, text: idea.text, pos, votes, agentId: idea.agent_id, tex: cardTexture(idea.text, accent, votes) });
    });
    return out;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ideaCount, clusterCount, tally, accent]);

  // Dispose textures of the previous card set when data changes / on unmount.
  useEffect(() => () => { cardData.forEach((c) => c.tex.dispose()); }, [cardData]);

  const moreTex = useMemo(() => (hiddenCount > 0 ? cardTexture(`+${hiddenCount} more ideas`, '#8a8a8f') : null), [hiddenCount]);
  useEffect(() => () => moreTex?.dispose(), [moreTex]);

  useFrame((_, dt) => {
    if (group.current) group.current.rotation.y += dt * 0.12;
    const im = tokenRef.current;
    if (im) {
      for (const v of voteFx) v.t += dt / 1.1;
      for (let i = voteFx.length - 1; i >= 0; i--) if (voteFx[i].t >= 1) voteFx.splice(i, 1);
      let i = 0;
      for (const v of voteFx) {
        const card = cardData.find((c) => c.id === v.ideaId);
        if (!card) continue;
        const t = v.t;
        dummy.position.set(
          THREE.MathUtils.lerp(v.from.x, card.pos.x * 0.55, t),
          1.0 + Math.sin(t * Math.PI) * 1.3 + t * (boardY - 1.0),
          THREE.MathUtils.lerp(v.from.z, card.pos.z * 0.55, t));
        dummy.scale.setScalar(1); dummy.updateMatrix();
        im.setMatrixAt(i++, dummy.matrix);
        if (i >= 16) break;
      }
      for (; i < 16; i++) { dummy.position.set(0, -10, 0); dummy.updateMatrix(); im.setMatrixAt(i, dummy.matrix); }
      im.instanceMatrix.needsUpdate = true;
    }
  });

  return (
    <group>
      <group ref={group} position={[0, boardY, 0]}>
        <mesh rotation={[Math.PI / 2, 0, 0]}><torusGeometry args={[0.5, 0.02, 8, 32]} /><meshBasicMaterial color={accent} /></mesh>
        <mesh rotation={[Math.PI / 2, 0.4, 0]}><torusGeometry args={[1.6, 0.012, 8, 40]} /><meshBasicMaterial color="#cbbfa9" /></mesh>
        {cardData.map((c, i) => (
          <group key={c.id} position={[c.pos.x, 0, c.pos.z]} rotation={[0, -Math.atan2(c.pos.x, c.pos.z) + Math.PI / 2, 0]}>
            <mesh ref={(m) => { if (m) cardMeshes.current[i] = m; }}>
              <planeGeometry args={[0.62, 0.31]} />
              <meshBasicMaterial map={c.tex} transparent />
            </mesh>
            <mesh position={[0, 0, -0.005]}><planeGeometry args={[0.7, 0.39]} /><meshBasicMaterial color={accent} transparent opacity={Math.min(0.35, c.votes * 0.08)} /></mesh>
          </group>
        ))}
        {moreTex && (
          <mesh position={[0, 0.4, 0]}>
            <planeGeometry args={[0.5, 0.25]} />
            <meshBasicMaterial map={moreTex} transparent />
          </mesh>
        )}
      </group>
      {/* pedestal glow in the well */}
      <mesh position={[0, 0.02, 0]} rotation={[-Math.PI / 2, 0, 0]}>
        <circleGeometry args={[Math.min(1.2, layout.b * 0.3), 24]} />
        <meshBasicMaterial color={accent} transparent opacity={0.12} />
      </mesh>
      <instancedMesh ref={tokenRef} args={[undefined, undefined, 16]}>
        <sphereGeometry args={[0.05, 8, 6]} />
        <meshBasicMaterial color={accent} />
      </instancedMesh>
    </group>
  );
}
