import { registerDynamicDept } from '@/three/materials';
import * as THREE from 'three';

export interface RoleDef { id: string; label: string; persona: string; lens?: string; hue: number }
export const ROLES: RoleDef[] = [
  { id: 'strategist', label: 'Strategist', hue: 150, persona: 'Plays three moves ahead and says so.' },
  { id: 'skeptic', label: 'Skeptic', hue: 205, persona: 'Asks what would have to be true for this to fail.' },
  { id: 'expert', label: 'Domain Expert', hue: 58, persona: 'Brings field data and prior art.' },
  { id: 'creative', label: 'Creative', hue: 300, persona: 'Proposes the option nobody expected.' },
  { id: 'pragmatist', label: 'Pragmatist', hue: 100, persona: 'Optimizes for shipping this quarter.' },
  { id: 'risk', label: 'Risk Analyst', hue: 0, persona: 'Prices the downside of every plan.' },
  { id: 'advocate', label: 'User Advocate', hue: 190, persona: 'Speaks for the people actually using it.' },
  { id: 'factchecker', label: 'Fact-Checker', hue: 45, persona: 'Cites sources or flags the claim.' },
  { id: 'engineer', label: 'Engineer', hue: 262, persona: 'Asks how it gets built and maintained.' },
  { id: 'economist', label: 'Economist', hue: 25, persona: 'Models cost, incentives, and trade-offs.' },
];
export const roleDef = (id: string) => { const r = ROLES.find((r) => r.id === id) ?? ROLES[0]; return { ...r, lens: r.lens || r.persona }; };
export const roleAt = (i: number) => ROLES[i % ROLES.length];

/** Derive readable role colors from the accent (same clamped-S/L trick as departments). */
export function applyRoleColors(accentHex: string) {
  const hsl = { h: 0, s: 0, l: 0 };
  new THREE.Color(accentHex).getHSL(hsl);
  for (const r of ROLES) {
    const hh = ((((hsl.h * 360 + r.hue) % 360) + 360) % 360) / 360;
    const c = new THREE.Color().setHSL(hh,
      Math.min(0.62, Math.max(0.38, hsl.s)),
      Math.min(0.52, Math.max(0.38, hsl.l)));
    registerDynamicDept(r.id, `#${c.getHexString()}`);
  }
}
export function roleCss(id: string): string {
  // mirror of applyRoleColors for UI chips
  const hsl = { h: 0, s: 0, l: 0 };
  new THREE.Color(getComputedStyle(document.documentElement).getPropertyValue('--accent').trim() || '#E4572E').getHSL(hsl);
  const r = roleDef(id);
  const hh = ((((hsl.h * 360 + r.hue) % 360) + 360) % 360) / 360;
  return `#${new THREE.Color().setHSL(hh, Math.min(0.62, Math.max(0.38, hsl.s)), Math.min(0.52, Math.max(0.38, hsl.l))).getHexString()}`;
}
