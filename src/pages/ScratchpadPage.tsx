import { useEffect, useMemo, useState } from 'react';
import { Clipboard, Eraser, NotebookPen, RotateCcw } from 'lucide-react';
import type { FlightSummary } from '../lib/ofp';
import { loadLocal, saveLocal } from '../lib/storage';

type ScratchTab = 'clearance' | 'atis' | 'taxi' | 'notes';
function templates(flight: FlightSummary): Record<ScratchTab, string> {
  return {
    clearance: `CLEARED TO ${flight.destination}\nVIA: ${flight.route !== '—' ? flight.route : ''}\nCLIMB: \nDEP FREQ: \nSQUAWK: `,
    atis: `${flight.origin} ATIS\nINFO: \nWIND: \nVIS/CEILING: \nTEMP/DEW: \nALTIMETER: \nRUNWAY: `,
    taxi: `${flight.origin} TAXI\nGATE/RAMP: \nRUNWAY: \nVIA: \nHOLD SHORT: `,
    notes: `${flight.airline}${flight.flightNumber} · ${flight.origin}–${flight.destination}\n${flight.aircraft} · ${flight.registration}\n`
  };
}
const LABELS: Record<ScratchTab, string> = { clearance: 'Clearance', atis: 'ATIS', taxi: 'Taxi', notes: 'Flight notes' };
const QUICK: Record<ScratchTab, string[]> = {
  clearance: ['CLIMB VIA ', 'MAINTAIN ', 'EXPECT ', 'DEP FREQ ', 'SQUAWK '],
  atis: ['RWY ', 'BRAKING ', 'LLWS ', 'BIRD ACTIVITY ', 'NOTAMS '],
  taxi: ['VIA ', 'HOLD SHORT ', 'CROSS RWY ', 'CONTACT GROUND ', 'MONITOR TOWER '],
  notes: ['FUEL ', 'PAX ', 'MEL ', 'DELAY ', 'GATE ']
};
export function ScratchpadPage({ flight, notify }: { flight: FlightSummary; notify: (message: string) => void }) {
  const key = `aeroslate.scratch.${flight.release}.${flight.origin}${flight.destination}`;
  const defaults = useMemo(() => templates(flight), [flight.release, flight.origin, flight.destination, flight.route, flight.airline, flight.flightNumber, flight.aircraft, flight.registration]);
  const [notes, setNotes] = useState<Record<ScratchTab, string>>(() => ({ ...defaults, ...loadLocal<Partial<Record<ScratchTab, string>>>(key, {}) }));
  useEffect(() => setNotes({ ...defaults, ...loadLocal<Partial<Record<ScratchTab, string>>>(key, {}) }), [key]);
  useEffect(() => saveLocal(key, notes), [key, notes]);
  const append = (tab: ScratchTab, value: string) => setNotes(current => ({ ...current, [tab]: `${current[tab]}${current[tab].endsWith('\n') ? '' : '\n'}${value}` }));
  const copy = async (tab: ScratchTab) => { await navigator.clipboard.writeText(notes[tab]); notify(`${LABELS[tab]} copied.`); };
  return <div className="scratchboard-page">
    <section className="scratchboard-intro"><NotebookPen size={20}/><div><strong>Cockpit scratchboard</strong><span>All working notes stay visible and save automatically with the active flight.</span></div></section>
    <div className="scratchboard-grid">{(['clearance','atis','taxi','notes'] as ScratchTab[]).map(tab => <section className={`card scratch-sheet scratch-${tab}`} key={tab}>
      <header><div><h3>{LABELS[tab]}</h3></div><div className="header-actions"><button title="Copy" onClick={() => void copy(tab)}><Clipboard size={14}/></button><button title="Restore flight template" onClick={() => setNotes(current => ({ ...current, [tab]: defaults[tab] }))}><RotateCcw size={14}/></button><button title="Clear" onClick={() => setNotes(current => ({ ...current, [tab]: '' }))}><Eraser size={14}/></button></div></header>
      <div className="card-body scratch-sheet-body"><div className="scratch-quick compact">{QUICK[tab].map(item => <button key={item} onClick={() => append(tab,item)}>{item}</button>)}</div><textarea value={notes[tab]} onChange={event => setNotes(current => ({ ...current, [tab]: event.target.value }))} aria-label={`${LABELS[tab]} scratchpad`}/></div>
    </section>)}</div>
  </div>;
}
