const buttonBase =
  'inline-flex h-9 shrink-0 cursor-pointer items-center justify-center gap-2 rounded px-3 text-sm leading-5 font-medium transition-colors duration-150 focus-visible:outline-hidden focus-visible:ring-2 focus-visible:ring-blue-400 disabled:cursor-not-allowed disabled:opacity-50 motion-reduce:transition-none'

export const uiButton = `${buttonBase} text-gray-700 hover:bg-gray-100 dark:text-gray-300 dark:hover:bg-gray-800`
export const uiPrimaryButton = `${buttonBase} bg-blue-600 text-white hover:bg-blue-500`
export const uiDangerButton = `${buttonBase} bg-red-500 text-white hover:bg-red-400`
export const uiIconButton =
  'inline-flex size-9 shrink-0 cursor-pointer items-center justify-center rounded align-middle text-gray-500 transition-colors duration-150 hover:bg-gray-100 hover:text-gray-700 focus-visible:outline-hidden focus-visible:ring-2 focus-visible:ring-blue-400 disabled:cursor-not-allowed disabled:opacity-50 dark:text-gray-400 dark:hover:bg-gray-800 dark:hover:text-gray-200 motion-reduce:transition-none'
// Dense variant used by the file listing, where every row shows several actions.
export const uiRowIconButton =
  'inline-flex size-9 shrink-0 cursor-pointer items-center justify-center rounded align-middle text-gray-500 transition-colors duration-150 hover:bg-gray-100 hover:text-gray-700 focus-visible:outline-hidden focus-visible:ring-2 focus-visible:ring-blue-400 disabled:cursor-not-allowed disabled:opacity-50 md:size-6 dark:text-gray-400 dark:hover:bg-gray-800 dark:hover:text-gray-200 motion-reduce:transition-none'
export const uiInput =
  'h-9 w-full min-w-0 rounded border border-gray-400/30 bg-gray-50 px-3 font-mono text-sm leading-5 text-gray-900 transition-colors duration-150 focus:ring-2 focus:ring-blue-400 focus:outline-hidden disabled:opacity-50 dark:bg-gray-800 dark:text-white motion-reduce:transition-none'
export const uiPanel =
  'rounded border border-gray-400/30 bg-white text-sm text-gray-700 shadow-xs dark:bg-gray-900 dark:text-gray-300 dark:shadow-none'
export const uiFieldLabel = 'block text-sm font-medium text-gray-700 dark:text-gray-300'
