"use client";

import { createContext, useCallback, useContext, useEffect, useRef, useState, type ReactNode } from "react";

type Ask = { title: string; body: string; confirm: string; onConfirm: () => void };
type ConfirmLeave = (ask: Omit<Ask, "confirm"> & { confirm?: string }) => void;

// Outside a guard (which should not happen), leaving goes ahead without asking.
const LeaveContext = createContext<ConfirmLeave>((ask) => ask.onConfirm());

// Asks "are you sure?" before a player leaves a game. Game screens call useConfirmLeave() instead of leaving directly.
export function useConfirmLeave() {
  return useContext(LeaveContext);
}

export default function LeaveGuard({ children }: { children: ReactNode }) {
  const [ask, setAsk] = useState<Ask | null>(null);
  const confirmLeave = useCallback<ConfirmLeave>((next) => setAsk({ confirm: "LEAVE", ...next }), []);
  return <LeaveContext.Provider value={confirmLeave}>
    {children}
    {ask && <LeaveDialog ask={ask} onStay={() => setAsk(null)} onLeave={() => { setAsk(null); ask.onConfirm(); }} />}
  </LeaveContext.Provider>;
}

function LeaveDialog({ ask, onStay, onLeave }: { ask: Ask; onStay: () => void; onLeave: () => void }) {
  const stay = useRef<HTMLButtonElement>(null);
  useEffect(() => {
    // Staying is the safe choice, so it has the focus and Escape picks it.
    stay.current?.focus();
    const onKey = (event: KeyboardEvent) => { if (event.key === "Escape") { event.stopPropagation(); onStay(); } };
    window.addEventListener("keydown", onKey, true);
    return () => window.removeEventListener("keydown", onKey, true);
  }, [onStay]);
  return <div className="leave-backdrop" onPointerDown={(event) => { if (event.target === event.currentTarget) onStay(); }}>
    <div className="leave-dialog" role="alertdialog" aria-modal="true" aria-labelledby="leave-title" aria-describedby="leave-body">
      <small>ARE YOU SURE?</small>
      <strong id="leave-title">{ask.title}</strong>
      <p id="leave-body">{ask.body}</p>
      <div className="leave-buttons">
        <button ref={stay} className="leave-stay" onClick={onStay}>STAY</button>
        <button className="leave-go" onClick={onLeave}>{ask.confirm}</button>
      </div>
    </div>
  </div>;
}

// Leaving an online room or party asks first. Returns a handler for the LEAVE / END PARTY buttons.
export function useLeaveRoom(leave: () => unknown) {
  const confirmLeave = useConfirmLeave();
  return ({ endsParty = false, inMatch = false }: { endsParty?: boolean; inMatch?: boolean } = {}) => confirmLeave(endsParty
    ? { title: "End the party?", body: "This ends the game for everyone in the room.", confirm: "END PARTY", onConfirm: () => void leave() }
    : inMatch
      ? { title: "Leave this match?", body: "You will leave the match in progress. You can join again with the room code.", onConfirm: () => void leave() }
      : { title: "Leave this room?", body: "You can join again with the room code if you change your mind.", onConfirm: () => void leave() });
}
