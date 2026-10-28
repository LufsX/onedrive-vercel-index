'use client'

import { FontAwesomeIcon } from '@fortawesome/react-fontawesome'
import { faFileAlt, faListUl } from '@fortawesome/free-solid-svg-icons'
import useLocalStorage from '../utils/useLocalStorage'

export const layouts = [
  { id: 0, name: 'List', icon: faListUl },
  { id: 1, name: 'Grid', icon: faFileAlt },
]

const SwitchLayout = () => {
  const [layout, setLayout] = useLocalStorage('preferredLayout', layouts[0])

  return (
    <div className="flex rounded bg-gray-900/10 dark:bg-gray-500/20">
      {layouts.map(l => (
        <button
          key={l.id}
          className={`flex items-center gap-2 rounded px-2 py-1 transition-all duration-150 ${
            layout.id === l.id
              ? 'bg-blue-600 text-white shadow-sm'
              : 'text-gray-700 hover:bg-gray-900/20 dark:text-gray-300 dark:hover:bg-gray-500/30'
          }`}
          onClick={() => setLayout(l)}
          title={l.name}
        >
          <FontAwesomeIcon icon={l.icon} />
          <span className="hidden text-sm font-medium md:inline-block">{l.name}</span>
        </button>
      ))}
    </div>
  )
}

export default SwitchLayout
