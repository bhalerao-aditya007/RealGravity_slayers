import * as THREE from 'three';
import { Dept, DEPT_HUE_OFF } from '@/config/office';
import { deptColorRT, hasDept, tenantColor } from '@/state/departments';

type MatEntry = { mat: THREE.MeshStandardMaterial | THREE.MeshBasicMaterial; base?: THREE.Color; accentTarget?: boolean; dept?: Dept };

const registry = new Map<string, MatEntry>();
let accentHex = '#E4572E';
const deptTargets = new Map<Dept, THREE.Color>();

function std(color: number, opts: Partial<THREE.MeshStandardMaterialParameters> = {}) {
  return new THREE.MeshStandardMaterial({ color, roughness: 0.85, metalness: 0.05, ...opts });
}

export function initMaterials() {
  if (registry.size) return;
  const defs: [string, THREE.MeshStandardMaterial | THREE.MeshBasicMaterial, THREE.Color | null, Dept | undefined][] = [
    ['wood', std(0xb98a5e, { roughness: 0.7 }), new THREE.Color(0xb98a5e), undefined],
    ['woodDark', std(0x8a6240, { roughness: 0.7 }), new THREE.Color(0x8a6240), undefined],
    ['charcoal', std(0x2b2b2e), new THREE.Color(0x2b2b2e), undefined],
    ['oat', std(0xe8dfd0), new THREE.Color(0xe8dfd0), undefined],
    ['white', std(0xfaf7f2), new THREE.Color(0xfaf7f2), undefined],
    ['steel', std(0xb8bcc2, { metalness: 0.6, roughness: 0.35 }), new THREE.Color(0xb8bcc2), undefined],
    ['metal', std(0x7d8288, { metalness: 0.5, roughness: 0.4 }), new THREE.Color(0x7d8288), undefined],
    ['clay', std(0xb46a4a), new THREE.Color(0xb46a4a), undefined],
    ['leaf', std(0x5d8a4a, { roughness: 1 }), new THREE.Color(0x5d8a4a), undefined],
    ['sofa', std(0x6e7f7a), new THREE.Color(0x6e7f7a), undefined],
    ['sofaDark', std(0x566561), new THREE.Color(0x566561), undefined],
    ['rug', std(0xd8cfc0), new THREE.Color(0xd8cfc0), undefined],
    ['artInner', std(0xd9c2ad), new THREE.Color(0xd9c2ad), undefined],
    ['wallSolid', std(0xded5c6), new THREE.Color(0xded5c6), undefined],
    ['accent', std(0xe4572e, { roughness: 0.6 }), new THREE.Color(0xe4572e), undefined],
    ['dept_research', std(0x7c5cd6), null, 'research'],
    ['dept_engineering', std(0x2f9e6e), null, 'engineering'],
    ['dept_data', std(0xc9962e), null, 'data'],
    ['dept_content', std(0x4a8fbf), null, 'content'],
    ['screen', new THREE.MeshBasicMaterial({ color: 0x2c4a63 }), null, undefined],
    ['led', new THREE.MeshBasicMaterial({ color: 0x35d07f }), null, undefined],
    ['lampGlow', new THREE.MeshBasicMaterial({ color: 0xf5e7c8 }), null, undefined],
    ['exitGreen', new THREE.MeshBasicMaterial({ color: 0x35d07f }), null, undefined],
    ['skyglass', new THREE.MeshStandardMaterial({ color: 0x9fd4e8, transparent: true, opacity: 0.45, roughness: 0.1 }), null, undefined],
  ];
  for (const [key, mat, base, dept] of defs)
    registry.set(key, { mat, base: base ?? undefined, accentTarget: key === 'accent', dept });
  deriveDepts();
}

function deriveDepts() {
  const hsl = new THREE.Color(accentHex);
  let h: number, s: number, l: number;
  ({ h, s, l } = hslToHsl(hsl));
  for (const dept of Object.keys(DEPT_HUE_OFF) as Dept[]) {
    const hh = (h + DEPT_HUE_OFF[dept]) % 360;
    const ss = Math.min(0.62, Math.max(0.38, s));
    const ll = Math.min(0.52, Math.max(0.38, l));
    deptTargets.set(dept, new THREE.Color().setHSL(hh / 360, ss, ll));
  }
}
function hslToHsl(c: THREE.Color) {
  const out = { h: 0, s: 0, l: 0 };
  c.getHSL(out);
  return out;
}

export function matFor(key: string): THREE.Material {
  initMaterials();
  return registry.get(key)?.mat ?? registry.get('white')!.mat;
}
export function screenMat() { return registry.get('screen')!.mat as THREE.MeshBasicMaterial; }
export function ledMat() { return registry.get('led')!.mat as THREE.MeshBasicMaterial; }

/** Run-dynamic department id first (Triage v3), static v1 map as the fallback for legacy tapes. */
export function deptColor(dept: string | null | undefined): THREE.Color {
  initMaterials();
  if (dept && hasDept(dept)) return deptColorRT(dept);
  const entry = dept ? registry.get(`dept_${dept}`) : undefined;
  if (entry) return (entry.mat as THREE.MeshStandardMaterial).color.clone();
  return deptColorRT(dept);
}

export function setAccent(hex: string) {
  initMaterials();
  accentHex = hex;
  deriveDepts();
}
export function getAccent() { return accentHex; }

// 300 ms eased recolor + day/night emissive blend
let tBlend = 1;
export function tickMaterials(dt: number) {
  tBlend = Math.min(1, tBlend + dt / 0.3);
  const k = easeOut(tBlend);
  for (const entry of registry.values()) {
    if (entry.accentTarget) {
      entry.mat.color.lerpColors(entry.base!, new THREE.Color(accentHex), k);
    } else if (entry.dept) {
      // the layout names each wing after a v1 department; the wing's color follows whoever is its
      // tenant this run (falls back to the accent-derived v1 color when the wing is vacant / legacy)
      const target = tenantColor(entry.dept) ?? deptTargets.get(entry.dept)!;
      entry.mat.color.lerp(target, Math.min(1, k * 1.2));
    }
  }
}
export function resetAccentBlend() { tBlend = 0; }
function easeOut(t: number) { return 1 - (1 - t) * (1 - t); }

export function registerDynamicDept(id: string, hex: string) {
  initMaterials();
  const key = `dept_${id}`;
  const entry = registry.get(key);
  if (entry) (entry.mat as THREE.MeshStandardMaterial).color.set(hex);
  else registry.set(key, { mat: std(new THREE.Color(hex).getHex()) });
}

// Blueprint mode: swap shared materials to a line style
let bp = false;
const bpMat = new THREE.MeshBasicMaterial({ color: 0xcfe3ff, wireframe: true });
const bpSaved = new Map<THREE.Material, THREE.Material>();
export function setBlueprint(on: boolean) {
  initMaterials();
  if (on === bp) return;
  bp = on;
  for (const { mat } of registry.values()) {
    if (on) { if (!bpSaved.has(mat)) { bpSaved.set(mat, mat); } }
  }
  (matFor as any).__bp = on; // StaticOffice checks this each frame and swaps instance materials
}
export function isBlueprint() { return bp; }
export function blueprintSwap(current: THREE.Material, fallback: THREE.Material): THREE.Material {
  return bp ? bpMat : (bpSaved.get(current) ?? current ?? fallback);
}
export const bpLineMat = bpMat;
