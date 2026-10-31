import { completeUpload, UploadCompletionError, UploadUncertainError, uploadToOnedrive } from './uploadToOnedrive'
import type { UploadCompletion, UploadResult } from './uploadToOnedrive'

export type UploadQueueItem = {
  id: string
  file: File
  state: 'queued' | 'uploading' | 'done' | 'failed' | 'cancelled' | 'uncertain' | 'completionFailed'
  uploaded: number
  completion?: UploadCompletion
  backupName?: string
}

export type UploadQueueSnapshot = {
  items: readonly UploadQueueItem[]
  running: boolean
  refreshFailed: boolean
  startBlocked: boolean
}

type Dependencies = {
  beginUpload: () => boolean
  endUpload: () => void
  onComplete?: () => Promise<unknown>
  upload?: typeof uploadToOnedrive
  complete?: typeof completeUpload
}

type Run = {
  controller: AbortController
  promise: Promise<void>
  lockHeld: boolean
  activeId?: string
}

let nextId = 0

/** A queue owns one encoded directory path and holds the admin lock through its refreshes. */
export function createUploadQueue(path: string, dependencies: Dependencies) {
  const upload = dependencies.upload ?? uploadToOnedrive
  const complete = dependencies.complete ?? completeUpload
  let onComplete = dependencies.onComplete ?? (async () => undefined)
  const listeners = new Set<() => void>()
  const finalizeOnly = new Set<string>()
  let snapshot: UploadQueueSnapshot = { items: [], running: false, refreshFailed: false, startBlocked: false }
  let currentRun: Run | undefined
  let disposed = false

  function publish(next: UploadQueueSnapshot) {
    snapshot = next
    if (!disposed) listeners.forEach(listener => listener())
  }

  function patch(id: string, changes: Partial<UploadQueueItem>) {
    publish({ ...snapshot, items: snapshot.items.map(item => item.id === id ? { ...item, ...changes } : item) })
  }

  function owns(run: Run) {
    return !disposed && currentRun === run
  }

  function release(run: Run) {
    if (!run.lockHeld) return
    run.lockHeld = false
    dependencies.endUpload()
  }

  async function drain(run: Run) {
    try {
      while (owns(run) && !run.controller.signal.aborted) {
        const item = snapshot.items.find(item => item.state === 'queued')
        if (!item) break
        run.activeId = item.id
        patch(item.id, { state: 'uploading' })
        // A subscriber can cancel or unmount while receiving the uploading snapshot.
        if (!owns(run)) return
        let state: UploadQueueItem['state'] = 'done'
        let result: UploadResult = undefined
        let completion = item.completion
        try {
          if (run.controller.signal.aborted) throw new DOMException('Aborted', 'AbortError')
          const decodedPath = path.split('/').map(segment => decodeURIComponent(segment)).join('/')
          if (finalizeOnly.has(item.id)) {
            result = await complete(decodedPath, item.file.name, run.controller.signal, completion)
            if (completion && result?.item?.size !== item.file.size) {
              throw new UploadCompletionError('Invalid replacement size', { completion })
            }
          } else {
            result = await upload({
              file: item.file,
              path: decodedPath,
              signal: run.controller.signal,
              onProgress(uploaded) {
                if (owns(run) && run.activeId === item.id && !run.controller.signal.aborted) {
                  patch(item.id, { uploaded })
                }
              },
            })
          }
        } catch (error) {
          // These errors carry stronger information than an aborted signal.
          if (error instanceof UploadCompletionError) {
            state = 'completionFailed'
            completion = error.completion ?? completion
          }
          else if (error instanceof UploadUncertainError) state = 'uncertain'
          else if (run.controller.signal.aborted) state = 'cancelled'
          else state = 'failed'
        }
        if (!owns(run)) return
        if (state === 'done') finalizeOnly.delete(item.id)
        else if (state === 'completionFailed') finalizeOnly.add(item.id)
        patch(item.id, state === 'done'
          ? { state, uploaded: item.file.size, completion: undefined, backupName: result?.backupName }
          : state === 'completionFailed'
            ? { state, uploaded: item.file.size, completion }
            : { state })
        if (!owns(run)) return
        if (state !== 'failed') {
          try {
            await onComplete()
          } catch {
            if (owns(run)) publish({ ...snapshot, refreshFailed: true })
          }
        }
        run.activeId = undefined
      }
    } finally {
      if (owns(run)) {
        release(run)
        currentRun = undefined
        publish({ ...snapshot, running: false })
      }
    }
  }

  function start(): Promise<void> {
    if (disposed) return Promise.resolve()
    if (currentRun) return currentRun.promise
    if (!snapshot.items.some(item => item.state === 'queued')) return Promise.resolve()
    if (!dependencies.beginUpload()) {
      publish({ ...snapshot, startBlocked: true })
      return Promise.resolve()
    }
    const run: Run = { controller: new AbortController(), promise: Promise.resolve(), lockHeld: true }
    // Defer draining so reentrant start/cancel calls see the complete run handle.
    run.promise = Promise.resolve().then(() => drain(run))
    currentRun = run
    if (disposed) {
      release(run)
      currentRun = undefined
      return run.promise
    }
    publish({ ...snapshot, running: true, startBlocked: false, refreshFailed: false })
    return run.promise
  }

  function cancel() {
    if (disposed) return
    // Mark waiting items before aborting: abort handlers may synchronously notify consumers.
    publish({
      ...snapshot,
      items: snapshot.items.map(item => item.state === 'queued' ? { ...item, state: 'cancelled' } : item),
    })
    currentRun?.controller.abort()
  }

  return {
    getSnapshot: () => snapshot,
    subscribe(listener: () => void) {
      listeners.add(listener)
      return () => { listeners.delete(listener) }
    },
    addFiles(files: readonly File[]) {
      if (disposed) return
      const identities = new Set(snapshot.items.map(item => JSON.stringify([
        item.file.name, item.file.size, item.file.lastModified,
      ])))
      const added: UploadQueueItem[] = []
      for (const file of files) {
        const identity = JSON.stringify([file.name, file.size, file.lastModified])
        if (identities.has(identity)) continue
        identities.add(identity)
        added.push({ id: `upload-${++nextId}`, file, state: 'queued', uploaded: 0 })
      }
      if (added.length) publish({ ...snapshot, items: [...snapshot.items, ...added] })
    },
    start,
    cancel,
    remove(id: string) {
      if (disposed || currentRun?.activeId === id) return
      finalizeOnly.delete(id)
      publish({ ...snapshot, items: snapshot.items.filter(item => item.id !== id) })
    },
    clear() {
      if (disposed || currentRun) return
      finalizeOnly.clear()
      publish({ items: [], running: false, refreshFailed: false, startBlocked: false })
    },
    async retry(id: string): Promise<void> {
      if (disposed) return
      if (currentRun) throw new Error('Cannot retry while the upload queue is running')
      const item = snapshot.items.find(item => item.id === id)
      if (!item || !['failed', 'cancelled', 'uncertain', 'completionFailed'].includes(item.state)) return
      const completing = item.state === 'completionFailed' || finalizeOnly.has(id) || !!item.completion
      if (completing) finalizeOnly.add(id)
      else finalizeOnly.delete(id)
      patch(id, { state: 'queued', uploaded: completing ? item.uploaded : 0, backupName: undefined })
      await start()
    },
    // React Strict Mode can set up an effect again after its cleanup.
    activate(refresh?: () => Promise<unknown>) {
      disposed = false
      if (refresh) onComplete = refresh
    },
    dispose() {
      if (disposed) return
      disposed = true
      const run = currentRun
      currentRun = undefined
      snapshot = {
        ...snapshot,
        running: false,
        items: snapshot.items.map(item => item.state === 'queued' || item.state === 'uploading'
          ? { ...item, state: 'cancelled' }
          : item),
      }
      run?.controller.abort()
      if (run) release(run)
    },
  }
}
