// Exports the physical office layout (desk coordinates etc.) for the Bridge developer.
//   npm run layout:export  ->  docs/layout-slots.json
import { writeFileSync } from 'node:fs';
import { LAYOUT } from '../src/config/layout';
import { BAY_ZONES } from '../src/state/departments';

const chair = (id: string) => { const c = LAYOUT.items.find((i) => i.id === id)!; return { chair_id: id, x: c.seat!.x, z: c.seat!.z }; };
const bays: Record<string, unknown> = {};
for (const [bay, zone] of Object.entries(BAY_ZONES)) {
  const staticDept = zone.replace('Bay', '');
  bays[bay] = {
    zone_id: zone,
    lead_desk: chair(LAYOUT.leadChairs[staticDept as keyof typeof LAYOUT.leadChairs]),
    worker_desks: LAYOUT.workstations.filter((w) => w.dept === staticDept).map((w) => chair(w.chair)),
  };
}
const out = {
  note: 'World units are metres. x = east, z = south, origin = centre of the 96 x 70 m floor. A desk is the SEAT position; the frontend sits the agent there and pathfinds from reception.',
  entrance: LAYOUT.entrance,
  manager_desk: chair(LAYOUT.execChair),
  bays,
  zones: LAYOUT.zones.map((z) => ({ id: z.id, name: z.name, kind: z.kind, center: z.jump })),
  max_workers_per_department: 12,
};
writeFileSync('docs/layout-slots.json', JSON.stringify(out, null, 2));
console.log('docs/layout-slots.json written');
