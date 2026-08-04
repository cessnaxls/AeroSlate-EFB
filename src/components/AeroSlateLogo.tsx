export function AeroSlateLogo({ size = 38 }: { size?: number }) {
  const gradientId = `aeroslateJet-${size}`;
  return <svg width={size} height={size} viewBox="0 0 72 72" aria-label="AeroSlate aviation logo" role="img">
    <defs>
      <linearGradient id={gradientId} x1="12" y1="62" x2="60" y2="10">
        <stop stopColor="var(--accent)" />
        <stop offset="1" stopColor="var(--accent-2)" />
      </linearGradient>
    </defs>
    <rect x="4" y="4" width="64" height="64" rx="17" fill="var(--surface-deep, #07131d)" stroke="var(--accent)" strokeWidth="2.5" />
    <path d="M12 49.5 31.5 39l8.2-20.4c.7-1.7 2.8-2.2 4.2-1l2.5 2.2-3.1 15.6 12.8-7.1c1.2-.7 2.8-.5 3.8.5l2 2-17.2 13.9-2.2 12.7-4.5 3.1-2.8-11.2-12.7 6.4-6.2-1.2Z" fill={`url(#${gradientId})`} />
    <path d="m35.7 39.1 7.5-18.3 1.2 1.1-3 16.1 15.7-8.3 1.2 1.2-18.7 14.8-1.8 10.5-1.3.9-2.3-10.1-11.9 6-3.1-.6Z" fill="var(--text)" opacity=".96" />
    <path d="M42.2 18.2 49 12l2.3 1.7-5.4 9.1Z" fill="var(--accent-2)" />
    <circle cx="16" cy="17" r="3.4" fill="var(--accent-2)" />
  </svg>;
}
