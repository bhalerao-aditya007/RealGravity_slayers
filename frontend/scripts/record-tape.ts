// Records the scripted runs as JSON event tapes (the "contract tape" the real Bridge must be able to reproduce).
//   npm run tape:record   ->  tapes/{sprint,standard,heavy}.json
import { writeFileSync, mkdirSync } from 'node:fs';
import { MockSimulator } from '../src/mock/simulator';
const GOALS: Record<string, string> = {
  sprint: 'Summarize this repo README in one paragraph',
  standard: 'Add dark mode to the dashboard',
  heavy: 'Compare the top 3 open-weight coding models and build a tiny CLI that benchmarks one',
};
mkdirSync('tapes', { recursive: true });
for (const [name, goal] of Object.entries(GOALS)) {
  const sim = new MockSimulator(goal); const tape: unknown[] = [];
  sim.drain((e) => tape.push(e));
  writeFileSync(`tapes/${name}.json`, JSON.stringify({ goal, events: tape }, null, 1));
  console.log(`tapes/${name}.json  ${tape.length} events`);
}
