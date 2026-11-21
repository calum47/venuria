/** Two interlocking rings: the small wedding mark used next to the Venuria wordmark. */
export function Rings({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 28 20" fill="none" stroke="currentColor" strokeWidth="1.6" className={className} aria-hidden="true">
      <circle cx="10" cy="10" r="7.2" />
      <circle cx="18" cy="10" r="7.2" />
    </svg>
  )
}
