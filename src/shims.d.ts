declare namespace React {
  type ReactNode = any;
  interface PointerEvent<T = Element> extends globalThis.PointerEvent { currentTarget: T; clientX: number; clientY: number; pointerId: number; }
}
declare module 'react' {
  export const StrictMode: any;
  export function useState<T>(initial: T | (() => T)): [T, (value: T | ((prev: T) => T)) => void];
  export function useEffect(effect: () => void | (() => void), deps?: any[]): void;
  export function useMemo<T>(factory: () => T, deps: any[]): T;
  export function useCallback<T extends (...args: any[]) => any>(fn: T, deps: any[]): T;
  export function useRef<T>(initial: T): { current: T };
  export function useRef<T>(initial: T | null): { current: T | null };
}
declare module 'react-dom/client' { export function createRoot(element: Element): { render(node: any): void }; }
declare module 'react/jsx-runtime' { export const jsx: any; export const jsxs: any; export const Fragment: any; }
declare module 'lucide-react' {
  export type LucideIcon = any;
  export const Activity: any; export const ArrowUpRight: any; export const BookOpenCheck: any; export const Calculator: any;
  export const Check: any; export const ChevronRight: any; export const ClipboardCheck: any; export const CloudSun: any;
  export const Download: any; export const ExternalLink: any; export const FileCheck2: any; export const Eraser: any; export const FileText: any; export const Fuel: any; export const Gauge: any;
  export const Highlighter: any; export const Import: any; export const LayoutDashboard: any; export const Link2: any; export const Map: any;
  export const MapPinned: any; export const Menu: any; export const Minus: any; export const MousePointer2: any; export const NotebookPen: any;
  export const PenLine: any; export const Plane: any; export const Redo2: any; export const RefreshCw: any; export const RotateCcw: any;
  export const Route: any; export const Save: any; export const ShieldCheck: any; export const Shuffle: any; export const Search: any; export const Settings: any; export const Square: any; export const Timer: any;
  export const Type: any; export const Undo2: any; export const Upload: any; export const Wifi: any; export const WifiOff: any; export const X: any;
  export const Wind: any; export const ZoomIn: any; export const ZoomOut: any;
}
declare module 'pdfjs-dist' {
  export const GlobalWorkerOptions: { workerSrc: string };
  export function getDocument(src: any): { promise: Promise<any> };
  export type PDFDocumentProxy = any;
}
declare module 'pdfjs-dist/build/pdf.worker.min.mjs?url' { const url: string; export default url; }
declare namespace JSX { interface IntrinsicAttributes { key?: any } interface IntrinsicElements { [elemName: string]: any; } }
