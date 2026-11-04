import { RULES, type Rule, type Rules } from "@salone/games/snakes/rules";

export const NO_RULES_HELP = "No house rules: any roll that reaches 100 wins, a 6 is an ordinary roll, and every snake just slides you down.";

// The four house rules as switches, with what the ones that are on do. Without `onToggle` they only show the rules.
export default function SnakesRuleChips({ rules, onToggle }: { rules: Rules; onToggle?: (rule: Rule) => void }) {
  const on = (Object.keys(RULES) as Rule[]).filter((r) => rules[r]);
  return <>
    <div className="ludo-rules" role="group" aria-label="House rules">
      {(Object.keys(RULES) as Rule[]).map((rule, i) => <button key={rule} className={rules[rule] ? "on" : ""} aria-pressed={rules[rule]} disabled={!onToggle} onClick={() => onToggle?.(rule)} title={RULES[rule].blurb}><b>{i + 1}</b>{RULES[rule].label}</button>)}
    </div>
    <p className="ludo-rules-help">{on.map((r) => RULES[r].blurb).join(" ") || NO_RULES_HELP}</p>
  </>;
}
