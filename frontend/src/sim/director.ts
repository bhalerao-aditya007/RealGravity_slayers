import { LAYOUT, Item, Slot } from '@/config/layout';
import { GRID, nearestFree } from '@/nav/grid';
import { findPath, Pt } from '@/nav/astar';
import { ACCEL, AGENT_R, CARRY_SPEED, TURN_RATE, WALK_SPEED } from '@/config/office';
import { AgentDef } from '@/mock/data';
import { fx } from './effects';
import { startBreakAct, startChatAct, seatInMeeting, releaseMeeting } from './directorActs';
import { useStore } from '@/state/store';
import { bayZoneOf } from '@/state/departments';

export type ActKind = 'sit' | 'stand' | 'goto' | 'slot' | 'chat' | 'despawn' | 'wait';
export interface Act {
  kind: ActKind;
  chair?: Item; pt?: Pt; slot?: Slot; activity?: string;
  untilRel?: number; partner?: string; line?: string;
}
export interface RT {
  id: string; def: AgentDef;
  x: number; z: number; vx: number; vz: number; heading: number; speed: number;
  phase: number; // walk cycle phase
  state: 'walk' | 'sitdown' | 'seated' | 'standup' | 'slot' | 'chat' | 'gone';
  path: Pt[]; pi: number;
  acts: Act[];
  sit?: { chair: Item; t: number; fromX: number; fromZ: number; dirX: number; dirZ: number; reverse: boolean };
  activity: string; // type | think | drink | eat | talk | idle | review | wait
  until: number; // wall clock for slot/chat end
  carry: boolean; chatWith?: string; speakTurn: boolean;
  line?: string;
  bubble?: { text: string; until: number };
  lastFreeX: number; lastFreeZ: number; stuckT: number; repaths: number;
  doorId?: string; waitingDoor?: string;
  seatChair?: Item; // currently occupying
  celebrateT: number; confuseT: number;
  meetRoom?: string;
}

export interface DoorRT { users: Set<string>; queue: string[] }

export class Director {
  runtimes: RT[] = [];
  private byId = new Map<string, RT>();
  chairOffsets = new Map<string, number>(); // chairItemId -> offset 0..0.35
  private slotsUsed = new Map<string, string>(); // slotId -> agentId
  private doors = new Map<string, DoorRT>();
  heat: Record<string, number> = {};
  time = 0;
  private spawnCount = 0;
  pace: 'sprint' | 'normal' | 'workday' = 'normal';
  // FIX F14: when the pantry's 7 slots are full, overflow agents all walked to ONE point and piled into the
  // fridge. They now take distinct queue spots in the free band between the stool tables and the coffee slots.
  private queueUsed = new Map<number, string>();

  constructor() { for (const d of LAYOUT.doors) this.doors.set(d.id, { users: new Set(), queue: [] }); }

  reset() {
    this.runtimes = []; this.byId.clear(); this.chairOffsets.clear(); this.slotsUsed.clear();
    for (const d of this.doors.values()) { d.users.clear(); d.queue = []; }
    this.heat = {}; this.time = 0; this.spawnCount = 0;
    this.queueUsed.clear();
    this.pace = 'normal';
    fx.reset();
  }

  rt(id: string) { return this.byId.get(id); }
  pos(id?: string) { const r = id && this.byId.get(id); return r ? { x: r.x, z: r.z } : null; }

  queueSpot(rt: RT): Pt {
    for (let k = 0; k < 12; k++) {
      if (!this.queueUsed.has(k)) {
        this.queueUsed.set(k, rt.id);
        return nearestFree(GRID, 20.6 + k * 0.85, 8.2 + (k % 2) * 0.5);
      }
    }
    return nearestFree(GRID, 27, 8.45);
  }
  freeQueue(rt: RT) { for (const [k, id] of this.queueUsed) if (id === rt.id) this.queueUsed.delete(k); }

  doorQueueCount() { let n = 0; for (const d of this.doors.values()) n += d.queue.length; return n; }

