import * as THREE from 'three';
import { useStore } from './store';
import { DepartmentDef } from '@/api/types';

export interface DeptRT {
  id: string; name: string; bay: string; hue: number;
  capability: string; leadModel: string; workerModel: string;
}

// Physical bay wings in the (unchanged) layout
export const BAY_ZONES: Record<string, string> = {
  NW: 'researchBay', NE: 'engineeringBay', SW: 'dataBay', SE: 'contentBay',
};
// The static layout names each wing after its v1 department; the wing is a "slot",
// the run's department is the "tenant".
const STATIC_DEPT_BAY: Record<string, string> = {
  research: 'NW', engineering: 'NE', data: 'SW', content: 'SE',
};

const colors = new Map<string, THREE.Color>();
let current: DepartmentDef[] = [];

function derive(defs: DepartmentDef[]) {
  colors.clear();
  const hsl = { h: 0, s: 0, l: 0 };
  new THREE.Color(useStore.getState().accent).getHSL(hsl);
  for (const d of defs) {
    const hh = (((hsl.h * 360 + d.hue) % 360) + 360) % 360 / 360;
    colors.set(d.id, new THREE.Color().setHSL(
      hh,
      Math.min(0.62, Math.max(0.38, hsl.s)),
      Math.min(0.52, Math.max(0.38, hsl.l)),
    ));
  }
}

export function setDepartments(defs: DepartmentDef[]) {
  current = defs;
  derive(defs);
  useStore.setState({ departments: Object.fromEntries(defs.map((d) => [d.id, d])) });
}

export function clearDepartments() {
  current = [];
  colors.clear();
  useStore.setState({ departments: {} });
}

/** Dept color for a run-dynamic id. Neutral grey if unknown. */
export function deptColorRT(id: string | null | undefined): THREE.Color {
  if (!id) return new THREE.Color(0x3d3d44);
  if (colors.has(id)) return colors.get(id)!.clone();
  return new THREE.Color(0x8a8a8f);
}
export function hasDept(id: string | null | undefined): boolean { return !!id && colors.has(id); }

export function activeDeptIds(): string[] { return [...colors.keys()]; }

/** Zone id (layout) for a dept's bay; undefined if wing vacant. */
export function bayZoneOf(deptId: string | null | undefined): string | undefined {
  if (!deptId) return undefined;
  const d = useStore.getState().departments[deptId];
  return d ? BAY_ZONES[d.bay] : undefined;
}

/** Color of whichever run department currently occupies the wing that the static
 *  layout calls `staticDept` ('research' | 'engineering' | 'data' | 'content'). */
export function tenantColor(staticDept: string | null | undefined): THREE.Color | undefined {
  if (!staticDept) return undefined;
  const bay = STATIC_DEPT_BAY[staticDept];
  const def = current.find((d) => d.bay === bay);
  return def ? colors.get(def.id) : undefined;
}

/** Which layout bays have no tenant this run (for "Vacant wing" dimming). */
export function vacantBays(): string[] {
  const used = new Set(current.map((d) => d.bay));
  return Object.keys(BAY_ZONES).filter((b) => !used.has(b));
}

// Re-derive colors live when the company color changes (T5)
useStore.subscribe((s, prev) => {
  if (s.accent !== prev.accent && current.length) {
    derive(current);
    useStore.setState({ departments: { ...useStore.getState().departments } });
  }
});
