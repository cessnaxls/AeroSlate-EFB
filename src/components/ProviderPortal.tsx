import { ExternalLink } from 'lucide-react';

interface Props {
  title: string;
  url: string;
  windowName: string;
  description?: string;
}

export function isNativeApp(): boolean {
  return Boolean((window as any).dispatchlinkNative?.isElectron);
}

export function ProviderPortal({ title, url, windowName, description }: Props) {
  const native = isNativeApp();
  if (native) {
    return <div className="provider-shell">
      <div className="provider-strip"><div><strong>{title}</strong><span>{description || 'Authenticated provider session'}</span></div><button onClick={() => (window as any).dispatchlinkNative?.openExternal?.(url)}><ExternalLink size={15} /> Open externally</button></div>
      <webview className="provider-webview" src={url} partition="persist:dispatchlink-providers" allowpopups="true" webpreferences="contextIsolation=yes,sandbox=yes,nodeIntegration=no" />
    </div>;
  }

  return <div className="provider-browser-fallback">
    <div><h2>{title}</h2><p>{description || 'This provider blocks normal browser embedding. DispatchLink will reuse one provider window so the EFB stays open.'}</p></div>
    <button className="primary" onClick={() => window.open(url, windowName, 'popup=yes,width=1500,height=1000')}><ExternalLink size={17} /> Open integrated provider window</button>
  </div>;
}
