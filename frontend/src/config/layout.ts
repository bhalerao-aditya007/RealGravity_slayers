import { Dept, DEPTS, HALF_D, HALF_W, OFFICE_D, OFFICE_W } from './office';

export interface Zone {
  id: string; name: string; x0: number; z0: number; x1: number; z1: number;
  kind: string; dept?: Dept; jump?: [number, number];
}
export interface WallSeg { x0: number; z0: number; x1: number; z1: number; kind: 'perimeter' | 'glass' | 'solid' }
export interface Door { id: string; x: number; z: number; axis: 'x' | 'z'; w: number; cap: number }
export interface Seat { x: number; z: number; face: number; ax: number; az: number }
export interface Item {
  id: string; type: string; x: number; z: number; rot: number;
  w: number; d: number; zone: string; dept?: Dept;
  seat?: Seat; seats?: Seat[]; label?: string; data?: Record<string, any>;
}
export interface Slot {
  id: string; kind: 'coffee' | 'cooler' | 'stool' | 'chat' | 'sofa' | 'bean';
  x: number; z: number; face: number; pair?: string; roomId?: string;
}
export interface Workstation { id: string; dept: Dept; desk: string; chair: string; x: number; z: number }
export interface MeetingRoom { id: string; name: string; seats: string[] }

const items: Item[] = [];
const slots: Slot[] = [];
let n = 0;
const RAD = { N: 0, E: -Math.PI / 2, S: Math.PI, W: Math.PI / 2 };
// rot = facing direction of the item (0 = faces -Z / north)

function addItem(type: string, x: number, z: number, rot: number, w: number, d: number,
  zone: string, extra?: Partial<Item>): Item {
  const it: Item = { id: `${type}_${n++}`, type, x, z, rot, w, d, zone, ...extra };
  items.push(it);
  return it;
}
// rot must be axis-aligned so collision uses a swapped AABB
function seatAt(chair: Item, off = 0.55, appOff = 1.4): Seat {
  // chair faces direction (sin rot, cos rot)? We define forward = -Z rotated by rot:
  const fx = -Math.sin(chair.rot), fz = -Math.cos(chair.rot);
  const sx = chair.x - fx * off, sz = chair.z - fz * off; // seat sits behind chair center? no: seat anchor = chair center
  return { x: sx, z: sz, face: (chair.rot + Math.PI) % (2 * Math.PI), ax: chair.x - fx * appOff, az: chair.z - fz * appOff };
}

function workstation(cx: number, cz: number, dept: Dept, idx: number, dual = false): Workstation {
  const x = cx, z = cz;
  const desk = addItem('wsDesk', x, z, RAD.N, 1.6, 0.8, `${dept}Bay`, {
    dept, data: { wsId: `${dept}_${idx}`, dual },
  });
  const chair = addItem('wchair', x, z + 0.66, RAD.N, 0.55, 0.55, `${dept}Bay`, {
    dept, seat: { x, z: z + 0.66, face: RAD.S, ax: x, az: z + 1.6 }, data: { wsId: `${dept}_${idx}` },
  });
  addItem('monitor', x, z - 0.18, RAD.N, 0.62, 0.1, `${dept}Bay`, { dept, data: { wsId: `${dept}_${idx}`, dual } });
  if (dual) addItem('monitor', x + 0.45, z - 0.18, RAD.N, 0.62, 0.1, `${dept}Bay`, { dept, data: { wsId: `${dept}_${idx}`, dual } });
  return { id: `${dept}_${idx}`, dept, desk: desk.id, chair: chair.id, x, z };
}

