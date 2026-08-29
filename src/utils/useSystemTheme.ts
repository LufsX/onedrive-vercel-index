import { useEffect, useState } from 'react'

type Theme = 'dark' | 'light'

export default function useSystemTheme(fallback: Theme): Theme {
  const [theme, setTheme] = useState<Theme>(fallback)

  useEffect(() => {
    const mediaQuery = window.matchMedia('(prefers-color-scheme: dark)')
    const updateTheme = () => setTheme(mediaQuery.matches ? 'dark' : 'light')

    updateTheme()
    mediaQuery.addEventListener('change', updateTheme)
    return () => mediaQuery.removeEventListener('change', updateTheme)
  }, [])

  return theme
}
