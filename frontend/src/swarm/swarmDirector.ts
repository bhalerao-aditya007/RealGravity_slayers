// Pure walk/sit/break runtime for the swarm hall. No three.js — runs headless in tests.
import { HallLayout, lanePoint, laneSpeed, buildHallLayout, SwarmSize } from './hallLayout';

const SPEED = 1.8, TURN = Math.PI * 2, SIT_T = 1.2, SLIDE = 0.35;

export interface SRT {
  id: string; seed: number; roleId: string; isMod: boolean;
  x: number; z: number; heading: number; vx: number; vz: number; speed: number; phase: number;
  state: 'waiting' | 'door' | 'lane' | 'radial' | 'sitdown' | 'seated' | 'standup' | 'walkSlot' | 'slot' | 'gone';
  seatIdx: number; laneOff: number; laneDir: 1 | -1;
  tLane: number; tTarget: number; tFrom: number;
  dest: { x: number; z: number } | null;
  slotId?: string; until: number;
  activity: string; carry: boolean;
  bubble?: { text: string; until: number };
  speakT: number; think: boolean;
  sit?: { t: number; fx: number; fz: number; tx: number; tz: number; face: number; rev: boolean };
  lastFree: { x: number; z: number };
}
export const lerpAngle = (a: number, b: number, t: number) => {
  let d = b - a; while (d > Math.PI) d -= Math.PI * 2; while (d < -Math.PI) d += Math.PI * 2;
  return a + d * Math.max(0, Math.min(1, t));
};

export class SwarmDirector {
  runtimes: SRT[] = [];
  private byId = new Map<string, SRT>();
  private slotsUsed = new Map<string, string>();
  chairSlides = new Map<number, number>(); // seatIdx -> offset
  layout: HallLayout;
  time = 0;
  speakingId: string | null = null;

  constructor(layout: HallLayout) { this.layout = layout; }
  reset() { this.runtimes = []; this.byId.clear(); this.slotsUsed.clear(); this.chairSlides.clear(); this.time = 0; this.speakingId = null; }
  rt(id: string) { return this.byId.get(id); }
  pos(id: string) { const r = this.byId.get(id); return r ? { x: r.x, z: r.z } : null; }
  private seat(idx: number) { return (idx >= this.layout.n || idx < 0) ? this.layout.moderatorSeat : (this.layout.seats[idx] ?? this.layout.moderatorSeat); }

  join(id: string, seed: number, roleId: string, seatIdx: number, isMod: boolean, instant = false) {
    if (this.byId.has(id)) return;
    const s = this.seat(seatIdx);
    if (!s) return;
    const hasDoorWalker = this.runtimes.some((r) => r.state === 'door' || (r.state === 'lane' && r.z > this.layout.hall.depth / 2 - 2.0));
    const rt: SRT = {
      id, seed, roleId, isMod, x: (seatIdx % 2 === 0 ? -0.35 : 0.35), z: this.layout.hall.depth / 2 - 0.8,
      heading: Math.PI, vx: 0, vz: 0, speed: 0, phase: 0,
      state: (instant || isMod) ? 'seated' : (hasDoorWalker ? 'waiting' : 'door'), seatIdx, laneOff: seatIdx % 2 === 0 ? this.layout.lanes.off1 : this.layout.lanes.off2,
      laneDir: seatIdx % 2 === 0 ? -1 : 1, tLane: Math.PI / 2, tTarget: 0, tFrom: Math.PI / 2,
      dest: null, until: 0, activity: 'idle', carry: false, speakT: 0, think: false,
      lastFree: { x: 0, z: this.layout.hall.depth / 2 - 0.8 },
    };
    this.runtimes.push(rt); this.byId.set(id, rt);
    if (instant || isMod) { // seated immediately
      rt.x = s.x; rt.z = s.z; rt.heading = s.face; rt.state = 'seated'; rt.activity = 'idle';
    }
  }

  speak(id: string, text: string) {
    const r = this.byId.get(id); if (!r) return;
    this.speakingId = id;
    r.bubble = { text: text.slice(0, 140), until: this.time + 5 };
    r.speakT = 5;
  }
  setThink(id: string, on: boolean) { const r = this.byId.get(id); if (r) r.think = on; }

