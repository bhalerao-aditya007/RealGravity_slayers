import { useState, useMemo } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { useStore } from '@/state/store';
import { DagView } from './DagView';
import { Icon, I } from './Icons';
import { STATUS_COLORS, deptStyle } from './deptUtils';
import { cameraCtl } from '@/three/cameraCtl';
import { director } from '@/sim/director';

type Tab = 'org' | 'dag' | 'board';

export function LeftPanel() {
  const [tab, setTab] = useState<Tab>('dag');
  const [collapsed, setCollapsed] = useState(false);

  return (
    <aside
      className={`shrink-0 border-r border-ink/10 bg-[#FAF7F2]/95 backdrop-blur-md flex flex-col relative z-10 transition-all duration-300 shadow-sm ${
        collapsed ? 'w-12' : 'w-84 lg:w-92'
      }`}
    >
      {/* Header Tabs */}
      <div className="flex items-center border-b border-ink/10 bg-white/60 px-2 py-1.5 justify-between">
        {!collapsed && (
          <div className="flex gap-1 flex-1">
            {([
              ['dag', 'Task DAG', I.chart],
              ['org', 'Team Org', I.users],
              ['board', 'Blackboard', I.pin],
            ] as [Tab, string, string][]).map(([t, label, icon]) => (
              <button
                key={t}
                onClick={() => setTab(t)}
                className={`flex-1 py-1.5 px-2 text-[11px] font-heading font-medium rounded-lg flex items-center justify-center gap-1.5 transition-all ${
                  tab === t
                    ? 'bg-white text-ink shadow-xs border border-ink/10'
                    : 'text-ink/60 hover:text-ink hover:bg-white/40'
                }`}
              >
                <Icon d={icon} size={12} />
                <span className="hidden sm:inline">{label}</span>
              </button>
            ))}
          </div>
        )}
        <button
          onClick={() => setCollapsed(!collapsed)}
          title={collapsed ? 'Expand panel' : 'Collapse panel'}
          className="p-1.5 rounded-lg text-ink/50 hover:text-ink hover:bg-white/80 transition-colors ml-1"
        >
          <Icon d={collapsed ? I.chevronRight : I.chevronLeft} size={13} />
        </button>
      </div>

      {/* Content Area */}
      {!collapsed && (
        <div className="flex-1 overflow-auto p-1">
          {tab === 'org' && <OrgChart />}
          {tab === 'dag' && <DagView />}
          {tab === 'board' && <Blackboard />}
        </div>
      )}

      {/* Mini Icon column when collapsed */}
      {collapsed && (
        <div className="flex flex-col items-center gap-3 py-4">
          <button
            onClick={() => {
              setCollapsed(false);
              setTab('dag');
            }}
            className={`p-2 rounded-lg ${tab === 'dag' ? 'bg-white shadow-xs text-ink' : 'text-ink/50'}`}
            title="Task DAG"
          >
            <Icon d={I.chart} size={16} />
          </button>
          <button
            onClick={() => {
              setCollapsed(false);
              setTab('org');
            }}
            className={`p-2 rounded-lg ${tab === 'org' ? 'bg-white shadow-xs text-ink' : 'text-ink/50'}`}
            title="Team Org"
          >
            <Icon d={I.users} size={16} />
          </button>
          <button
            onClick={() => {
              setCollapsed(false);
              setTab('board');
            }}
            className={`p-2 rounded-lg ${tab === 'board' ? 'bg-white shadow-xs text-ink' : 'text-ink/50'}`}
            title="Blackboard"
          >
            <Icon d={I.pin} size={16} />
          </button>
        </div>
      )}
    </aside>
  );
}

function StatusDot({ status }: { status: string }) {
  const color = STATUS_COLORS[status] ?? '#999';
  const isWorking = status === 'WORKING' || status === 'RUNNING';
  return (
    <span className="relative flex items-center justify-center w-2.5 h-2.5 shrink-0">
      {isWorking && (
        <span
          className="absolute inline-flex h-full w-full rounded-full opacity-75 animate-ping"
          style={{ background: color }}
        />
      )}
      <span className="relative inline-block w-2 h-2 rounded-full" style={{ background: color }} />
    </span>
  );
}

