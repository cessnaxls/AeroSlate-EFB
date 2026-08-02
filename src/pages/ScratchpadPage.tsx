import { useEffect, useMemo, useState } from 'react';
import { Clipboard, Eraser, NotebookPen, RotateCcw } from 'lucide-react';
import type { FlightSummary } from '../lib/ofp';
import { loadLocal, saveLocal } from '../lib/storage';

type ScratchTab = 'clearance' | 'atis' | 'notes';

function templates(flight: FlightSummary): Record<ScratchTab, string> {
  return {
    clearance: `CLEARED TO ${flight.destination}\nVIA: ${flight.route !== '—' ? flight.route : ''}\nCLIMB: \nDEP FREQ: \nSQUAWK: `,
    atis: `${flight.origin} ATIS\nINFO: \nWIND: \nVIS: \nCEILING: \nTEMP/DEW: \nALTIMETER: \nRUNWAY: `,
    notes: `${flight.airline}${flight.flightNumber} · ${flight.origin}–${flight.destination}\n${flight.aircraft} · ${flight.registration}\n`
  };
}

export function ScratchpadPage({ flight, notify }: { flight: FlightSummary; notify: (message: string) => void }) {
  const key = `aeroslate.scratch.${flight.release}.${flight.origin}${flight.destination}`;
  const defaults = useMemo(() => templates(flight), [flight.release, flight.origin, flight.destination, flight.route, flight.airline, flight.flightNumber, flight.aircraft, flight.registration]);
  const [tab, setTab] = useState<ScratchTab>('clearance');
  const [notes, setNotes] = useState<Record<ScratchTab, string>>(() => {
    const stored = loadLocal<Partial<Record<ScratchTab, string>>>(key, {});
    return { clearance: stored.clearance || defaults.clearance, atis: stored.atis || defaults.atis, notes: stored.notes || defaults.notes };
  });
  useEffect(() => {
    const stored = loadLocal<Partial<Record<ScratchTab, string>>>(key, {});
    setNotes({ clearance: stored.clearance || defaults.clearance, atis: stored.atis || defaults.atis, notes: stored.notes || defaults.notes });
  }, [key]);
  useEffect(() => saveLocal(key, notes), [key, notes]);

  const copy = async () => { await navigator.clipboard.writeText(notes[tab]); notify(`${tab.toUpperCase()} scratchpad copied.`); };
  return <section className="card scratch-card"><header><div><NotebookPen size={18} /><h3>Cockpit scratchpad</h3></div><div className="header-actions"><button onClick={copy}><Clipboard size={15} /> Copy</button><button onClick={() => setNotes(current => ({ ...current, [tab]: defaults[tab] }))}><RotateCcw size={15} /> Reset template</button><button onClick={() => setNotes(current => ({ ...current, [tab]: '' }))}><Eraser size={15} /> Clear</button></div></header><div className="card-body">
    <div className="scratch-tabs">{(['clearance', 'atis', 'notes'] as const).map(item => <button className={tab === item ? 'active' : ''} onClick={() => setTab(item)} key={item}>{item.toUpperCase()}</button>)}</div>
    <textarea className="scratchpad" value={notes[tab]} onChange={event => setNotes({ ...notes, [tab]: event.target.value })} aria-label={`${tab} scratchpad`} />
    <div className="scratch-hint">Templates are inserted automatically for each new active flight and never overwrite text you have already saved.</div>
  </div></section>;
}
