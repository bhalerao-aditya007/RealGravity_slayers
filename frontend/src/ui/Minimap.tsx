import { useEffect, useRef } from 'react';
import { LAYOUT } from '@/config/layout';
import { director } from '@/sim/director';
import { cameraCtl } from '@/three/cameraCtl';
import { useStore } from '@/state/store';
import { STATUS_COLORS } from '@/config/office';

export function Minimap() {
  const ref = useRef<HTMLCanvasElement>(null);
  useEffect(() => {
    let raf = 0;
    const draw = () => {
      raf = requestAnimationFrame(() => setTimeout(draw, 250));
      const c = ref.current; if (!c) return;
      const g = c.getContext('2d')!;
      const W = 216, H = 158;
      g.clearRect(0, 0, W, H);
      g.fillStyle = '#FAF7F2'; g.fillRect(0, 0, W, H);
      const sx = (x: number) => (x + 48) / 96 * W;
      const sz = (z: number) => (z + 35) / 70 * H;
      g.strokeStyle = '#2B2B2E33'; g.lineWidth = 1;
      for (const w of LAYOUT.walls) {
        g.beginPath(); g.moveTo(sx(w.x0), sz(w.z0)); g.lineTo(sx(w.x1), sz(w.z1)); g.stroke();
      }
      g.fillStyle = '#2B2B2E18';
      for (const it of LAYOUT.items) {
        if (['monitor', 'rug', 'art', 'clock', 'exitSign'].includes(it.type)) continue;
        const swap = Math.abs(Math.sin(it.rot)) > 0.5;
        g.fillRect(sx(it.x) - 1, sz(it.z) - 1, (swap ? it.d : it.w) / 96 * W, (swap ? it.w : it.d) / 70 * H);
      }
      const agents = useStore.getState().agents;
      for (const rt of director.runtimes) {
        if (rt.state === 'gone') continue;
        const a = agents[rt.id];
        g.fillStyle = STATUS_COLORS[a?.status ?? 'IDLE'] ?? '#888';
        g.beginPath(); g.arc(sx(rt.x), sz(rt.z), 2.2, 0, Math.PI * 2); g.fill();
      }
    };
    draw();
    return () => cancelAnimationFrame(raf);
  }, []);
  return (
    <div className="absolute left-4 bottom-4 z-10 rounded-xl border border-ink/10 bg-paper/90 backdrop-blur p-1.5 shadow-lg">
      <canvas ref={ref} width={216} height={158} className="rounded-lg cursor-crosshair"
        onClick={(e) => {
          const r = (e.target as HTMLCanvasElement).getBoundingClientRect();
          const x = ((e.clientX - r.left) / r.width) * 96 - 48;
          const z = ((e.clientY - r.top) / r.height) * 70 - 35;
          cameraCtl.flyTo([x + 12, 14, z + 12], [x, 0.8, z]);
        }} />
      <div className="text-[9px] font-mono text-ink/40 text-center pt-0.5">click to jump</div>
    </div>
  );
}
