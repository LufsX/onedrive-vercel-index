'use client'

import { Check, ChevronDown, LayoutGrid, List, type LucideIcon } from 'lucide-react'
import Dropdown from './Dropdown'
import { useTranslations } from './ClientProviders'

import useLocalStorage from '../utils/useLocalStorage'

export const layouts: Array<{ id: number; name: 'Grid' | 'List' }> = [
  { id: 1, name: 'List' },
  { id: 2, name: 'Grid' },
]

const layoutIcons: Record<'Grid' | 'List', LucideIcon> = {
  Grid: LayoutGrid,
  List: List,
}

const LayoutOptionIcon = ({ layout, className }: { layout: 'Grid' | 'List'; className: string }) => {
  const Icon = layoutIcons[layout]
  return <Icon className={className} />
}

const SwitchLayout = () => {
  const [preferredLayout, setPreferredLayout] = useLocalStorage('preferredLayout', layouts[0])

  const t = useTranslations()

  return (
    <div className="relative w-24 shrink-0 text-sm text-gray-600 md:w-28 dark:text-gray-300">
      <Dropdown
        role="listbox"
        items={layouts}
        selectedIndex={layouts.findIndex(layout => layout.name === preferredLayout.name)}
        onSelect={setPreferredLayout}
        triggerClassName="flex w-full cursor-pointer items-center justify-between gap-2 rounded px-2 py-1 transition-colors duration-150 hover:bg-gray-100 dark:hover:bg-gray-700"
        trigger={
          <>
            <span className="flex min-w-0 items-center gap-2">
              <LayoutOptionIcon layout={preferredLayout.name} className="h-3.5 w-3.5 shrink-0" />
              <span className="truncate">
                {
                  // t('Grid')
                  // t('List')
                  t(preferredLayout.name)
                }
              </span>
            </span>
            <ChevronDown className="h-3 w-3 shrink-0 transition-transform duration-200 group-aria-expanded:rotate-180" />
          </>
        }
        panelClassName="absolute top-full right-0 z-20 mt-1 w-32 overflow-auto rounded border border-gray-900/10 bg-white py-1 shadow-lg focus:outline-hidden dark:border-gray-500/30 dark:bg-gray-800"
        itemClassName={layout =>
          `${
            layout.name === preferredLayout.name && 'bg-blue-50 text-blue-700 dark:bg-blue-600/10 dark:text-blue-400'
          } relative flex w-full cursor-pointer items-center py-1.5 pl-3 text-left text-gray-600 transition-colors duration-100 select-none hover:opacity-80 focus:outline-hidden focus:opacity-80 dark:text-gray-300`
        }
        renderItem={layout => (
          <>
            <LayoutOptionIcon layout={layout.name} className="mr-2 h-3 w-3" />
            <span className={layout.name === preferredLayout.name ? 'font-medium' : 'font-normal'}>
              {
                // t('Grid')
                // t('List')
                t(layout.name)
              }
            </span>
            {layout.name === preferredLayout.name && (
              <span className="absolute inset-y-0 right-3 flex items-center">
                <Check className="h-3 w-3" />
              </span>
            )}
          </>
        )}
      />
    </div>
  )
}

export default SwitchLayout
