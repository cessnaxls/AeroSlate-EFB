export function AeroSlateLogo({ size = 38 }: { size?: number }) {
  return <svg width={size} height={size} viewBox="0 0 64 64" aria-label="AeroSlate logo" role="img">
    <defs><linearGradient id="asWing" x1="8" y1="54" x2="56" y2="10"><stop stopColor="var(--accent)"/><stop offset="1" stopColor="var(--accent-2)"/></linearGradient></defs>
    <rect x="4" y="4" width="56" height="56" rx="15" fill="#07131d" stroke="var(--accent)" strokeWidth="2"/>
    <path d="M11 39 50 15 38 35 55 41 50 49 31 42 18 52Z" fill="url(#asWing)"/>
    <path d="M20 36 46 22 34 36 47 40 43 43 29 39 21 45Z" fill="#eefbff" opacity=".92"/>
    <circle cx="17" cy="18" r="4" fill="var(--accent-2)"/>
  </svg>;
}
