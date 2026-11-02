/** Shared reference-based logo for home, streaks and settings; no UI font dependency. */
export function BrandLogo({ variant = 'logo' }: { variant?: 'logo' | 'symbol' }) {
  const base = `${import.meta.env.BASE_URL}brand/${variant}`
  const suffix = variant === 'logo' ? '-raster-v1.png' : '.svg'
  return <span className={`brand-logo brand-logo--${variant}`} aria-hidden="true">
    <img className="brand-logo-image brand-logo-light" src={`${base}-light${suffix}`} alt="" draggable={false} />
    <img className="brand-logo-image brand-logo-dark" src={`${base}-dark${suffix}`} alt="" draggable={false} />
  </span>
}
