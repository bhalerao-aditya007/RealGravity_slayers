import { useState, useMemo, useEffect } from 'react';
import { motion } from 'framer-motion';
import { useStore } from '@/state/store';
import { Icon, I } from './Icons';
import { fmtEffort } from '@/state/events';
import { jsPDF } from 'jspdf';
import { generateProjectFiles, downloadProjectZip, downloadMarkdownReport, downloadSingleFile } from '@/services/projectBundle';

function Md({ text }: { text: string }) {
  const lines = text.split('\n');
  return (
    <div className="space-y-1.5">
      {lines.map((l, i) => {
        if (l.startsWith('## ')) return <h2 key={i} className="font-heading font-bold text-lg mt-4">{l.slice(3)}</h2>;
        if (l.startsWith('# ')) return <h1 key={i} className="font-heading font-bold text-2xl mt-2">{l.slice(2)}</h1>;
        if (l.startsWith('- ')) return <li key={i} className="text-sm font-body ml-5 list-disc">{inline(l.slice(2))}</li>;
        if (l.startsWith('> ')) return <blockquote key={i} className="text-sm font-body border-l-2 pl-3 text-ink/70" style={{ borderColor: 'var(--accent)' }}>{inline(l.slice(2))}</blockquote>;
        if (l.trim() === '') return <div key={i} className="h-1" />;
        return <p key={i} className="text-sm font-body leading-relaxed">{inline(l)}</p>;
      })}
    </div>
  );
}

function inline(s: string) {
  const parts = s.split(/(\*\*[^*]+\*\*|`[^`]+`)/g);
  return parts.map((p, i) => {
    if (p.startsWith('**')) return <b key={i}>{p.slice(2, -2)}</b>;
    if (p.startsWith('`')) return <code key={i} className="font-mono text-xs bg-ink/8 rounded px-1">{p.slice(1, -1)}</code>;
    return <span key={i}>{p}</span>;
  });
}