  // ---- Commands (called by the event reducer) ----
  spawn(def: AgentDef, instant = false) {
    const off = this.spawnCount++;
    const rt: RT = {
      id: def.id, def, x: LAYOUT.entrance.x + (off % 3) * 0.7 - 0.7,
      z: LAYOUT.entrance.z - Math.floor(off / 3) * (this.pace === 'sprint' ? 0.6 : 0.9),
      vx: 0, vz: 0, heading: Math.PI, speed: 0, phase: 0,
      state: 'seated', path: [], pi: 0, acts: [], activity: 'idle', until: 0, carry: false,
      lastFreeX: LAYOUT.entrance.x, lastFreeZ: LAYOUT.entrance.z, stuckT: 0, repaths: 0,
      celebrateT: 0, confuseT: 0, speakTurn: false,
    };
    this.runtimes.push(rt); this.byId.set(def.id, rt);
    const chair = LAYOUT.items.find((i) => i.id === def.chairId)!;
    this.enqueue(rt, [{ kind: 'sit', chair }], instant);
  }

  release(id: string, instant = false) {
    const rt = this.byId.get(id); if (!rt) return;
    releaseMeeting(this, rt);
    this.enqueue(rt, [
      { kind: 'stand' }, { kind: 'goto', pt: { x: LAYOUT.exit.x, z: LAYOUT.exit.z - 1 } }, { kind: 'despawn' },
    ], instant);
  }

  sendTo(id: string, purpose: string, instant = false) {
    const rt = this.byId.get(id); if (!rt) return;
    if (purpose === 'desk') {
      releaseMeeting(this, rt);
      this.enqueue(rt, [{ kind: 'stand' }, { kind: 'sit', chair: rt.seatChair ?? this.deskChair(rt) }], instant);
    } else if (purpose === 'exit') this.release(id, instant);
    else if (purpose === 'meeting') seatInMeeting(this, rt, instant);
    else this.goZone(rt, purpose, instant);
  }

  /** Permission wait: interrupt current intent, walk to the manager's cabin, stand. */
  sendToCabin(id: string, instant = false) {
    const rt = this.byId.get(id); if (!rt || rt.state === 'gone') return;
    rt.acts = [];
    rt.until = 0;
    const cabin = { x: 2.2, z: -19.5 }; // free standing spot beside the exec desk
    this.enqueue(rt, [{ kind: 'stand' }, { kind: 'goto', pt: cabin }, { kind: 'wait', untilRel: 9999 }], instant);
  }

  /** Permission granted: leave the cabin, return to desk. */
  resumeFromCabin(id: string, instant = false) {
    const rt = this.byId.get(id); if (!rt || rt.state === 'gone') return;
    rt.acts = [];
    rt.until = 0;
    this.enqueue(rt, [{ kind: 'stand' }, { kind: 'sit', chair: this.deskChair(rt) }], instant);
  }

  startBreak(id: string, kind: string, durationSimS: number, instant = false) {
    const rt = this.byId.get(id); if (!rt) return;
    startBreakAct(this, rt, kind, durationSimS, instant);
  }
  endBreak(id: string, instant = false) {
    const rt = this.byId.get(id); if (!rt) return;
    // cut short any slot/chat wait, walk back to desk
    rt.until = 0; rt.acts = []; rt.carry = false;
    this.freeQueue(rt);
    this.enqueue(rt, [{ kind: 'stand' }, { kind: 'sit', chair: this.deskChair(rt) }], instant);
  }
  startChat(a: string, b: string, durationMs: number, line: string, instant = false) {
    const ra = this.byId.get(a), rb = this.byId.get(b); if (!ra || !rb) return;
    startChatAct(this, ra, rb, durationMs, line, instant);
  }
  setActivityFor(id: string, status: string) {
    const rt = this.byId.get(id); if (!rt) return;
    const map: Record<string, string> = {
      WORKING: 'type', WAITING: 'wait', REVIEW: 'review', BREAK: 'idle',
      COMPLETE: 'idle', FAILED: 'idle', IDLE: 'idle', THINK: 'think',
    };
    rt.activity = map[status] ?? 'idle';
  }
  celebrate(id: string) { const rt = this.byId.get(id); if (rt) rt.celebrateT = 1.6; }
  confuse(id: string) { const rt = this.byId.get(id); if (rt) rt.confuseT = 2.0; }

