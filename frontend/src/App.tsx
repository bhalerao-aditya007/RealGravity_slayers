import { useEffect } from 'react';
import { useStore } from '@/state/store';
import { Landing } from '@/ui/Landing';
import { Workspace } from '@/ui/Workspace';
import { MODELS } from '@/mock/data';
import { USE_MOCK } from '@/api/client';
import { setAccent, resetAccentBlend } from '@/three/materials';
import { engine, GOLDEN_GOAL } from '@/state/engine';
import { validateLayout } from '@/nav/validate';
import { GRID } from '@/nav/grid';
import { buildHallLayout } from '@/swarm/hallLayout';
import { validateHall } from '@/swarm/validateHall';

export default function App() {
  const phase = useStore((s) => s.phase);
  const appMode = useStore((s) => s.appMode);
  const swarmSize = useStore((s) => s.swarmSize);

  useEffect(() => {
    // startup validator — the app refuses to run on an invalid layout
    const errs = validateLayout(GRID);
    if (errs.length) throw new Error('Layout validation failed:\n' + errs.join('\n'));
    if ((import.meta as any).env?.DEV) {
      for (const n of [10, 20, 30, 40, 50] as const) {
        const issues = validateHall(buildHallLayout(n));
        if (issues.length) console.warn(`[swarm] hall validation warning for N=${n}:`, issues);
      }
    }
  }, []);

  useEffect(() => {
    if (appMode === 'swarm' && phase === 'landing') {
      import('@/swarm/directorRef').then(({ rebuildSwarmDirector }) => {
        rebuildSwarmDirector(swarmSize);
      });
    }
  }, [appMode, swarmSize, phase]);

  useEffect(() => {
    // brand color -> materials + CSS vars
    const hex = useStore.getState().accent;
    document.documentElement.style.setProperty('--accent', hex);
    setAccent(hex); resetAccentBlend();
    if (USE_MOCK) useStore.setState({ models: MODELS });
    else {
      fetch(((import.meta as any).env?.VITE_API_URL ?? 'http://localhost:8000') + '/api/models')
        .then((r) => r.json())
        .then((models) => useStore.setState({ models, demoMode: false }))
        .catch(() => useStore.setState({ offline: true, models: MODELS }));
    }
  }, []);

  // landing: loop the ambient run in the background (office or swarm)
  useEffect(() => {
    if (phase === 'landing') {
      engine.start(appMode === 'swarm' ? 'Best go-to-market plan for a student-run coffee cart' : GOLDEN_GOAL);
      engine.setSpeed(2);
    }
  }, [phase, appMode]);

  return <div className="h-full w-full">{phase === 'landing' ? <Landing /> : <Workspace />}</div>;
}
