declare module 'vite' { export function defineConfig(config: any): any; }
declare module '@vitejs/plugin-react' { const plugin: () => any; export default plugin; }

interface ImportMetaEnv { readonly VITE_OPENAIP_TILE_URL?: string }
interface ImportMeta { readonly env: ImportMetaEnv }
