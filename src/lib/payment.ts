// Payment requests, transaction building, confirmation and on-chain lookup.
//
// A request carries a fresh "reference" public key. The transfer instruction lists it as a read-only
// account, so the payment can later be found with getSignaturesForAddress(reference) — the same
// trick Solana Pay uses. No backend, no database: the chain is the source of truth.
import {
  Keypair,
  PublicKey,
  SystemProgram,
  Transaction,
  TransactionInstruction,
  type ParsedTransactionWithMeta,
} from '@solana/web3.js'
import {
  createAssociatedTokenAccountIdempotentInstruction,
  createTransferCheckedInstruction,
  getAssociatedTokenAddressSync,
} from '@solana/spl-token'
import { MEMO_PROGRAM_ID, NATIVE_MINT, connection, isPubkey, parseUnits } from './chain'
import { describeMint, type TokenInfo } from './tokens'

export interface PaymentRequest {
  to: string // address or .cook name
  amount: string // UI amount, e.g. "12.5"
  mint: string // NATIVE_MINT for COOK, else SPL mint
  label: string
  message: string
  ref: string // reference pubkey (base58)
}

export const MEMO_PREFIX = 'payjar'

export function newReference(): string {
  return Keypair.generate().publicKey.toBase58()
}

export function encodeRequest(r: PaymentRequest): string {
  const p = new URLSearchParams()
  p.set('to', r.to)
  p.set('amount', r.amount)
  if (r.mint !== NATIVE_MINT) p.set('mint', r.mint)
  if (r.label) p.set('label', r.label)
  if (r.message) p.set('msg', r.message)
  p.set('ref', r.ref)
  return p.toString()
}

export function decodeRequest(p: URLSearchParams): PaymentRequest | null {
  const to = p.get('to')?.trim() ?? ''
  const amount = p.get('amount')?.trim() ?? ''
  const ref = p.get('ref')?.trim() ?? ''
  if (!to || !amount || !isPubkey(ref)) return null
  const mint = p.get('mint')?.trim() || NATIVE_MINT
  if (mint !== NATIVE_MINT && !isPubkey(mint)) return null
  return { to, amount, mint, label: p.get('label') ?? '', message: p.get('msg') ?? '', ref }
}

export function appBase(): string {
  return `${location.origin}${location.pathname}`
}
export function paymentUrl(r: PaymentRequest): string {
  return `${appBase()}#/pay?${encodeRequest(r)}`
}
export function receiptUrl(ref: string): string {
  return `${appBase()}#/receipt?ref=${ref}`
}

export function memoText(r: PaymentRequest): string {
  const parts = [MEMO_PREFIX, r.label, r.message].map((s) => s.replace(/\|/g, '/').trim())
  return parts.join('|').slice(0, 200)
}

export interface BuiltPayment {
  tx: Transaction
  blockhash: string
  lastValidBlockHeight: number
  token: TokenInfo
  amountRaw: bigint
  createsRecipientAccount: boolean
}

export async function buildPaymentTx(payer: PublicKey, recipient: PublicKey, r: PaymentRequest): Promise<BuiltPayment> {
  const { info: token, program } = await describeMint(r.mint)
  const amountRaw = parseUnits(r.amount, token.decimals)
  const reference = new PublicKey(r.ref)
  const ixs: TransactionInstruction[] = []
  let createsRecipientAccount = false

  if (r.mint === NATIVE_MINT) {
    const ix = SystemProgram.transfer({ fromPubkey: payer, toPubkey: recipient, lamports: amountRaw })
    ix.keys.push({ pubkey: reference, isSigner: false, isWritable: false })
    ixs.push(ix)
  } else {
    const mint = new PublicKey(r.mint)
    const fromAta = getAssociatedTokenAddressSync(mint, payer, false, program)
    const toAta = getAssociatedTokenAddressSync(mint, recipient, true, program)
    const toInfo = await connection.getAccountInfo(toAta)
    createsRecipientAccount = !toInfo
    // Always included (idempotent): it creates the recipient's token account when missing, and it
    // keeps the recipient's wallet in the account list so the payment shows up in the dashboard's
    // getSignaturesForAddress(recipient) even when the token account already exists.
    ixs.push(createAssociatedTokenAccountIdempotentInstruction(payer, toAta, recipient, mint, program))
    const ix = createTransferCheckedInstruction(fromAta, mint, toAta, payer, amountRaw, token.decimals, [], program)
    ix.keys.push({ pubkey: reference, isSigner: false, isWritable: false })
    ixs.push(ix)
  }
  ixs.push(new TransactionInstruction({ programId: MEMO_PROGRAM_ID, keys: [], data: Buffer.from(memoText(r), 'utf8') }))

  const { blockhash, lastValidBlockHeight } = await connection.getLatestBlockhash('confirmed')
  const tx = new Transaction({ feePayer: payer, blockhash, lastValidBlockHeight }).add(...ixs)
  return { tx, blockhash, lastValidBlockHeight, token, amountRaw, createsRecipientAccount }
}

