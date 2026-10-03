import { useSimulatorStore } from '../stores/simulatorStore';

export type { SimulatorPreset } from '../stores/simulatorStore';
export { SIMULATOR_PRESETS } from '../stores/simulatorStore';

/**
 * Typed facade over the singleton simulator store.
 *
 * The engine lives in `stores/simulatorStore.ts`; this keeps call sites short
 * without reintroducing per-component timer ownership.
 */
export function useSimulator() {
  return useSimulatorStore();
}
