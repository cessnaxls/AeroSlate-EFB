import { useMemo, useState } from 'react';
import { AlertTriangle, CloudSun, Filter } from 'lucide-react';
import { getAllNotams, getWeather, type AnyRecord, type FlightSummary, type ParsedNotam } from '../lib/ofp';

function categoryLabel(category: ParsedNotam['category']) {
  return ({ runway: 'Runway', procedure: 'Procedure', airport: 'Airport', airspace: 'Airspace', navaid: 'Navaid', other: 'Other' } as const)[category];
}

export function WeatherPage({ ofp, flight }: { ofp: AnyRecord | null; flight: FlightSummary }) {
  const stations = ([
    { key: 'origin', code: flight.origin }, { key: 'destination', code: flight.destination }, { key: 'alternate', code: flight.alternate }
  ] as { key: 'origin' | 'destination' | 'alternate'; code: string }[]).filter(item => item.code && item.code !== '----');
  const allNotams = useMemo(() => getAllNotams(ofp), [ofp]);
  const important = allNotams.filter(item => item.important);
  const [filter, setFilter] = useState<'all' | ParsedNotam['category']>('all');
  const visible = allNotams.filter(item => filter === 'all' || item.category === filter);
  const grouped = visible.reduce<Record<string, ParsedNotam[]>>((acc, item) => { (acc[item.station] ||= []).push(item); return acc; }, {});

  return <div className="weather-page">
    <div className="weather-grid compact-weather-grid">{stations.map(station => {
      const wx = getWeather(ofp, station.key);
      return <section className="card" key={station.key}><header><div><CloudSun size={18} /><h3>{station.code} {station.key}</h3></div></header><div className="card-body"><div className="weather-block"><span>METAR</span><p>{wx.metar}</p></div><div className="weather-block"><span>TAF</span><p>{wx.taf}</p></div></div></section>;
    })}</div>

    <section className="card important-notams">
      <header><div><AlertTriangle size={18} /><h3>Operationally important NOTAMs</h3></div><span className={`pill ${important.length ? 'warn' : 'good'}`}>{important.length}</span></header>
      <div className="card-body notam-priority-grid">
        {important.map(item => <article key={item.id}><div><span className={`notam-category ${item.category}`}>{categoryLabel(item.category)}</span><strong>{item.station}</strong></div><p>{item.text}</p></article>)}
        {!important.length && <div className="empty-inline">No runway closures, approach/procedure changes, critical navaid outages, airport closures, TFRs or major obstacles were identified in the imported NOTAM set.</div>}
      </div>
    </section>

    <section className="card all-notams">
      <header><div><Filter size={18} /><h3>All imported NOTAMs</h3></div><div className="notam-filters">{(['all', 'runway', 'procedure', 'airport', 'airspace', 'navaid', 'other'] as const).map(item => <button key={item} className={filter === item ? 'active' : ''} onClick={() => setFilter(item)}>{item === 'all' ? `All ${allNotams.length}` : categoryLabel(item)}</button>)}</div></header>
      <div className="card-body notam-groups">
        {Object.entries(grouped).map(([station, items]) => <section key={station}><h4>{station}<span>{items.length}</span></h4>{items.map(item => <article key={item.id}><span className={`notam-category ${item.category}`}>{categoryLabel(item.category)}</span><p>{item.text}</p></article>)}</section>)}
        {!allNotams.length && <div className="empty-inline">No NOTAM text was found in the imported OFP. Regenerate with NOTAMs and FIR NOTAMs enabled, then synchronize the OFP again.</div>}
      </div>
    </section>
  </div>;
}
