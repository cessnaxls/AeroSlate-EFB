export function AeroSlateLogo({ size = 38 }: { size?: number }) {
  return <svg width={size} height={size} viewBox="0 0 64 64" aria-label="AeroSlate logo" role="img">
    <defs><linearGradient id="aeroslateGradient" x1="8" y1="7" x2="56" y2="58" gradientUnits="userSpaceOnUse"><stop stopColor="#65D4FF" /><stop offset="1" stopColor="#176B9D" /></linearGradient></defs>
    <rect x="3" y="3" width="58" height="58" rx="14" fill="#071019" />
    <rect x="7" y="7" width="50" height="50" rx="12" fill="url(#aeroslateGradient)" />
    <path fill="#06131D" d="M14 43 30 15h15L29 37h23l-7 11H22Z" />
    <path fill="#E7F8FF" d="m26 38 27-12-7 11-20 9Z" />
  </svg>;
}