function bay(cx: number, zStart: number, dept: Dept, leadX: number, leadZ: number, dual = false) {
  const wss: Workstation[] = [];
  let idx = 0;
  for (let row = 0; row < 4; row++) {
    for (let col = 0; col < 3; col++) {
      const x = cx + (col - 1) * 2.3;
      const z = zStart - row * 3.3;
      wss.push(workstation(x, z, dept, idx, dual && col === 1));
      idx++;
    }
  }
  // Lead desk at the head, facing east toward the block
  addItem('leadDesk', leadX, leadZ, RAD.E, 1.8, 0.9, `${dept}Bay`, { dept });
  addItem('monitor', leadX + 0.35, leadZ, RAD.E, 0.62, 0.1, `${dept}Bay`, { dept, data: { lead: dept } });
  const lc = addItem('wchair', leadX - 0.75, leadZ, RAD.E, 0.55, 0.55, `${dept}Bay`, {
    dept, label: `Lead ${dept}`,
    seat: { x: leadX - 0.75, z: leadZ, face: RAD.W, ax: leadX - 1.9, az: leadZ },
    data: { lead: dept },
  });
  // semi-enclosed lead office: glass panels north and south of the lead desk (open on the aisle and bay sides)
  addItem('glassPanel', leadX, leadZ - 1.5, RAD.N, 1.6, 0.1, `${dept}Bay`, { dept });
  addItem('glassPanel', leadX, leadZ + 1.5, RAD.N, 1.6, 0.1, `${dept}Bay`, { dept });
  addItem('cabinet', leadX, leadZ - 2.2, RAD.S, 0.8, 0.5, `${dept}Bay`, { dept });
  addItem('printer', leadX, leadZ + 2.2, RAD.N, 0.9, 0.6, `${dept}Bay`, { dept });
  // FIX F15: the front plants stood on the line agents walk to leave the bay (z = zStart + 1.2 .. approach row); moved beside row 0
  for (const [px, pz] of [[cx - 4.2, zStart - 0.4], [cx + 4.2, zStart - 0.4], [cx - 4.2, zStart - 11], [cx + 4.2, zStart - 11]] as [number, number][])
    addItem('plant', px, pz, 0, 0.7, 0.7, `${dept}Bay`, { dept });
  addItem('rug', cx, zStart - 5.5, 0, 7, 3, `${dept}Bay`, { dept });
  return { wss, leadChair: lc.id };
}

const research = bay(-31, -9, 'research', -38.5, -8.5);
const engineering = bay(31, -9, 'engineering', 38.5, -8.5, true);
const data = bay(-32, 29, 'data', -39.5, 29.5);
const content = bay(32, 29, 'content', 39.5, 29.5);

// ---- Manager cabin ----
addItem('execDesk', 1, -22.5, RAD.S, 2.4, 1.1, 'manager');
addItem('monitor', 1, -23.1, RAD.S, 0.7, 0.1, 'manager', { data: { manager: true } });
const execChair = addItem('execChair', 1, -23.6, RAD.S, 0.65, 0.65, 'manager', {
  seat: { x: 1, z: -23.6, face: RAD.N, ax: 1, az: -24.4 },
});
addItem('visitorChair', -0.2, -20.9, RAD.N, 0.55, 0.55, 'manager', {
  seat: { x: -0.2, z: -20.9, face: RAD.S, ax: -0.2, az: -20.2 },
});
addItem('visitorChair', 2.2, -20.9, RAD.N, 0.55, 0.55, 'manager', {
  seat: { x: 2.2, z: -20.9, face: RAD.S, ax: 2.2, az: -20.2 },
});
addItem('whiteboard', 1, -29.4, RAD.S, 3.2, 0.15, 'manager');
addItem('meetTable', -3, -27, 0, 1.8, 1.1, 'manager');
const cabinTableSeats: string[] = [];
for (const [tx, tz] of [[-3.8, -26], [-2.2, -26], [-3, -28]] as [number, number][]) {
  const c = addItem('meetChair', tx, tz, tz < -27 ? RAD.S : RAD.N, 0.55, 0.55, 'manager', {
    seat: { x: tx, z: tz, face: tz < -27 ? RAD.S : RAD.N, ax: tx, az: tz + (tz < -27 ? -0.9 : 0.9) },
  });
  cabinTableSeats.push(c.id);
}

