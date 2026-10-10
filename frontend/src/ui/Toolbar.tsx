import { useStore } from '@/state/store';
import { Icon, I } from './Icons';
import { cameraCtl } from '@/three/cameraCtl';
import { engine } from '@/state/engine';
import { LAYOUT } from '@/config/layout';
import { setAccent, resetAccentBlend } from '@/three/materials';
import { USE_MOCK } from '@/api/client';

const SPEEDS = [1, 10, 60];

export function Toolbar() {
  const s = useStore();
  const applyAccent = (hex: string) => {
    useStore.setState({ accent: hex });
    document.documentElement.style.setProperty('--accent', hex);
    setAccent(hex);
    resetAccentBlend();
  };

  return (
    <header className="h-12 shrink-0 flex items-center justify-between px-3 border-b border-ink/10 bg-[#FAF7F2]/95 backdrop-blur-md relative z-20 overflow-x-auto no-scrollbar shadow-xs">
      {/* Left section: Branding & View Modes */}
      <div className="flex items-center gap-2 shrink-0">
        <div className="flex items-center gap-2 cursor-pointer select-none" onClick={() => cameraCtl.fit()}>
          <div
            className="w-7 h-7 rounded-lg flex items-center justify-center shadow-xs transition-transform hover:scale-105"
            style={{
              background: 'linear-gradient(135deg, var(--accent) 0%, #2B2B2E 100%)',
            }}
          >
            <span className="font-heading font-black text-white text-xs tracking-wider">G</span>
          </div>
          <div className="flex items-baseline gap-1.5">
            <span className="font-heading font-bold text-sm tracking-tight text-ink">GravityDesk</span>
            <span className="text-[9px] font-mono text-ink/40 uppercase tracking-widest hidden sm:inline">3D</span>
          </div>
        </div>

        <div className="w-px h-5 bg-ink/10 mx-0.5" />

        <span className="text-[10px] font-mono uppercase px-2 py-1 rounded-full whitespace-nowrap"
          style={{ background: s.appMode === 'swarm' ? 'var(--accent)' : 'transparent', color: s.appMode === 'swarm' ? '#fff' : 'var(--accent)', border: '1px solid var(--accent)' }}>
          {s.appMode === 'swarm' ? `Swarm · ${s.swarmSize} agents` : 'Office'}
        </span>

        {/* Accent Picker */}
        <label className="relative cursor-pointer flex items-center" title="Theme accent color">
          <input
            type="color"
            value={s.accent}
            onChange={(e) => applyAccent(e.target.value)}
            className="sr-only"
          />
          <div
            className="w-5 h-5 rounded-full border-2 border-white shadow-xs transition-transform hover:scale-110"
            style={{ background: s.accent }}
          />
        </label>

        {/* 3D / Blueprint toggle */}
        <div className="flex rounded-lg border border-ink/15 overflow-hidden text-[11px] font-heading bg-white/70 shadow-xs">
          {(['3d', 'blueprint'] as const).map((v) => (
            <button
              key={v}
              onClick={() => {
                useStore.setState({ view: v });
                cameraCtl.setView(v === '3d' ? '3d' : 'top');
              }}
              className={`px-2 py-1 flex items-center gap-1 transition-all ${
                s.view === v ? 'text-white font-medium shadow-xs' : 'text-ink/65 hover:text-ink'
              }`}
              style={s.view === v ? { background: 'var(--accent)' } : {}}
            >
              <Icon d={v === '3d' ? I.cube : I.grid} size={12} />
              <span className="hidden sm:inline">{v === '3d' ? '3D Office' : 'Blueprint'}</span>
            </button>
          ))}
        </div>

        {s.appMode === 'office' && (
          <ToolbarBtn
            active={s.flows}
            onClick={() => useStore.setState({ flows: !s.flows })}
            icon={I.flow}
            label="Flows"
          />
        )}

        <ToolbarBtn
          active={s.night}
          onClick={() => useStore.setState({ night: !s.night })}
          icon={s.night ? I.sun : I.moon}
          label={s.night ? 'Day' : 'Night'}
        />

        {/* Sim Speed */}
        <div className="flex rounded-lg border border-ink/15 overflow-hidden font-mono text-[10px] bg-white/70 shadow-xs">
          {SPEEDS.map((f) => (
            <button
              key={f}
              onClick={() => {
                useStore.setState({ speed: f });
                engine.setSpeed(f);
              }}
              className={`px-1.5 py-1 transition-all ${
                s.speed === f ? 'text-white font-bold' : 'text-ink/65 hover:text-ink'
              }`}
              style={s.speed === f ? { background: 'var(--accent)' } : {}}
            >
              {f}x
            </button>
          ))}
        </div>
      </div>

      {/* Middle section: Sim / Real stats & badges */}
      <div className="flex items-center gap-1.5 shrink-0 px-2">
        {s.triage && (
          <span className="text-[9.5px] font-mono uppercase px-2 py-0.5 rounded-full border border-ink/20 text-ink/70 bg-white/60 whitespace-nowrap hidden lg:inline">
            {s.triage.break_policy.pace === 'sprint'
              ? 'Sprint'
              : s.triage.break_policy.pace === 'workday'
              ? 'Workday'
              : 'Normal'}
          </span>
        )}
        <span className="text-[9.5px] font-mono uppercase px-2 py-0.5 rounded-full border border-ink/20 text-ink/70 bg-white/60 hidden xl:inline">
          {s.profile}
        </span>
        <span className="text-[9.5px] font-mono uppercase px-2 py-0.5 rounded-full border border-ink/20 text-ink/70 bg-white/60 hidden 2xl:inline">
          {s.sandboxMode}
        </span>

        <div className="font-mono text-[11px] tabular text-ink/70 flex items-center gap-1.5 bg-white/60 px-2 py-0.5 rounded-md border border-ink/10 hidden md:flex">
          <span title="Simulated Office Time" className="font-semibold text-ink/80">{s.simClock}</span>
          <span className="text-ink/30">|</span>
          <span title="Real Elapsed Time" className="text-ink/60">
            {Math.floor(s.realElapsed / 60)}:{String(Math.floor(s.realElapsed % 60)).padStart(2, '0')}
          </span>
        </div>
      </div>

      {/* Right section: Models, Mode, Actions, Zones */}
      <div className="flex items-center gap-1.5 shrink-0">
        <select
          value={s.modelId}
          onChange={(e) => useStore.setState({ modelId: e.target.value })}
          className="rounded-lg border border-ink/15 bg-white/90 px-1.5 py-1 text-[10.5px] font-mono max-w-[130px] truncate text-ink/80 outline-none focus:border-ink/40 shadow-xs hidden lg:block"
          title="Active Model Routing"
        >
          {s.models.map((m) => (
            <option key={m.id} value={m.id}>
              {m.label}
            </option>
          ))}
        </select>

        {/* Live / Replay switch */}
        <div className="flex rounded-lg border border-ink/15 overflow-hidden text-[10.5px] font-heading bg-white/70 shadow-xs">
          {(['live', 'replay'] as const).map((m) => (
            <button
              key={m}
              onClick={() => useStore.setState({ mode: m })}
              className={`px-2 py-1 transition-all ${
                s.mode === m ? 'text-white font-medium' : 'text-ink/65 hover:text-ink'
              }`}
              style={s.mode === m ? { background: 'var(--accent)' } : {}}
            >
              {m === 'live' ? 'Live' : 'Replay'}
            </button>
          ))}
        </div>

        <ToolbarBtn
          onClick={() => useStore.setState({ reportOpen: true })}
          icon={I.download}
          label="Export"
          disabled={!s.report}
        />

        <ToolbarBtn
          active={s.dev}
          onClick={() => useStore.setState({ dev: !s.dev })}
          icon={I.bug}
          label="Dev"
        />

        <ToolbarBtn
          onClick={() => useStore.setState({ settingsOpen: true })}
          icon={I.settings}
          label=""
        />

        <select
          onChange={(e) => e.target.value && cameraCtl.jumpZone(e.target.value)}
          defaultValue=""
          className="rounded-lg border border-ink/15 bg-white/90 px-1.5 py-1 text-[10.5px] font-body max-w-[110px] truncate text-ink/80 outline-none focus:border-ink/40 shadow-xs hidden xl:block"
        >
          <option value="">Jump zone</option>
          {LAYOUT.zones.map((z) => (
            <option key={z.id} value={z.id}>
              {z.name}
            </option>
          ))}
        </select>

        {USE_MOCK ? (
          <span
            className="text-[9.5px] font-mono px-1.5 py-0.5 rounded border border-amber-500/30 bg-amber-50 text-amber-700 font-medium"
            title="Running in local contract simulation"
          >
            MOCK
          </span>
        ) : (
          <span
            className="text-[9.5px] font-mono px-1.5 py-0.5 rounded border border-emerald-500/30 bg-emerald-50 text-emerald-700 font-medium flex items-center gap-1"
            title="Connected to real Bridge (:8000)"
          >
            <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse" />
            LIVE
          </span>
        )}
      </div>
    </header>
  );
}

function ToolbarBtn({
  active,
  onClick,
  icon,
  label,
  disabled,
}: {
  active?: boolean;
  onClick: () => void;
  icon: string;
  label: string;
  disabled?: boolean;
}) {
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      title={label || 'Action'}
      className={`flex items-center gap-1 rounded-lg px-2 py-1 text-[11px] border transition-all ${
        active
          ? 'border-transparent text-white shadow-xs'
          : 'border-ink/15 text-ink/75 bg-white/70 hover:border-ink/40 hover:bg-white'
      } ${disabled ? 'opacity-40 pointer-events-none' : ''}`}
      style={active ? { background: 'var(--accent)' } : {}}
    >
      <Icon d={icon} size={12} />
      {label && <span className="font-heading hidden md:inline">{label}</span>}
    </button>
  );
}

