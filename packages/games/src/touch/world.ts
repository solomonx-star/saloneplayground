import type { Body } from "./field";
import type { SideTuning } from "./settings";

// What the computer players can see when they decide. The match builds one each step; tests build them by hand.
export interface World {
  attackers: Body[];
  defenders: Body[];
  mainDefender: Body;
  // The players people control. The computer moves everyone else.
  humans: ReadonlySet<Body>;
  // The attacker the Main Line has marked as the biggest threat.
  aiTarget: Body | null;
  attack: SideTuning;
  defense: SideTuning;
  now: number;
  random: () => number;
}
