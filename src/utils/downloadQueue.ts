// Keep response bodies bounded while retaining completed files in the archive.
export async function downloadFiles<T extends { url: string }>(
  files: Iterable<T> | AsyncIterable<T>,
  controller: AbortController,
  consume: (file: T, blob: Blob) => void,
  onProgress: (completed: number) => void,
): Promise<void> {
  const { signal } = controller
  const active = new Set<Promise<void>>()
  let completed = 0
  try {
    for await (const file of files) {
      signal.throwIfAborted()
      const task = (async () => {
        try {
          const response = await fetch(file.url, { signal })
          if (!response.ok) throw new Error(`Download failed: ${response.status}`)
          const blob = await response.blob()
          signal.throwIfAborted()
          consume(file, blob)
          onProgress(++completed)
        } catch (error) {
          controller.abort(error)
          throw error
        }
      })()
      active.add(task)
      // Register a rejection handler even while waiting for folder traversal.
      void task.then(
        () => active.delete(task),
        () => active.delete(task),
      )
      if (active.size >= 3) await Promise.race(active)
    }
    await Promise.all(active)
    signal.throwIfAborted()
  } catch (error) {
    controller.abort(error)
    await Promise.allSettled(active)
    throw error
  }
}
