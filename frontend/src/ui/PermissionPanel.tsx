import { motion, AnimatePresence } from 'framer-motion';
import { useStore } from '@/state/store';
import { engine } from '@/state/engine';
import { Icon, I } from './Icons';

export function PermissionPanel() {
  const pending = useStore((s) => s.pendingPermissions);

  const handleDecision = (requestId: string, decision: 'once' | 'always' | 'reject') => {
    // 1. Instantly respond to engine
    engine.respondPermission(requestId, decision);
    // 2. Optimistically clear from store so UI responds instantaneously
    useStore.setState({
      pendingPermissions: useStore.getState().pendingPermissions.filter((x) => x.request_id !== requestId),
    });
  };

  return (
    <div className="absolute bottom-52 left-4 z-40 space-y-2 w-96 pointer-events-auto">
      <AnimatePresence>
        {pending.map((p) => (
          <motion.div
            key={p.request_id}
            initial={{ x: -40, opacity: 0, scale: 0.95 }}
            animate={{ x: 0, opacity: 1, scale: 1 }}
            exit={{ x: -40, opacity: 0, scale: 0.95 }}
            className="rounded-2xl border border-ink/20 bg-white/95 backdrop-blur-md shadow-2xl overflow-hidden"
          >
            <div
              className="px-4 py-2.5 flex items-center gap-2 border-b border-ink/10 select-none"
              style={{ background: 'var(--accent-soft)' }}
            >
              <Icon d={I.pin} size={13} />
              <span className="font-heading text-xs font-semibold text-ink">
                {p.agent_name ?? 'Agent'} is waiting at the manager's desk
              </span>
            </div>

            <div className="px-4 py-3">
              <div className="text-[10px] font-mono uppercase text-ink/55 mb-1 font-semibold">
                {p.action} · {p.effect}
              </div>
              <pre className="text-xs font-mono bg-ink/5 rounded-lg p-2.5 max-h-36 overflow-auto whitespace-pre-wrap text-ink font-semibold">
                {p.resource}
              </pre>
              {p.preview && (
                <pre
                  className="text-[11px] font-mono mt-2 rounded-lg p-2.5 max-h-36 overflow-auto"
                  style={{ background: '#0f1a0f', color: '#9fe8b8' }}
                >
                  {p.preview}
                </pre>
              )}
            </div>

            {/* Clickable Actions with stopped propagation */}
            <div
              className="flex border-t border-ink/10 text-xs font-heading font-medium divide-x divide-ink/10"
              onPointerDown={(e) => e.stopPropagation()}
            >
              <button
                type="button"
                onClick={() => handleDecision(p.request_id, 'reject')}
                className="flex-1 py-2.5 text-[#d64545] hover:bg-red-50 active:bg-red-100 transition-colors cursor-pointer"
              >
                Reject all
              </button>
              <button
                type="button"
                onClick={() => handleDecision(p.request_id, 'once')}
                className="flex-1 py-2.5 text-ink/80 hover:bg-ink/5 active:bg-ink/10 transition-colors cursor-pointer"
              >
                Approve once
              </button>
              <button
                type="button"
                onClick={() => handleDecision(p.request_id, 'always')}
                className="flex-1 py-2.5 text-white font-semibold shadow-xs transition-opacity hover:opacity-90 active:opacity-100 cursor-pointer"
                style={{ background: 'var(--accent)' }}
              >
                Always (project)
              </button>
            </div>
          </motion.div>
        ))}
      </AnimatePresence>
    </div>
  );
}
