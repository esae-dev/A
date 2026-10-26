import { useSyncExternalStore } from 'react'

const query = '(prefers-reduced-motion: reduce)'
const snapshot = () => typeof matchMedia === 'function' && matchMedia(query).matches
function subscribe(listener: () => void) {
  const media = matchMedia(query)
  media.addEventListener('change', listener)
  return () => media.removeEventListener('change', listener)
}

export function useReducedMotion() {
  return useSyncExternalStore(subscribe, snapshot, () => true)
}