  breakStart(id: string, _kind: string) {
    const r = this.byId.get(id); if (!r || r.state === 'gone') return;
    r.until = 0; r.dest = null;
    this.sendToCoffee(r);
  }
  breakEnd(id: string) {
    const r = this.byId.get(id); if (!r || r.state === 'gone') return;
    this.releaseSlot(r); r.until = 0; r.carry = false; r.activity = 'idle';
    this.routeToSeat(r);
  }
  chat(a: string, _b: string, line: string) {
    const r = this.byId.get(a); if (!r) return;
    r.activity = 'talk'; r.bubble = { text: line.slice(0, 140), until: this.time + 5 };
  }
  release(id: string) { const r = this.byId.get(id); if (r) { this.releaseSlot(r); r.state = 'gone'; } }

  // ── routing ──────────────────────────────────────────────
  private routeToSeat(r: SRT) {
    const s = this.seat(r.seatIdx);
    r.activity = 'idle';
    if (r.state === 'seated') return;
    if (r.state === 'slot' || r.state === 'walkSlot') {
      // back to lane at west, then around to seat angle
      const west = Math.PI;
      r.state = 'walkSlot'; r.dest = lanePoint(this.layout.a, this.layout.b, r.laneOff, west);
      r.tTarget = this.wrapTarget(west, s.angle, r.laneDir); r.tFrom = west; r.tLane = west;
      r.until = -1; // then lane -> radial -> sit
      return;
    }
    // from approach/standup position: go outward to lane at seat angle, then lane is a no-op
    r.state = 'radial'; r.dest = { x: s.ax, z: s.az };
    r.tTarget = s.angle; r.tFrom = s.angle; r.tLane = s.angle;
  }
  private sendToCoffee(r: SRT) {
    const slot = this.takeSlot(r.id);
    const west = Math.PI;
    const s = this.seat(r.seatIdx);
    // stand up handled by state machine; route: radial-out -> lane west -> slot
    r.tTarget = this.wrapTarget(s.angle, west, r.laneDir);
    r.tFrom = s.angle; r.tLane = s.angle;
    r.dest = slot ? { x: slot.x, z: slot.z } : this.layout.coffeeCorner.queue[r.id.length % this.layout.coffeeCorner.queue.length];
    r.state = 'radial'; r.activity = 'idle';
    r.until = -1;
  }
  private wrapTarget(from: number, to: number, dir: 1 | -1): number {
    const TAU = Math.PI * 2;
    let d = (to - from) % TAU; if (d < 0) d += TAU;
    if (dir === -1) { let dd = (from - to) % TAU; if (dd < 0) dd += TAU; return from - dd; }
    return from + d;
  }
  private takeSlot(agentId: string) {
    for (const s of this.layout.coffeeCorner.slots)
      if (!this.slotsUsed.has(s.id)) { this.slotsUsed.set(s.id, agentId); return s; }
    return null;
  }
  private releaseSlot(r: SRT) { for (const [sid, aid] of this.slotsUsed) if (aid === r.id) this.slotsUsed.delete(sid); }

  // ── per-frame ────────────────────────────────────────────
  update(dt: number) {
    this.time += dt;
    const hasEvenDoor = this.runtimes.some((r) => r.seatIdx % 2 === 0 && (r.state === 'door' || (r.state === 'lane' && r.z > this.layout.hall.depth / 2 - 0.9)));
    const hasOddDoor = this.runtimes.some((r) => r.seatIdx % 2 !== 0 && (r.state === 'door' || (r.state === 'lane' && r.z > this.layout.hall.depth / 2 - 0.9)));
    if (!hasEvenDoor) {
      const nextEven = this.runtimes.find((r) => r.state === 'waiting' && r.seatIdx % 2 === 0);
      if (nextEven) { nextEven.state = 'door'; nextEven.x = -0.35; nextEven.z = this.layout.hall.depth / 2 - 0.8; }
    }
    if (!hasOddDoor) {
      const nextOdd = this.runtimes.find((r) => r.state === 'waiting' && r.seatIdx % 2 !== 0);
      if (nextOdd) { nextOdd.state = 'door'; nextOdd.x = 0.35; nextOdd.z = this.layout.hall.depth / 2 - 0.8; }
    }
    for (const r of this.runtimes) {
      if (r.state === 'gone') continue;
      if (r.bubble && this.time > r.bubble.until) r.bubble = undefined;
      r.speakT = Math.max(0, r.speakT - dt);
      if (r.speakT === 0 && this.speakingId === r.id && !r.bubble) this.speakingId = null;
      this.step(r, dt);
      r.speed = Math.hypot(r.vx, r.vz);
      r.phase += r.speed * 6.6 * dt;
      if (r.think) r.activity = 'think';
      else if (r.speakT > 0) r.activity = 'talk';
      else if (r.activity === 'think' || r.activity === 'talk') r.activity = 'idle';
    }
    this.separate();
    this.hardResolve();
  }

