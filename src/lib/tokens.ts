import { PublicKey } from '@solana/web3.js'
import { TOKEN_PROGRAM_ID, TOKEN_2022_PROGRAM_ID } from '@solana/spl-token'
import { COOK_DECIMALS, COOK_SYMBOL, DAS_API_URL, NATIVE_MINT, connection, shortAddr } from './chain'

export interface TokenInfo {
  mint: string
  symbol: string
  name: string
  decimals: number
  logo?: string
  priceUsd?: number
  holders?: number
}

export const COOK_TOKEN: TokenInfo = {
  mint: NATIVE_MINT,
  symbol: COOK_SYMBOL,
  name: 'Cookie (native)',
  decimals: COOK_DECIMALS,
}

interface DasToken {
  mint: string
  metadata?: { name?: string; symbol?: string; logo?: string; decimals?: number }
  price?: { usd?: string | number }
  marketData?: { holderCount?: number; liquidity?: number }
}

export interface Registry {
  tokens: TokenInfo[]
  cookUsd: number | null
}

let registry: Promise<Registry> | null = null

/** Cookiescan DAS token registry (~6k tokens). Loaded once, on demand. */
export function loadRegistry(): Promise<Registry> {
  registry ??= (async () => {
    const res = await fetch(`${DAS_API_URL}/api/tokens`)
    if (!res.ok) throw new Error(`Cookiescan API ${res.status}`)
    const json = (await res.json()) as { cookUsd?: number; data?: DasToken[] }
    const tokens: TokenInfo[] = (json.data ?? [])
      .filter((t) => t.mint && typeof t.metadata?.decimals === 'number')
      .map((t) => ({
        mint: t.mint,
        symbol: t.metadata?.symbol || shortAddr(t.mint),
        name: t.metadata?.name || 'Unknown token',
        decimals: t.metadata!.decimals!,
        logo: t.metadata?.logo || undefined,
        priceUsd: t.price?.usd !== undefined ? Number(t.price.usd) : undefined,
        holders: t.marketData?.holderCount,
      }))
      .sort((a, b) => (b.holders ?? 0) - (a.holders ?? 0))
    return { tokens, cookUsd: typeof json.cookUsd === 'number' ? json.cookUsd : null }
  })().catch((e) => {
    registry = null
    throw e
  })
  return registry
}

export async function cookUsdPrice(): Promise<number | null> {
  try {
    const res = await fetch(`${DAS_API_URL}/api/price/cook`)
    const json = (await res.json()) as { data?: { price?: { usd?: number } } }
    const usd = json?.data?.price?.usd
    return typeof usd === 'number' && usd > 0 ? usd : null
  } catch {
    return null
  }
}

export interface MintDescription {
  info: TokenInfo
  program: PublicKey
}

const mintCache = new Map<string, Promise<MintDescription>>()

/** Token info + owning token program for any mint: registry when known, on-chain otherwise. */
export function describeMint(mint: string): Promise<MintDescription> {
  if (mint === NATIVE_MINT) return Promise.resolve({ info: COOK_TOKEN, program: TOKEN_PROGRAM_ID })
  let p = mintCache.get(mint)
  if (!p) {
    p = (async () => {
      const acc = await connection.getParsedAccountInfo(new PublicKey(mint))
      const v = acc.value
      if (!v || !('parsed' in v.data) || v.data.parsed?.type !== 'mint') {
        throw new Error('Not a token mint on Cookie Chain')
      }
      const program = v.owner.equals(TOKEN_2022_PROGRAM_ID) ? TOKEN_2022_PROGRAM_ID : TOKEN_PROGRAM_ID
      const decimals = Number(v.data.parsed.info.decimals)
      let info: TokenInfo = { mint, symbol: shortAddr(mint), name: 'SPL token', decimals }
      try {
        const reg = await loadRegistry()
        const known = reg.tokens.find((t) => t.mint === mint)
        if (known) info = known
      } catch {
        /* registry is optional */
      }
      return { info, program }
    })()
    mintCache.set(mint, p)
    p.catch(() => mintCache.delete(mint))
  }
  return p
}
