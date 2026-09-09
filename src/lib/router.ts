import { useEffect, useState } from 'react'

export interface Route {
  path: string
  params: URLSearchParams
}

function parse(hash: string): Route {
  const h = hash.startsWith('#') ? hash.slice(1) : hash
  const [path, query = ''] = h.split('?')
  return { path: path || '/', params: new URLSearchParams(query) }
}

/** Tiny hash router: works on any static host without rewrite rules. */
export function useRoute(): Route {
  const [route, setRoute] = useState<Route>(() => parse(location.hash))
  useEffect(() => {
    const onChange = () => setRoute(parse(location.hash))
    window.addEventListener('hashchange', onChange)
    return () => window.removeEventListener('hashchange', onChange)
  }, [])
  return route
}

export function navigate(to: string) {
  location.hash = to
}
