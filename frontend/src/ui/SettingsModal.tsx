import { motion } from 'framer-motion';
import { useStore } from '@/state/store';
import { Icon, I } from './Icons';
import { sfx } from '@/sim/sound';

export function SettingsModal() {
  const open = useStore((s) => s.settingsOpen);
  const st = useStore((s) => s.settings);
  const models = useStore((s) => s.models);
  const modelId = useStore((s) => s.modelId);
  if (!open) return null;
  const set = (patch: Partial<typeof st>) => useStore.setState({ settings: { ...st, ...patch } });
  return (
    <div className="absolute inset-0 z-40 bg-ink/40 backdrop-blur-sm flex items-center justify-center"
      onClick={(e) => e.target === e.currentTarget && useStore.setState({ settingsOpen: false })}>
      <motion.div initial={{ scale: 0.95, opacity: 0 }} animate={{ scale: 1, opacity: 1 }}
        className="w-[420px] rounded-2xl bg-paper border border-ink/10 shadow-2xl p-6">
        <div className="flex items-center justify-between mb-5">
          <h2 className="font-heading font-bold text-lg flex items-center gap-2"><Icon d={I.settings} size={16} /> Settings</h2>
          <button onClick={() => useStore.setState({ settingsOpen: false })} className="text-ink/40"><Icon d={I.x} size={16} /></button>
        </div>
        <div className="space-y-4 text-sm font-body">
          <Row label="Model">
            <select value={modelId} onChange={(e) => useStore.setState({ modelId: e.target.value })} className="input">
              {models.map((m) => <option key={m.id} value={m.id}>{m.label}</option>)}
            </select>
          </Row>
          <Row label="Concurrency limit">
            <input type="range" min={1} max={8} value={st.concurrency}
              onChange={(e) => set({ concurrency: +e.target.value })} />
            <span className="font-mono text-xs w-6">{st.concurrency}</span>
          </Row>
          <Row label="Shadow quality">
            <div className="flex rounded-lg border border-ink/15 overflow-hidden text-xs">
              {(['low', 'med', 'high'] as const).map((q) => (
                <button key={q} onClick={() => set({ shadows: q })}
                  className={`px-2.5 py-1 ${st.shadows === q ? 'text-white' : ''}`}
                  style={st.shadows === q ? { background: 'var(--accent)' } : {}}>{q}</button>
              ))}
            </div>
          </Row>
          <Row label="Filmic grade (post)">
            <Toggle on={st.post} onClick={() => set({ post: !st.post })} />
          </Row>
          <Row label="Sound">
            <Toggle on={st.sound} onClick={() => { set({ sound: !st.sound }); sfx.setEnabled(!st.sound); }} />
          </Row>
          <Row label="Reduced motion">
            <Toggle on={st.reducedMotion} onClick={() => set({ reducedMotion: !st.reducedMotion })} />
          </Row>
          <Row label={`Agent LOD distance (${st.lodDist}m)`}>
            <input type="range" min={10} max={60} value={st.lodDist} onChange={(e) => set({ lodDist: +e.target.value })} />
          </Row>
          <p className="text-[11px] text-ink/50 font-body">
            Speed changes animation only, never execution. Config changes PATCH /api/config when a live backend is connected.
          </p>
        </div>
      </motion.div>
    </div>
  );
}
const Row = ({ label, children }: { label: string; children: React.ReactNode }) => (
  <div className="flex items-center justify-between gap-3">
    <span className="text-ink/70">{label}</span>
    <div className="flex items-center gap-2">{children}</div>
  </div>
);
const Toggle = ({ on, onClick }: { on: boolean; onClick: () => void }) => (
  <button onClick={onClick} className={`w-10 h-6 rounded-full relative transition-colors ${on ? '' : 'bg-ink/20'}`}
    style={on ? { background: 'var(--accent)' } : {}}>
    <span className={`absolute top-0.5 w-5 h-5 rounded-full bg-white shadow transition-all ${on ? 'left-[18px]' : 'left-0.5'}`} />
  </button>
);
