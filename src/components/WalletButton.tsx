import { useEffect, useState } from 'react'
import { NIGHTLY_URL, shortAddr } from '../lib/chain'
import { NIGHTLY_NAME } from '../lib/wallet'
import { useWallet } from './WalletContext'

export function WalletButton() {
  const { wallets, wallet, account, connecting, error, connect, disconnect } = useWallet()
  const [open, setOpen] = useState(false)

  useEffect(() => {
    if (!open) return
    const close = (e: KeyboardEvent) => e.key === 'Escape' && setOpen(false)
    window.addEventListener('keydown', close)
    return () => window.removeEventListener('keydown', close)
  }, [open])

  if (wallet && account) {
    return (
      <div className="wallet-pill">
        {wallet.icon && <img src={wallet.icon} alt="" width={18} height={18} />}
        <span className="mono" title={account.address}>{shortAddr(account.address)}</span>
        <button className="btn btn-ghost btn-sm" onClick={() => void disconnect()}>Disconnect</button>
      </div>
    )
  }

  return (
    <>
      <button className="btn btn-primary" onClick={() => setOpen(true)} disabled={connecting}>
        {connecting ? 'Connecting…' : 'Connect wallet'}
      </button>
      {open && (
        <div className="modal-backdrop" onClick={() => setOpen(false)}>
          <div className="modal" onClick={(e) => e.stopPropagation()} role="dialog" aria-label="Choose a wallet">
            <h3>Connect a wallet</h3>
            <p className="muted">Nightly is the recommended wallet for Cookie Chain. Set its RPC to <span className="mono">rpc.cookiescan.io</span> to see your COOK balance.</p>
            {wallets.length === 0 && (
              <div className="callout">
                No Solana wallet detected. <a href={NIGHTLY_URL} target="_blank" rel="noreferrer">Install Nightly</a> and reload this page.
              </div>
            )}
            <div className="wallet-list">
              {wallets.map((w) => (
                <button
                  key={w.name}
                  className="wallet-option"
                  onClick={() => {
                    setOpen(false)
                    void connect(w).catch(() => undefined)
                  }}
                >
                  {w.icon && <img src={w.icon} alt="" width={28} height={28} />}
                  <span>{w.name}</span>
                  {w.name === NIGHTLY_NAME && <span className="tag">recommended</span>}
                </button>
              ))}
            </div>
            {error && <p className="error">{error}</p>}
            <button className="btn btn-ghost" onClick={() => setOpen(false)}>Close</button>
          </div>
        </div>
      )}
    </>
  )
}
