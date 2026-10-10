import { motion, AnimatePresence } from 'framer-motion';
import { useMemo, useState } from 'react';
import { useStore } from '@/state/store';
import { Icon, I } from '@/ui/Icons';
import { roleDef, roleCss } from './roles';
import { swarmDirector } from './directorRef';

const PHASES = ['frame', 'diverge', 'cluster', 'critique', 'vote', 'synthesize'] as const;

export function SwarmPanel() {
  const s = useStore();
  const sw = s.swarm;
  const [highlightIdea, setHighlightIdea] = useState<string | null>(null);
  const open = s.drawerOpen;

  const ideas = useMemo(() => sw.ideaOrder.map((id) => sw.ideas[id]).filter(Boolean), [sw.ideaOrder, sw.ideas]);
  const leaderboard = useMemo(() => {
    const sc = sw.tally?.scores ?? [];
    return [...sc].sort((a, b) => b.score - a.score || b.votes - a.votes).slice(0, 8);
  }, [sw.tally]);
  const transcript = useMemo(() => {
    const items: { agent: string; roleId: string; kind: 'proposal' | 'critique'; text: string; ideaId: string }[] = [];
    ideas.forEach((i) => items.push({ agent: i.agent_id, roleId: sw.agents[i.agent_id]?.department ?? '', kind: 'proposal', text: i.text, ideaId: i.id }));
    sw.critiques.forEach((c) => items.push({ agent: c.agent_id, roleId: sw.agents[c.agent_id]?.department ?? '', kind: 'critique', text: `${c.stance === 'support' ? '▲' : '▼'} ${c.text}`, ideaId: c.idea_id }));
    return items.slice(-120).reverse();
  }, [ideas, sw.critiques, sw.agents]);
  const agreement = sw.tally?.agreement ?? 0;
  const phaseIdx = PHASES.indexOf(sw.phase as any);

  return (
    <AnimatePresence>
      {open && (
        <motion.div initial={{ x: 340 }} animate={{ x: 0 }} exit={{ x: 340 }}
          transition={{ type: 'spring', damping: 26, stiffness: 240 }}
          className="absolute top-0 right-0 bottom-0 w-80 bg-paper/97 backdrop-blur border-l border-ink/10 z-20 flex flex-col">
          <div className="flex items-center justify-between px-4 py-3 border-b border-ink/10">
            <h3 className="font-heading font-semibold flex items-center gap-2"><Icon d={I.users} size={15} /> Swarm</h3>
            <button onClick={() => useStore.setState({ drawerOpen: false })} className="text-ink/40"><Icon d={I.x} size={15} /></button>
          </div>

          {/* phase stepper */}
          <div className="px-4 py-3 border-b border-ink/10">
            <div className="flex items-center gap-1">
              {PHASES.map((p, i) => (
                <div key={p} className="flex-1">
                  <div className={`h-1.5 rounded-full ${i < phaseIdx || sw.phase === 'done' ? 'bg-[#2f9e6e]' : i === phaseIdx ? '' : 'bg-ink/10'}`}
                    style={i === phaseIdx && sw.phase !== 'done' ? { background: 'var(--accent)' } : {}} />
                  <div className={`text-[8px] font-mono uppercase mt-1 ${i === phaseIdx ? 'text-ink' : 'text-ink/40'}`}>{p}</div>
                </div>
              ))}
            </div>
            <div className="text-[10px] font-mono text-ink/50 mt-1">round {sw.round} {sw.phase === 'done' && '· complete ✓'}</div>
          </div>

          <div className="flex-1 overflow-y-auto px-4 py-3 space-y-4">
            <div className="grid grid-cols-3 gap-2">
              <Stat label="Ideas" value={ideas.length} />
              <Stat label="Critiques" value={sw.critiques.length} />
              <Stat label="Votes" value={sw.votes.length} />
              <Stat label="LLM active" value={s.gate.in_flight} />
              <Stat label="Queue" value={s.gate.queue_depth} />
              <Stat label="Agents" value={Object.keys(sw.agents).length} />
            </div>

            {sw.tally && (
              <div>
                <div className="flex justify-between text-[10px] font-mono text-ink/50 mb-1">
                  <span>Agreement</span><span>{agreement}%</span>
                </div>
                <div className="h-2 rounded-full bg-ink/10 overflow-hidden">
                  <div className="h-full rounded-full transition-all" style={{ width: `${agreement}%`, background: agreement < 50 ? '#e0a13a' : 'var(--accent)' }} />
                </div>
                <div className="text-[9px] font-body text-ink/45 mt-0.5">how much the votes agree</div>
                {agreement < 50 && <span className="inline-block mt-1 text-[9px] font-mono px-1.5 py-0.5 rounded bg-[#e0a13a]/20 text-[#8a6210]">Dissent</span>}
              </div>
            )}

            {leaderboard.length > 0 && (
              <div>
                <div className="text-[10px] font-mono uppercase text-ink/45 mb-1.5">Leaderboard</div>
                <div className="space-y-1.5">
                  {leaderboard.map((sc, i) => {
                    const idea = sw.ideas[sc.idea_id];
                    const maxV = Math.max(1, ...leaderboard.map((x) => x.votes));
                    return (
                      <button key={sc.idea_id}
                        onClick={() => {
                          setHighlightIdea(sc.idea_id);
                          if (idea && swarmDirector.rt(idea.agent_id)) useStore.setState({ selected: idea.agent_id, inspectorOpen: true } as any);
                        }}
                        className={`w-full text-left rounded-lg border px-2 py-1.5 ${highlightIdea === sc.idea_id ? 'border-ink/40' : 'border-ink/10'} hover:border-ink/30`}>
                        <div className="flex items-center gap-1.5">
                          <span className="font-mono text-[9px] text-ink/40">#{i + 1}</span>
                          <span className="text-[10px] font-body truncate flex-1">{idea?.text.slice(0, 42) ?? sc.idea_id}…</span>
                          <span className="font-mono text-[10px] tabular">{sc.score.toFixed(1)}·{sc.votes}✓</span>
                        </div>
                        <div className="h-1 rounded bg-ink/8 mt-1 overflow-hidden">
                          <div className="h-full rounded" style={{ width: `${(sc.votes / maxV) * 100}%`, background: 'var(--accent)' }} />
                        </div>
                      </button>
                    );
                  })}
                </div>
              </div>
            )}

            <div>
              <div className="text-[10px] font-mono uppercase text-ink/45 mb-1.5">Transcript</div>
              <div className="space-y-1 max-h-64 overflow-y-auto pr-1">
                {transcript.map((t, i) => (
                  <button key={i} onClick={() => {
                    if (swarmDirector.rt(t.agent)) useStore.setState({ selected: t.agent, inspectorOpen: true } as any);
                  }} className="w-full text-left rounded-lg px-2 py-1.5 hover:bg-ink/5">
                    <div className="flex items-center gap-1.5">
                      <span className="w-1.5 h-1.5 rounded-full shrink-0" style={{ background: roleCss(t.roleId) }} />
                      <span className="text-[10px] font-heading">{sw.agents[t.agent]?.name ?? t.agent}</span>
                      <span className="text-[8px] font-mono uppercase text-ink/40">{t.kind}</span>
                    </div>
                    <div className="text-[10px] font-body text-ink/70 leading-snug mt-0.5">{t.text.slice(0, 110)}</div>
                  </button>
                ))}
                {!transcript.length && <div className="text-[11px] font-body text-ink/40 p-2">Waiting for the first proposals…</div>}
              </div>
            </div>

            <AnimatePresence>
              {sw.synthesis && (
                <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }}
                  className="rounded-xl border p-3" style={{ borderColor: 'var(--accent)' }}>
                  <div className="flex items-center justify-between mb-1.5">
                    <span className="font-heading font-semibold text-sm">Final answer</span>
                    <div className="flex gap-1.5">
                      <button onClick={() => navigator.clipboard?.writeText(sw.synthesis!.text)}
                        className="text-[10px] font-heading rounded-md px-2 py-1 border border-ink/15">Copy</button>
                      <button onClick={() => useStore.setState({ reportOpen: true } as any)}
                        className="text-[10px] font-heading rounded-md px-2 py-1 text-white" style={{ background: 'var(--accent)' }}>PDF</button>
                    </div>
                  </div>
                  <div className="flex gap-1 flex-wrap mb-2">
                    {sw.synthesis.source_idea_ids.map((iid) => (
                      <span key={iid} className="text-[9px] font-mono px-1.5 py-0.5 rounded" style={{ background: 'var(--accent-soft)' }}>{iid}</span>
                    ))}
                  </div>
                  <p className="text-[11px] font-body leading-relaxed text-ink/80 whitespace-pre-line line-clamp-[12]">{sw.synthesis.text}</p>
                </motion.div>
              )}
            </AnimatePresence>
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}

/** Left roster: collapsible, grouped by role. */
export function SwarmRoster() {
  const sw = useStore((s) => s.swarm);
  const [open, setOpen] = useState(true);
  const groups = useMemo(() => {
    const g = new Map<string, string[]>();
    for (const a of Object.values(sw.agents)) {
      const k = a.department ?? 'other';
      g.set(k, [...(g.get(k) ?? []), a.id]);
    }
    return [...g.entries()];
  }, [sw.agents]);
  return (
    <div className="w-56 shrink-0 border-r border-ink/10 bg-paper blueprint-grid flex flex-col relative z-10">
      <button onClick={() => setOpen(!open)} className="flex items-center gap-1 px-3 py-2.5 text-xs font-heading border-b border-ink/10">
        <Icon d={I.chevron} size={13} className={open ? '' : '-rotate-90'} /> Roster
        <span className="font-mono text-[10px] text-ink/40 ml-auto">{Object.keys(sw.agents).length}</span>
      </button>
      {open && (
        <div className="flex-1 overflow-auto p-2 space-y-2">
          {groups.map(([role, ids]) => (
            <div key={role}>
              <div className="flex items-center gap-1.5 px-1 mb-0.5">
                <span className="w-2 h-2 rounded-full" style={{ background: roleCss(role) }} />
                <span className="text-[10px] font-mono uppercase text-ink/50">{role === 'moderator' ? 'Moderator' : roleDef(role).label}</span>
              </div>
              {ids.map((id) => {
                const a = sw.agents[id];
                const rt = swarmDirector.rt(id);
                return (
                  <button key={id} onClick={() => useStore.setState({ selected: id, inspectorOpen: true } as any)}
                    className="w-full flex items-center gap-1.5 rounded px-1.5 py-1 text-left hover:bg-ink/5">
                    <span className="w-1.5 h-1.5 rounded-full" style={{ background: rt?.think ? '#7c5cd6' : '#8a8a8f' }} />
                    <span className="text-[11px] font-body truncate">{a.name}</span>
                  </button>
                );
              })}
            </div>
          ))}
          {!groups.length && <div className="text-[11px] font-body text-ink/40 p-2">The hall is empty…</div>}
        </div>
      )}
    </div>
  );
}

const Stat = ({ label, value }: { label: string; value: number }) => (
  <div className="rounded-xl border border-ink/10 bg-white/60 p-2">
    <div className="text-[9px] font-mono uppercase text-ink/45">{label}</div>
    <div className="font-mono text-base tabular">{value}</div>
  </div>
);
