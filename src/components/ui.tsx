import { useEffect, useState } from 'react'
import QRCode from 'qrcode'
import { addressUrl, shortAddr, txUrl } from '../lib/chain'

export function CopyButton({ text, label = 'Copy' }: { text: string; label?: string }) {
  const [done, setDone] = useState(false)
  return (
    <button
      className="btn btn-ghost btn-sm"
      onClick={() => {
        void navigator.clipboard?.writeText(text).then(() => {
          setDone(true)
          setTimeout(() => setDone(false), 1500)
        })
      }}
    >
      {done ? 'Copied ✓' : label}
    </button>
  )
}

export function CopyField({ value, label }: { value: string; label?: string }) {
  return (
    <div className="copy-field">
      {label && <span className="copy-label">{label}</span>}
      <input className="mono" readOnly value={value} onFocus={(e) => e.currentTarget.select()} />
      <CopyButton text={value} />
    </div>
  )
}

export function Qr({ value, size = 220 }: { value: string; size?: number }) {
  const [src, setSrc] = useState<string | null>(null)
  useEffect(() => {
    let alive = true
    QRCode.toDataURL(value, { width: size, margin: 1, color: { dark: '#2b1d12', light: '#ffffff' } })
      .then((s) => alive && setSrc(s))
      .catch(() => alive && setSrc(null))
    return () => {
      alive = false
    }
  }, [value, size])
  return src ? <img className="qr" src={src} width={size} height={size} alt="Payment QR code" /> : <div className="qr qr-empty" style={{ width: size, height: size }} />
}

export function AddressLink({ address, name }: { address: string; name?: string | null }) {
  return (
    <a className="mono" href={addressUrl(address)} target="_blank" rel="noreferrer" title={address}>
      {name ? `${name} (${shortAddr(address)})` : shortAddr(address, 6)}
    </a>
  )
}

export function TxLink({ signature }: { signature: string }) {
  return (
    <a className="mono" href={txUrl(signature)} target="_blank" rel="noreferrer" title={signature}>
      {shortAddr(signature, 8)} ↗
    </a>
  )
}

export function Spinner() {
  return <span className="spinner" aria-label="loading" />
}

export type Stage = 'idle' | 'building' | 'signing' | 'sent' | 'confirmed' | 'finalized' | 'error'

const STEPS: { key: Stage; title: string; hint: string }[] = [
  { key: 'building', title: 'Building transaction', hint: 'Fetching a recent blockhash from Cookie Chain' },
  { key: 'signing', title: 'Waiting for your signature', hint: 'Approve the request in your wallet' },
  { key: 'sent', title: 'Sent to the network', hint: 'Broadcast to rpc.cookiescan.io' },
  { key: 'confirmed', title: 'Confirmed', hint: 'Included in a block' },
  { key: 'finalized', title: 'Finalized', hint: 'Irreversible' },
]
const ORDER: Stage[] = ['idle', 'building', 'signing', 'sent', 'confirmed', 'finalized']

export function TxTimeline({ stage, error }: { stage: Stage; error?: string | null }) {
  const pos = ORDER.indexOf(stage === 'error' ? 'idle' : stage)
  return (
    <ol className="timeline">
      {STEPS.map((s, i) => {
        const idx = i + 1
        const state = stage === 'error' ? 'error' : idx < pos ? 'done' : idx === pos ? 'active' : 'todo'
        return (
          <li key={s.key} className={`step step-${state}`}>
            <span className="dot">{state === 'done' ? '✓' : state === 'active' ? <Spinner /> : ''}</span>
            <div>
              <div className="step-title">{s.title}</div>
              <div className="muted small">{s.hint}</div>
            </div>
          </li>
        )
      })}
      {stage === 'error' && error && <li className="error">{error}</li>}
    </ol>
  )
}
