import { useEffect } from 'react';
import { useStore } from '@/state/store';
import { OfficeCanvas } from '@/three/OfficeCanvas';
import { Toolbar } from './Toolbar';
import { LeftPanel } from './LeftPanel';
import { EventLog } from './EventLog';
import { Inspector } from './Inspector';
import { ComputeDrawer } from './ComputeDrawer';
import { ReportView } from './ReportView';
import { SettingsModal } from './SettingsModal';
import { Minimap } from './Minimap';
import { TriageBanner } from './TriageBanner';
import { PermissionPanel } from './PermissionPanel';
import { engine } from '@/state/engine';
import { director } from '@/sim/director';
import { cameraCtl } from '@/three/cameraCtl';
import { Icon, I } from './Icons';
import { SwarmCanvas } from '@/swarm/SwarmCanvas';
import { SwarmPanel, SwarmRoster } from '@/swarm/SwarmPanel';

export function Workspace() {
  const offline = useStore((s) => s.offline);
  const toast = useStore((s) => s.toast);
  const dev = useStore((s) => s.dev);
  const appMode = useStore((s) => s.appMode);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.target as HTMLElement)?.tagName === 'INPUT' || (e.target as HTMLElement)?.tagName === 'TEXTAREA') return;
      const s = useStore.getState();
      switch (e.key.toLowerCase()) {
        case ' ': e.preventDefault(); engine.pause(!s.paused); break;
        case 'f': if (s.selected) useStore.setState({ followId: s.followId === s.selected ? null : s.selected }); break;
        case 'g': useStore.setState({ flows: !s.flows }); break;
        case 'b': useStore.setState({ view: s.view === '3d' ? 'blueprint' : '3d' }); cameraCtl.setView(s.view === '3d' ? 'top' : '3d'); break;
        case 'd': useStore.setState({ dev: !s.dev }); break;
        case 'escape': useStore.setState({ inspectorOpen: false, settingsOpen: false, followId: null }); break;
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  return (
    <div className="h-full flex flex-col bg-paper">
      <Toolbar />
      <div className="flex-1 flex min-h-0 relative">
        {appMode === 'swarm' ? <SwarmRoster /> : <LeftPanel />}
        <div className="flex-1 relative min-w-0">
          {appMode === 'swarm' ? <SwarmCanvas /> : <OfficeCanvas />}
          {appMode !== 'swarm' && <Minimap />}
          {appMode !== 'swarm' && <TriageBanner />}
          <PermissionPanel />
          <button
            onClick={() => useStore.setState({ drawerOpen: !useStore.getState().drawerOpen }) }
            className="absolute top-4 right-4 z-20 rounded-xl px-3 py-2 text-xs font-heading text-white shadow-md flex items-center gap-1.5"
            style={{ background: 'var(--accent)' }}>
            <Icon d={appMode === 'swarm' ? I.users : I.chart} size={13} /> {appMode === 'swarm' ? 'Swarm Panel' : 'Compute & Cost'}
          </button>
          <Inspector />
          {appMode === 'swarm' ? <SwarmPanel /> : <ComputeDrawer />}
          <ReportView />
          <SettingsModal />
          {offline && (
            <div className="absolute top-4 left-1/2 -translate-x-1/2 z-30 rounded-xl bg-[#d64545] text-white text-xs font-heading px-4 py-2 shadow-lg flex items-center gap-2">
              Backend offline — showing demo mode
              <button className="underline" onClick={() => useStore.setState({ offline: false })}>dismiss</button>
            </div>
          )}
          {toast && (
            <div className="absolute bottom-4 left-1/2 -translate-x-1/2 z-30 rounded-xl bg-ink text-paper text-xs font-body px-4 py-2 shadow-lg">
              {toast}
              <button className="ml-3 underline" onClick={() => useStore.setState({ toast: null })}>ok</button>
            </div>
          )}
          {dev && <DevPanel />}
        </div>
      </div>
      <EventLog />
    </div>
  );
}

function DevPanel() {
  const agents = director.runtimes.filter((r) => r.state !== 'gone');
  const stuck = (window as any).__deskmates_stuckCount ?? 0;
  return (
    <div className="absolute top-16 right-4 z-20 rounded-xl border border-ink/15 bg-ink/90 text-paper p-3 font-mono text-[10px] leading-5 w-52">
      <div className="text-[#9fe8b8] mb-1">DEV OVERLAY (D)</div>
      <div>agents: {agents.length}</div>
      <div>walking: {agents.filter((a) => a.state === 'walk').length}</div>
      <div>seated: {agents.filter((a) => a.state === 'seated').length}</div>
      <div>chair slides: {director.chairOffsets.size}</div>
      <div>door queues: {director.doorQueueCount()}</div>
      <div className="text-[#e8c46a]">stuck repaths: {stuck}</div>
      <div className="mt-1 opacity-60">grid: 0.25m · A* cached</div>
    </div>
  );
}
