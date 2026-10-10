import { motion, AnimatePresence } from 'framer-motion';
import { useStore } from '@/state/store';
import { Icon, I } from './Icons';
import { deptStyle } from './deptUtils';

export function ComputeDrawer() {
  const open = useStore((s) => s.drawerOpen);
  const m = useStore((s) => s.metrics);
  const gate = useStore((s) => s.gate);
  const byRole = useStore((s) => s.llmByRole);
  const byModel = useStore((s) => s.llmByModel);
  const agents = useStore((s) => s.agents);
  const settings = useStore((s) => s.settings);
  const effort = useStore((s) => s.effortLogical);
  const departments = useStore((s) => s.departments);

  const total = m.llm_calls + m.tool_calls;
  const llmShare = total ? Math.round((m.llm_calls / total) * 100) : 0;
  const paidCost = ((m.tokens_in + m.tokens_out) / 1e6) * settings.pricePerM;
  const gaugeR = 26, circ = Math.PI * gaugeR; // half circle
  const deptIds = Object.keys(departments).length ? Object.keys(departments) : ['research', 'engineering', 'data', 'content'];

  return (
    <AnimatePresence>
      {open && (
        <motion.div initial={{ x: 340 }} animate={{ x: 0 }} exit={{ x: 340 }} transition={{ type: 'spring', damping: 26, stiffness: 240 }}
          className="absolute top-0 right-0 bottom-0 w-80 bg-paper/97 backdrop-blur border-l border-ink/10 z-20 p-4 space-y-5 overflow-y-auto">
          <div className="flex items-center justify-between">
            <h3 className="font-heading font-semibold flex items-center gap-2"><Icon d={I.chart} size={15} /> Compute & Cost</h3>
            <button onClick={() => useStore.setState({ drawerOpen: false })} className="text-ink/40 hover:text-ink"><Icon d={I.x} size={15} /></button>
          </div>

          <div className="grid grid-cols-2 gap-2">
            <Stat label="LLM calls" value={m.llm_calls} />
            <Stat label="Tool calls" value={m.tool_calls} />
            <Stat label="Tokens in" value={m.tokens_in} />
            <Stat label="Tokens out" value={m.tokens_out} />
          </div>

          <div>
            <div className="text-[10px] font-mono uppercase text-ink/45 mb-1">Concurrency gate</div>
            <div className="flex items-center gap-3">
              <svg width="70" height="42" viewBox="0 0 70 42">
                <path d={`M 8 36 A ${gaugeR} ${gaugeR} 0 0 1 62 36`} fill="none" stroke="#e8dfd0" strokeWidth="7" strokeLinecap="round" />
                <path d={`M 8 36 A ${gaugeR} ${gaugeR} 0 0 1 62 36`} fill="none"
                  stroke={gate.backoff_active ? '#d64545' : 'var(--accent)'} strokeWidth="7" strokeLinecap="round"
                  strokeDasharray={`${(Math.min(gate.in_flight, gate.limit) / gate.limit) * circ} ${circ}`} />
                <text x="35" y="34" textAnchor="middle" fontSize="13" fontFamily="JetBrains Mono" fill="#2B2B2E">
                  {gate.in_flight}/{gate.limit}
                </text>
              </svg>
              <div className="text-[11px] font-body text-ink/70 space-y-0.5">
                <div>queue <span className="font-mono tabular">{gate.queue_depth}</span></div>
                <div className={gate.backoff_active ? 'text-[#d64545]' : ''}>
                  {gate.backoff_active ? '429 backoff active' : 'no backoff'}
                </div>
              </div>
            </div>
          </div>

          <div>
            <div className="text-[10px] font-mono uppercase text-ink/45 mb-1">LLM vs tool work</div>
            <div className="h-3 rounded-full overflow-hidden flex">
              <div style={{ width: `${llmShare}%`, background: 'var(--accent)' }} />
              <div style={{ width: `${100 - llmShare}%`, background: '#2B2B2E22' }} />
            </div>
            <div className="text-[11px] font-body text-ink/60 mt-1">Only <b>{llmShare}%</b> of work used an LLM.</div>
          </div>

          <div>
            <div className="text-[10px] font-mono uppercase text-ink/45 mb-1">By role / model</div>
            <div className="space-y-1">
              {Object.entries(byRole).map(([r, c]) => <KV key={`r_${r}`} k={r} v={c} />)}
              {Object.entries(byModel).map(([mo, c]) => <KV key={`m_${mo}`} k={mo} v={c} dim />)}
            </div>
          </div>

          <div>
            <div className="text-[10px] font-mono uppercase text-ink/45 mb-1">Utilization by department</div>
            <div className="grid grid-cols-2 gap-2">
              {deptIds.map((d) => {
                const team = Object.values(agents).filter((a) => a.department === d);
                const avg = team.length ? team.reduce((s, a) => s + a.energy, 0) / team.length : 0;
                return (
                  <div key={d} className="rounded-lg border border-ink/10 p-2">
                    <div className="text-[10px] font-heading flex items-center gap-1">
                      <span className="w-2 h-2 rounded-full" style={{ background: deptStyle(d) }} />{departments[d]?.name ?? d}
                    </div>
                    <div className="h-1.5 rounded bg-ink/10 mt-1 overflow-hidden">
                      <div className="h-full" style={{ width: `${avg}%`, background: deptStyle(d) }} />
                    </div>
                    <div className="text-[9px] font-mono text-ink/40 mt-0.5">{team.length} agents · {Math.round(avg)}% energy</div>
                  </div>
                );
              })}
            </div>
          </div>

          <div className="rounded-xl border border-ink/10 p-3">
            <div className="font-mono text-sm">Estimated cost: <b>$0.00</b> <span className="text-[10px] text-ink/50">(local / open-weight)</span></div>
            <label className="flex items-center gap-2 mt-2 text-[11px] font-body text-ink/60">
              <input type="checkbox" checked={settings.showPaidCost} onChange={(e) => useStore.setState({ settings: { ...settings, showPaidCost: e.target.checked } })} />
              show equivalent paid-API cost
            </label>
            {settings.showPaidCost && (
              <div className="mt-2 text-[11px] font-body text-ink/70 space-y-1">
                <div>≈ <span className="font-mono">${paidCost.toFixed(2)}</span> at ${settings.pricePerM}/1M tokens</div>
                <input type="range" min={0.1} max={5} step={0.1} value={settings.pricePerM}
                  onChange={(e) => useStore.setState({ settings: { ...settings, pricePerM: +e.target.value } })} className="w-full" />
              </div>
            )}
          </div>

          {effort > 0 && (
            <div className="text-[11px] font-body text-ink/60">
              Organizational effort: <b className="font-mono">{Math.floor(effort / 3600)}h {Math.round((effort % 3600) / 60)}m</b>
            </div>
          )}
        </motion.div>
      )}
    </AnimatePresence>
  );
}

const Stat = ({ label, value }: { label: string; value: number }) => (
  <div className="rounded-xl border border-ink/10 bg-white/60 p-2.5">
    <div className="text-[9px] font-mono uppercase text-ink/45">{label}</div>
    <div className="font-mono text-lg tabular">{value.toLocaleString()}</div>
  </div>
);
const KV = ({ k, v, dim }: { k: string; v: number; dim?: boolean }) => (
  <div className={`flex justify-between text-[11px] font-mono ${dim ? 'text-ink/45' : 'text-ink/75'}`}>
    <span className="truncate mr-2">{k}</span><span className="tabular">{v}</span>
  </div>
);