// ---- Meeting rooms ----
const meetingRooms: MeetingRoom[] = [];
const roomDefs: [string, number][] = [['M1', -9.5], ['M2', -0.5], ['M3', 8.5]];
for (const [rid, rx] of roomDefs) {
  addItem('meetTable', rx, -9.5, 0, 2.2, 1.1, rid);
  const seats: string[] = [];
  for (const [tx, tz, rot] of [[rx - 0.6, -8.6, RAD.N], [rx + 0.6, -8.6, RAD.N], [rx - 0.6, -10.4, RAD.S], [rx + 0.6, -10.4, RAD.S]] as [number, number, number][]) {
    const c = addItem('meetChair', tx, tz, rot, 0.55, 0.55, rid, {
      seat: { x: tx, z: tz, face: rot === RAD.N ? RAD.S : RAD.N, ax: tx, az: tz + (rot === RAD.N ? 0.9 : -0.9) },
    });
    seats.push(c.id);
  }
  meetingRooms.push({ id: rid, name: `Meeting ${rid.slice(1)}`, seats });
  addItem('plant', rx + 2.6, -12.2, 0, 0.7, 0.7, rid);
}

// ---- Cafeteria ----
for (const tz of [3.5, 8.0]) {
  addItem('mealTable', -34, tz, 0, 4.8, 1.0, 'cafeteria');
  for (let i = 0; i < 4; i++) {
    const tx = -35.6 + i * 1.1;
    addItem('mealChair', tx, tz - 0.8, RAD.N, 0.5, 0.5, 'cafeteria', {
      seat: { x: tx, z: tz - 0.8, face: RAD.S, ax: tx, az: tz - 1.65 },
    });
    addItem('mealChair', tx, tz + 0.8, RAD.S, 0.5, 0.5, 'cafeteria', {
      seat: { x: tx, z: tz + 0.8, face: RAD.N, ax: tx, az: tz + 1.65 },
    });
  }
}
addItem('serveCounter', -34, 11.3, RAD.S, 6, 0.8, 'cafeteria');
addItem('clock', -34, 12.6, RAD.S, 0.6, 0.15, 'cafeteria');
addItem('plant', -43, 2.2, 0, 0.7, 0.7, 'cafeteria');
addItem('plant', -25, 2.2, 0, 0.7, 0.7, 'cafeteria');

// ---- Pantry ----
addItem('counter', 22.5, 11, RAD.S, 3, 0.7, 'pantry');           // short counter that carries the coffee machine
addItem('coffeeMachine', 22, 10.9, RAD.S, 0.8, 0.7, 'pantry');   // sits on top (see furnitureDefs: raised)
addItem('counter', 29, 11, RAD.S, 6, 0.7, 'pantry');
slots.push({ id: 'coffee_1', kind: 'coffee', x: 21.6, z: 9.4, face: RAD.N });
slots.push({ id: 'coffee_2', kind: 'coffee', x: 23.0, z: 9.4, face: RAD.N });
addItem('fridge', 25, 10.8, RAD.S, 0.9, 0.8, 'pantry');
addItem('cooler', 33, 10.9, RAD.S, 0.6, 0.6, 'pantry');
slots.push({ id: 'cooler_1', kind: 'cooler', x: 33, z: 9.4, face: RAD.N });
for (const tx of [27, 31]) {
  addItem('stoolTable', tx, 6, 0, 1.1, 1.1, 'pantry');
  for (const dz of [-0.95, 0.95]) {
    const st = addItem('stool', tx, 6 + dz, dz < 0 ? RAD.N : RAD.S, 0.45, 0.45, 'pantry', {
      seat: { x: tx, z: 6 + dz, face: dz < 0 ? RAD.N : RAD.S, ax: tx, az: 6 + dz * 2.1 },
    });
    slots.push({ id: `stool_${st.id}`, kind: 'stool', x: tx, z: 6 + dz, face: dz < 0 ? RAD.N : RAD.S });
  }
}

