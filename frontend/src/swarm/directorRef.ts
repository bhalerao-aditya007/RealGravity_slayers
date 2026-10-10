import { SwarmDirector, makeDirector } from './swarmDirector';
import { useStore } from '@/state/store';

export let swarmDirector: SwarmDirector = makeDirector(20);
export function rebuildSwarmDirector(n: 10 | 20 | 30 | 40 | 50) {
  swarmDirector = makeDirector(n);
  useStore.setState({ swarmPhaseTick: 0 });
  return swarmDirector;
}
