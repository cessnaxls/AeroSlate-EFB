declare namespace React {
  type ReactNode = any;
  type SetStateAction<T> = T | ((prev: T) => T);
  type Dispatch<T> = (value: T) => void;
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
  export const Activity: any; export const ArrowLeftRight: any; export const ArrowUpDown: any; export const ArrowUpRight: any; export const BookOpenCheck: any; export const Calculator: any; export const CalendarDays: any; export const CalendarPlus: any;
  export const AlertTriangle: any; export const Check: any; export const CheckCircle2: any; export const ChevronDown: any; export const ChevronRight: any; export const ChevronUp: any; export const Clipboard: any; export const ClipboardCheck: any; export const Clock3: any; export const CloudSun: any;
  export const CloudDownload: any; export const CloudUpload: any; export const Download: any; export const ExternalLink: any; export const FileCheck2: any; export const Eraser: any; export const FileText: any; export const Filter: any; export const Fuel: any; export const Gauge: any; export const HelpCircle: any;
  export const HardDrive: any; export const LockKeyhole: any; export const Highlighter: any; export const Import: any; export const KeyRound: any; export const LayoutDashboard: any; export const Link2: any; export const Map: any; export const MapPin: any; export const Layers: any; export const Radar: any;
  export const MapPinned: any; export const FolderPlus: any; export const Plus: any; export const Trash2: any; export const Menu: any; export const Minus: any; export const PanelLeftClose: any; export const PanelLeftOpen: any; export const MousePointer2: any; export const NotebookPen: any;
  export const PenLine: any; export const Plane: any; export const Redo2: any; export const RefreshCw: any; export const RotateCcw: any;
  export const Route: any; export const Save: any; export const Send: any; export const ShieldCheck: any; export const Shuffle: any; export const Search: any; export const Settings: any; export const Settings2: any; export const Square: any; export const Timer: any;
  export const Type: any; export const Undo2: any; export const Upload: any; export const Wifi: any; export const WifiOff: any; export const X: any;
  export const Wind: any; export const ZoomIn: any; export const ZoomOut: any;
}
declare namespace JSX { interface IntrinsicAttributes { key?: any } interface IntrinsicElements { [elemName: string]: any; } }

interface ImportMetaEnv { readonly VITE_OPENAIP_TILE_URL?: string }
interface ImportMeta { readonly env: ImportMetaEnv }