// ---- Lounge ----
for (const sz of [3.5, 7.5]) {
  const sofa = addItem('sofa', 37.2, sz, RAD.E, 2.2, 0.95, 'lounge');
  sofa.seats = [
    { x: 37.2, z: sz - 0.55, face: RAD.E, ax: 38.5, az: sz - 0.55 },
    { x: 37.2, z: sz + 0.55, face: RAD.E, ax: 38.5, az: sz + 0.55 },
  ];
  slots.push({ id: `sofa_${sofa.id}_a`, kind: 'sofa', x: 37.2, z: sz - 0.55, face: RAD.E });
  slots.push({ id: `sofa_${sofa.id}_b`, kind: 'sofa', x: 37.2, z: sz + 0.55, face: RAD.E });
}
addItem('beanbag', 42.5, 10, 0, 0.9, 0.9, 'lounge');
slots.push({ id: 'bean_1', kind: 'bean', x: 42.5, z: 10, face: RAD.W });
addItem('beanbag', 43.2, 6.5, 0, 0.9, 0.9, 'lounge');
slots.push({ id: 'bean_2', kind: 'bean', x: 43.2, z: 6.5, face: RAD.W });
addItem('plant', 44.2, 12.2, 0, 0.7, 0.7, 'lounge');
addItem('plant', 44.2, 1.8, 0, 0.7, 0.7, 'lounge');

// ---- Plaza / central hall ----
addItem('rug', -4, 7, 0, 6, 4, 'plaza');
addItem('cooler', -18, 12.4, RAD.S, 0.6, 0.6, 'plaza');
slots.push({ id: 'cooler_2', kind: 'cooler', x: -18, z: 11, face: RAD.N });
addItem('art', -20, 6, RAD.E, 2.2, 0.1, 'plaza');
addItem('art', 12, 6, RAD.W, 2.2, 0.1, 'plaza');
addItem('clock', -20, 13.6, RAD.S, 0.6, 0.15, 'plaza');
addItem('plant', -19.5, 1.5, 0, 0.7, 0.7, 'plaza');
addItem('plant', 11, 1.5, 0, 0.7, 0.7, 'plaza');
addItem('cabinet', -20.5, 10, RAD.E, 0.8, 0.5, 'plaza');
addItem('printer', 11.5, 10, RAD.W, 0.9, 0.6, 'plaza');
// Chat standing pairs (0.9 m apart, facing each other)
const chatPairs: [number, number, number][] = [
  [-8, 6, 0], [4, 9, Math.PI / 2], [26, 3.6, 0], [-14, 8, Math.PI / 2], [0, 11.5, 0], [8, 4, Math.PI / 2],
];
chatPairs.forEach(([px, pz, ang], i) => {
  const dx = Math.sin(ang) * 0.45, dz = Math.cos(ang) * 0.45;
  slots.push({ id: `chat_${i}a`, kind: 'chat', x: px - dx, z: pz - dz, face: Math.atan2(dx, dz), pair: `chat_${i}b` });
  slots.push({ id: `chat_${i}b`, kind: 'chat', x: px + dx, z: pz + dz, face: Math.atan2(-dx, -dz), pair: `chat_${i}a` });
});

// ---- Server room ----
const rackIds: string[] = [];
for (let r = 0; r < 4; r++) {
  const rk = addItem('rack', -3 + (r % 2) * 5, 21.5 + Math.floor(r / 2) * 2.4, RAD.S, 1.0, 0.8, 'server');
  rackIds.push(rk.id);
}
addItem('serverDesk', 0, 26, RAD.S, 1.6, 0.8, 'server');

