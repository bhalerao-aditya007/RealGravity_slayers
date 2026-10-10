import { useEffect, useRef } from 'react';
import * as THREE from 'three';
import { Canvas, useFrame, useThree } from '@react-three/fiber';
import { OrbitControls } from '@react-three/drei';
import type { OrbitControls as OrbitControlsImpl } from 'three-stdlib';
import { StaticOffice } from './StaticOffice';
import { Doors } from './Doors';
import { Chairs } from './Chairs';
import { AgentsLayer } from './AgentsLayer';
import { FxLayer } from './FxLayer';
import { LabelsLayer, setLabelCamera } from './LabelsLayer';
import { cameraCtl, PRESETS } from './cameraCtl';
import { useStore } from '@/state/store';
import { director } from '@/sim/director';
import { LAYOUT } from '@/config/layout';
import { tickMaterials, setBlueprint } from './materials';
import { updateWhiteboard, whiteboardTexture } from './textures';

function CameraRig({ ambient }: { ambient: boolean }) {
  const controls = useRef<OrbitControlsImpl>(null);
  const { camera } = useThree();
  const tween = useRef<{ t: number; fromP: THREE.Vector3; toP: THREE.Vector3; fromL: THREE.Vector3; toL: THREE.Vector3 } | null>(null);
  const lastZone = useRef({ id: '', t: 0 });

  useEffect(() => {
    const fly = (pos: [number, number, number], look: [number, number, number]) => {
      if (useStore.getState().settings.reducedMotion) {
        camera.position.set(...pos); controls.current?.target.set(...look); controls.current?.update();
        return;
      }
      tween.current = {
        t: 0,
        fromP: camera.position.clone(), toP: new THREE.Vector3(...pos),
        fromL: controls.current!.target.clone(), toL: new THREE.Vector3(...look),
      };
    };
    cameraCtl.flyTo = fly;
    cameraCtl.jumpZone = (zoneId: string) => {
      const z = LAYOUT.zones.find((zn) => zn.id === zoneId);
      if (!z?.jump) return;
      fly([z.jump[0] + 14, 16, z.jump[1] + 16], [z.jump[0], 0.8, z.jump[1]]);
    };
    cameraCtl.fit = () => fly(PRESETS.iso.pos, PRESETS.iso.look);
    cameraCtl.setView = (v) => fly(v === 'top' ? PRESETS.top.pos : PRESETS.iso.pos, v === 'top' ? PRESETS.top.look : PRESETS.iso.look);
    cameraCtl.follow = (id) => {
      if (!id) return;
      const rt = director.rt(id); if (!rt) return;
      const off = new THREE.Vector3(5, 4.5, 5);
      const tgt = new THREE.Vector3(rt.x, 1, rt.z);
      camera.position.lerp(tgt.clone().add(off), 0.06);
      controls.current!.target.lerp(tgt, 0.12);
    };
  }, [camera]);

  useFrame((_, dt) => {
    setLabelCamera(camera);
    tickMaterials(Math.min(dt, 0.05));
    const s = useStore.getState();
    // FIX F11: the Blueprint toggle only changed the floor texture; furniture materials were never swapped
    setBlueprint(s.view === 'blueprint');
    const c = controls.current; if (!c) return;

    if (ambient) {
      // landing: slow orbit
      const t = performance.now() / 1000 * 0.06;
      camera.position.set(Math.sin(t) * 52, 40, Math.cos(t) * 52 + 4);
      c.target.set(0, 0, 2); c.update(); c.enabled = false;
      return;
    }
    c.enabled = true;
    if (tween.current) {
      const tw = tween.current;
      tw.t = Math.min(1, tw.t + dt / 0.8);
      const e = 1 - Math.pow(1 - tw.t, 3);
      camera.position.lerpVectors(tw.fromP, tw.toP, e);
      c.target.lerpVectors(tw.fromL, tw.toL, e);
      c.update();
      if (tw.t >= 1) tween.current = null;
      return;
    }
    // cinematic auto-director
    if (s.followId) return;
    const now = performance.now() / 1000;
    if (s.view !== 'blueprint' && now - lastZone.current.t > 14 && !s.selected) {
      lastZone.current.t = now;
      const hottest = Object.entries(director.heat).sort((a, b) => b[1] - a[1])[0];
      if (hottest && hottest[1] > 1) cameraCtl.jumpZone(hottest[0]);
    }
  });

  return (
    <OrbitControls
      ref={controls as any}
      dampingFactor={0.08}
      maxPolarAngle={Math.PI / 2.05}
      minPolarAngle={0.12}
      minDistance={6}
      maxDistance={95}
      target={[0, 0, 2]}
      enablePan
      keyPanSpeed={0}
    />
  );
}

