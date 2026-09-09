// Local, per-browser memory of the links a merchant created (the chain holds the payments).
import type { PaymentRequest } from './payment'

export interface SavedLink extends PaymentRequest {
  createdAt: number
  signature?: string | null
  paidAt?: number | null
}

const KEY = 'cookiepay.links.v1'

export function loadLinks(): SavedLink[] {
  try {
    return JSON.parse(localStorage.getItem(KEY) ?? '[]') as SavedLink[]
  } catch {
    return []
  }
}

function persist(all: SavedLink[]) {
  try {
    localStorage.setItem(KEY, JSON.stringify(all.slice(0, 200)))
  } catch {
    /* storage unavailable: links simply are not remembered */
  }
}

export function saveLink(link: SavedLink) {
  const all = loadLinks().filter((l) => l.ref !== link.ref)
  all.unshift(link)
  persist(all)
}

export function updateLink(ref: string, patch: Partial<SavedLink>) {
  persist(loadLinks().map((l) => (l.ref === ref ? { ...l, ...patch } : l)))
}

export function removeLink(ref: string) {
  persist(loadLinks().filter((l) => l.ref !== ref))
}
