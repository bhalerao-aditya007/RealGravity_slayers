export interface EnvelopeFx { x0: number; z0: number; x1: number; z1: number; t: number; dur: number }
export interface CourierFx { path: { x: number; z: number }[]; t: number; dur: number }
export interface StampFx { x: number; z: number; ok: boolean; t: number }

export const fx = {
  envelopes: [] as EnvelopeFx[],
  couriers: [] as CourierFx[],
  stamps: [] as StampFx[],
  spawnEnvelope(x0: number, z0: number, x1: number, z1: number) {
    const dist = Math.hypot(x1 - x0, z1 - z0);
    if (dist < 20) this.envelopes.push({ x0, z0, x1, z1, t: 0, dur: Math.max(0.8, dist / 8) });
  },
  spawnCourier(path: { x: number; z: number }[], dist: number) {
    this.couriers.push({ path, t: 0, dur: dist / 2.5 });
  },
  stamp(x: number, z: number, ok: boolean) { this.stamps.push({ x, z, ok, t: 0 }); },
  update(dt: number) {
    for (const e of this.envelopes) e.t += dt;
    this.envelopes = this.envelopes.filter((e) => e.t < e.dur);
    for (const c of this.couriers) c.t += dt;
    this.couriers = this.couriers.filter((c) => c.t < c.dur);
    for (const s of this.stamps) s.t += dt;
    this.stamps = this.stamps.filter((s) => s.t < 2.2);
  },
  reset() { this.envelopes = []; this.couriers = []; this.stamps = []; },
};
