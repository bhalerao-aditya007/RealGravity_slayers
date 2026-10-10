import { motion, AnimatePresence } from 'framer-motion';
import { useEffect, useState } from 'react';
import { useStore } from '@/state/store';
import { Icon, I } from './Icons';
import { fmtEffort } from '@/state/events';
import { deptColorRT } from '@/state/departments';

const deptCss = (id: string) => `#${deptColorRT(id).getHexString()}`;

export function TriageBanner() {
  const triage = useStore((s) => s.triage);
  const [expanded, setExpanded] = useState(true);

  useEffect(() => {
    if (triage) { setExpanded(true); const t = setTimeout(() => setExpanded(false), 10000); return () => clearTimeout(t); }
  }, [triage]);

  return (
    <AnimatePresence>
      {triage && (
        <motion.div
          initial={{ y: -14, opacity: 0 }} animate={{ y: 0, opacity: 1 }} exit={{ y: -14, opacity: 0 }}
          className="absolute top-16 left-1/2 -translate-x-1/2 z-20 rounded-xl border border-ink/10 bg-paper/95 backdrop-blur px-4 py-2.5 shadow-lg flex items-center gap-3 flex-wrap max-w-[740px]"
          onClick={() => setExpanded(!expanded)}
        >
          <span className="text-[10px] font-mono uppercase tracking-wider px-2 py-0.5 rounded-full text-white whitespace-nowrap"
            style={{ background: 'var(--accent)' }}>Manager's call</span>
          <span className="font-heading text-sm font-semibold capitalize whitespace-nowrap">
            {triage.task_class.replace(/_/g, ' ')} · {triage.intensity}
          </span>
          {expanded && (
            <>
              <span className="text-[11px] font-mono text-ink/60 tabular whitespace-nowrap">
                ~{fmtEffort(triage.est_effort_s)} ·{' '}
                {triage.est_workers === 0 ? 'solo' : `${triage.est_workers} workers`}
              </span>
              <span className="flex items-center gap-1.5 text-[11px] font-body text-ink/70 whitespace-nowrap">
                {triage.break_policy.pace === 'sprint' && <><Icon d={I.flow} size={12} /> Sprint — no breaks</>}
                {triage.break_policy.pace === 'normal' && <><Icon d={I.coffee} size={12} /> Coffee on compaction</>}
                {triage.break_policy.pace === 'workday' && <><Icon d={I.coffee} size={12} /> Full workday — coffee{triage.break_policy.meals ? ' + lunch' : ''}</>}
              </span>
              <span className="text-[10px] font-body text-ink/45 truncate max-w-[220px]" title={triage.rationale}>
                “{triage.rationale}”
              </span>
              <span className="flex gap-1">
                {triage.departments.map((d) => (
                  <span key={d.id} className="text-[9px] font-heading px-1.5 py-0.5 rounded"
                    style={{ background: deptCss(d.id), color: '#fff' }}>{d.name}</span>
                ))}
              </span>
            </>
          )}
        </motion.div>
      )}
    </AnimatePresence>
  );
}
