import { useEffect, useMemo, Component, ReactNode, useRef } from 'react';
import * as THREE from 'three';
import { Canvas, useFrame, useThree } from '@react-three/fiber';
import { OrbitControls } from '@react-three/drei';
import type { OrbitControls as OrbitControlsImpl } from 'three-stdlib';
import { useStore } from '@/state/store';
import { buildHallLayout, HallLayout } from './hallLayout';
import { HallProps } from './HallProps';
import { IdeaBoard } from './IdeaBoard';
import { SwarmAgents } from './SwarmAgents';
import { swarmDirector } from './directorRef';

class CanvasBoundary extends Component<{ children: ReactNode }, { err: string | null }> {
  state = { err: null as string | null };
  static getDerivedStateFromError(e: any) { return { err: String(e?.message ?? e) }; }
  render() {
    if (this.state.err) return (
      <div className="absolute inset-0 flex flex-col items-center justify-center gap-3 bg-paper">
        <div className="font-heading font-bold">The swarm hall failed to render</div>
        <div className="font-mono text-xs text-ink/60 max-w-md text-center">{this.state.err}</div>
        <button onClick={() => location.reload()} className="rounded-xl px-4 py-2 text-white text-sm" style={{ background: 'var(--accent)' }}>Reload scene</button>
      </div>
    );
    return this.props.children;
  }
}

function Lights({ layout }: { layout: HallLayout }) {
  const sun = useRef<THREE.DirectionalLight>(null);
  const hemi = useRef<THREE.HemisphereLight>(null);
  useFrame((_, dt) => {
    const n = useStore.getState().night ? 1 : 0;
    if (sun.current) {
      sun.current.intensity = THREE.MathUtils.lerp(sun.current.intensity, n ? 0.1 : 1.3, dt * 2);
      sun.current.color.set(n ? 0x8fa3c8 : 0xffe8c8);
    }
    if (hemi.current) hemi.current.intensity = THREE.MathUtils.lerp(hemi.current.intensity, n ? 0.3 : 0.55, dt * 2);
  });
  const size = Math.max(layout.hall.width, layout.hall.depth);
  return (
    <>
      <directionalLight ref={sun} position={[size * 0.5, size * 0.7, size * 0.4]} castShadow intensity={1.3}
        color="#ffe8c8" shadow-mapSize={[2048, 2048]}
        shadow-camera-left={-size * 0.7} shadow-camera-right={size * 0.7}
        shadow-camera-top={size * 0.6} shadow-camera-bottom={-size * 0.6}
        shadow-camera-near={2} shadow-camera-far={size * 2.5}
        shadow-bias={-0.0006} shadow-normalBias={0.02} />
      <hemisphereLight ref={hemi} args={['#f5ede0', '#8a8378', 0.55]} />
      <ambientLight intensity={0.18} />
    </>
  );
}

function Sky() {
  const { scene } = useThree();
  useFrame(() => {
    const want = new THREE.Color(useStore.getState().night ? 0x14181f : 0xf3ede2);
    const cur = scene.background as THREE.Color | null;
    if (!cur || !cur.equals(want)) scene.background = want;
  });
  return null;
}

function Rig({ ambient, layout }: { ambient?: boolean; layout: HallLayout }) {
  const controls = useRef<OrbitControlsImpl>(null);
  const { camera } = useThree();
  useFrame(() => {
    const c = controls.current; if (!c) return;
    if (ambient) {
      const t = (performance.now() / 1000) * 0.05;
      camera.position.set(Math.sin(t) * layout.hall.width * 0.6, layout.hall.width * 0.45, Math.cos(t) * layout.hall.depth * 0.6);
      c.target.set(0, 1, 0); c.update(); c.enabled = false; return;
    }
    c.enabled = true;
  });
  return (
    <OrbitControls ref={controls} dampingFactor={0.08}
      maxPolarAngle={Math.PI / 2.05} minPolarAngle={0.15}
      minDistance={4} maxDistance={Math.max(layout.hall.width, layout.hall.depth) * 1.6}
      target={[0, 0.8, 0]} />
  );
}

export function SwarmCanvas({ ambient = false }: { ambient?: boolean }) {
  const layout = useMemo(() => swarmDirector.layout ?? buildHallLayout(useStore.getState().swarmSize), []);
  useEffect(() => () => { /* geometries in JSX are disposed by R3F; canvas textures dispose in their owners */ }, []);
  return (
    <CanvasBoundary>
      <Canvas shadows dpr={[1, 1.75]}
        camera={{ position: layout.cameraFit.pos, fov: 42, near: 0.5, far: 300 }}
        gl={{ antialias: true, powerPreference: 'default' }}
        onCreated={({ gl }) => {
          gl.toneMapping = THREE.ACESFilmicToneMapping;
          const onLost = (e: Event) => { e.preventDefault(); useStore.setState({ toast: 'Graphics context lost — click Reload scene.' } as any); };
          gl.domElement.addEventListener('webglcontextlost', onLost);
          const onRestored = () => {
            useStore.setState({ toast: 'Graphics context restored.' } as any);
          };
          gl.domElement.addEventListener('webglcontextrestored', onRestored);
        }}>
        <Rig ambient={ambient} layout={layout} />
        <Lights layout={layout} />
        <Sky />
        <HallProps layout={layout} />
        {!ambient && <IdeaBoard layout={layout} />}
        {!ambient && <SwarmAgents layout={layout} />}
      </Canvas>
    </CanvasBoundary>
  );
}
