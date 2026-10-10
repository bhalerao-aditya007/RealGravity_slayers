import * as THREE from 'three';
import { LAYOUT } from '@/config/layout';
import { Dept } from '@/config/office';

export function carpetTexture(): THREE.Texture {
  const c = document.createElement('canvas'); c.width = c.height = 256;
  const g = c.getContext('2d')!;
  g.fillStyle = '#cfc8bb'; g.fillRect(0, 0, 256, 256);
  for (let i = 0; i < 2600; i++) {
    const v = 190 + Math.floor(Math.random() * 40);
    g.fillStyle = `rgba(${v},${v - 6},${v - 14},0.5)`;
    g.fillRect(Math.random() * 256, Math.random() * 256, 2, 2);
  }
  const t = new THREE.CanvasTexture(c);
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.repeat.set(48, 35);
  return t;
}

export function blueprintTexture(): THREE.Texture {
  const c = document.createElement('canvas'); c.width = 1536; c.height = 1120;
  const g = c.getContext('2d')!;
  g.fillStyle = '#1d3a6e'; g.fillRect(0, 0, c.width, c.height);
  g.strokeStyle = 'rgba(207,227,255,0.10)'; g.lineWidth = 1;
  for (let x = 0; x < c.width; x += 32) { g.beginPath(); g.moveTo(x, 0); g.lineTo(x, c.height); g.stroke(); }
  for (let y = 0; y < c.height; y += 32) { g.beginPath(); g.moveTo(0, y); g.lineTo(c.width, y); g.stroke(); }
  const sx = (x: number) => (x + 48) / 96 * c.width;
  const sz = (z: number) => (z + 35) / 70 * c.height;
  g.strokeStyle = 'rgba(207,227,255,0.85)'; g.lineWidth = 3;
  for (const w of LAYOUT.walls) {
    g.beginPath(); g.moveTo(sx(w.x0), sz(w.z0)); g.lineTo(sx(w.x1), sz(w.z1)); g.stroke();
  }
  g.lineWidth = 1.5; g.strokeStyle = 'rgba(207,227,255,0.45)';
  for (const it of LAYOUT.items) {
    const swap = Math.abs(Math.sin(it.rot)) > 0.5;
    const w = (swap ? it.d : it.w) / 96 * c.width, d = (swap ? it.w : it.d) / 70 * c.height;
    if (it.type === 'monitor' || it.type === 'rug' || it.type === 'art') continue;
    g.strokeRect(sx(it.x) - w / 2, sz(it.z) - d / 2, w, d);
  }
  g.fillStyle = 'rgba(207,227,255,0.9)'; g.font = '600 22px "Space Grotesk", sans-serif';
  for (const z of LAYOUT.zones) {
    g.fillText(z.name.toUpperCase(), sx((z.x0 + z.x1) / 2) - g.measureText(z.name.toUpperCase()).width / 2, sz((z.z0 + z.z1) / 2));
  }
  return new THREE.CanvasTexture(c);
}

let whiteboardTex: THREE.CanvasTexture | null = null;
export function whiteboardTexture(): THREE.CanvasTexture {
  if (whiteboardTex) return whiteboardTex;
  const c = document.createElement('canvas'); c.width = 512; c.height = 224;
  const g = c.getContext('2d')!;
  drawWhiteboard(g, []);
  whiteboardTex = new THREE.CanvasTexture(c);
  return whiteboardTex;
}
export function drawWhiteboard(g: CanvasRenderingContext2D, outline: string[]) {
  g.fillStyle = '#f7f4ee'; g.fillRect(0, 0, 512, 224);
  g.strokeStyle = '#e4572e'; g.lineWidth = 4; g.strokeRect(8, 8, 496, 208);
  g.fillStyle = '#2B2B2E'; g.font = '600 20px "Space Grotesk", sans-serif';
  g.fillText('THE PLAN', 24, 40);
  g.font = '13px "JetBrains Mono", monospace';
  const items = outline.slice(0, 9);
  items.forEach((line, i) => {
    g.fillText('· ' + line.slice(0, 52), 26, 66 + i * 17);
  });
  if (!items.length) g.fillText('· awaiting the manager…', 26, 66);
}
export function updateWhiteboard(outline: string[]) {
  const t = whiteboardTex ?? whiteboardTexture();
  const img = (t.image as HTMLCanvasElement);
  drawWhiteboard(img.getContext('2d')!, outline);
  t.needsUpdate = true;
}
