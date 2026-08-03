import { useMemo, useState } from 'react';
import { AlertTriangle, ChevronDown, CloudSun, Filter } from 'lucide-react';
import { getAllNotams, getWeather, type AnyRecord, type FlightSummary, type ParsedNotam } from '../lib/ofp';

function categoryLabel(category: ParsedNotam['category']) {
  return ({ runway: 'Runway', procedure: 'Procedure', airport: 'Airport', airspace: 'Airspace', navaid: 'Navaid', other: 'Other' } as const)[category];
}
function priorityLabel(priority: ParsedNotam['priority']) {
  if (priority === 'critical') return 'Closed / out of service';
  if (priority === 'amendment') return 'Procedure amendment';
  return 'Advisory';
}

export function WeatherPage({ ofp, flight }: { ofp: AnyRecord | null; flight: FlightSummary }) {
  const stations = ([
    { key: 'origin', code: flight.origin, label: 'Departure' },
    { key: 'destination', code: flight.destination, label: 'Destination' },
    { key: 'alternate', code: flight.alternate, label: 'Alternate' }
  ] as { key: 'origin' | 'destination' | 'alternate'; code: string; label: string }[]).filter(item => item.code && item.code !== '----');
  const allNotams = useMemo(() => getAllNotams(ofp), [ofp]);
  const important = useMemo(() => allNotams.filter(item => item.important).sort((a, b) => (a.priority === 'critical' ? 0 : 1) - (b.priority === 'critical' ? 0 : 1)), [allNotams]);
  const [filter, setFilter] = useState<'all' | ParsedNotam['category']>('all');
  const visible = allNotams.filter(item => filter === 'all' || item.category === filter);
  const grouped = visible.reduce<Record<string, ParsedNotam[]>>((acc, item) => { (acc[item.station] ||= []).push(item); return acc; }, {});
  const criticalCount = important.filter(item => item.priority === 'critical').length;
  const amendmentCount = important.filter(item => item.priority === 'amendment').length;

  return <div className="weather-page">
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
      <details open={important.length > 0}>
        <summary><div><AlertTriangle size={18} /><span><strong>Operational NOTAM scan</strong><small>Airport, runway, approach and runway-equipment issues</small></span></div><div className="summary-badges"><span className={`pill ${criticalCount ? 'bad' : 'neutral'}`}>{criticalCount} OUT / CLOSED</span><span className={`pill ${amendmentCount ? 'warn' : 'neutral'}`}>{amendmentCount} AMENDMENTS</span><ChevronDown size={17} /></div></summary>
        <div className="card-body notam-priority-grid">
          {important.map(item => <article className={`priority-${item.priority}`} key={item.id}><div><span className={`notam-priority ${item.priority}`}>{priorityLabel(item.priority)}</span><span className={`notam-category ${item.category}`}>{categoryLabel(item.category)}</span><strong>{item.station}</strong></div><p>{item.text}</p></article>)}
          {!important.length && <div className="empty-inline">No airport closure, runway closure, runway-equipment outage, critical navaid outage, or instrument-procedure amendment was identified in the imported NOTAM set.</div>}
        </div>
      </details>
    </section>

    <section className="briefing-section card all-notams">
      <details>
        <summary><div><Filter size={18} /><span><strong>All imported NOTAMs</strong><small>Complete set retained for full review</small></span></div><div className="summary-badges"><span className="pill neutral">{allNotams.length}</span><ChevronDown size={17} /></div></summary>
        <div className="notam-filter-bar">{(['all', 'runway', 'procedure', 'airport', 'navaid', 'airspace', 'other'] as const).map(item => <button key={item} className={filter === item ? 'active' : ''} onClick={() => setFilter(item)}>{item === 'all' ? `All ${allNotams.length}` : categoryLabel(item)}</button>)}</div>
        <div className="card-body notam-groups">
          {Object.entries(grouped).map(([station, items]) => <details key={station} className="notam-station"><summary><span><strong>{station}</strong><small>{items.length} NOTAM{items.length === 1 ? '' : 's'}</small></span><ChevronDown size={15} /></summary><div>{items.map(item => <article key={item.id}><div><span className={`notam-category ${item.category}`}>{categoryLabel(item.category)}</span>{item.priority !== 'advisory' && <span className={`notam-priority ${item.priority}`}>{priorityLabel(item.priority)}</span>}</div><p>{item.text}</p></article>)}</div></details>)}
          {!allNotams.length && <div className="empty-inline">No NOTAM text was found in the imported OFP. Regenerate with NOTAMs and FIR NOTAMs enabled, then synchronize the OFP again.</div>}
        </div>
      </details>
    </section>
  </div>;
}
