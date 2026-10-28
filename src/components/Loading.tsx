'use client'

import { FC } from 'react'
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome'
import { faCircleNotch } from '@fortawesome/free-solid-svg-icons'

export const LoadingIcon: FC<{ className?: string }> = ({ className }) => {
  return <FontAwesomeIcon icon={faCircleNotch} className={className} />
}

const Loading: FC<{ loadingText: string }> = ({ loadingText }) => {
  return (
    <div className="flex flex-col items-center justify-center space-y-4 py-32">
      <LoadingIcon className="h-12 w-12 animate-spin text-blue-600" />
      <div className="text-sm font-medium text-gray-700 dark:text-gray-300">{loadingText}</div>
    </div>
  )
}

export default Loading
