import { useRef, useState } from 'react';
import { ExternalLink, PanelLeftOpen, PanelLeftClose, RefreshCw } from 'lucide-react';
import { isNativeApp } from '../components/ProviderPortal';
import type { AnyRecord, FlightSummary } from '../lib/ofp';

const NAVIGRAPH_CURRENT_FLIGHT = 'https://charts.navigraph.com/flights/current';

function nativeApi(): any {
  return (window as any).aeroslateNative || (window as any).dispatchlinkNative;
}

function openNavigraph() {
  const api = nativeApi();
  if (api?.openProvider) return api.openProvider(NAVIGRAPH_CURRENT_FLIGHT, 'Navigraph Charts');
  const browser = (window as any).Capacitor?.Plugins?.Browser;
  if (browser?.open) return browser.open({ url: NAVIGRAPH_CURRENT_FLIGHT, presentationStyle: 'fullscreen' });
  window.open(NAVIGRAPH_CURRENT_FLIGHT, 'aeroslate-navigraph', 'popup=yes,width=1500,height=1000');
}

export function ChartsPage({ flight }: { ofp: AnyRecord | null; flight: FlightSummary }) {
  const native = isNativeApp();
  const webviewRef = useRef<any>(null);
  const [reloadKey, setReloadKey] = useState(0);
  const [expanded, setExpanded] = useState(false);
  const reload = () => {
    if (native && webviewRef.current?.reload) webviewRef.current.reload();
    else setReloadKey(value => value + 1);
  };

  return <div className={`navigraph-page navigraph-clean ${expanded ? 'expanded' : ''}`}>
    <div className="navigraph-topbar">
      <div className="navigraph-heading">
        <strong>Navigraph Charts</strong>
        <span>{flight.origin} → {flight.destination}{flight.alternate && flight.alternate !== '—' && flight.alternate !== '----' ? ` · ALT ${flight.alternate}` : ''}</span>
      </div>
      <div className="navigraph-actions">
        <button onClick={reload} title="Reload Navigraph"><RefreshCw size={16} /><span>Reload</span></button>
        <button onClick={() => setExpanded(value => !value)} title={expanded ? 'Restore workspace' : 'Expand workspace'}>{expanded ? <PanelLeftClose size={16} /> : <PanelLeftOpen size={16} />}<span>{expanded ? 'Restore' : 'Expand'}</span></button>
        <button onClick={() => void openNavigraph()} title="Open Navigraph provider window"><ExternalLink size={16} /><span>Open</span></button>
      </div>
    </div>
    <section className="navigraph-provider-pane navigraph-only-pane">
      {native ? <webview
        key={reloadKey}
        ref={webviewRef}
        className="navigraph-webview"
        src={NAVIGRAPH_CURRENT_FLIGHT}
        partition="persist:aeroslate-providers"
        allowpopups="true"
        webpreferences="contextIsolation=yes,sandbox=yes,nodeIntegration=no"
      /> : <>
        <iframe key={reloadKey} className="navigraph-iframe" src={NAVIGRAPH_CURRENT_FLIGHT} title="Navigraph Charts" allow="clipboard-read; clipboard-write; fullscreen" />
        <div className="navigraph-web-help">
          <span>If your browser blocks the embedded provider, open the persistent Navigraph session.</span>
          <button className="primary" onClick={() => void openNavigraph()}><ExternalLink size={15} /> Open Navigraph</button>
        </div>
      </>}
    </section>
  </div>;
}
