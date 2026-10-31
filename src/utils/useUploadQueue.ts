'use client'

import { useEffect, useMemo, useRef, useSyncExternalStore } from 'react'
import { beginAdminUpload, endAdminUpload } from './useAdminSession'
import { createUploadQueue } from './uploadQueue'

export function useUploadQueue(path: string, onComplete: () => Promise<unknown>) {
  const onCompleteRef = useRef(onComplete)
  useEffect(() => {
    onCompleteRef.current = onComplete
  }, [onComplete])

  const queue = useMemo(() => createUploadQueue(path, {
    beginUpload: beginAdminUpload,
    endUpload: endAdminUpload,
  }), [path])

  const snapshot = useSyncExternalStore(queue.subscribe, queue.getSnapshot, queue.getSnapshot)
  useEffect(() => {
    queue.activate(() => onCompleteRef.current())
    return () => queue.dispose()
  }, [queue])

  return {
    ...snapshot,
    addFiles: queue.addFiles,
    start: queue.start,
    cancel: queue.cancel,
    remove: queue.remove,
    clear: queue.clear,
    retry: queue.retry,
  }
}

export default useUploadQueue