function OrgChart() {
  const agents = useStore((s) => s.agents);
  const order = useStore((s) => s.order);
  const selected = useStore((s) => s.selected);

  const mgr = order.map((id) => agents[id]).find((a) => a?.role === 'manager');
  if (!mgr) {
    return (
      <div className="p-6 text-center text-xs font-body text-ink/50">
        Team will assemble once a goal is launched.
      </div>
    );
  }

  const leads = order.map((id) => agents[id]).filter((a) => a?.role === 'lead');

  return (
    <div className="p-2 space-y-2">
      {/* Manager Node */}
      <AgentRow a={mgr} depth={0} selected={selected} />

      {/* Departments & Leads */}
      <div className="space-y-1.5 pt-1">
        {leads.map((l) => {
          const team = order.map((id) => agents[id]).filter((a) => a?.parent_id === l.id);
          return (
            <div key={l.id} className="rounded-xl border border-ink/8 bg-white/40 p-1.5 shadow-2xs">
              <AgentRow a={l} depth={1} selected={selected} />
              {team.length > 0 && (
                <div className="ml-4 mt-1 border-l-2 border-ink/10 pl-1.5 space-y-1">
                  {team.map((w) => (
                    <AgentRow key={w.id} a={w} depth={2} selected={selected} />
                  ))}
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}

function AgentRow({ a, depth, selected }: { a: any; depth: number; selected: string | null }) {
  const tasks = useStore((s) => s.tasks);
  const agents = useStore((s) => s.agents);
  const order = useStore((s) => s.order);

  // Dynamic Hierarchical Progress Calculation
  const progressPct = useMemo(() => {
    if (!a) return 0;
    if (a.role === 'manager') {
      const allTasks = Object.values(tasks);
      if (!allTasks.length) return 0;
      const totalPct = allTasks.reduce(
        (acc, t) => acc + (t.progress_pct ?? (t.status === 'done' ? 100 : 0)),
        0
      );
      return Math.round(totalPct / allTasks.length);
    }
    if (a.role === 'lead') {
      const team = order.map((id) => agents[id]).filter((w) => w?.parent_id === a.id);
      if (!team.length) return 0;
      const teamPct = team.reduce((acc, w) => {
        const wt = w?.current_task_id ? tasks[w.current_task_id] : null;
        return acc + (wt?.progress_pct ?? (w?.status === 'DONE' || (w?.done ?? 0) > 0 ? 100 : 0));
      }, 0);
      return Math.round(teamPct / team.length);
    }
    const task = a.current_task_id ? tasks[a.current_task_id] : null;
    return task?.progress_pct ?? (a.status === 'DONE' ? 100 : 0);
  }, [a, tasks, agents, order]);

  const jump = () => {
    useStore.setState({ selected: a.id, inspectorOpen: true });
    const rt = director.rt(a.id);
    if (rt) cameraCtl.flyTo([rt.x + 8, 7, rt.z + 8], [rt.x, 1, rt.z]);
  };

  const roleLabel =
    a.role === 'manager' ? 'MANAGER' : a.role === 'lead' ? 'LEAD' : (a.department || 'WORKER').toUpperCase();

  return (
    <button
      onClick={jump}
      className={`w-full flex items-center gap-2 rounded-lg px-2 py-1.5 text-left transition-all hover:bg-white/80 ${
        selected === a.id ? 'bg-white shadow-xs ring-1 ring-ink/20' : 'bg-transparent'
      }`}
    >
      <span
        className="w-1.5 self-stretch rounded-full shrink-0"
        style={{ background: a.department ? deptStyle(a.department) : 'var(--accent)' }}
      />
      <StatusDot status={a.status} />

      <div className="flex-1 min-w-0">
        <div className="flex items-center justify-between gap-1">
          <span className="text-[11.5px] font-heading font-medium truncate text-ink">{a.name}</span>
          <span
            className="text-[8.5px] font-mono uppercase px-1 rounded tracking-wider"
            style={{
              background: a.role === 'manager' ? '#2B2B2E' : 'rgba(43,43,46,0.08)',
              color: a.role === 'manager' ? '#FAF7F2' : '#2B2B2E',
            }}
          >
            {roleLabel}
          </span>
        </div>

        {/* Progress Bar */}
        <div className="h-1 rounded-full bg-ink/10 mt-1 overflow-hidden">
          <div
            className="h-full rounded-full transition-all duration-300"
            style={{
              width: `${progressPct}%`,
              background: progressPct >= 100 ? '#10b981' : 'var(--accent)',
            }}
          />
        </div>
      </div>

      <span
        className={`font-mono text-[10px] tabular shrink-0 ${
          progressPct >= 100 ? 'text-emerald-600 font-bold' : 'text-ink/60'
        }`}
      >
        {progressPct}%
      </span>
    </button>
  );
}

function Blackboard() {
  const notes = useStore((s) => s.notes);
  const agents = useStore((s) => s.agents);
  const pulse = useStore((s) => s.notePulse);

  return (
    <div className="p-2 space-y-2">
      {!notes.length && (
        <div className="text-xs font-body text-ink/50 p-4 text-center">
          No blackboard notes yet. Cross-team findings and review decisions will pin here.
        </div>
      )}
      <AnimatePresence>
        {notes.map((n) => (
          <motion.div
            key={n.id}
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            className="rounded-xl border border-ink/10 bg-white/90 p-3 shadow-xs"
          >
            <div className="flex items-center justify-between mb-1.5">
              <span
                className="text-[9.5px] font-mono uppercase tracking-wider px-1.5 py-0.5 rounded font-semibold"
                style={{ background: 'var(--accent-soft)', color: '#2B2B2E' }}
              >
                {n.topic}
              </span>
              <span className="text-[9.5px] font-mono text-ink/40">
                {agents[n.author_agent_id]?.name ?? n.author_agent_id} | {n.ts}
              </span>
            </div>
            <p className="text-[11.5px] font-body text-ink/85 leading-relaxed">{n.note}</p>
            {pulse && (
              <motion.div
                className="mt-1.5 h-0.5 rounded"
                style={{ background: 'var(--accent)' }}
                initial={{ scaleX: 0 }}
                animate={{ scaleX: 1 }}
                transition={{ duration: 0.5 }}
              />
            )}
          </motion.div>
        ))}
      </AnimatePresence>
    </div>
  );
}
