export interface CamTarget { pos: [number, number, number]; look: [number, number, number] }
export const cameraCtl = {
  flyTo: (_pos: [number, number, number], _look: [number, number, number]) => {},
  jumpZone: (_zoneId: string) => {},
  follow: (_agentId: string | null) => {},
  setView: (_v: '3d' | 'blueprint' | 'top') => {},
  fit: () => {},
};
export const PRESETS: Record<string, CamTarget> = {
  iso: { pos: [42, 46, 52], look: [0, 0, 2] },
  top: { pos: [0.01, 78, 6], look: [0, 0, 2] },
};
