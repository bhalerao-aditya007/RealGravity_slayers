import { useState, useRef } from 'react';
import { Html } from '@react-three/drei';
import { useFrame } from '@react-three/fiber';
import * as THREE from 'three';
import { director } from '@/sim/director';
import { useStore } from '@/state/store';
import { STATUS_COLORS } from '@/config/office';

const MAX_LABELS = 14;
const MAX_BUBBLES = 4;

export function LabelsLayer() {
  const [tick, setTick] = useState(0);
  const last = useRef(0);
  const selected = useStore((s) => s.selected);
  useFrame(({ camera }) => {
    if (performance.now() - last.current > 200) {
      last.current = performance.now();
      setTick((t) => t + 1);
    }
    setLabelCamera(camera);
  });

  const agents = director.runtimes.filter((r) => r.state !== 'gone');
  const withPos = agents
    .map((r) => ({ r, d: cameraDist(r.x, r.z) }))
    .sort((a, b) => a.d - b.d)
    .slice(0, MAX_LABELS);
  const bubbles = agents.filter((r) => r.bubble).slice(0, MAX_BUBBLES);

  return (
    <group>
      {withPos.map(({ r, d }) => {
        const st = useStore.getState().agents[r.id];
        const status = st?.status ?? 'IDLE';
        const collapsed = d > 26;
        return (
          <Html key={r.id} position={[r.x, 1.95, r.z]} center distanceFactor={14} zIndexRange={[10, 0]}>
            <div
              className={`select-none cursor-pointer transition-opacity ${d > 40 ? 'opacity-0' : 'opacity-100'}`}
              onClick={(e) => { e.stopPropagation(); useStore.setState({ selected: r.id, inspectorOpen: true }); }}
            >
              <div className={`flex items-center gap-1 rounded-full px-2 py-0.5 shadow-sm border ${selected === r.id ? 'ring-2' : ''}`}
                style={{ background: 'rgba(250,247,242,0.92)', borderColor: '#e8dfd0' }}>
                <span className="rounded-full" style={{ width: 7, height: 7, background: STATUS_COLORS[status] ?? '#888' }} />
                {!collapsed && (
                  <span className="font-body text-[11px] font-medium whitespace-nowrap" style={{ color: '#2B2B2E' }}>
                    {r.def.name}
                  </span>
                )}
              </div>
            </div>
          </Html>
        );
      })}
      {bubbles.map((r) => (
        <Html key={`b${r.id}`} position={[r.x, 2.25, r.z]} center distanceFactor={14}>
          <div className="max-w-[180px] rounded-lg px-2.5 py-1.5 text-[11px] leading-snug font-body shadow-md"
            style={{ background: '#2B2B2E', color: '#FAF7F2' }}>
            {r.bubble!.text}
          </div>
        </Html>
      ))}
    </group>
  );
}

const _v = new THREE.Vector3();
let _cam: THREE.Camera | null = null;
export function setLabelCamera(c: THREE.Camera) { _cam = c; }
function cameraDist(x: number, z: number) {
  if (!_cam) return 999;
  return _v.set(x, 1, z).distanceTo(_cam.position);
}
