import { useCallback, useEffect, useRef, useState } from "react"

type State<T> =
  | { status: "loading"; data?: T; error?: undefined }
  | { status: "error"; data?: T; error: Error }
  | { status: "success"; data: T; error?: undefined }

/**
 * Загружает данные и отдаёт одно из трёх состояний: loading / error / success.
 * Пустое состояние страница определяет сама по data.
 */
export function useAsync<T>(fn: () => Promise<T>, deps: unknown[]) {
  const [state, setState] = useState<State<T>>({ status: "loading" })
  const call = useRef(0)

  const run = useCallback(() => {
    const id = ++call.current
    setState((s) => ({ status: "loading", data: s.data }))
    fn().then(
      (data) => id === call.current && setState({ status: "success", data }),
      (error: Error) => id === call.current && setState((s) => ({ status: "error", error, data: s.data })),
    )
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, deps)

  useEffect(run, [run])

  const setData = useCallback((updater: (d: T) => T) => {
    setState((s) => (s.status === "success" ? { status: "success", data: updater(s.data) } : s))
  }, [])

  return { ...state, reload: run, setData }
}
