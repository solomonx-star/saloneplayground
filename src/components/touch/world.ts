import type { Body } from "./field";
import type { SideTuning } from "./settings";

// What the computer players can see when they decide. The scene builds one each frame; tests build them by hand.
export interface World {
  attackers: Body[];
  defenders: Body[];
  mainDefender: Body;
  humanAttacks: boolean;
  // The player the human controls, if any.
  selected: Body | null;
  // The attacker the Main Line has marked as the biggest threat.
  aiTarget: Body | null;
  attack: SideTuning;
  defense: SideTuning;
  now: number;
  random: () => number;
}