// ---- Reception ----
addItem('receptionDesk', 12, 28.5, RAD.N, 2.4, 0.8, 'reception');
addItem('logoWall', 12, 24.6, RAD.N, 8, 0.4, 'reception');
addItem('sofa', 8, 32.2, RAD.N, 2.2, 0.95, 'reception');
addItem('plant', 16.5, 32.5, 0, 0.7, 0.7, 'reception');
addItem('plant', 7.5, 25.2, 0, 0.7, 0.7, 'reception');
addItem('art', 12, 33.6, RAD.S, 2.2, 0.1, 'reception');

// ---- Service blocks (scenery only, fully blocked) ----
addItem('serviceBlock', -12, 23, 0, 8, 8, 'restroom', { label: 'Restrooms' });
addItem('serviceBlock', 11, 20.5, 0, 8, 5, 'storage', { label: 'Storage' });
addItem('exitSign', 12, 33.2, RAD.S, 0.7, 0.15, 'reception');
addItem('exitSign', -45.5, -33.4, RAD.N, 0.7, 0.15, 'researchBay');
addItem('exitSign', 45.5, 16.5, RAD.W, 0.7, 0.15, 'corridorS');

// ---- Walls (gaps = doors) ----
const P = 'perimeter', G = 'glass', S = 'solid';
const walls: WallSeg[] = [
  // perimeter (z = ±34, x = ±47.5)
  { x0: -47.5, z0: -34, x1: 10.8, z1: -34, kind: P }, { x0: 13.2, z0: -34, x1: 47.5, z1: -34, kind: P },
  { x0: -47.5, z0: 34, x1: 10.8, z1: 34, kind: P }, { x0: 13.2, z0: 34, x1: 47.5, z1: 34, kind: P },
  { x0: -47.5, z0: -34, x1: -47.5, z1: 34, kind: P }, { x0: 47.5, z0: -34, x1: 47.5, z1: 34, kind: P },
  // manager cabin
  { x0: -6, z0: -30, x1: 8, z1: -30, kind: G },
  { x0: -6, z0: -30, x1: -6, z1: -16, kind: G }, { x0: 8, z0: -30, x1: 8, z1: -16, kind: G },
  { x0: -6, z0: -16, x1: 0.3, z1: -16, kind: G }, { x0: 1.7, z0: -16, x1: 8, z1: -16, kind: G },
  // meeting rooms block (shared north wall + dividers + south walls with doors)
  { x0: -13, z0: -13, x1: 12, z1: -13, kind: G },
  { x0: -13, z0: -13, x1: -13, z1: -6, kind: G }, { x0: -4, z0: -13, x1: -4, z1: -6, kind: G },
  { x0: 5, z0: -13, x1: 5, z1: -6, kind: G }, { x0: 12, z0: -13, x1: 12, z1: -6, kind: G },
  { x0: -13, z0: -6, x1: -10.2, z1: -6, kind: G }, { x0: -8.8, z0: -6, x1: -1.2, z1: -6, kind: G },
  { x0: 0.2, z0: -6, x1: 7.8, z1: -6, kind: G }, { x0: 9.2, z0: -6, x1: 12, z1: -6, kind: G },
  // server room
  { x0: -5, z0: 27, x1: 5, z1: 27, kind: G },
  { x0: -5, z0: 19, x1: -0.7, z1: 19, kind: G }, { x0: 0.7, z0: 19, x1: 5, z1: 19, kind: G },
  { x0: -5, z0: 19, x1: -5, z1: 27, kind: G }, { x0: 5, z0: 19, x1: 5, z1: 27, kind: G },
];

const doors: Door[] = [
  { id: 'd_main', x: 12, z: 34, axis: 'x', w: 2.4, cap: 2 },
  { id: 'd_mgr', x: 1, z: -16, axis: 'x', w: 1.4, cap: 1 },
  { id: 'd_m1', x: -9.5, z: -6, axis: 'x', w: 1.4, cap: 1 },
  { id: 'd_m2', x: -0.5, z: -6, axis: 'x', w: 1.4, cap: 1 },
  { id: 'd_m3', x: 8.5, z: -6, axis: 'x', w: 1.4, cap: 1 },
  { id: 'd_srv', x: 0, z: 19, axis: 'x', w: 1.4, cap: 1 },
];