export interface BalanceCheck {
  ok: boolean
  balanceRaw: bigint
  cookLamports: bigint
  needLamports: bigint
}

/** Rent for a token account (~0.002 COOK) + fee headroom. */
const ATA_RENT_LAMPORTS = 2_100_000n
const FEE_HEADROOM_LAMPORTS = 20_000n

export async function checkPayerBalance(
  payer: PublicKey,
  token: TokenInfo,
  amountRaw: bigint,
  createsRecipientAccount: boolean,
): Promise<BalanceCheck> {
  const cookLamports = BigInt(await connection.getBalance(payer))
  if (token.mint === NATIVE_MINT) {
    const needLamports = amountRaw + FEE_HEADROOM_LAMPORTS
    return { ok: cookLamports >= needLamports, balanceRaw: cookLamports, cookLamports, needLamports }
  }
  const { program } = await describeMint(token.mint)
  const ata = getAssociatedTokenAddressSync(new PublicKey(token.mint), payer, false, program)
  let balanceRaw = 0n
  try {
    const b = await connection.getTokenAccountBalance(ata)
    balanceRaw = BigInt(b.value.amount)
  } catch {
    balanceRaw = 0n
  }
  const needLamports = FEE_HEADROOM_LAMPORTS + (createsRecipientAccount ? ATA_RENT_LAMPORTS : 0n)
  return { ok: balanceRaw >= amountRaw && cookLamports >= needLamports, balanceRaw, cookLamports, needLamports }
}

export type SendStage = 'sent' | 'confirmed' | 'finalized'

export async function sendAndConfirm(
  signed: Uint8Array,
  blockhash: string,
  lastValidBlockHeight: number,
  onStage: (s: SendStage, sig: string) => void,
): Promise<string> {
  const sig = await connection.sendRawTransaction(signed, { skipPreflight: false, maxRetries: 5 })
  onStage('sent', sig)
  const res = await connection.confirmTransaction({ signature: sig, blockhash, lastValidBlockHeight }, 'confirmed')
  if (res.value.err) throw new Error(`Transaction failed on-chain: ${JSON.stringify(res.value.err)}`)
  onStage('confirmed', sig)
  // Finalization is reported when it happens; the UI already shows "confirmed".
  void (async () => {
    for (let i = 0; i < 40; i++) {
      await new Promise((r) => setTimeout(r, 1500))
      const st = await connection.getSignatureStatuses([sig]).catch(() => null)
      if (st?.value[0]?.confirmationStatus === 'finalized') {
        onStage('finalized', sig)
        return
      }
    }
  })()
  return sig
}

export function explainSendError(e: unknown): string {
  const msg = e instanceof Error ? e.message : String(e)
  if (/insufficient (lamports|funds)/i.test(msg)) return 'Insufficient balance to cover the amount plus the network fee.'
  if (/block ?height exceeded|expired/i.test(msg)) return 'The transaction expired before it was confirmed. Please try again.'
  if (/reject|denied|cancel/i.test(msg)) return 'You rejected the request in your wallet.'
  if (/could not find account|AccountNotFound|invalid account data/i.test(msg)) {
    return 'Your wallet has no token account for this token on Cookie Chain.'
  }
  return msg
}

// --- Lookups ---------------------------------------------------------------------------------

export interface Transfer {
  signature: string
  slot: number
  blockTime: number | null
  from: string | null
  to: string
  mint: string
  amountRaw: bigint
  decimals: number
  memo: string | null
  fee: number
  err: unknown
}

export async function findSignatureByReference(ref: string): Promise<string | null> {
  const sigs = await connection.getSignaturesForAddress(new PublicKey(ref), { limit: 10 }, 'confirmed')
  const good = sigs.find((s) => !s.err) ?? sigs[0]
  return good?.signature ?? null
}