  envelopeFrom(fromId?: string, toId?: string) {
    const a = this.pos(fromId), b = this.pos(toId); if (!a || !b) return;
    const dist = Math.hypot(b.x - a.x, b.z - a.z);
    if (dist >= 20) {
      const path = findPath(GRID, a.x, a.z, b.x, b.z);
      if (path) { fx.spawnCourier(path, dist); return; }
    }
    fx.spawnEnvelope(a.x, a.z, b.x, b.z);
  }
  stamp(taskId: string, ok: boolean) {
    // FIX F9: read the task owner straight from the store (the original read a window global that
    // only exists once the Workspace is mounted, so stamps on the landing page landed at (0,0)).
    const ownerId = useStore.getState().tasks[taskId]?.assigned_agent ?? undefined;
    const p = this.pos(ownerId);
    if (!p) return;
    fx.stamp(p.x, p.z, ok);
  }

  deskChair(rt: RT): Item {
    return LAYOUT.items.find((i) => i.id === rt.def.chairId)!;
  }

  goZone(rt: RT, purpose: string, instant: boolean) {
    const zoneId = purpose === 'pantry' ? 'pantry' : purpose === 'cafeteria' ? 'cafeteria' : 'lounge';
    this.heat[zoneId] = (this.heat[zoneId] ?? 0) + 3;
    const slot = this.takeSlot(rt.id, purpose === 'pantry' ? ['coffee', 'cooler', 'stool'] : purpose === 'cafeteria' ? ['meal'] : ['sofa', 'bean']);
    if (!slot) { // queue nearby — just stand in the zone
      const z = LAYOUT.zones.find((zn) => zn.id === zoneId)!;
      const cx = (z.x0 + z.x1) / 2, cz = (z.z0 + z.z1) / 2;
      const spot = zoneId === 'pantry' ? this.queueSpot(rt) : nearestFree(GRID, cx, cz);
      this.enqueue(rt, [{ kind: 'stand' }, { kind: 'goto', pt: spot }, { kind: 'wait', untilRel: 8 }], instant);
      return;
    }
    const chair = LAYOUT.items.find((i) => i.seat && Math.abs(i.seat.x - slot.x) < 0.3 && Math.abs(i.seat.z - slot.z) < 0.3);
    if (chair?.seat) {
      this.enqueue(rt, [{ kind: 'stand' }, { kind: 'sit', chair, activity: purpose === 'cafeteria' ? 'eat' : 'idle' }], instant);
    } else {
      this.enqueue(rt, [{ kind: 'stand' }, { kind: 'goto', pt: { x: slot.x, z: slot.z } },
        { kind: 'slot', slot, activity: purpose === 'pantry' ? 'drink' : 'idle', untilRel: 8 }], instant);
    }
  }

  takeSlot(agentId: string, kinds: string[]): Slot | null {
    for (const s of LAYOUT.slots) {
      if (!kinds.includes(s.kind) && !(kinds.includes('meal'))) continue;
      if (kinds.includes('meal') && s.kind !== 'stool') continue;
      if (!this.slotsUsed.has(s.id)) { this.slotsUsed.set(s.id, agentId); return s; }
    }
    return null;
  }
  freeSlot(rt: RT) {
    for (const [sid, aid] of this.slotsUsed) if (aid === rt.id) this.slotsUsed.delete(sid);
  }
  slotOf(rt: RT): Slot | undefined {
    for (const [sid, aid] of this.slotsUsed) if (aid === rt.id) return LAYOUT.slots.find((s) => s.id === sid);
    return undefined;
  }

  // ---- Action queue engine ----
  enqueue(rt: RT, acts: Act[], instant = false) {
    rt.acts = [...rt.acts.filter((a) => a.kind === 'stand' && rt.state === 'seated' || a.kind === 'sit'), ...acts];
    if (instant) this.runInstant(rt);
    else if (rt.state === 'seated' || rt.state === 'slot' || rt.state === 'chat') {
      // wait for current activity; the loop will start acts when free
    }
  }

