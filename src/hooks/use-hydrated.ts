"use client"

import * as React from "react"

/**
 * Hook to detect if the component has been hydrated on the client.
 * This prevents hydration mismatches by ensuring consistent rendering
 * between server and client on the first render.
 *
 * @returns true if the component has been hydrated, false otherwise
 *
 * @example
 * ```tsx
 * function MyComponent() {
 *   const hydrated = useHydrated()
 *
 *   if (!hydrated) {
 *     // Return server-safe default UI
 *     return <div>Loading...</div>
 *   }
 *
 *   // Safe to access browser APIs
 *   const data = localStorage.getItem('key')
 *   return <div>{data}</div>
 * }
 * ```
 */
export function useHydrated(): boolean {
  const [hydrated, setHydrated] = React.useState(false)

  React.useEffect(() => {
    setHydrated(true)
  }, [])

  return hydrated
}
