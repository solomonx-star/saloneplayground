import { RULES, type Rule, type Rules } from "@salone/games/ludo/rules";

// The six house rules as switches, with what the ones that are on do. Without `onToggle` they only show the rules.
export default function RuleChips({ rules, onToggle }: { rules: Rules; onToggle?: (rule: Rule) => void }) {
  const on = (Object.keys(RULES) as Rule[]).filter((r) => rules[r]);
  return <>
    <div className="ludo-rules" role="group" aria-label="House rules">
      {(Object.keys(RULES) as Rule[]).map((rule, i) => <button key={rule} className={rules[rule] ? "on" : ""} aria-pressed={rules[rule]} disabled={!onToggle} onClick={() => onToggle?.(rule)} title={RULES[rule].blurb}><b>{i + 1}</b>{RULES[rule].label}</button>)}
    </div>
    <p className="ludo-rules-help">{on.map((r) => RULES[r].blurb).join(" ") || (onToggle ? "No house rules on: a double 6, a capture or a token reaching home earns another roll. Tap a rule to switch it on (this starts a new game)." : "No house rules: a double 6, a capture or a token reaching home earns another roll.")}</p>
  </>;
}