  private step(r: SRT, dt: number) {
    const L = this.layout, s = this.seat(r.seatIdx);
    switch (r.state) {
      case 'door': {
        const e = lanePoint(L.a, L.b, r.laneOff, Math.PI / 2);
        if (this.moveTo(r, e.x, e.z, dt)) {
          r.state = 'lane'; r.tLane = Math.PI / 2;
          r.tFrom = Math.PI / 2; r.tTarget = this.wrapTarget(Math.PI / 2, s.angle, r.laneDir);
        }
        break;
      }
      case 'lane': {
        const sp = laneSpeed(L.a, L.b, r.laneOff, r.tLane);
        r.tLane += r.laneDir * (SPEED / sp) * dt;
        const p = lanePoint(L.a, L.b, r.laneOff, r.tLane);
        this.faceMove(r, p.x - r.x, p.z - r.z, dt);
        r.vx = (p.x - r.x) / Math.max(dt, 1e-4); r.vz = (p.z - r.z) / Math.max(dt, 1e-4);
        r.x = p.x; r.z = p.z;
        if ((r.laneDir === 1 && r.tLane >= r.tTarget) || (r.laneDir === -1 && r.tLane <= r.tTarget)) {
          if (r.until === -1 && r.dest && Math.abs(r.tTarget - Math.PI) < 1e-6 + (Math.abs(r.tTarget) === Math.PI ? 0 : Math.PI * 2)) {
            // reached west on the way to coffee
            r.state = 'walkSlot';
          } else { r.state = 'radial'; r.dest = { x: s.ax, z: s.az }; }
        }
        break;
      }
      case 'radial': case 'walkSlot': {
        if (!r.dest) { r.state = 'seated'; break; }
        if (this.crowded(r) && r.state === 'radial') { r.vx = 0; r.vz = 0; break; } // yield
        if (this.moveTo(r, r.dest.x, r.dest.z, dt)) {
          if (r.state === 'walkSlot') {
            r.state = 'slot'; r.until = this.time + 9999;
            r.activity = 'drink'; r.carry = true;
            const sl = [...this.slotsUsed].find(([, aid]) => aid === r.id);
            const def = sl && L.coffeeCorner.slots.find((x) => x.id === sl[0]);
            if (def) r.heading = def.face;
          } else if (r.until === -1 && r.dest === undefined) { r.state = 'walkSlot'; }
          else {
            // arrived at approach: sit (unless this radial was the outbound coffee leg)
            this.beginSit(r, false);
          }
        }
        break;
      }
      case 'sitdown': case 'standup': this.sitAnim(r, dt); break;
      case 'seated': case 'slot': break;
    }
  }

  private crowded(r: SRT): boolean {
    for (const o of this.runtimes) {
      if (o === r || o.state === 'seated' || o.state === 'gone' || o.state === 'sitdown' || o.state === 'standup' || o.state === 'slot') continue;
      if (Math.hypot(o.x - r.x, o.z - r.z) < 0.50) return true;
    }
    return false;
  }
  private moveTo(r: SRT, tx: number, tz: number, dt: number): boolean {
    const dx = tx - r.x, dz = tz - r.z, d = Math.hypot(dx, dz);
    if (d < 0.12) { r.vx = 0; r.vz = 0; return true; }
    const sp = Math.min(SPEED, d * 4);
    r.vx = (dx / d) * sp; r.vz = (dz / d) * sp;
    this.faceMove(r, r.vx, r.vz, dt);
    r.x += r.vx * dt; r.z += r.vz * dt;
    return false;
  }
  private faceMove(r: SRT, vx: number, vz: number, dt: number) {
    if (Math.hypot(vx, vz) > 0.05) r.heading = lerpAngle(r.heading, Math.atan2(vx, vz), TURN * dt);
  }

