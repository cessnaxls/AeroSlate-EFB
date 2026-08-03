import { useEffect, useRef } from 'react';
import { ExternalLink, RefreshCw } from 'lucide-react';

interface Props {
  title: string;
  url: string;
  windowName: string;
  description?: string;
  prefill?: Record<string, string | number | undefined>;
  autoPrefill?: boolean;
}

function nativeApi(): any {
  return (window as any).aeroslateNative || (window as any).dispatchlinkNative;
}

export function isNativeApp(): boolean {
  return Boolean(nativeApi()?.isElectron);
}

function prefillScript(values: Record<string, string | number | undefined>) {
  const cleaned = Object.fromEntries(Object.entries(values).filter(([, value]) => value !== undefined && value !== null && String(value).trim() !== ''));
  return `(() => {
    const values = ${JSON.stringify(cleaned)};
    const rules = [
      [/origin|departure airport|departing airport|from airport|orig/i, values.origin],
      [/destination airport|arrival airport|to airport|dest/i, values.destination],
      [/takeoff runway|departure runway|orig.*runway/i, values.departureRunway],
      [/landing runway|arrival runway|dest.*runway/i, values.arrivalRunway],
      [/aircraft type|icao type|aircraft/i, values.aircraft],
      [/registration|tail number|aircraft reg/i, values.registration],
      [/takeoff weight|tow/i, values.takeoffWeight],
      [/landing weight|ldw/i, values.landingWeight],
      [/zero fuel weight|zfw/i, values.zeroFuelWeight],
      [/block fuel|ramp fuel/i, values.blockFuel],
      [/wind.*departure|departure.*wind/i, values.departureWind],
      [/wind.*arrival|arrival.*wind/i, values.arrivalWind],
      [/temperature.*departure|departure.*temperature|oat.*departure/i, values.departureTemperature],
      [/temperature.*arrival|arrival.*temperature|oat.*arrival/i, values.arrivalTemperature],
      [/altimeter.*departure|qnh.*departure/i, values.departureAltimeter],
      [/altimeter.*arrival|qnh.*arrival/i, values.arrivalAltimeter],
      [/passengers?|pax/i, values.passengers],
      [/^payload$|manual payload|payload.*lbs/i, values.payload],
      [/freight|cargo/i, values.freight]
    ];
    const elements = [...document.querySelectorAll('input, select, textarea')];
    let changed = 0;
    for (const element of elements) {
      const id = element.id || '';
      const label = id ? document.querySelector('label[for="' + CSS.escape(id) + '"]')?.textContent || '' : '';
      const nearby = element.closest('label, .form-group, .field, div')?.textContent?.slice(0, 180) || '';
      const descriptor = [element.name, id, element.placeholder, element.getAttribute('aria-label'), label, nearby].filter(Boolean).join(' ');
      const match = rules.find(([pattern, value]) => value !== undefined && value !== '' && pattern.test(descriptor));
      if (!match) continue;
      const value = String(match[1]);
      const setter = Object.getOwnPropertyDescriptor(Object.getPrototypeOf(element), 'value')?.set;
      if (setter) setter.call(element, value); else element.value = value;
      element.dispatchEvent(new Event('input', { bubbles: true }));
      element.dispatchEvent(new Event('change', { bubbles: true }));
      changed++;
    }
    return changed;
  })()`;
}

export function ProviderPortal({ title, url, windowName, description, prefill = {}, autoPrefill = false }: Props) {
  const native = isNativeApp();
  const webviewRef = useRef<any>(null);

  const applyPrefill = async () => {
    if (!webviewRef.current?.executeJavaScript || !Object.keys(prefill).length) return 0;
    try { return await webviewRef.current.executeJavaScript(prefillScript(prefill), true); } catch { return 0; }
  };

  useEffect(() => {
    const webview = webviewRef.current;
    if (!native || !webview || !autoPrefill) return;
    const handler = () => { window.setTimeout(() => void applyPrefill(), 900); };
    webview.addEventListener?.('did-finish-load', handler);
    return () => webview.removeEventListener?.('did-finish-load', handler);
  }, [native, url, autoPrefill, JSON.stringify(prefill)]);

  const openProvider = async () => {
    const api = nativeApi();
    if (api?.openProvider) { await api.openProvider(url, title); return; }
    const capacitorBrowser = (window as any).Capacitor?.Plugins?.Browser;
    if (capacitorBrowser?.open) { await capacitorBrowser.open({ url, presentationStyle: 'popover' }); return; }
    window.open(url, windowName, 'popup=yes,width=1500,height=1000');
  };

  if (native) {
    return <div className="provider-shell">
      <div className="provider-strip"><div><strong>{title}</strong><span>{description || 'Authenticated provider session'}</span></div><div className="provider-strip-actions">{Object.keys(prefill).length > 0 && <button onClick={() => void applyPrefill()}><RefreshCw size={15} /> Apply OFP values</button>}<button onClick={() => nativeApi()?.openExternal?.(url)}><ExternalLink size={15} /> External</button></div></div>
      <webview ref={webviewRef} className="provider-webview" src={url} partition="persist:aeroslate-providers" allowpopups="true" webpreferences="contextIsolation=yes,sandbox=yes,nodeIntegration=no" />
    </div>;
  }

  return <div className="provider-browser-fallback provider-browser-ready">
    <div><h2>{title}</h2><p>{description || 'Open the authenticated provider workspace without closing AeroSlate.'}</p><div className="provider-session-card"><strong>Persistent provider session</strong><span>Mobile builds use an in-app browser sheet. The AeroSlate desktop app displays this workspace directly in the pane and keeps it loaded while you change tabs.</span></div></div>
    <button className="primary" onClick={() => void openProvider()}><ExternalLink size={17} /> Open {title} in AeroSlate</button>
  </div>;
}
