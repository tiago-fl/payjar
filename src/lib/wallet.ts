// Wallet Standard integration. Nightly (and any other Solana wallet-standard wallet) registers
// itself on window; we discover it, connect, and ask it to SIGN transactions only. Sending is done
// by us against the Cookie Chain RPC, so the wallet's own RPC setting never gets in the way.
import { getWallets } from '@wallet-standard/app'
import type { Wallet, WalletAccount, IdentifierString } from '@wallet-standard/base'
import type { Transaction } from '@solana/web3.js'

type ConnectFeature = {
  connect: (input?: { silent?: boolean }) => Promise<{ accounts: readonly WalletAccount[] }>
}
type DisconnectFeature = { disconnect: () => Promise<void> }
type EventsFeature = {
  on: (event: 'change', listener: (props: { accounts?: readonly WalletAccount[] }) => void) => () => void
}
type SignTxFeature = {
  signTransaction: (
    ...inputs: { transaction: Uint8Array; account: WalletAccount; chain?: IdentifierString }[]
  ) => Promise<readonly { signedTransaction: Uint8Array }[]>
}

export const NIGHTLY_NAME = 'Nightly'

export function listSolanaWallets(): Wallet[] {
  return getWallets()
    .get()
    .filter((w) => 'solana:signTransaction' in w.features && 'standard:connect' in w.features)
    .sort((a, b) => Number(b.name === NIGHTLY_NAME) - Number(a.name === NIGHTLY_NAME))
}

export function onWalletRegistry(cb: () => void): () => void {
  const { on } = getWallets()
  const offs = [on('register', cb), on('unregister', cb)]
  return () => offs.forEach((off) => off())
}

function solanaAccount(accounts: readonly WalletAccount[]): WalletAccount | null {
  return accounts.find((a) => a.chains.some((c) => c.startsWith('solana:'))) ?? accounts[0] ?? null
}

export async function connectWallet(wallet: Wallet, silent = false): Promise<WalletAccount> {
  const feat = wallet.features['standard:connect'] as ConnectFeature
  const { accounts } = await feat.connect(silent ? { silent: true } : undefined)
  const acc = solanaAccount(accounts.length ? accounts : wallet.accounts)
  if (!acc) throw new Error('The wallet returned no Solana account')
  return acc
}

export async function disconnectWallet(wallet: Wallet): Promise<void> {
  const feat = wallet.features['standard:disconnect'] as DisconnectFeature | undefined
  if (feat) await feat.disconnect().catch(() => undefined)
}

export function onAccountChange(wallet: Wallet, cb: (acc: WalletAccount | null) => void): () => void {
  const feat = wallet.features['standard:events'] as EventsFeature | undefined
  if (!feat) return () => undefined
  return feat.on('change', (p) => {
    if (p.accounts) cb(solanaAccount(p.accounts))
  })
}

export async function signWithWallet(wallet: Wallet, account: WalletAccount, tx: Transaction): Promise<Uint8Array> {
  const feat = wallet.features['solana:signTransaction'] as SignTxFeature
  const chain = (account.chains.find((c) => c.startsWith('solana:')) ?? 'solana:mainnet') as IdentifierString
  const serialized = tx.serialize({ requireAllSignatures: false, verifySignatures: false })
  const [out] = await feat.signTransaction({ transaction: serialized, account, chain })
  if (!out?.signedTransaction) throw new Error('Wallet returned no signed transaction')
  return out.signedTransaction
}

// --- Nightly network switching --------------------------------------------------------------
// Nightly exposes a non-standard `changeNetwork` on its injected object: the dApp can ask the
// wallet to switch to any SVM network by genesis hash + RPC (docs.nightly.app → change_network).
type NightlySolana = {
  genesisHash?: string
  changeNetwork?: (n: { genesisHash: string; url?: string }) => Promise<unknown>
}
function nightlyObject(): NightlySolana | null {
  const w = window as unknown as { nightly?: { solana?: NightlySolana } }
  return w.nightly?.solana ?? null
}

/** true = Nightly is on Cookie Chain, false = on another network, null = not Nightly / unknown. */
export function nightlyOnNetwork(genesisHash: string): boolean | null {
  const n = nightlyObject()
  if (!n || !n.genesisHash) return null
  return n.genesisHash === genesisHash
}

export function nightlyCanSwitch(): boolean {
  return typeof nightlyObject()?.changeNetwork === 'function'
}

/** Ask Nightly to switch to the given network (opens a confirmation popup in the extension). */
export async function nightlySwitchNetwork(genesisHash: string, url: string): Promise<void> {
  const n = nightlyObject()
  if (!n?.changeNetwork) throw new Error('This wallet cannot switch networks from a dApp')
  await n.changeNetwork({ genesisHash, url })
}

/** Human-friendly wallet error (user rejection etc.). */
export function walletErrorMessage(e: unknown): string {
  const msg = e instanceof Error ? e.message : String(e)
  if (/reject|denied|cancel|declin/i.test(msg)) return 'You rejected the request in your wallet.'
  return msg
}