const zones: Zone[] = [
  { id: 'researchBay', name: 'Research', x0: -45, z0: -32, x1: -17, z1: -5, kind: 'bay', dept: 'research', jump: [-31, -14] },
  { id: 'engineeringBay', name: 'Engineering', x0: 17, z0: -32, x1: 45, z1: -5, kind: 'bay', dept: 'engineering', jump: [31, -14] },
  { id: 'dataBay', name: 'Data', x0: -45, z0: 17, x1: -19, z1: 32, kind: 'bay', dept: 'data', jump: [-32, 24] },
  { id: 'contentBay', name: 'Content', x0: 19, z0: 17, x1: 45, z1: 32, kind: 'bay', dept: 'content', jump: [32, 24] },
  { id: 'manager', name: "Manager's Cabin", x0: -6, z0: -30, x1: 8, z1: -16, kind: 'cabin', jump: [1, -23] },
  { id: 'M1', name: 'Meeting 1', x0: -13, z0: -13, x1: -4, z1: -6, kind: 'meeting', jump: [-9.5, -9.5] },
  { id: 'M2', name: 'Meeting 2', x0: -4, z0: -13, x1: 5, z1: -6, kind: 'meeting', jump: [-0.5, -9.5] },
  { id: 'M3', name: 'Meeting 3', x0: 5, z0: -13, x1: 12, z1: -6, kind: 'meeting', jump: [8.5, -9.5] },
  { id: 'cafeteria', name: 'Cafeteria', x0: -44, z0: 1, x1: -24, z1: 12.6, kind: 'cafeteria', jump: [-34, 6] },
  { id: 'pantry', name: 'Pantry', x0: 20, z0: 3, x1: 34, z1: 12, kind: 'pantry', jump: [27, 7] },
  { id: 'lounge', name: 'Break Lounge', x0: 36, z0: 1, x1: 45, z1: 13, kind: 'lounge', jump: [40, 7] },
  { id: 'server', name: 'LLM Gateway', x0: -5, z0: 19, x1: 5, z1: 27, kind: 'server', jump: [0, 23] },
  { id: 'reception', name: 'Reception', x0: 7, z0: 25, x1: 17, z1: 33.5, kind: 'lobby', jump: [12, 29] },
  { id: 'plaza', name: 'Central Plaza', x0: -20, z0: 0, x1: 12, z1: 14, kind: 'plaza', jump: [-4, 7] },
];

export const workstations = [...research.wss, ...engineering.wss, ...data.wss, ...content.wss];
export const leadChairs: Record<Dept, string> = {
  research: research.leadChair, engineering: engineering.leadChair,
  data: data.leadChair, content: content.leadChair,
};
export const LAYOUT = {
  zones, walls, doors, items, slots, workstations,
  leadChairs, execChair: execChair.id, meetingRooms,
  cabinTableSeats, rackIds,
  entrance: { x: 12, z: 33 },
  exit: { x: 12, z: 33.6 },
  bounds: { x0: -HALF_W, z0: -HALF_D, x1: HALF_W, z1: HALF_D },
};

export function zoneById(id: string): Zone | undefined { return zones.find((z) => z.id === id); }
export function zoneAt(x: number, z: number): Zone | undefined {
  return zones.find((zn) => x >= zn.x0 && x <= zn.x1 && z >= zn.z0 && z <= zn.z1);
}
export function itemById(id: string): Item | undefined { return items.find((i) => i.id === id); }
export function deptWorkstations(dept: Dept): Workstation[] { return workstations.filter((w) => w.dept === dept); }
export const OFFICE_SIZE = { W: OFFICE_W, D: OFFICE_D };
