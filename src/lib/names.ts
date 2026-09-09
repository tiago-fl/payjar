// `.cook` names (CookOven name service). Byte layouts mirror the MIT-licensed cookie-mcp reference
// implementation (github.com/cookiechain/cookie-mcp): DomainAccount = 8 disc + borsh string name +
// owner + resolver + metadata + i64 + bump; PrimaryDomain = 8 disc + owner + borsh string name.
import { PublicKey, SystemProgram } from '@solana/web3.js'
import { connection, isPubkey } from './chain'

export const DOMAINS_PROGRAM_ID = new PublicKey('H43Qtq4AMQ86y7yc3YtCKZJ2QMhhnCcHyZKeFeoQn7PA')
export const COOK_TLD = '.cook'
const DOMAIN_DISC = Buffer.from([35, 146, 98, 112, 13, 230, 231, 153])
const PRIMARY_DISC = Buffer.from([231, 255, 61, 63, 142, 184, 254, 42])
const UNSET = SystemProgram.programId.toBase58()

export function normalizeName(input: string): string {
  const s = input.trim().toLowerCase()
  return s.endsWith(COOK_TLD) ? s.slice(0, -COOK_TLD.length) : s
}

export function nameError(label: string): string | null {
  if (!label) return 'name is empty'
  if (Buffer.byteLength(label) > 32) return 'name is longer than 32 characters'
  if (!/^[a-z0-9-]+$/.test(label)) return 'only a-z, 0-9 and hyphens are allowed'
  if (label.startsWith('-') || label.endsWith('-')) return 'no leading or trailing hyphen'
  return null
}

export function looksLikeName(input: string): boolean {
  const s = input.trim()
  if (!s) return false
  if (s.toLowerCase().endsWith(COOK_TLD)) return true
  return !isPubkey(s)
}

export interface ResolvedName {
  label: string
  owner: string
  resolver: string | null
}

export async function resolveName(input: string): Promise<ResolvedName | null> {
  const label = normalizeName(input)
  const err = nameError(label)
  if (err) throw new Error(`"${input}" is not a valid .cook name — ${err}`)
  const [pda] = PublicKey.findProgramAddressSync([Buffer.from('domain'), Buffer.from(label)], DOMAINS_PROGRAM_ID)
  const info = await connection.getAccountInfo(pda)
  if (!info) return null
  const data = info.data
  if (data.length < 12 || !DOMAIN_DISC.equals(data.subarray(0, 8))) return null
  const len = data.readUInt32LE(8)
  const end = 12 + len
  if (end + 32 > data.length) return null
  const owner = new PublicKey(data.subarray(end, end + 32)).toBase58()
  let resolver: string | null = null
  if (end + 64 <= data.length) {
    const r = new PublicKey(data.subarray(end + 32, end + 64)).toBase58()
    resolver = r === UNSET ? null : r
  }
  return { label, owner, resolver }
}

/** The wallet's primary `.cook` name, if it set one. */
export async function primaryName(owner: PublicKey): Promise<string | null> {
  const [pda] = PublicKey.findProgramAddressSync([Buffer.from('primary'), owner.toBuffer()], DOMAINS_PROGRAM_ID)
  const info = await connection.getAccountInfo(pda)
  if (!info) return null
  const data = info.data
  if (data.length < 44 || !PRIMARY_DISC.equals(data.subarray(0, 8))) return null
  const len = data.readUInt32LE(40)
  if (len === 0 || 44 + len > data.length) return null
  return data.subarray(44, 44 + len).toString('utf8') + COOK_TLD
}

export interface Recipient {
  address: PublicKey
  name: string | null
}

/** Accepts a base58 address or a `.cook` name and returns the pubkey to pay. */
export async function resolveRecipient(input: string): Promise<Recipient> {
  const s = input.trim()
  if (isPubkey(s)) return { address: new PublicKey(s), name: null }
  if (!looksLikeName(s)) throw new Error('Enter a wallet address or a .cook name')
  const r = await resolveName(s)
  if (!r) throw new Error(`${normalizeName(s)}${COOK_TLD} is not registered`)
  return { address: new PublicKey(r.resolver ?? r.owner), name: r.label + COOK_TLD }
}
