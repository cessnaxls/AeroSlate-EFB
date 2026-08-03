import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import App from './App';
import './styles.css';

for (const eventName of ['gesturestart','gesturechange','gestureend'] as const) document.addEventListener(eventName, event => event.preventDefault(), { passive: false });
document.addEventListener('wheel', event => { if (event.ctrlKey) event.preventDefault(); }, { passive: false });
document.addEventListener('keydown', event => { if ((event.ctrlKey || event.metaKey) && ['+','-','=','0'].includes(event.key)) event.preventDefault(); });

window.addEventListener('beforeinstallprompt', event => {
  event.preventDefault();
  (window as any).deferredPrompt = event;
});

createRoot(document.getElementById('root')!).render(<StrictMode><App /></StrictMode>);
