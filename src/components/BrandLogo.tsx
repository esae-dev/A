/** Shared reference-based logo for home, streaks and settings; no UI font dependency. */
export function BrandLogo({ variant = 'logo' }: { variant?: 'logo' | 'symbol' }) {
  const base = `${import.meta.env.BASE_URL}brand/${variant}`
  return <span className={`brand-logo brand-logo--${variant}`} aria-hidden="true">
    <img className="brand-logo-image brand-logo-light" src={`${base}-light.svg`} alt="" draggable={false} />
    <img className="brand-logo-image brand-logo-dark" src={`${base}-dark.svg`} alt="" draggable={false} />
  </span>
}
