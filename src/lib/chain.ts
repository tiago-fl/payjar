import { Connection, PublicKey } from '@solana/web3.js'

export const RPC_URL = 'https://rpc.cookiescan.io'
/** Cookie Chain genesis hash — identifies the network to wallets (Nightly's changeNetwork). */
export const COOKIE_GENESIS_HASH = '9wDaBRDgArEUpvhHxGguNkwozsZh4UpGZB9o2EoEcBB2'
export const EXPLORER_URL = 'https://cookiescan.io'
export const DAS_API_URL = 'https://api.cookiescan.io'
export const COOKIEBOX_AGG_URL = 'https://agg.cookiebox.app'
export const COOKIEBOX_APP_URL = 'https://cookiebox.app'
export const BRIDGE_URL = 'https://hyperlane.cookiescan.io'
export const NIGHTLY_URL = 'https://nightly.app'

export const COOK_DECIMALS = 9
export const COOK_SYMBOL = 'COOK'
/** Native COOK uses the same wrapped-native mint id as SOL on Solana. */
export const NATIVE_MINT = 'So11111111111111111111111111111111111111112'
export const MEMO_PROGRAM_ID = new PublicKey('MemoSq4gqABAXKb96qnH8TysNcWxMyWCqXgDLGmfcHr')

export const connection = new Connection(RPC_URL, { commitment: 'confirmed' })

export const txUrl = (sig: string) => `${EXPLORER_URL}/tx/${sig}`
export const addressUrl = (addr: string) => `${EXPLORER_URL}/address/${addr}`

export function shortAddr(addr: string, n = 4): string {
  return addr.length <= 2 * n + 1 ? addr : `${addr.slice(0, n)}…${addr.slice(-n)}`
}

export function isPubkey(s: string): boolean {
  if (!/^[1-9A-HJ-NP-Za-km-z]{32,44}$/.test(s)) return false
  try {
    new PublicKey(s)
    return true
  } catch {
    return false
  }
}

/** "1.5" with 9 decimals -> 1500000000n. Throws on malformed input. */
export function parseUnits(amount: string, decimals: number): bigint {
  const s = amount.trim().replace(',', '.')
  if (!/^\d*(\.\d*)?$/.test(s) || s === '' || s === '.') throw new Error('Invalid amount')
  const [whole, frac = ''] = s.split('.')
  if (frac.length > decimals) throw new Error(`At most ${decimals} decimal places`)
  const fracPadded = (frac + '0'.repeat(decimals)).slice(0, decimals)
  const raw = BigInt(whole || '0') * 10n ** BigInt(decimals) + BigInt(fracPadded || '0')
  if (raw <= 0n) throw new Error('Amount must be greater than zero')
  return raw
}

/** 1500000000n with 9 decimals -> "1.5" (trailing zeros trimmed). */
export function formatUnits(raw: bigint | number | string, decimals: number, maxFrac = decimals): string {
  const v = BigInt(raw)
  const neg = v < 0n
  const abs = neg ? -v : v
  const base = 10n ** BigInt(decimals)
  const whole = abs / base
  const frac = (abs % base).toString().padStart(decimals, '0').slice(0, maxFrac).replace(/0+$/, '')
  return `${neg ? '-' : ''}${whole.toLocaleString('en-US')}${frac ? '.' + frac : ''}`
}

export function fmtUsd(v: number): string {
  if (!Number.isFinite(v)) return '—'
  if (v >= 1) return `$${v.toLocaleString('en-US', { maximumFractionDigits: 2 })}`
  if (v >= 0.01) return `$${v.toFixed(3)}`
  return `$${v.toPrecision(3)}`
}

export function fmtTime(unix: number | null | undefined): string {
  if (!unix) return '—'
  return new Date(unix * 1000).toLocaleString()
}

export async function chainStats(): Promise<{ slot: number; tps: number | null; version: string }> {
  const [slot, version, perf] = await Promise.all([
    connection.getSlot(),
    connection.getVersion(),
    connection.getRecentPerformanceSamples(1).catch(() => []),
  ])
  const s = perf[0]
  const tps = s && s.samplePeriodSecs > 0 ? Math.round(s.numTransactions / s.samplePeriodSecs) : null
  return { slot, tps, version: String(version['solana-core']) }
}