export function parseMemo(tx: ParsedTransactionWithMeta): string | null {
  for (const ix of tx.transaction.message.instructions) {
    if (!ix.programId.equals(MEMO_PROGRAM_ID)) continue
    if ('parsed' in ix && typeof ix.parsed === 'string') return ix.parsed
    if ('data' in ix && typeof ix.data === 'string') return ix.data
  }
  return null
}

/** Split a PayJar memo ("payjar|label|message") into its parts; null for other memos. */
export function parseCookieMemo(memo: string | null): { label: string; message: string } | null {
  if (!memo) return null
  const m = memo.replace(/^\[\d+\]\s*/, '') // getSignaturesForAddress prefixes "[len] "
  if (!m.startsWith(MEMO_PREFIX + '|')) return null
  const [, label = '', message = ''] = m.split('|')
  return { label, message }
}

/** Everything `owner` received in a parsed transaction (native + SPL), by balance deltas. */
export function extractIncoming(owner: PublicKey, tx: ParsedTransactionWithMeta, signature: string): Transfer[] {
  const meta = tx.meta
  if (!meta) return []
  const keys = tx.transaction.message.accountKeys
  const ownerStr = owner.toBase58()
  const payer = keys[0]?.pubkey.toBase58() ?? null
  if (payer === ownerStr) return []
  const memo = parseMemo(tx)
  const base = { signature, slot: tx.slot, blockTime: tx.blockTime ?? null, from: payer, to: ownerStr, memo, fee: meta.fee, err: meta.err }
  const out: Transfer[] = []
  const idx = keys.findIndex((k) => k.pubkey.equals(owner))
  if (idx >= 0) {
    const delta = BigInt(meta.postBalances[idx]) - BigInt(meta.preBalances[idx])
    if (delta > 0n) out.push({ ...base, mint: NATIVE_MINT, amountRaw: delta, decimals: 9 })
  }
  const sum = (list: typeof meta.preTokenBalances, mint: string) =>
    (list ?? []).filter((b) => b.owner === ownerStr && b.mint === mint).reduce((s, b) => s + BigInt(b.uiTokenAmount.amount), 0n)
  const mints = new Set((meta.postTokenBalances ?? []).filter((b) => b.owner === ownerStr).map((b) => b.mint))
  for (const mint of mints) {
    const delta = sum(meta.postTokenBalances, mint) - sum(meta.preTokenBalances, mint)
    if (delta <= 0n) continue
    const decimals = (meta.postTokenBalances ?? []).find((b) => b.mint === mint)?.uiTokenAmount.decimals ?? 0
    out.push({ ...base, mint, amountRaw: delta, decimals })
  }
  return out
}

/** Incoming payments to `owner` (native COOK and SPL tokens), newest first. */
export async function incomingPayments(owner: PublicKey, limit = 60): Promise<Transfer[]> {
  const sigs = await connection.getSignaturesForAddress(owner, { limit }, 'confirmed')
  if (!sigs.length) return []
  const txs = await connection.getParsedTransactions(
    sigs.map((s) => s.signature),
    { maxSupportedTransactionVersion: 0, commitment: 'confirmed' },
  )
  const out: Transfer[] = []
  txs.forEach((tx, i) => {
    if (tx) out.push(...extractIncoming(owner, tx, sigs[i].signature))
  })
  return out
}

export interface PaymentDetails {
  signature: string
  slot: number
  blockTime: number | null
  fee: number
  err: unknown
  payer: string | null
  memo: string | null
  transfers: Transfer[]
}

/** Payment details for a signature: every account that gained value, excluding the fee payer. */
export async function paymentBySignature(sig: string): Promise<PaymentDetails | null> {
  const tx = await connection.getParsedTransaction(sig, { maxSupportedTransactionVersion: 0, commitment: 'confirmed' })
  if (!tx) return null
  const keys = tx.transaction.message.accountKeys
  const transfers: Transfer[] = []
  for (const k of keys) transfers.push(...extractIncoming(k.pubkey, tx, sig))
  return {
    signature: sig,
    slot: tx.slot,
    blockTime: tx.blockTime ?? null,
    fee: tx.meta?.fee ?? 0,
    err: tx.meta?.err ?? null,
    payer: keys[0]?.pubkey.toBase58() ?? null,
    memo: parseMemo(tx),
    transfers,
  }
}