function Lights() {
  const sun = useRef<THREE.DirectionalLight>(null);
  const hemi = useRef<THREE.HemisphereLight>(null);
  const target = useRef<THREE.Object3D>(null);
  const { scene } = useThree();
  useEffect(() => { if (sun.current && target.current) { sun.current.target = target.current; scene.add(target.current); } }, [scene]);
  useFrame((_, dt) => {
    const s = useStore.getState();
    const nightMix = s.night ? 1 : 0;
    if (sun.current) {
      sun.current.intensity = THREE.MathUtils.lerp(sun.current.intensity, nightMix ? 0.12 : 1.35, dt * 2);
      sun.current.color.set(nightMix ? 0x8fa3c8 : 0xffe8c8);
    }
    if (hemi.current) hemi.current.intensity = THREE.MathUtils.lerp(hemi.current.intensity, nightMix ? 0.28 : 0.55, dt * 2);
    scene.background = new THREE.Color(nightMix ? 0x14181f : 0xf3ede2);
  });
  const shadowSize = useStore((s) => s.settings.shadows);
  const mapSize = shadowSize === 'high' ? 4096 : shadowSize === 'med' ? 2048 : 1024;
  return (
    <>
      <object3D ref={target} position={[4, 0, 2]} />
      <directionalLight
        ref={sun}
        position={[38, 52, 30]}
        castShadow
        intensity={1.35}
        color="#ffe8c8"
        shadow-mapSize-width={mapSize}
        shadow-mapSize-height={mapSize}
        shadow-camera-left={-60}
        shadow-camera-right={60}
        shadow-camera-top={45}
        shadow-camera-bottom={-45}
        shadow-camera-near={5}
        shadow-camera-far={140}
        shadow-bias={-0.0006}
        shadow-normalBias={0.02}
      />
      <hemisphereLight ref={hemi} args={['#f5ede0', '#8a8378', 0.55]} />
      <ambientLight intensity={0.18} />
    </>
  );
}

function WhiteboardSync() {
  const planOutline = useStore((s) => s.planOutline);
  useEffect(() => { updateWhiteboard(planOutline); }, [planOutline]);
  const wb = LAYOUT.items.find((i) => i.type === 'whiteboard')!;
  return (
    // FIX F20: the plan texture was never attached (map={undefined}) and the plane sat inside the board (z-fighting)
    <mesh position={[wb.x, 1.5, wb.z + 0.06]} rotation={[0, wb.rot + Math.PI, 0]}>
      <planeGeometry args={[3.1, 1.32]} />
      <meshBasicMaterial map={whiteboardTexture()} />
    </mesh>
  );
}

export function OfficeCanvas({ ambient = false }: { ambient?: boolean }) {
  const post = useStore((s) => s.settings.post);
  const dpr = useStore((s) => (s.settings.shadows === 'high' ? [1, 2] : [1, 1.5]));
  useEffect(() => {
    return () => { director.reset(); };
  }, []);
  return (
    <Canvas
      shadows
      dpr={dpr as [number, number]}
      camera={{ position: PRESETS.iso.pos, fov: 42, near: 0.5, far: 400 }}
      gl={{ antialias: true, powerPreference: 'high-performance' }}
      onCreated={({ gl }) => {
        gl.toneMapping = post ? THREE.ACESFilmicToneMapping : THREE.NoToneMapping;
        gl.toneMappingExposure = 1.05;
      }}
      style={{ background: 'transparent' }}
    >
      <CameraRig ambient={ambient} />
      <Lights />
      <StaticOffice />
      <Doors />
      <Chairs />
      <WhiteboardSync />
      <AgentsLayer />
      <FxLayer />
      <LabelsLayer />
    </Canvas>
  );
}
