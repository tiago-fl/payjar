import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react'
import { PublicKey, type Transaction } from '@solana/web3.js'
import type { Wallet, WalletAccount } from '@wallet-standard/base'
import { COOKIE_GENESIS_HASH, RPC_URL } from '../lib/chain'
import {
  NIGHTLY_NAME,
  connectWallet,
  disconnectWallet,
  listSolanaWallets,
  nightlyCanSwitch,
  nightlyOnNetwork,
  nightlySwitchNetwork,
  onAccountChange,
  onWalletRegistry,
  signWithWallet,
  walletErrorMessage,
} from '../lib/wallet'

export interface WalletState {
  wallets: Wallet[]
  wallet: Wallet | null
  account: WalletAccount | null
  publicKey: PublicKey | null
  connecting: boolean
  error: string | null
  /** Nightly only: is the wallet currently pointed at Cookie Chain? null when unknown / not Nightly. */
  onCookieChain: boolean | null
  canSwitchNetwork: boolean
  connect: (w: Wallet) => Promise<void>
  disconnect: () => Promise<void>
  switchToCookieChain: () => Promise<void>
  sign: (tx: Transaction) => Promise<Uint8Array>
}

const Ctx = createContext<WalletState | null>(null)
const LAST_WALLET_KEY = 'cookiepay.wallet'

export function WalletProvider({ children }: { children: ReactNode }) {
  const [wallets, setWallets] = useState<Wallet[]>(() => listSolanaWallets())
  const [wallet, setWallet] = useState<Wallet | null>(null)
  const [account, setAccount] = useState<WalletAccount | null>(null)
  const [connecting, setConnecting] = useState(false)
  const [error, setError] = useState<string | null>(null)

  // Wallets register asynchronously after page load; keep the list fresh.
  useEffect(() => onWalletRegistry(() => setWallets(listSolanaWallets())), [])

  const connect = useCallback(async (w: Wallet) => {
    setConnecting(true)
    setError(null)
    try {
      const acc = await connectWallet(w)
      setWallet(w)
      setAccount(acc)
      try {
        localStorage.setItem(LAST_WALLET_KEY, w.name)
      } catch {
        /* ignore */
      }
    } catch (e) {
      setError(walletErrorMessage(e))
      throw e
    } finally {
      setConnecting(false)
    }
  }, [])

  const disconnect = useCallback(async () => {
    if (wallet) await disconnectWallet(wallet)
    setWallet(null)
    setAccount(null)
    try {
      localStorage.removeItem(LAST_WALLET_KEY)
    } catch {
      /* ignore */
    }
  }, [wallet])

  // Silent reconnect to the wallet used last time.
  useEffect(() => {
    let name: string | null = null
    try {
      name = localStorage.getItem(LAST_WALLET_KEY)
    } catch {
      /* ignore */
    }
    if (!name || wallet) return
    const w = wallets.find((x) => x.name === name)
    if (!w) return
    let cancelled = false
    connectWallet(w, true)
      .then((acc) => {
        if (cancelled) return
        setWallet(w)
        setAccount(acc)
      })
      .catch(() => undefined)
    return () => {
      cancelled = true
    }
  }, [wallets, wallet])

  // Follow account switches inside the wallet.
  useEffect(() => {
    if (!wallet) return
    return onAccountChange(wallet, (acc) => {
      setAccount(acc)
      if (!acc) setWallet(null)
    })
  }, [wallet])

  const sign = useCallback(
    async (tx: Transaction) => {
      if (!wallet || !account) throw new Error('Connect a wallet first')
      return signWithWallet(wallet, account, tx)
    },
    [wallet, account],
  )

  // Track which network Nightly is on; poll because the user can switch inside the extension.
  const [onCookieChain, setOnCookieChain] = useState<boolean | null>(null)
  useEffect(() => {
    if (!wallet || wallet.name !== NIGHTLY_NAME) {
      setOnCookieChain(null)
      return
    }
    const tick = () => setOnCookieChain(nightlyOnNetwork(COOKIE_GENESIS_HASH))
    tick()
    const id = setInterval(tick, 2000)
    return () => clearInterval(id)
  }, [wallet, account])

  const switchToCookieChain = useCallback(async () => {
    setError(null)
    try {
      await nightlySwitchNetwork(COOKIE_GENESIS_HASH, RPC_URL)
      setOnCookieChain(nightlyOnNetwork(COOKIE_GENESIS_HASH))
    } catch (e) {
      setError(walletErrorMessage(e))
      throw e
    }
  }, [])

  // Right after connecting Nightly on another network, offer the switch once automatically.
  const [offered, setOffered] = useState(false)
  useEffect(() => {
    if (onCookieChain === false && !offered && nightlyCanSwitch()) {
      setOffered(true)
      void switchToCookieChain().catch(() => undefined)
    }
    if (onCookieChain !== false) setOffered(false)
  }, [onCookieChain, offered, switchToCookieChain])

  const publicKey = useMemo(() => (account ? new PublicKey(account.publicKey) : null), [account])

  const value = useMemo<WalletState>(
    () => ({
      wallets, wallet, account, publicKey, connecting, error,
      onCookieChain, canSwitchNetwork: nightlyCanSwitch(),
      connect, disconnect, switchToCookieChain, sign,
    }),
    [wallets, wallet, account, publicKey, connecting, error, onCookieChain, connect, disconnect, switchToCookieChain, sign],
  )
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>
}

export function useWallet(): WalletState {
  const v = useContext(Ctx)
  if (!v) throw new Error('useWallet outside WalletProvider')
  return v
}
