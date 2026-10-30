import { Dispatch, SetStateAction, useCallback, useMemo, useSyncExternalStore } from 'react'

type SetValue<T> = Dispatch<SetStateAction<T>>
const serverSnapshot = () => undefined

function useLocalStorage<T>(key: string, initialValue: T): [T, SetValue<T>, boolean] {
  const getSnapshot = useCallback(() => {
    try {
      return window.localStorage.getItem(key)
    } catch {
      return null
    }
  }, [key])

  const subscribe = useCallback(
    (notify: () => void) => {
      const onStorage = (event: StorageEvent) => {
        if (event.key === null || event.key === key) notify()
      }
      const onLocalStorage = (event: Event) => {
        if ((event as CustomEvent<string>).detail === key) notify()
      }
      window.addEventListener('storage', onStorage)
      window.addEventListener('local-storage', onLocalStorage)
      return () => {
        window.removeEventListener('storage', onStorage)
        window.removeEventListener('local-storage', onLocalStorage)
      }
    },
    [key],
  )

  // Hydration uses the same default as the server. Keep the serialized snapshot
  // stable so unchanged storage does not trigger another render or JSON parse.
  const serialized = useSyncExternalStore(subscribe, getSnapshot, serverSnapshot)
  const storedValue = useMemo(() => {
    try {
      return serialized ? (JSON.parse(serialized) as T) : initialValue
    } catch {
      return initialValue
    }
  }, [serialized, initialValue])

  const setValue: SetValue<T> = useCallback(
    value => {
      try {
        let current = initialValue
        const raw = getSnapshot()
        if (raw) {
          try {
            current = JSON.parse(raw) as T
          } catch {
            /* Use the default for malformed storage. */
          }
        }
        const next = value instanceof Function ? value(current) : value
        window.localStorage.setItem(key, JSON.stringify(next))
        window.dispatchEvent(new CustomEvent('local-storage', { detail: key }))
      } catch (error) {
        console.warn(`Error setting localStorage key “${key}”: `, error)
      }
    },
    [getSnapshot, initialValue, key],
  )

  return [storedValue, setValue, serialized !== undefined]
}

export default useLocalStorage
