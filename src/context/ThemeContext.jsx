import { createContext, useContext, useEffect, useState } from 'react'
import { LS } from '@/lib/storage'

const Ctx = createContext(null)

export function ThemeProvider({ children }) {
  const [theme, setTheme] = useState(() => LS.get('theme') ?? 'dark')

  useEffect(() => {
    document.documentElement.classList.toggle('light', theme === 'light')
    LS.set('theme', theme)
  }, [theme])

  const toggle = () => setTheme(t => t === 'dark' ? 'light' : 'dark')

  return <Ctx.Provider value={{ theme, toggle }}>{children}</Ctx.Provider>
}

export const useTheme = () => useContext(Ctx)
