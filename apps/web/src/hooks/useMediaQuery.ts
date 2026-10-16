'use client'

import { useEffect, useState } from 'react'

export function useMediaQuery(query: string): boolean {
  const [matches, setMatches] = useState(false)

  useEffect(() => {
    const mql = window.matchMedia(query)
    setMatches(mql.matches)
    const onChange = (e: MediaQueryListEvent) => setMatches(e.matches)
    mql.addEventListener('change', onChange)
    return () => mql.removeEventListener('change', onChange)
  }, [query])

  return matches
}

export const usePhone   = () => useMediaQuery('(max-width: 639px)')
export const useTablet  = () => useMediaQuery('(min-width: 640px) and (max-width: 1023px)')
export const useCompact = () => useMediaQuery('(max-width: 1023px)')
