import { TOUCH } from "@salone/games/touch/settings";

type Step = "run" | "turn" | "main";

// A tiny drawing of the field: turn line at the top, four defended lines, home line at the bottom, Main Line down the middle.
function StepArt({ step }: { step: Step }) {
  return (
    <svg viewBox="0 0 120 100" className="how-to-art" aria-hidden="true">
      <rect x="2" y="2" width="116" height="96" rx="6" fill="#226b4d" />
      <line x1="6" y1="12" x2="114" y2="12" stroke="#f0d77a" strokeWidth="2" />
      {[30, 46, 62, 78].map((y) => <line key={y} x1="6" y1={y} x2="114" y2={y} stroke="#d1e3cb" strokeOpacity="0.6" />)}
      <line x1="6" y1="90" x2="114" y2="90" stroke="#f0d77a" strokeWidth="2" />
      <line x1="60" y1="6" x2="60" y2="94" stroke="#f6dda0" strokeOpacity={step === "main" ? 1 : 0.6} strokeWidth={step === "main" ? 3 : 1} />
      {step === "run" && <>
        <line x1="36" y1="90" x2="36" y2="20" stroke="#a9dbef" strokeWidth="2" />
        <polygon points="32,22 36,15 40,22" fill="#a9dbef" />
        <circle cx="36" cy="94" r="4" fill="#69c6ef" />
        {[[90, 30], [80, 46], [95, 62], [78, 78]].map(([x, y]) => <g key={y}>
          <circle cx={x} cy={y} r="4" fill="#f2a354" />
          <line x1={x - 9} y1={y + 7} x2={x + 9} y2={y + 7} stroke="#f2a354" strokeOpacity="0.8" />
        </g>)}
      </>}
      {step === "turn" && <>
        <path d="M30 90 L30 14 Q30 7 38 7 L82 7 Q90 7 90 14 L90 84" fill="none" stroke="#a9dbef" strokeWidth="2" />
        <polygon points="86,82 90,89 94,82" fill="#a9dbef" />
        <text x="36" y="50" fontSize="9" fontWeight="700" fill="#d7ec83">+{TOUCH.linePoints}</text>
        <text x="70" y="86" fontSize="9" fontWeight="700" fill="#d7ec83">+{TOUCH.homePoints}</text>
      </>}
      {step === "main" && <>
        <line x1="60" y1="34" x2="60" y2="66" stroke="#ff8a6b" strokeWidth="2" />
        <polygon points="56,36 60,29 64,36" fill="#ff8a6b" />
        <polygon points="56,64 60,71 64,64" fill="#ff8a6b" />
        <circle cx="60" cy="50" r="5" fill="#e57859" />
        <circle cx="70" cy="52" r="4" fill="#69c6ef" />
        <circle cx="65" cy="51" r="10" fill="none" stroke="#ffd166" strokeWidth="2" />
      </>}
    </svg>
  );
}

export default function HowToPlay({ onClose }: { onClose: () => void }) {
  return (
    <div className="how-to" role="dialog" aria-modal="true" aria-labelledby="how-to-title">
      <div className="how-to-card">
        <p className="how-to-eyebrow">HOW TO PLAY</p>
        <h2 id="how-to-title">Touch</h2>
        <ol className="how-to-steps">
          <li><StepArt step="run" /><div><strong>1. Run the lines</strong><span>Start at the bottom and get past each line. A line defender can only slide along their own line.</span></div></li>
          <li><StepArt step="turn" /><div><strong>2. Turn and come home</strong><span>Reach the last line, turn back and run home. Each line crossed scores +{TOUCH.linePoints}; getting home scores +{TOUCH.homePoints}.</span></div></li>
          <li><StepArt step="main" /><div><strong>3. Don&apos;t get touched</strong><span>The Main Line defender runs up and down the middle. If any attacker is touched, the sides swap.</span></div></li>
        </ol>
        <div className="how-to-controls">
          <span><b>Keyboard</b> WASD or arrows to move · Shift to sprint · Space to switch player</span>
          <span><b>Touch screen</b> joystick to move · SPRINT · SWITCH · or tap a player</span>
          <span><b>Match</b> {TOUCH.turnsPerTeam} attacking turns each · most points wins</span>
        </div>
        <button className="how-to-go" onClick={onClose} autoFocus>GOT IT ▶</button>
      </div>
    </div>
  );
}