  private runInstant(rt: RT) {
    while (rt.acts.length) {
      const a = rt.acts.shift()!;
      switch (a.kind) {
        case 'stand':
          if (rt.state === 'seated' && rt.seatChair) this.clearChair(rt);
          rt.state = 'seated'; rt.x = a.chair ? 0 : rt.x; break;
        case 'sit': {
          if (!a.chair?.seat) break;
          if (rt.seatChair && rt.seatChair !== a.chair) this.clearChair(rt);
          rt.seatChair = a.chair;
          rt.x = a.chair.seat.x; rt.z = a.chair.seat.z; rt.heading = a.chair.seat.face;
          rt.state = 'seated'; if (a.activity) rt.activity = a.activity;
          break;
        }
        case 'goto': if (a.pt) { rt.x = a.pt.x; rt.z = a.pt.z; rt.state = 'seated'; } break;
        case 'slot': if (a.slot) { rt.x = a.slot.x; rt.z = a.slot.z; rt.state = 'slot'; rt.activity = a.activity ?? 'idle'; } break;
        case 'chat': rt.state = 'chat'; break;
        case 'despawn': rt.state = 'gone'; break;
        case 'wait': break;
      }
    }
  }
  private clearChair(rt: RT) {
    if (rt.seatChair) this.chairOffsets.delete(rt.seatChair.id);
    this.freeSlot(rt);
    releaseMeeting(this, rt);
    rt.seatChair = undefined;
  }

  // ---- Per-frame update ----
  update(dt: number) {
    this.time += dt;
    for (const k of Object.keys(this.heat)) this.heat[k] = Math.max(0, this.heat[k] - dt * 0.2);
    for (const rt of this.runtimes) {
      if (rt.state === 'gone') continue;
      rt.celebrateT = Math.max(0, rt.celebrateT - dt);
      rt.confuseT = Math.max(0, rt.confuseT - dt);
      if (rt.bubble && this.time > rt.bubble.until) rt.bubble = undefined;
      this.stepAgent(rt, dt);
    }
    this.separation(dt);
    this.hardResolve();
    fx.update(dt);
  }

  private stepAgent(rt: RT, dt: number) {
    switch (rt.state) {
      case 'walk': this.steer(rt, dt); break;
      case 'sitdown': case 'standup': this.sitAnim(rt, dt); break;
      case 'seated': case 'slot': case 'chat': {
        if (rt.until > 0 && this.time > rt.until) { rt.until = 0; rt.carry = false; this.freeQueue(rt); this.nextAct(rt); } // FIX F18: the cup was never put down, so agents walked at 0.5 m/s forever after a coffee
        else if (rt.state === 'chat') this.chatTick(rt);
        else if (!rt.acts.length && rt.until === 0 && rt.state === 'seated' && !rt.seatChair) this.nextAct(rt);
        break;
      }
    }
    // start queued acts when idle-ish
    if ((rt.state === 'seated' || rt.state === 'slot') && rt.acts.length && rt.until === 0) {
      const idleLongEnough = rt.state === 'seated' && !rt.seatChair;
      if (idleLongEnough || rt.state === 'slot' || rt.acts[0].kind === 'stand' || rt.acts[0].kind === 'sit') this.nextAct(rt);
    }
    rt.speed = Math.hypot(rt.vx, rt.vz);
    rt.phase += rt.speed * 6.6 * dt;
  }

  private nextAct(rt: RT) {
    const a = rt.acts.shift();
    if (!a) return;
    switch (a.kind) {
      case 'stand':
        if (rt.state === 'seated' && rt.seatChair?.seat) {
          rt.sit = { chair: rt.seatChair, t: 0, fromX: rt.x, fromZ: rt.z, dirX: -Math.sin(rt.seatChair.seat.face), dirZ: -Math.cos(rt.seatChair.seat.face), reverse: true };
          rt.state = 'standup';
        } else this.nextAct(rt);
        break;
      case 'sit': {
        if (!a.chair?.seat) { this.nextAct(rt); break; }
        if (rt.seatChair && rt.seatChair !== a.chair) this.clearChair(rt);
        const s = a.chair.seat;
        if (this.deskChair(rt) === a.chair) this.heat[zoneIdOf(rt)] = (this.heat[zoneIdOf(rt)] ?? 0) + 1;
        if (Math.hypot(rt.x - s.ax, rt.z - s.az) < 0.6) {
          rt.seatChair = a.chair;
          rt.sit = { chair: a.chair, t: 0, fromX: rt.x, fromZ: rt.z, dirX: -Math.sin(s.face), dirZ: -Math.cos(s.face), reverse: false };
          rt.state = 'sitdown';
          if (a.activity) rt.activity = a.activity;
        } else {
          rt.acts.unshift(a);
          this.startWalk(rt, { x: s.ax, z: s.az });
        }
        break;
      }
      case 'goto':
        if (a.pt) { if (a.pt.x === LAYOUT.exit.x) this.heat.reception = (this.heat.reception ?? 0) + 2; this.startWalk(rt, a.pt); }
        break;
      case 'slot':
        if (a.slot) { rt.state = 'slot'; rt.x = a.slot.x; rt.z = a.slot.z; rt.heading = a.slot.face; rt.activity = a.activity ?? 'idle'; rt.until = this.time + (a.untilRel ?? 8); if (a.activity === 'drink') rt.carry = true; }
        break;
      case 'chat':
        rt.state = 'chat'; rt.activity = 'talk';
        rt.until = this.time + (a.untilRel ?? 6) / 1000;
        rt.until = this.time + (a.untilRel ?? 6000) / 1000;
        if (a.partner) rt.chatWith = a.partner;
        // FIX F12: the chat line was never armed, so speech bubbles never appeared
        if (a.line) { rt.line = a.line; rt.speakTurn = true; }
        break;
      case 'despawn':
        this.clearChair(rt); rt.state = 'gone';
        break;
      case 'wait':
        rt.until = this.time + (a.untilRel ?? 5); rt.state = 'slot'; rt.activity = 'idle';
        break;
    }
  }

