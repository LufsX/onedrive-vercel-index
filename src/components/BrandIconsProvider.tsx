'use client'

import { createContext, useContext, type ReactNode } from 'react'
import type { IconDefinition } from '@fortawesome/fontawesome-svg-core'

const BrandIconsContext = createContext<Record<string, IconDefinition>>({})

export const useBrandIcons = () => useContext(BrandIconsContext)

export default function BrandIconsProvider({
  icons,
  children,
}: {
  icons: Record<string, IconDefinition>
  children: ReactNode
}) {
  return <BrandIconsContext.Provider value={icons}>{children}</BrandIconsContext.Provider>
}
