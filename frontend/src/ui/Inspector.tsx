import { motion } from 'framer-motion';
import { useStore } from '@/state/store';
import { Icon, I } from './Icons';
import { deptStyle, STATUS_COLORS } from './deptUtils';
import { director } from '@/sim/director';
import { cameraCtl } from '@/three/cameraCtl';
import { engine } from '@/state/engine';
import { useState } from 'react';

import { roleDef, roleCss } from '@/swarm/roles';
import { swarmDirector } from '@/swarm/directorRef';

const stageColor = (st: number) =>
  ['#e8dfd0', '#f4d58d', '#e8a44d', '#d64545'][Math.min(3, Math.max(0, st))] ?? '#e8dfd0';

export function Inspector() {
  const selected = useStore((s) => s.selected);
  const open = useStore((s) => s.inspectorOpen);
  const agents = useStore((s) => s.agents);
  const tasks = useStore((s) => s.tasks);
  const terminal = useStore((s) => s.terminal);
  const followId = useStore((s) => s.followId);
  const contextStages = useStore((s) => s.contextStages);
  const fileEdits = useStore((s) => s.fileEdits);
  const checkpoint = useStore((s) => s.checkpoint);
  const sandboxMode = useStore((s) => s.sandboxMode);
  const appMode = useStore((s) => s.appMode);
  const swarm = useStore((s) => s.swarm);
  const [tab, setTab] = useState<'profile' | 'live'>('profile');

  if (!open || !selected) return null;
  const a = agents[selected];
  const swAgent = appMode === 'swarm' && selected ? swarm.agents[selected] : null;
  const swRt = swAgent ? swarmDirector.rt(swAgent.id) : null;
  if (!a && !swAgent) return null;

  const task = a?.current_task_id ? tasks[a.current_task_id] : null;
  const reports = a ? Object.values(tasks).filter((t) => t.assigned_agent === a.id) : [];
  const isCode = (a?.engine?.kind === 'code') || (fileEdits[selected]?.length ?? 0) > 0;
  const energy = a ? Math.round(a.energy) : (swAgent?.energy ?? 100);
  const tired = energy > 75 ? 'Fresh' : energy > 50 ? 'Steady' : energy > 30 ? 'Tired' : 'Needs coffee';
  const stage = a ? contextStages[a.id] : undefined;

  return (
    <motion.div drag dragMomentum={false}
      initial={{ opacity: 0, x: 30 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0 }}
      transition={{ duration: 0.2 }}
      className="absolute top-4 right-4 w-80 rounded-2xl border border-ink/10 bg-paper/97 backdrop-blur shadow-xl z-30 cursor-grab">
      <div className="flex items-center gap-2 p-3 border-b border-ink/10 cursor-grab">
        <div className="w-9 h-9 rounded-xl flex items-center justify-center text-white font-heading font-bold"
          style={{ background: swAgent ? (swAgent.role === 'manager' ? 'var(--accent)' : roleCss(swAgent.department)) : (a?.department ? deptStyle(a.department) : 'var(--accent)') }}>
          {(swAgent?.name ?? a?.name ?? '?')[0]}
        </div>
        <div className="flex-1 min-w-0">
          <div className="font-heading font-semibold text-sm truncate">{swAgent?.name ?? a?.name}</div>
          <div className="text-[10px] font-mono text-ink/50 truncate">
            {swAgent
              ? (swAgent.role === 'manager' ? 'Moderator' : `${roleDef(swAgent.department).label} · seat ${swAgent.seat_index + 1}`)
              : `${a?.role}${a?.department ? ` · ${a.department}` : ''} · ${a?.engine?.label} · ${sandboxMode}`}
          </div>
        </div>
        <button onClick={() => useStore.setState({ inspectorOpen: false, selected: null, followId: null })}
          className="p-1 text-ink/40 hover:text-ink"><Icon d={I.x} size={14} /></button>
      </div>

      {swAgent ? (
        <div className="p-3 space-y-4 max-h-[70vh] overflow-y-auto">
          {swRt && (
            <div className="rounded-xl border border-ink/10 p-2.5 space-y-1 font-mono text-xs bg-white/50">
              <div className="flex justify-between text-ink/60"><span>State</span><span className="text-ink font-semibold">{swRt.state}</span></div>
              <div className="flex justify-between text-ink/60"><span>Activity</span><span className="text-ink font-semibold">{swRt.activity}</span></div>
              <div className="flex justify-between text-ink/60"><span>Speed</span><span>{swRt.speed.toFixed(2)} m/s</span></div>
            </div>
          )}
          {swAgent.role !== 'manager' && (
            <div className="rounded-xl border border-ink/10 p-3 bg-white/60">
              <div className="text-[10px] font-mono uppercase text-ink/40 mb-1">Perspective</div>
              <p className="text-xs font-body text-ink/80 leading-relaxed">{roleDef(swAgent.department).lens}</p>
            </div>
          )}
          <div>
            <div className="text-[10px] font-mono uppercase text-ink/40 mb-1.5">Proposals</div>
            <div className="space-y-1.5">
              {swarm.ideaOrder.filter((id) => swarm.ideas[id]?.agent_id === swAgent.id).map((id) => (
                <div key={id} className="rounded-lg border border-ink/10 p-2 text-xs font-body bg-white/40">
                  {swarm.ideas[id]?.text}
                </div>
              ))}
              {!swarm.ideaOrder.some((id) => swarm.ideas[id]?.agent_id === swAgent.id) && (
                <div className="text-xs text-ink/40">No proposals yet</div>
              )}
            </div>
          </div>
        </div>
      ) : a ? (
        <>
          {isCode && (
            <div className="flex border-b border-ink/10 text-xs font-heading">
              {(['profile', 'live'] as const).map((t) => (
                <button key={t} onClick={() => setTab(t)}
                  className={`flex-1 py-1.5 flex items-center justify-center gap-1 ${tab === t ? 'text-ink border-b-2 border-b-[var(--accent)]' : 'text-ink/45'}`}>
                  {t === 'live' && <Icon d={I.terminal} size={12} />} {t === 'profile' ? 'Profile' : 'Live'}
                </button>
              ))}
            </div>
          )}

          {tab === 'live' ? (
            <div className="p-3 space-y-3 max-h-[52vh] overflow-auto">
              {stage && (
                <div className="flex items-center justify-between text-[10px] font-mono">
                  <span className="text-ink/50 uppercase">Context stage</span>
                  <span className="px-1.5 py-0.5 rounded" style={{ background: stageColor(stage.stage) }}>
                    S{stage.stage} · {(stage.frac * 100).toFixed(0)}%
                  </span>
                </div>
              )}
              {fileEdits[a.id]?.length ? (
                <div>
                  <div className="text-[10px] font-mono uppercase text-ink/45 mb-1">File edits</div>
                  <div className="space-y-1">
                    {fileEdits[a.id].slice(-8).reverse().map((fe, i) => (
                      <div key={i} className="rounded-lg border border-ink/10 px-2 py-1.5">
                        <div className="font-mono text-[11px] truncate" title={fe.path}>{fe.path}</div>
                        <div className="flex gap-1 mt-0.5 flex-wrap">
                          {fe.line_ranges.map(([s0, e0], j) => (
                            <span key={j} className="font-mono text-[9px] px-1 rounded"
                              style={{ background: 'var(--accent-soft)' }}>L{s0}–{e0}</span>
                          ))}
                          {fe.branch && <span className="font-mono text-[9px] text-ink/40 ml-auto">{fe.branch}</span>}
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              ) : null}
              <div className="h-40 overflow-auto rounded-xl bg-ink text-[10px] font-mono leading-5 p-2.5" style={{ color: '#9fe8b8' }}>
                {(terminal[a.id] ?? []).map((l, i) => (
                  <div key={i} style={{ color: l.startsWith('✓') ? '#9fe8b8' : l.startsWith('$') ? '#cfe3ff' : '#e8c46a' }}>{l}</div>
                ))}
                {!terminal[a.id]?.length && <div className="opacity-50">waiting for runtime.stream…</div>}
              </div>
              {checkpoint && (
                <div className="rounded-xl border border-ink/10 p-2.5 flex items-center gap-2">
                  <span className="font-mono text-[10px] text-ink/60 truncate flex-1">{checkpoint.branch}</span>
                  <button onClick={() => engine.runControl('merge_branch', checkpoint.branch)}
                    className="text-[10px] font-heading rounded-md px-2 py-1 text-white" style={{ background: '#2f9e6e' }}>Merge</button>
                  <button onClick={() => engine.runControl('discard_branch', checkpoint.branch)}
                    className="text-[10px] font-heading rounded-md px-2 py-1 text-[#d64545] border border-[#d64545]/40">Discard</button>
                </div>
              )}
            </div>
          ) : (
            <div className="p-3 space-y-3 max-h-[52vh] overflow-auto">
              <div className="flex items-center gap-2 flex-wrap">
                <span className="text-[10px] font-mono uppercase px-2 py-0.5 rounded-full text-white"
                  style={{ background: STATUS_COLORS[a.status] ?? '#888' }}>{a.status}</span>
                {stage && (
                  <span className="text-[10px] font-mono px-1.5 py-0.5 rounded" style={{ background: stageColor(stage.stage) }}>S{stage.stage}</span>
                )}
                {a.parent_id && (
                  <button onClick={() => useStore.setState({ selected: a.parent_id })}
                    className="text-[11px] font-body text-ink/60 underline decoration-dotted">
                    Reports to {agents[a.parent_id]?.name}
                  </button>
                )}
                <span className="text-[10px] font-mono text-ink/40 ml-auto">
                  {a.done ?? 0}✓ · {a.failed ?? 0}✗ · {a.pending ?? 0} pending
                </span>
              </div>

              {task && (
                <div>
                  <div className="text-[10px] font-mono text-ink/45 mb-1">{task.id} · {task.status}</div>
                  <div className="text-xs font-body leading-snug mb-1.5">{task.description}</div>
                  <div className="h-1.5 rounded-full bg-ink/10 overflow-hidden">
                    <div className="h-full rounded-full transition-all" style={{ width: `${task.progress_pct}%`, background: 'var(--accent)' }} />
                  </div>
                  <div className="text-right font-mono text-[10px] tabular text-ink/50 mt-0.5">{task.progress_pct}%</div>
                </div>
              )}

              <Meter label="Energy" value={energy} max={100} sub={tired} color="var(--accent)" />
              <Meter label="Context" value={a.context_tokens} max={a.context_max || 32768}
                sub={`${((a.context_tokens / (a.context_max || 32768)) * 100).toFixed(0)}% used`} color="var(--dept-data)" />

              {a.role !== 'worker' && (
                <div>
                  <div className="text-[10px] font-mono uppercase text-ink/45 mb-1">Team</div>
                  <div className="space-y-1">
                    {Object.values(agents).filter((w) => w.parent_id === a.id).map((w) => (
                      <button key={w.id} onClick={() => useStore.setState({ selected: w.id })}
                        className="w-full flex items-center gap-2 text-[11px] font-body hover:bg-ink/5 rounded px-1 py-0.5">
                        <span className="w-1.5 h-1.5 rounded-full" style={{ background: STATUS_COLORS[w.status] ?? '#888' }} />
                        {w.name}
                        <span className="ml-auto font-mono text-[9px] text-ink/40">{w.status}</span>
                      </button>
                    ))}
                  </div>
                </div>
              )}

              {a.role === 'manager' && (
                <div className="text-[11px] font-body text-ink/60">
                  Replans: <span className="font-mono">{useStore.getState().replanCount}</span> · LLM calls:{' '}
                  <span className="font-mono">{useStore.getState().metrics.llm_calls}</span>
                </div>
              )}

              {reports.filter((t) => t.status === 'done').length > 0 && (
                <div>
                  <div className="text-[10px] font-mono uppercase text-ink/45 mb-1">Outputs</div>
                  {reports.filter((t) => t.status === 'done').map((t) => (
                    <div key={t.id} className="text-[11px] font-body text-ink/70 truncate">· {t.id}: {t.description}</div>
                  ))}
                </div>
              )}

              <div className="flex gap-2 pt-1">
                <button onClick={() => {
                  const rt = director.rt(a.id);
                  if (rt) cameraCtl.flyTo([rt.x + 7, 6, rt.z + 7], [rt.x, 1, rt.z]);
                }} className="flex-1 rounded-lg border border-ink/15 py-1.5 text-xs font-heading flex items-center justify-center gap-1 hover:border-ink/40">
                  <Icon d={I.camera} size={13} /> Visit
                </button>
                <button onClick={() => useStore.setState({ followId: followId === a.id ? null : a.id })}
                  className="flex-1 rounded-lg py-1.5 text-xs font-heading text-white flex items-center justify-center gap-1"
                  style={{ background: followId === a.id ? '#2B2B2E' : 'var(--accent)' }}>
                  {followId === a.id ? 'Unfollow' : 'Follow'}
                </button>
              </div>
            </div>
          )}
        </>
      ) : null}
    </motion.div>
  );
}

function Meter({ label, value, max, sub, color }: { label: string; value: number; max: number; sub: string; color: string }) {
  return (
    <div>
      <div className="flex justify-between text-[10px] font-mono text-ink/50 mb-1">
        <span>{label}</span><span className="tabular">{value.toLocaleString()} / {max.toLocaleString()}</span>
      </div>
      <div className="h-1.5 rounded-full bg-ink/10 overflow-hidden">
        <div className="h-full rounded-full transition-all" style={{ width: `${Math.min(100, (value / max) * 100)}%`, background: color }} />
      </div>
      <div className="text-[9px] font-mono text-ink/40 mt-0.5">{sub}</div>
    </div>
  );
}
