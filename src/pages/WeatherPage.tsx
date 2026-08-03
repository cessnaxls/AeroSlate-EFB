import { useMemo, useState } from 'react';
import { AlertTriangle, ChevronDown, CloudSun, Filter, Search, ShieldCheck } from 'lucide-react';
import { getAllNotams, getWeather, type AnyRecord, type FlightSummary, type ParsedNotam } from '../lib/ofp';

function categoryLabel(category: ParsedNotam['category']) {
  return ({ airport: 'Airport', runway: 'Runway', taxiway: 'Taxiway', lighting: 'Lighting', procedure: 'Procedure / FDC', navaid: 'Navaid', communication: 'Communications', service: 'Services', airspace: 'Airspace', obstacle: 'Obstacles', other: 'Other' } as const)[category];
}
function statusLabel(item: ParsedNotam) {
  if (/\b(?:CLSD|CLOSED)\b/i.test(item.text)) return 'CLOSED';
  if (/\bNA\b|NOT AUTHORIZED/i.test(item.text) && item.category === 'procedure') return 'Not authorized';
  if (/NOT APPLICABLE/i.test(item.text) && item.category === 'procedure') return 'Not applicable';
  if (item.category === 'procedure' && /INCREASE|RAISE|VISIBILITY|CEILING|MINIMA|AMDT|AMEND|REVISED|CHANGE/i.test(item.text)) return 'Minima / procedure change';
  if (item.priority === 'amendment') return 'Procedure change';
  if (/UNSERVICEABLE|\bU\/S\b/i.test(item.text)) return 'Unserviceable';
  if (/OUT OF SERVICE|\bOOS\b|\bOTS\b|INOPERATIVE|\bINOP\b/i.test(item.text)) return 'Out of service';
  if (/NOT AVBL|NOT AVAILABLE|SUSPENDED/i.test(item.text)) return 'Not available';
  return item.priority === 'critical' ? 'UNAVAILABLE' : 'ADVISORY';
}
function operationalRank(item: ParsedNotam) {
  if (item.priority === 'critical' && /(?:AD|AIRPORT|AERODROME).*\b(?:CLSD|CLOSED)\b/i.test(item.text)) return 0;
  if (item.priority === 'critical' && /(?:RWY|RUNWAY).*\b(?:CLSD|CLOSED)\b/i.test(item.text)) return 1;
  if (item.priority === 'critical') return 2;
  return 3;
}

