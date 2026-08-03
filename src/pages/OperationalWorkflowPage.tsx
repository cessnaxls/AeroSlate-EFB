import { useEffect, useMemo, useState } from 'react';
import { AlertTriangle, CheckCircle2, ClipboardCheck, ShieldCheck } from 'lucide-react';
import type { FlightSummary } from '../lib/ofp';
import { loadLocal, saveLocal } from '../lib/storage';

type Mode = 'frat' | 'preflight' | 'postflight';
interface CheckItem { id: string; label: string; checked: boolean; }
const DEFAULTS: Record<Mode, string[]> = {
  frat: ['Weather reviewed', 'NOTAMs reviewed', 'Runway/performance reviewed', 'Crew fitness acceptable', 'Aircraft/MEL acceptable', 'Airport and terrain risk acceptable'],
  preflight: ['OFP synchronized', 'Charts and binder ready', 'Fuel and payload confirmed', 'Clearance copied', 'Departure briefing completed', 'OOOI automation armed'],
  postflight: ['OOOI times reviewed', 'Fuel checkpoint reconciled', 'Flight log completed', 'Duty log attached', 'Discrepancies recorded', 'Trip closed']
};
export function OperationalWorkflowPage({ mode, flight }: { mode: Mode; flight: FlightSummary }) {
  const key = `aeroslate.workflow.${mode}.${flight.release}.${flight.origin}${flight.destination}`;
  const initial = useMemo(() => DEFAULTS[mode].map((label, index) => ({ id: `${mode}-${index}`, label, checked: false })), [mode]);
  const [items, setItems] = useState<CheckItem[]>(() => loadLocal(key, initial));
  const [notes, setNotes] = useState(() => loadLocal(`${key}.notes`, ''));
  const [score, setScore] = useState(() => loadLocal(`${key}.score`, mode === 'frat' ? 0 : 0));
  useEffect(() => { setItems(loadLocal(key, initial)); setNotes(loadLocal(`${key}.notes`, '')); setScore(loadLocal(`${key}.score`, 0)); }, [key]);
  useEffect(() => saveLocal(key, items), [key, items]); useEffect(() => saveLocal(`${key}.notes`, notes), [key, notes]); useEffect(() => saveLocal(`${key}.score`, score), [key, score]);
  const completed = items.filter(item => item.checked).length;
  const title = mode === 'frat' ? 'Flight risk assessment' : mode === 'preflight' ? 'Preflight workflow' : 'Postflight workflow';
  const Icon = mode === 'frat' ? ShieldCheck : mode === 'preflight' ? ClipboardCheck : CheckCircle2;
  return <div className="workflow-page"><section className="card workflow-card"><header><div><Icon size={18}/><h3>{title}</h3></div><span className={`pill ${completed === items.length ? 'good' : 'blue'}`}>{completed}/{items.length}</span></header><div className="card-body workflow-body">
    <div className="workflow-flight"><strong>{flight.airline}{flight.flightNumber} · {flight.origin} → {flight.destination}</strong><span>{flight.aircraft} · {flight.registration}</span></div>
    {mode === 'frat' && <label className="frat-score"><span>Risk score</span><input type="number" min="0" max="100" value={score} onChange={event => setScore(Number(event.target.value))}/><small className={score >= 30 ? 'bad-text' : score >= 15 ? 'warn-text' : 'good-text'}>{score >= 30 ? 'High — review or mitigate before release' : score >= 15 ? 'Moderate — document mitigations' : 'Low'}</small></label>}
    <div className="workflow-checks">{items.map(item => <label key={item.id}><input type="checkbox" checked={item.checked} onChange={event => setItems(current => current.map(row => row.id === item.id ? { ...row, checked: event.target.checked } : row))}/><span>{item.label}</span></label>)}</div>
    <label className="stacked-input"><span>{mode === 'frat' ? 'Hazards and mitigations' : 'Notes'}</span><textarea value={notes} onChange={event => setNotes(event.target.value)} placeholder={mode === 'frat' ? 'Hazard — mitigation — residual risk' : 'Record anything that needs follow-up.'}/></label>
    {mode === 'frat' && <div className="notice warn"><AlertTriangle size={17}/><p>This is a configurable personal simulator workflow, not an operator-approved FRAT or dispatch release.</p></div>}
  </div></section></div>;
}