export function ReportView() {
  const open = useStore((s) => s.reportOpen);
  const report = useStore((s) => s.report);
  const goal = useStore((s) => s.goal) || 'Build a real-time crypto price tracker in React with the name of project as "CRYPTracker"';
  const agents = useStore((s) => s.agents);
  const tasks = useStore((s) => s.tasks);
  const departments = useStore((s) => s.departments);

  const [activeTab, setActiveTab] = useState<'report' | 'files'>('report');
  const [selectedFile, setSelectedFile] = useState<string>('src/App.tsx');
  const [copied, setCopied] = useState(false);
  const [building, setBuilding] = useState(0);
  const [zipping, setZipping] = useState(false);

  const dirMatch = report?.report_markdown?.match(/\*\*Output Directory:\*\*\s*`([^`]+)`/);
  const localOutputDir = dirMatch
    ? dirMatch[1]
    : (report?.sources?.[0]?.url
      ? report.sources[0].url.replace(/^file:\/\/\/?/, '').replace(/\/[^/]+$/, '').replace(/\//g, '\\')
      : 'D:\\GravityDesk\\output\\ProjectOutput');
  const projectName = localOutputDir.split(/[\\/]/).filter(Boolean).pop() || 'ProjectOutput';

  const [realFiles, setRealFiles] = useState<Record<string, string> | null>(null);

  useEffect(() => {
    if (!open || !localOutputDir) return;
    fetch(`http://localhost:8000/api/deliverables?dir=${encodeURIComponent(localOutputDir)}`)
      .then(r => r.json())
      .then(d => {
        if (d.files && Object.keys(d.files).length > 0) {
          setRealFiles(d.files);
          setSelectedFile(Object.keys(d.files)[0]);
        }
      })
      .catch(() => {});
  }, [open, localOutputDir]);

  const fallbackFiles = useMemo(() => generateProjectFiles(goal), [goal]);
  const files = realFiles || fallbackFiles;
  const fileKeys = useMemo(() => Object.keys(files), [files]);

  if (!open || !report) return null;

  const handleDownloadZip = async () => {
    setZipping(true);
    try {
      await downloadProjectZip(goal, files);
    } finally {
      setZipping(false);
    }
  };

  const handleCopyPath = () => {
    navigator.clipboard.writeText(localOutputDir);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const exportPdf = async () => {
    setBuilding(1);
    await wait(350); setBuilding(2);
    await wait(350); setBuilding(3);
    const doc = new jsPDF({ unit: 'pt', format: 'a4' });
    const W = doc.internal.pageSize.getWidth();
    let y = 60;
    doc.setFont('helvetica', 'bold'); doc.setFontSize(22); doc.setTextColor('#E4572E');
    doc.text('GravityDesk - Final Synthesis Report', 40, y); y += 26;
    doc.setTextColor('#2B2B2E'); doc.setFontSize(10); doc.setFont('helvetica', 'normal');
    doc.text(`Organizational effort ${fmtEffort(report.effort_logical_s)} vs real time ${(report.effort_real_s / 60).toFixed(1)} min`, 40, y); y += 24;
    for (const line of report.report_markdown.split('\n')) {
      if (!line.trim()) { y += 8; continue; }
      const h = line.startsWith('## '), h1 = line.startsWith('# ');
      doc.setFont('helvetica', h || h1 ? 'bold' : 'normal');
      doc.setFontSize(h1 ? 15 : h ? 12 : 10);
      const text = line.replace(/^#+ /, '').replace(/^> /, '').replace(/\*\*/g, '').replace(/`/g, '');
      const wrapped = doc.splitTextToSize(text, W - 80) as string[];
      doc.text(wrapped, 40, y);
      y += wrapped.length * (h1 ? 20 : h ? 17 : 13) + 3;
      if (y > 760) { doc.addPage(); y = 60; }
    }
    if (report.sources.length) {
      y += 14; doc.setFont('helvetica', 'bold'); doc.setFontSize(12); doc.text('Sources', 40, y); y += 16;
      doc.setFont('helvetica', 'normal'); doc.setFontSize(9);
      for (const s of report.sources) {
        doc.text(`${s.verified ? '[verified]' : '[unverified]'} ${s.title} - ${s.url}`, 40, y, { maxWidth: W - 80 });
        y += 22;
      }
    }
    if (y > 640) { doc.addPage(); y = 60; }
    y += 10; doc.setFont('helvetica', 'bold'); doc.setFontSize(12); doc.text('Org chart', 40, y); y += 16;
    doc.setFontSize(9); doc.setFont('helvetica', 'normal');
    for (const a of Object.values(agents)) {
      doc.text(`${'  '.repeat(a.role === 'manager' ? 0 : a.role === 'lead' ? 1 : 2)}- ${a.name} (${a.role}${a.department ? ', ' + a.department : ''}) - ${a.done ?? 0} tasks done`, 40, y);
      y += 13;
      if (y > 760) { doc.addPage(); y = 60; }
    }
    y += 10; doc.setFont('helvetica', 'bold'); doc.setFontSize(12); doc.text('Task timeline', 40, y); y += 16;
    doc.setFontSize(9); doc.setFont('helvetica', 'normal');
    for (const t of Object.values(tasks)) {
      doc.text(`${t.id}  ${t.status.padEnd(8)} ${t.description}`, 40, y, { maxWidth: W - 80 });
      y += 13;
      if (y > 760) { doc.addPage(); y = 60; }
    }
    doc.save(`${projectName}-report.pdf`);
    await wait(300);
    setBuilding(0);
  };

  return (
    <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }}
      className="absolute inset-0 z-40 bg-ink/50 backdrop-blur-sm flex items-center justify-center p-6"
      onClick={(e) => e.target === e.currentTarget && useStore.setState({ reportOpen: false })}>
      <motion.div initial={{ y: 24, opacity: 0 }} animate={{ y: 0, opacity: 1 }}
        className="w-[880px] max-h-[88vh] rounded-2xl bg-paper shadow-2xl border border-ink/10 overflow-hidden flex flex-col">

        {/* Modal Header */}
        <div className="flex items-center gap-3 px-6 py-4 border-b border-ink/10 blueprint-grid">
          <div className="w-2.5 h-8 rounded-full" style={{ background: 'var(--accent)' }} />
          <div className="flex-1">
            <h2 className="font-heading font-bold text-lg flex items-center gap-2">
              Deliverables & Final Report
              <span className="text-xs bg-emerald-500/15 text-emerald-700 px-2 py-0.5 rounded font-mono font-medium">COMPLETE</span>
            </h2>
            <p className="text-xs font-mono text-ink/50">
              Organizational effort {fmtEffort(report.effort_logical_s)} vs real time {(report.effort_real_s / 60).toFixed(1)} min
            </p>
          </div>

          {/* Action Download Buttons */}
          <div className="flex items-center gap-2">
            <button
              onClick={handleDownloadZip}
              disabled={zipping}
              className="flex items-center gap-1.5 rounded-xl px-3.5 py-1.5 text-white text-xs font-heading shadow-md transition-all hover:opacity-95"
              style={{ background: '#2563EB' }}
              title="Download full project source code as .ZIP"
            >
              <Icon d={I.download} size={13} />
              {zipping ? 'Zipping...' : 'Download Code (.ZIP)'}
            </button>

            <button
              onClick={() => downloadMarkdownReport(goal, report.report_markdown)}
              className="flex items-center gap-1.5 rounded-xl px-3 py-1.5 text-ink/80 text-xs font-heading bg-ink/5 hover:bg-ink/10 transition-colors"
              title="Download report as Markdown (.md)"
            >
              <Icon d={I.download} size={13} />
              Report (.md)
            </button>

            <button
              onClick={exportPdf}
              disabled={building > 0}
              className="flex items-center gap-1.5 rounded-xl px-3 py-1.5 text-white text-xs font-heading shadow-md transition-all"
              style={{ background: 'var(--accent)' }}
            >
              <Icon d={I.download} size={13} />
              {building === 0 ? 'Export PDF' : `Exporting ${building}/3`}
            </button>

            <button onClick={() => useStore.setState({ reportOpen: false })} className="p-1 text-ink/40 hover:text-ink">
              <Icon d={I.x} size={16} />
            </button>
          </div>
        </div>

        {/* Local Disk Location Banner */}
        <div className="px-6 py-2.5 bg-amber-500/10 border-b border-amber-500/20 flex items-center justify-between text-xs">
          <div className="flex items-center gap-2 text-ink/80 font-mono">
            <span className="font-semibold text-amber-700">Output Folder:</span>
            <span className="bg-paper px-2 py-0.5 rounded border border-ink/10">{localOutputDir}</span>
          </div>
          <button
            onClick={handleCopyPath}
            className="text-[11px] font-heading font-medium text-amber-800 hover:text-amber-950 underline decoration-dotted"
          >
            {copied ? 'Path Copied!' : 'Copy Local Path'}
          </button>
        </div>

        {/* Tab Selector */}
        <div className="flex items-center gap-4 px-6 pt-3 border-b border-ink/10 text-xs font-heading font-medium">
          <button
            onClick={() => setActiveTab('report')}
            className={`pb-2.5 border-b-2 transition-colors flex items-center gap-1.5 ${
              activeTab === 'report' ? 'border-[var(--accent)] text-ink font-bold' : 'border-transparent text-ink/50 hover:text-ink'
            }`}
          >
            <Icon d={I.check} size={13} />
            Executive Synthesis Report
          </button>
          <button
            onClick={() => setActiveTab('files')}
            className={`pb-2.5 border-b-2 transition-colors flex items-center gap-1.5 ${
              activeTab === 'files' ? 'border-[var(--accent)] text-ink font-bold' : 'border-transparent text-ink/50 hover:text-ink'
            }`}
          >
            <Icon d={I.layers} size={13} />
            Project Deliverables & Source Code ({fileKeys.length} files)
          </button>
        </div>

        {/* Tab Content Body */}
        <div className="flex-1 overflow-y-auto px-8 py-5">
          {activeTab === 'report' ? (
            <div>
              <Md text={report.report_markdown} />
              {report.sources.length > 0 && (
                <>
                  <h3 className="font-heading font-bold text-base mt-6 mb-2">Sources & References</h3>
                  <div className="space-y-1.5">
                    {report.sources.map((s) => (
                      <div key={s.url} className="flex items-center gap-2 text-sm font-body">
                        <span className={`text-[10px] font-mono px-1.5 py-0.5 rounded ${s.verified ? 'bg-[#2f9e6e]/15 text-[#20714f]' : 'bg-ink/8 text-ink/50'}`}>
                          {s.verified ? 'verified' : 'unverified'}
                        </span>
                        <a href={s.url} target="_blank" rel="noreferrer" className="underline decoration-dotted text-ink/80">{s.title}</a>
                      </div>
                    ))}
                  </div>
                </>
              )}
            </div>
          ) : (
            /* Deliverables / Source Code Tab */
            <div className="grid grid-cols-12 gap-4 h-[440px]">
              {/* File list sidebar */}
              <div className="col-span-4 border border-ink/10 rounded-xl bg-ink/2 p-2 overflow-y-auto space-y-1">
                <div className="text-[10px] font-mono uppercase tracking-wider text-ink/40 px-2 py-1">Generated Files</div>
                {fileKeys.map((fk) => (
                  <button
                    key={fk}
                    onClick={() => setSelectedFile(fk)}
                    className={`w-full text-left px-2.5 py-1.5 rounded-lg text-xs font-mono transition-colors truncate flex items-center gap-2 ${
                      selectedFile === fk ? 'bg-[var(--accent)] text-white font-bold' : 'text-ink/75 hover:bg-ink/5'
                    }`}
                  >
                    <span>{fk.endsWith('.tsx') || fk.endsWith('.ts') ? 'TS' : fk.endsWith('.json') ? '{}' : 'MD'}</span>
                    <span className="truncate">{fk}</span>
                  </button>
                ))}
              </div>

              {/* Code viewer pane */}
              <div className="col-span-8 border border-ink/10 rounded-xl bg-ink/5 flex flex-col overflow-hidden">
                <div className="px-3 py-2 border-b border-ink/10 flex items-center justify-between bg-ink/3">
                  <span className="font-mono text-xs text-ink/70 font-semibold">{selectedFile}</span>
                  <div className="flex items-center gap-2">
                    <button
                      onClick={() => {
                        navigator.clipboard.writeText(files[selectedFile] || '');
                        setCopied(true);
                        setTimeout(() => setCopied(false), 1500);
                      }}
                      className="text-[11px] font-mono px-2 py-0.5 rounded bg-paper border border-ink/10 hover:bg-ink/5 text-ink/70"
                    >
                      {copied ? 'Copied!' : 'Copy Code'}
                    </button>
                    <button
                      onClick={() => downloadSingleFile(selectedFile.split('/').pop() || 'file.txt', files[selectedFile] || '')}
                      className="text-[11px] font-mono px-2 py-0.5 rounded bg-paper border border-ink/10 hover:bg-ink/5 text-ink/70 flex items-center gap-1"
                    >
                      <Icon d={I.download} size={11} />
                      Save
                    </button>
                  </div>
                </div>
                <pre className="flex-1 p-4 overflow-auto font-mono text-xs leading-relaxed text-ink/90 bg-[#FAF7F2] select-text">
                  <code>{files[selectedFile] || '// Select a file to view code'}</code>
                </pre>
              </div>
            </div>
          )}
        </div>
      </motion.div>
    </motion.div>
  );
}

const wait = (ms: number) => new Promise((r) => setTimeout(r, ms));