export function WeatherPage({ ofp, flight }: { ofp: AnyRecord | null; flight: FlightSummary }) {
  const stations = ([
    { key: 'origin', code: flight.origin, label: 'Departure' },
    { key: 'destination', code: flight.destination, label: 'Destination' },
    { key: 'alternate', code: flight.alternate, label: 'Alternate' }
  ] as { key: 'origin' | 'destination' | 'alternate'; code: string; label: string }[]).filter(item => item.code && item.code !== '----');
  const allNotams = useMemo(() => getAllNotams(ofp), [ofp]);
  const important = useMemo(() => allNotams.filter(item => item.important).sort((a, b) => a.station.localeCompare(b.station) || operationalRank(a) - operationalRank(b)), [allNotams]);
  const [filter, setFilter] = useState<'all' | ParsedNotam['category']>('all');
  const [query, setQuery] = useState('');
  const visible = allNotams.filter(item => (filter === 'all' || item.category === filter) && (!query.trim() || `${item.station} ${item.text}`.toLowerCase().includes(query.trim().toLowerCase())));
  const grouped = visible.reduce<Record<string, ParsedNotam[]>>((acc, item) => { (acc[item.station] ||= []).push(item); return acc; }, {});
  const operationalGroups = important.reduce<Record<string, ParsedNotam[]>>((acc, item) => { (acc[item.station] ||= []).push(item); return acc; }, {});
  const criticalCount = important.filter(item => item.priority === 'critical').length;
  const amendmentCount = important.filter(item => item.priority === 'amendment').length;

  const stationCount = Object.keys(allNotams.reduce<Record<string, true>>((acc, item) => { acc[item.station] = true; return acc; }, {})).length;

  return <div className="weather-page">
    <section className="notam-briefing-overview">
      <div><ShieldCheck size={20} /><span><strong>Complete imported briefing</strong><small>Every full NOTAM supplied by the current SimBrief OFP is retained below.</small></span></div>
      <div className="notam-overview-metrics"><span><b>{allNotams.length}</b> notices</span><span><b>{stationCount}</b> stations</span><span className={criticalCount ? 'danger' : ''}><b>{criticalCount}</b> critical</span><span className={amendmentCount ? 'caution' : ''}><b>{amendmentCount}</b> procedure changes</span></div>
    </section>
    <section className="briefing-section card">
      <details open>
        <summary><div><CloudSun size={18} /><span><strong>Weather briefing</strong><small>{stations.length} station{stations.length === 1 ? '' : 's'}</small></span></div><ChevronDown size={17} /></summary>
        <div className="card-body weather-grid compact-weather-grid">{stations.map(station => {
          const wx = getWeather(ofp, station.key);
          return <details className="weather-station" key={station.key} open={station.key !== 'alternate'}><summary><span><strong>{station.code}</strong><small>{station.label}</small></span><ChevronDown size={15} /></summary><div className="weather-station-body"><div className="weather-block"><span>METAR</span><p>{wx.metar}</p></div><div className="weather-block"><span>TAF</span><p>{wx.taf}</p></div></div></details>;
        })}</div>
      </details>
    </section>

    <section className="briefing-section card important-notams">
      <details open>
        <summary><div><AlertTriangle size={18} /><span><strong>Pilot-critical airport scan</strong><small>Only closures, unavailable runway/approach equipment, and procedure changes</small></span></div><div className="summary-badges"><span className={`pill ${criticalCount ? 'bad' : 'good'}`}>{criticalCount} CRITICAL</span><span className={`pill ${amendmentCount ? 'warn' : 'neutral'}`}>{amendmentCount} CHANGES</span><ChevronDown size={17} /></div></summary>
        <div className="card-body operational-notam-groups">
          {Object.entries(operationalGroups).map(([station, items]) => <details className="operational-airport" key={station} open={station === flight.origin || station === flight.destination}>
            <summary><div><strong>{station}</strong><span>{items.length} operational item{items.length === 1 ? '' : 's'}</span></div><div><span className="critical-dot">{items.filter(item => item.priority === 'critical').length} critical</span><span className="amendment-dot">{items.filter(item => item.priority === 'amendment').length} changed</span><ChevronDown size={15}/></div></summary>
            <div>{items.map(item => <article className={`priority-${item.priority}`} key={item.id}><div className="notam-glance-line"><span className={`notam-status ${item.priority}`}>{statusLabel(item)}</span><span className={`notam-category ${item.category}`}>{categoryLabel(item.category)}</span></div><p>{item.text}</p></article>)}</div>
          </details>)}
          {!important.length && <div className="empty-inline good-scan"><strong>No critical airport or procedure condition identified.</strong><span>The complete imported NOTAM set remains available below for mandatory review.</span></div>}
        </div>
      </details>
    </section>

    <section className="briefing-section card all-notams">
      <details>
        <summary><div><Filter size={18} /><span><strong>Complete imported NOTAM set</strong><small>All {allNotams.length} imported notices retained; review this section for the complete briefing</small></span></div><div className="summary-badges"><span className="pill neutral">{allNotams.length}</span><ChevronDown size={17} /></div></summary>
        <div className="notam-toolbar"><div className="notam-filter-bar">{(['all', 'airport', 'runway', 'taxiway', 'lighting', 'procedure', 'navaid', 'communication', 'service', 'airspace', 'obstacle', 'other'] as const).map(item => <button key={item} className={filter === item ? 'active' : ''} onClick={() => setFilter(item)}>{item === 'all' ? `All ${allNotams.length}` : categoryLabel(item)}</button>)}</div><label className="notam-search"><Search size={15} /><input value={query} onChange={event => setQuery(event.target.value)} placeholder="Search station or NOTAM text" /></label></div>
        <div className="card-body notam-groups">
          {Object.entries(grouped).sort(([a], [b]) => a.localeCompare(b)).map(([station, items]) => <details key={station} className="notam-station"><summary><span><strong>{station}</strong><small>{items.length} NOTAM{items.length === 1 ? '' : 's'} · {items.filter(item => item.priority === 'critical').length} critical · {items.filter(item => item.priority === 'amendment').length} changed</small></span><ChevronDown size={15} /></summary><div>{items.sort((a, b) => operationalRank(a) - operationalRank(b)).map(item => <article key={item.id} className={`full-notam priority-${item.priority}`}><div><span className={`notam-category ${item.category}`}>{categoryLabel(item.category)}</span>{item.priority !== 'advisory' && <span className={`notam-status ${item.priority}`}>{statusLabel(item)}</span>}</div><p>{item.text}</p></article>)}</div></details>) }
          {!allNotams.length && <div className="empty-inline"><AlertTriangle size={18} /> No NOTAM text was found in the imported OFP. Regenerate with NOTAMs and FIR NOTAMs enabled, then synchronize the OFP again.</div>}
        </div>
      </details>
    </section>
  </div>;
}