  private startWalk(rt: RT, target: Pt) {
    const p = findPath(GRID, rt.x, rt.z, target.x, target.z);
    if (p && p.length > 1) { rt.path = p; rt.pi = 1; }
    else { rt.path = [ { x: rt.x, z: rt.z }, nearestFree(GRID, target.x, target.z) ]; rt.pi = 1; }
    rt.state = 'walk'; rt.waitingDoor = undefined;
  }

  private steer(rt: RT, dt: number) {
    const target = rt.path[Math.min(rt.pi, rt.path.length - 1)];
    const last = rt.pi >= rt.path.length - 1;
    // Door reservation
    const door = this.nearDoor(rt);
    if (door && !this.doors.get(door.id)!.users.has(rt.id)) {
      const d = this.doors.get(door.id)!;
      if (d.users.size < door.cap) { d.users.add(rt.id); rt.doorId = door.id; }
      else {
        // wait at a queue spot 1 m before the door
        const dirx = rt.x - door.x, dirz = rt.z - door.z;
        const len = Math.hypot(dirx, dirz) || 1;
        const qx = door.x + (dirx / len) * 1.2, qz = door.z + (dirz / len) * 1.2;
        if (Math.hypot(rt.x - qx, rt.z - qz) > 0.25) { this.moveToward(rt, { x: qx, z: qz }, dt, 0.4); return; }
        rt.vx = 0; rt.vz = 0; // wait orderly
        rt.heading = lerpAngle(rt.heading, Math.atan2(door.x - rt.x, door.z - rt.z), TURN_RATE * 0.5 * dt);
        if (!d.queue.includes(rt.id)) d.queue.push(rt.id);
        return;
      }
    }
    const arrive = last ? 0.14 : 0.3;
    const dist = Math.hypot(target.x - rt.x, target.z - rt.z);
    if (dist <= arrive) {
      if (last) {
        rt.vx = 0; rt.vz = 0; rt.path = [];
        if (rt.doorId) { this.doors.get(rt.doorId)?.users.delete(rt.id); rt.doorId = undefined; }
        this.nextAct(rt);
        return;
      }
      rt.pi++;
    }
    this.moveToward(rt, target, dt, rt.carry ? CARRY_SPEED : WALK_SPEED, !last);
    // release door once through
    if (rt.doorId) {
      const d = LAYOUT.doors.find((x) => x.id === rt.doorId)!;
      if (Math.hypot(rt.x - d.x, rt.z - d.z) > 1.6) { this.doors.get(d.id)!.users.delete(rt.id); rt.doorId = undefined; }
    }
    // stuck detection
    if (rt.speed < 0.12) {
      rt.stuckT += dt;
      if (rt.stuckT > 3) {
        rt.stuckT = 0; rt.repaths++;
        if (rt.repaths > 2) { const nf = nearestFree(GRID, rt.x, rt.z); rt.x = nf.x; rt.z = nf.z; rt.repaths = 0; }
        else if (rt.path.length) this.startWalk(rt, rt.path[rt.path.length - 1]);
        if (typeof window !== 'undefined') {
          (window as any).__deskmates_stuck?.(rt.id);
          (window as any).__deskmates_stuckCount = ((window as any).__deskmates_stuckCount ?? 0) + 1;
        }
      }
    } else rt.stuckT = 0;
  }

