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
const QUICK: Record<ScratchTab, string[]> = {
  clearance: ['CLIMB VIA ', 'MAINTAIN ', 'EXPECT ', 'DEP FREQ ', 'SQUAWK '],
  atis: ['RWY ', 'BRAKING ', 'LLWS ', 'BIRD ACTIVITY ', 'NOTAMS '],
  taxi: ['VIA ', 'HOLD SHORT ', 'CROSS RWY ', 'CONTACT GROUND ', 'MONITOR TOWER '],
  notes: ['FUEL ', 'PAX ', 'MEL ', 'DELAY ', 'GATE ']
};
export function ScratchpadPage({ flight, notify }: { flight: FlightSummary; notify: (message: string) => void }) {
  const key = `aeroslate.scratch.${flight.release}.${flight.origin}${flight.destination}`;
  const defaults = useMemo(() => templates(flight), [flight.release, flight.origin, flight.destination, flight.route, flight.airline, flight.flightNumber, flight.aircraft, flight.registration]);
  const [tab, setTab] = useState<ScratchTab>('clearance');
  const [notes, setNotes] = useState<Record<ScratchTab, string>>(() => ({ ...defaults, ...loadLocal<Partial<Record<ScratchTab, string>>>(key, {}) }));
  useEffect(() => setNotes({ ...defaults, ...loadLocal<Partial<Record<ScratchTab, string>>>(key, {}) }), [key]);
  useEffect(() => saveLocal(key, notes), [key, notes]);
  const append = (value: string) => setNotes(current => ({ ...current, [tab]: `${current[tab]}${current[tab].endsWith('\n') ? '' : '\n'}${value}` }));
  const copy = async () => { await navigator.clipboard.writeText(notes[tab]); notify(`${tab.toUpperCase()} copied.`); };
  return <section className="card scratch-card"><header><div><NotebookPen size={18}/><h3>Scratchpad</h3></div><div className="header-actions"><button onClick={copy}><Clipboard size={15}/> Copy</button><button title="Restore template" onClick={() => setNotes(current => ({ ...current, [tab]: defaults[tab] }))}><RotateCcw size={15}/></button><button title="Clear page" onClick={() => setNotes(current => ({ ...current, [tab]: '' }))}><Eraser size={15}/></button></div></header><div className="card-body">
    <div className="scratch-tabs">{(['clearance','atis','taxi','notes'] as const).map(item => <button className={tab===item?'active':''} onClick={()=>setTab(item)} key={item}>{item.toUpperCase()}</button>)}</div>
    <div className="scratch-quick">{QUICK[tab].map(item=><button key={item} onClick={()=>append(item)}>{item}</button>)}</div>
    <textarea className="scratchpad" value={notes[tab]} onChange={event=>setNotes({...notes,[tab]:event.target.value})} aria-label={`${tab} scratchpad`} />
    <div className="scratch-hint">Flight templates load automatically. Quick inserts append common cockpit phrases without replacing saved text.</div>
  </div></section>;
}