  private beginSit(r: SRT, rev: boolean) {
    const s = this.seat(r.seatIdx);
    r.sit = { t: 0, fx: r.x, fz: r.z, tx: s.x, tz: s.z, face: s.face, rev };
    r.state = rev ? 'standup' : 'sitdown';
  }
  private sitAnim(r: SRT, dt: number) {
    const S = r.sit!; S.t += dt / SIT_T;
    const t = Math.min(1, S.t), k = t * t * (3 - 2 * t);
    const out = t < 0.4 ? SLIDE * (t / 0.4) : t < 0.7 ? SLIDE : SLIDE * (1 - (t - 0.7) / 0.3);
    this.chairSlides.set(r.seatIdx, out);
    if (!S.rev) {
      r.x = S.fx + (S.tx - S.fx) * k; r.z = S.fz + (S.tz - S.fz) * k;
      r.heading = lerpAngle(r.heading, S.face, 6 * dt);
    } else {
      const s = this.seat(r.seatIdx);
      r.x = S.tx + (s.ax - S.tx) * k; r.z = S.tz + (s.az - S.tz) * k;
      r.heading = lerpAngle(r.heading, Math.atan2(s.ax - s.x, s.az - s.z), 6 * dt);
    }
    if (t >= 1) {
      this.chairSlides.delete(r.seatIdx); r.sit = undefined;
      if (S.rev) { r.state = 'seated'; this.routeAfterStand(r); }
      else { r.state = 'seated'; r.heading = S.face; }
    }
  }
  private routeAfterStand(r: SRT) {
    // after standup, whatever queued intent (coffee) takes over
    if (r.dest && r.until === -1) { r.state = 'radial'; } else { r.state = 'seated'; }
  }

  private separate() {
    const movers = this.runtimes.filter((r) => ['door', 'lane', 'radial', 'walkSlot'].includes(r.state));
    for (let i = 0; i < movers.length; i++) for (let j = i + 1; j < movers.length; j++) {
      const a = movers[i], b = movers[j];
      const dx = b.x - a.x, dz = b.z - a.z, d = Math.hypot(dx, dz);
      if (d < 0.68 && d > 1e-4) {
        const push = (0.68 - d) * 0.5;
        a.x -= (dx / d) * push; a.z -= (dz / d) * push;
        b.x += (dx / d) * push; b.z += (dz / d) * push;
      }
    }
  }
  private hardResolve() {
    const L = this.layout;
    for (const r of this.runtimes) {
      if (['gone', 'seated', 'sitdown', 'standup', 'slot'].includes(r.state)) continue;
      // keep out of the table ring
      const t = Math.atan2(r.z / (L.b || 1), r.x / (L.a || 1));
      const o = L.table.outer[Math.floor(((t / (Math.PI * 2)) + 1) % 1 * L.table.outer.length) % L.table.outer.length];
      const dOut = Math.hypot(o[0], o[1]);
      const dP = Math.hypot(r.x, r.z);
      const insideRing = dP < dOut - 0.05 && (L.table.solid || (L.table.well && dP > Math.hypot(L.table.well[0][0], L.table.well[0][1]) + 0.4));
      if (insideRing) {
        const k = (dOut + 0.3) / (dP || 1);
        r.x *= k; r.z *= k; r.vx = 0; r.vz = 0;
      }
      // keep out of other chairs (not your own target)
      for (const s of [...L.seats, L.moderatorSeat]) {
        if (s.index === r.seatIdx && r.state === 'radial') continue;
        const dx = r.x - s.x, dz = r.z - s.z, d = Math.hypot(dx, dz);
        if (d < 0.45 && d > 1e-4) { r.x = s.x + (dx / d) * 0.45; r.z = s.z + (dz / d) * 0.45; }
      }
      r.x = Math.max(L.walls.west + 0.5, Math.min(L.walls.east - 0.5, r.x));
      r.z = Math.max(L.walls.north + 0.5, Math.min(L.walls.south - 0.5, r.z));
      if (!insideRing) r.lastFree = { x: r.x, z: r.z };
    }
  }
}

export function makeDirector(n: SwarmSize) { return new SwarmDirector(buildHallLayout(n)); }
