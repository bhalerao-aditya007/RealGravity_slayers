import { useMemo, useRef, useState, useEffect } from 'react';
import { useStore } from '@/state/store';
import { Icon, I } from './Icons';
import { managerAgent } from '@/sim/managerAgent';
import { haltEntireSystem } from '@/state/engine';

export function EventLog() {
  const log = useStore((s) => s.log);
  const mode = useStore((s) => s.mode);
  const runEvents = useStore((s) => s.runEvents);
  const replayIdx = useStore((s) => s.replayIdx);
  const replayPlaying = useStore((s) => s.replayPlaying);

  const [filter, setFilter] = useState('');
  const [open, setOpen] = useState(true);
  const [autoScroll, setAutoScroll] = useState(true);
  const [managerInput, setManagerInput] = useState('');
  const [isProcessing, setIsProcessing] = useState(false);
  const boxRef = useRef<HTMLDivElement>(null);

  const filtered = useMemo(() => {
    if (!filter) return log;
    const f = filter.toLowerCase();
    return log.filter((l) => l.text.toLowerCase().includes(f) || l.type.includes(f));
  }, [log, filter]);

  useEffect(() => {
    if (autoScroll && open && boxRef.current) boxRef.current.scrollTop = boxRef.current.scrollHeight;
  }, [filtered.length, autoScroll, open]);

  const sendCommand = async (rawText?: string) => {
    const text = (rawText ?? managerInput).trim();
    if (!text || isProcessing) return;
    setManagerInput('');

    if (/^(stop|halt|cancel|emergency stop|freeze all|stop all)$/i.test(text.trim())) {
      await haltEntireSystem();
      return;
    }
    setIsProcessing(true);

    const s = useStore.getState();
    const now = s.simClock || '10:00';

    // 1. Record user instruction in event stream
    useStore.setState({
      log: [
        ...s.log,
        { id: Date.now(), ts_sim: now, type: 'user.directive', text: `You ➔ Diya (Manager): "${text}"` },
      ],
    });

    // 2. Process with Manager Memory Agent
    try {
      await managerAgent.processDirective(text);
    } finally {
      setIsProcessing(false);
    }
  };

  return (
    <div className={`border-t border-ink/10 bg-[#FAF7F2]/95 backdrop-blur-md relative z-10 transition-all ${open ? 'h-44' : 'h-10'}`}>
      <div className="h-10 flex items-center justify-between gap-2 px-3 border-b border-ink/5">
        {/* Left: Event Log Controls */}
        <div className="flex items-center gap-2 shrink-0">
          <button
            onClick={() => setOpen(!open)}
            className="flex items-center gap-1 text-xs font-heading font-medium text-ink/75 hover:text-ink transition-colors"
          >
            <Icon d={open ? I.chevronDown : I.chevronUp} size={14} />
            <span>Event log ({log.length})</span>
          </button>
          <input
            type="text"
            value={filter}
            onChange={(e) => setFilter(e.target.value)}
            placeholder="filter..."
            className="h-6 w-24 rounded border border-ink/15 bg-paper px-2 text-xs font-mono text-ink placeholder-ink/40 focus:border-[var(--accent)] focus:outline-none"
          />
          <label className="flex items-center gap-1 text-[11px] font-mono text-ink/60 cursor-pointer">
            <input
              type="checkbox"
              checked={autoScroll}
              onChange={(e) => setAutoScroll(e.target.checked)}
              className="accent-[var(--accent)]"
            />
            follow
          </label>
        </div>

        {/* Right: Diya Manager Directive Console (Active Floor Control) */}
        <div className="flex items-center gap-2 flex-1 max-w-xl justify-end">
          <div className="flex items-center gap-1.5 bg-paper border border-ink/15 rounded-xl px-2.5 py-1 shadow-sm w-full max-w-md focus-within:border-[var(--accent)] focus-within:ring-1 focus-within:ring-[var(--accent)]/30 transition-all">
            <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse shrink-0" />
            <span className="text-[11px] font-mono text-ink/60 font-semibold shrink-0">Diya:</span>
            <input
              type="text"
              value={managerInput}
              onChange={(e) => setManagerInput(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && sendCommand()}
              placeholder={isProcessing ? 'Diya is reasoning...' : 'Message manager (e.g. "where are output files", "share insights", "continue", "stop")...'}
              disabled={isProcessing}
              className="w-full bg-transparent text-xs font-body text-ink placeholder-ink/40 focus:outline-none"
            />
            <button
              onClick={() => sendCommand()}
              disabled={!managerInput.trim() || isProcessing}
              className="px-2 py-0.5 rounded-lg text-[11px] font-heading font-medium text-white transition-opacity disabled:opacity-30 shrink-0"
              style={{ background: 'var(--accent)' }}
            >
              Send
            </button>
          </div>

          {/* Quick preset directives */}
          <div className="hidden sm:flex items-center gap-1 shrink-0">
            <button
              onClick={() => sendCommand('where are the output files ? which i can download like the codes and other thing you gave')}
              className="text-[10px] font-heading font-medium px-2 py-1 rounded-lg border border-ink/10 bg-paper hover:bg-ink/5 text-blue-600 transition-colors"
              title="Locate outputs and download code"
            >
              Get Files
            </button>
            <button
              onClick={() => sendCommand('can you share one insights you saw while the project')}
              className="text-[10px] font-heading font-medium px-2 py-1 rounded-lg border border-ink/10 bg-paper hover:bg-ink/5 text-ink/75 transition-colors"
              title="Ask Diya for run insights"
            >
              Insights
            </button>
            <button
              onClick={() => sendCommand('continue with next phase')}
              className="text-[10px] font-heading font-medium px-2 py-1 rounded-lg border border-ink/10 bg-paper hover:bg-ink/5 text-ink/75 transition-colors"
              title="Continue with Phase 2"
            >
              Continue
            </button>
            <button
              onClick={() => haltEntireSystem()}
              className="text-[10px] font-heading font-bold px-2.5 py-1 rounded-lg border border-red-500/40 bg-red-500/10 hover:bg-red-500/20 text-red-600 transition-colors flex items-center gap-1 shadow-xs"
              title="Emergency Stop: Halt entire system, all workers, tasks, and LLM calls"
            >
              <span>🛑</span>
              <span>Stop All</span>
            </button>
          </div>
        </div>
      </div>

      {open && (
        <div ref={boxRef} className="h-32 overflow-y-auto px-4 py-2 font-mono text-xs select-text">
          {filtered.length === 0 ? (
            <div className="text-ink/40 py-4 text-center">No events matching filter</div>
          ) : (
            filtered.map((e) => {
              const isDirective = e.type === 'user.directive';
              const isManagerResp = e.type === 'manager.response';
              return (
                <div
                  key={e.id}
                  className={`py-0.5 leading-relaxed flex items-start gap-2.5 transition-colors ${
                    isDirective
                      ? 'bg-amber-500/10 -mx-4 px-4 font-semibold text-amber-900 border-l-2 border-amber-500'
                      : isManagerResp
                      ? 'bg-emerald-500/10 -mx-4 px-4 font-semibold text-emerald-900 border-l-2 border-emerald-500'
                      : 'hover:bg-ink/5'
                  }`}
                >
                  <span className="text-ink/30 shrink-0 select-none w-10 text-[10px] font-sans">{e.ts_sim}</span>
                  <span
                    className={`text-[10px] font-bold uppercase shrink-0 w-28 truncate ${
                      isDirective ? 'text-amber-700' : isManagerResp ? 'text-emerald-700' : 'text-ink/45'
                    }`}
                  >
                    {e.type}
                  </span>
                  <span className="flex-1 break-all text-ink/80">{e.text}</span>
                </div>
              );
            })
          )}
        </div>
      )}
    </div>
  );
}