  private moveToward(rt: RT, target: Pt, dt: number, maxSpeed: number, decel = true) {
    const dx = target.x - rt.x, dz = target.z - rt.z;
    const dist = Math.hypot(dx, dz) || 1;
    let want = maxSpeed;
    if (decel === false) { /* full speed to waypoint */ }
    if (maxSpeed === WALK_SPEED && dist < 1.2 && !decel) want = maxSpeed;
    const desiredX = (dx / dist) * Math.min(want, maxSpeed), desiredZ = (dz / dist) * Math.min(want, maxSpeed);
    const dvx = desiredX - rt.vx, dvz = desiredZ - rt.vz;
    const dv = Math.hypot(dvx, dvz);
    const maxDv = ACCEL * dt;
    if (dv > maxDv) { rt.vx += (dvx / dv) * maxDv; rt.vz += (dvz / dv) * maxDv; }
    else { rt.vx = desiredX; rt.vz = desiredZ; }
    if (Math.hypot(rt.vx, rt.vz) > 0.05) rt.heading = lerpAngle(rt.heading, Math.atan2(rt.vx, rt.vz), TURN_RATE * dt);
    // FIX F17: axis-separated wall sliding. Before, a step into a blocked cell was undone wholesale by hardResolve
    // (snap back to lastFree), so an agent that clipped a waypoint corner stayed pinned to the obstacle edge forever.
    const nx = rt.x + rt.vx * dt, nz = rt.z + rt.vz * dt;
    if (!GRID.isBlocked(nx, nz) || GRID.isBlocked(rt.x, rt.z)) { rt.x = nx; rt.z = nz; }
    else if (!GRID.isBlocked(nx, rt.z)) { rt.x = nx; rt.vz *= 0.5; }
    else if (!GRID.isBlocked(rt.x, nz)) { rt.z = nz; rt.vx *= 0.5; }
    else { rt.vx *= 0.3; rt.vz *= 0.3; }
  }

  private nearDoor(rt: RT) {
    for (const d of LAYOUT.doors) {
      if (Math.hypot(rt.x - d.x, rt.z - d.z) < 1.6) {
        // only if the door is roughly ahead
        const t = rt.path[Math.min(rt.pi, rt.path.length - 1)];
        if (t && Math.hypot(t.x - d.x, t.z - d.z) < Math.hypot(t.x - rt.x, t.z - rt.z)) return d;
      }
    }
    return null;
  }

  private sitAnim(rt: RT, dt: number) {
    const s = rt.sit!; s.t += dt / 1.3;
    const t = Math.min(1, s.t);
    const seat = s.chair.seat!;
    const out = s.reverse
      ? (t < 0.4 ? 0.35 * (t / 0.4) : t < 0.65 ? 0.35 : 0.35 * (1 - (t - 0.65) / 0.35))
      : (t < 0.33 ? 0.35 * (t / 0.33) : t < 0.7 ? 0.35 : 0.35 * (1 - (t - 0.7) / 0.3));
    this.chairOffsets.set(s.chair.id, out);
    const seatOutX = seat.x + s.dirX * out * -1, seatOutZ = seat.z + s.dirZ * out * -1;
    if (!s.reverse) {
      const k = smooth01((t - 0.3) / 0.45);
      rt.x = lerp(s.fromX, seatOutX, k); rt.z = lerp(s.fromZ, seatOutZ, k);
      rt.heading = lerpAngle(rt.heading, seat.face, 6 * dt);
    } else {
      const k = smooth01((t - 0.55) / 0.4);
      rt.x = lerp(seatOutX, seat.ax, k); rt.z = lerp(seatOutZ, seat.az, k);
      rt.heading = lerpAngle(rt.heading, Math.atan2(seat.ax - seat.x, seat.az - seat.z), 6 * dt);
    }
    if (t >= 1) {
      if (s.reverse) { this.chairOffsets.delete(s.chair.id); this.freeSlot(rt); rt.state = 'seated'; rt.seatChair = undefined; rt.sit = undefined; this.nextAct(rt); }
      else { this.chairOffsets.delete(s.chair.id); rt.state = 'seated'; rt.x = seat.x; rt.z = seat.z; rt.heading = seat.face; rt.sit = undefined; }
    }
  }

