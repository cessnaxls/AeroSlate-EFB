import { ExternalLink, Map } from 'lucide-react';
import { ProviderPortal } from '../components/ProviderPortal';
import type { AnyRecord, FlightSummary } from '../lib/ofp';
import type { ChartSource } from '../components/ChartWorkspace';

interface Props { ofp: AnyRecord | null; flight: FlightSummary; source: ChartSource | null; setSource: (source: ChartSource | null) => void; }

export function ChartsPage({ flight }: Props) {
  const url = 'https://charts.navigraph.com/flights/current';
  return <div className="charts-page">
    <section className="card provider-card charts-provider">
      <header><div><Map size={18} /><h3>Navigraph Charts</h3></div><button onClick={() => window.open(url, 'aeroslate-navigraph')}><ExternalLink size={15} /> Open session</button></header>
      <ProviderPortal title="Navigraph Charts" url={url} windowName="aeroslate-navigraph" description={`Official Navigraph flight workspace for ${flight.origin}–${flight.destination}. The provider session remains mounted while you use other AeroSlate tabs.`} />
    </section>
  </div>;
}
