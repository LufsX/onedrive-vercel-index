'use client'

import { createContext, useContext, type ReactNode } from 'react'
import type { BrandMark } from './BrandIcon'

const BrandIconsContext = createContext<Record<string, BrandMark>>({})

export const useBrandIcons = () => useContext(BrandIconsContext)

export default function BrandIconsProvider({
  icons,
  children,
}: {
  icons: Record<string, BrandMark>
  children: ReactNode
}) {
  return <BrandIconsContext.Provider value={icons}>{children}</BrandIconsContext.Provider>
}
