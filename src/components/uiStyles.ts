const buttonBase =
  'inline-flex cursor-pointer items-center justify-center gap-2 rounded px-3 py-1.5 text-sm font-medium transition-colors duration-150 focus-visible:outline-hidden focus-visible:ring-2 focus-visible:ring-blue-400 disabled:cursor-not-allowed disabled:opacity-50 motion-reduce:transition-none'

export const uiButton = `${buttonBase} text-gray-700 hover:bg-gray-100 dark:text-gray-300 dark:hover:bg-gray-800`
export const uiPrimaryButton = `${buttonBase} bg-blue-600 text-white hover:bg-blue-500`
export const uiDangerButton = `${buttonBase} bg-red-500 text-white hover:bg-red-400`
export const uiIconButton =
  'inline-flex cursor-pointer items-center justify-center rounded p-1.5 text-gray-500 transition-colors duration-150 hover:bg-gray-100 hover:text-gray-700 focus-visible:outline-hidden focus-visible:ring-2 focus-visible:ring-blue-400 disabled:cursor-not-allowed disabled:opacity-50 dark:text-gray-400 dark:hover:bg-gray-800 dark:hover:text-gray-200 motion-reduce:transition-none'
export const uiInput =
  'w-full min-w-0 rounded border border-gray-600/10 bg-gray-50 p-2 font-mono text-sm text-gray-900 transition-colors duration-150 focus:ring focus:ring-blue-300 focus:outline-hidden disabled:opacity-50 dark:bg-gray-600 dark:text-white dark:focus:ring-blue-700 motion-reduce:transition-none'
export const uiPanel =
  'rounded border border-gray-400/30 bg-white text-sm text-gray-700 shadow-xs dark:bg-gray-900 dark:text-gray-300'
export const uiFieldLabel = 'block text-sm font-medium text-gray-700 dark:text-gray-300'