  private chatTick(rt: RT) {
    const other = rt.chatWith ? this.byId.get(rt.chatWith) : undefined;
    if (other) rt.heading = lerpAngle(rt.heading, Math.atan2(other.x - rt.x, other.z - rt.z), 5 * 0.016);
    if (rt.speakTurn && !rt.bubble && rt.line) {
      rt.bubble = { text: rt.line, until: this.time + 3 };
      rt.line = undefined;
    }
  }

  private separation(dt: number) {
    const movers = this.runtimes.filter((r) => r.state === 'walk');
    for (let i = 0; i < movers.length; i++) {
      for (let j = i + 1; j < movers.length; j++) {
        const a = movers[i], b = movers[j];
        const dx = b.x - a.x, dz = b.z - a.z;
        const d = Math.hypot(dx, dz);
        if (d < 1.1 && d > 0.001) {
          const push = (1.1 - d) * 0.5 * Math.min(1, dt * 8);
          const ux = dx / d, uz = dz / d;
          // FIX F16: a push may never shove an agent into furniture / a wall (it used to, and the agent then crawled
          // along the obstacle edge forever). Moves into blocked cells are vetoed.
          if (!GRID.isBlocked(a.x - ux * push, a.z - uz * push)) { a.x -= ux * push; a.z -= uz * push; }
          if (!GRID.isBlocked(b.x + ux * push, b.z + uz * push)) { b.x += ux * push; b.z += uz * push; }
          // lower id yields in head-on conflicts
          if (d < 0.8) { const y = a.id < b.id ? a : b; y.vx *= 0.4; y.vz *= 0.4; }
        }
      }
    }
  }

  private hardResolve() {
    for (const rt of this.runtimes) {
      if (rt.state === 'gone' || rt.state === 'seated' || rt.state === 'sitdown' || rt.state === 'standup') continue;
      // agent vs agent
      for (const o of this.runtimes) {
        if (o === rt || o.state === 'gone') continue;
        const dx = rt.x - o.x, dz = rt.z - o.z;
        const d = Math.hypot(dx, dz);
        if (d < AGENT_R * 2 && d > 0.001) {
          const push = (AGENT_R * 2 - d);
          const nx = rt.x + (dx / d) * push, nz = rt.z + (dz / d) * push;
          if (!GRID.isBlocked(nx, nz) || GRID.isBlocked(rt.x, rt.z)) { rt.x = nx; rt.z = nz; }
        }
      }
      // blocked cells
      if (!GRID.isBlocked(rt.x, rt.z)) { rt.lastFreeX = rt.x; rt.lastFreeZ = rt.z; }
      else {
        const dx = rt.lastFreeX - rt.x, dz = rt.lastFreeZ - rt.z;
        const d = Math.hypot(dx, dz);
        if (d > 0.001) { rt.x += (dx / d) * Math.min(d, 0.1); rt.z += (dz / d) * Math.min(d, 0.1); }
        rt.vx *= 0.5; rt.vz *= 0.5;
      }
      rt.x = Math.max(-46.5, Math.min(46.5, rt.x));
      rt.z = Math.max(-33.5, Math.min(33.5, rt.z));
    }
  }
}

export function lerpAngle(a: number, b: number, t: number) {
  let d = b - a;
  while (d > Math.PI) d -= Math.PI * 2;
  while (d < -Math.PI) d += Math.PI * 2;
  return a + d * Math.min(1, Math.max(0, t));
}
export const lerp = (a: number, b: number, t: number) => a + (b - a) * t;
export const smooth01 = (t: number) => { const c = Math.max(0, Math.min(1, t)); return c * c * (3 - 2 * c); };
// dynamic department ids map to the layout zone of the wing they occupy (so the cinematic camera can find it)
function zoneIdOf(rt: RT) { return bayZoneOf(rt.def.department) ?? (rt.def.department ? `${rt.def.department}Bay` : 'manager'); }

export const director = new Director();
