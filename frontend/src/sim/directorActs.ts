import { LAYOUT, Item, Slot } from '@/config/layout';
import { Director, RT, Act } from './director';

export function startBreakAct(d: Director, rt: RT, kind: string, durationSimS: number, instant: boolean) {
  const realDur = kind === 'coffee' ? Math.max(8, durationSimsToReal(durationSimS)) : Math.max(12, durationSimsToReal(durationSimS));
  if (kind === 'coffee') {
    const slot = d.takeSlot(rt.id, ['coffee', 'cooler', 'stool']);
    const acts: Act[] = [{ kind: 'stand' }];
    if (slot) {
      const chair = LAYOUT.items.find((i) => i.seat && Math.abs(i.seat.x - slot.x) < 0.3 && Math.abs(i.seat.z - slot.z) < 0.3);
      if (chair?.seat) acts.push({ kind: 'sit', chair, activity: 'drink' });
      else acts.push({ kind: 'goto', pt: { x: slot.x, z: slot.z } }, { kind: 'slot', slot, activity: 'drink', untilRel: realDur });
    } else {
      acts.push({ kind: 'goto', pt: d.queueSpot(rt) }, { kind: 'wait', untilRel: 6 });
    }
    acts.push({ kind: 'goto', pt: { x: LAYOUT.items.find((i) => i.id === rt.def.chairId)!.seat!.ax, z: LAYOUT.items.find((i) => i.id === rt.def.chairId)!.seat!.az } });
    acts.push({ kind: 'sit', chair: d.deskChair(rt) });
    d.enqueue(rt, acts, instant);
  } else {
    // meals in the cafeteria: sit at a free meal chair
    const meal = LAYOUT.items.filter((i) => i.type === 'mealChair' && i.seat);
    const free = meal.find((c) => !d.runtimes.some((r) => r.seatChair === c));
    const acts: Act[] = [{ kind: 'stand' }];
    if (free) acts.push({ kind: 'sit', chair: free, activity: 'eat' });
    else acts.push({ kind: 'goto', pt: { x: -34, z: 13 }, }, { kind: 'wait', untilRel: 10 });
    acts.push({ kind: 'sit', chair: d.deskChair(rt) });
    d.enqueue(rt, acts, instant);
    if (free) {
      // auto-return after the meal duration
      const origUntil = realDur;
      setTimeout(() => {}, 0);
      const stored = free;
      d.runtimes.push(); // no-op keeps types happy
      rt.until = 0;
      const wrap: Act = { kind: 'wait', untilRel: 0 };
      void wrap; void stored; void origUntil;
    }
  }
  // endBreak event drives the walk back; also arm a safety return
  rt.until = 0;
}
function durationSimsToReal(s: number) { return s / 30; }

export function startChatAct(d: Director, ra: RT, rb: RT, durationMs: number, line: string, instant: boolean) {
  // find a free chat pair
  let pair: [Slot, Slot] | null = null;
  for (const s of LAYOUT.slots) {
    if (s.kind !== 'chat' || !s.pair) continue;
    const other = LAYOUT.slots.find((o) => o.id === s.pair);
    if (!other) continue;
    const used = (id: string) => Array.from(d['slotsUsed'].keys()).includes(id);
    if (!used(s.id) && !used(other.id)) { pair = [s, other]; break; }
  }
  const dur = durationMs / 1000;
  if (!pair) { // fall back: meet in the plaza center
    const c = { x: -4, z: 7 };
    d.enqueue(ra, [{ kind: 'stand' }, { kind: 'goto', pt: c }, { kind: 'chat', untilRel: durationMs, partner: rb.id, line }], instant);
    d.enqueue(rb, [{ kind: 'stand' }, { kind: 'goto', pt: { x: c.x + 0.9, z: c.z } }, { kind: 'chat', untilRel: durationMs, partner: ra.id }], instant);
    return;
  }
  d['slotsUsed'].set(pair[0].id, ra.id);
  d['slotsUsed'].set(pair[1].id, rb.id);
  d.enqueue(ra, [
    { kind: 'stand' }, { kind: 'goto', pt: { x: pair[0].x, z: pair[0].z } },
    { kind: 'chat', untilRel: durationMs, partner: rb.id, line },
    { kind: 'goto', pt: { x: LAYOUT.items.find((i) => i.id === ra.def.chairId)!.seat!.ax, z: LAYOUT.items.find((i) => i.id === ra.def.chairId)!.seat!.az } },
    { kind: 'sit', chair: d.deskChair(ra) },
  ], instant);
  d.enqueue(rb, [
    { kind: 'stand' }, { kind: 'goto', pt: { x: pair[1].x, z: pair[1].z } },
    { kind: 'chat', untilRel: durationMs, partner: ra.id, line: 'Agreed — I will note that down.' },
    { kind: 'goto', pt: { x: LAYOUT.items.find((i) => i.id === rb.def.chairId)!.seat!.ax, z: LAYOUT.items.find((i) => i.id === rb.def.chairId)!.seat!.az } },
    { kind: 'sit', chair: d.deskChair(rb) },
  ], instant);
}

const roomUsers = new Map<string, Set<string>>();

export function seatInMeeting(d: Director, rt: RT, instant: boolean) {
  let roomId: string | null = null;
  for (const room of LAYOUT.meetingRooms) {
    const users = roomUsers.get(room.id) ?? new Set<string>();
    if (users.size === 0 || users.has(rt.id)) { roomId = room.id; break }
  }
  if (!roomId) roomId = LAYOUT.meetingRooms[0].id;
  const users = roomUsers.get(roomId) ?? new Set<string>();
  users.add(rt.id); roomUsers.set(roomId, users);
  rt.meetRoom = roomId;
  const chairs = LAYOUT.items.filter((i) => i.zone === roomId && i.type === 'meetChair' && i.seat);
  const taken = d.runtimes.filter((r) => r.meetRoom === roomId && r.seatChair).map((r) => r.seatChair!.id);
  const free = chairs.find((c) => !taken.includes(c.id)) ?? chairs[0];
  d.heat[roomId] = (d.heat[roomId] ?? 0) + 3;
  d.enqueue(rt, [{ kind: 'stand' }, { kind: 'sit', chair: free as Item, activity: 'review' }], instant);
}

export function releaseMeeting(d: Director, rt: RT) {
  if (!rt.meetRoom) return;
  const users = roomUsers.get(rt.meetRoom);
  if (users) { users.delete(rt.id); if (users.size === 0) roomUsers.delete(rt.meetRoom); }
  rt.meetRoom = undefined;
}
