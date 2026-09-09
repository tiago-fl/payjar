import { useEffect, useState, type FormEvent } from 'react'
import { fmtUsd, isPubkey, parseUnits } from '../lib/chain'
import { looksLikeName, primaryName, resolveRecipient } from '../lib/names'
import { newReference, paymentUrl, receiptUrl, type PaymentRequest } from '../lib/payment'
import { saveLink } from '../lib/store'
import { COOK_TOKEN, cookUsdPrice, type TokenInfo } from '../lib/tokens'
import { TokenPicker } from '../components/TokenPicker'
import { CopyField, Qr } from '../components/ui'
import { useWallet } from '../components/WalletContext'

export function Home() {
  const { publicKey } = useWallet()
  const [to, setTo] = useState('')
  const [amount, setAmount] = useState('')
  const [token, setToken] = useState<TokenInfo>(COOK_TOKEN)
  const [label, setLabel] = useState('')
  const [message, setMessage] = useState('')
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState<string | null>(null)
  const [result, setResult] = useState<{ request: PaymentRequest; resolved: string; name: string | null } | null>(null)
  const [cookUsd, setCookUsd] = useState<number | null>(null)
  const [touched, setTouched] = useState(false)

  useEffect(() => {
    void cookUsdPrice().then(setCookUsd)
  }, [])

  // Prefill the recipient with the connected wallet (its primary .cook name when it has one).
  useEffect(() => {
    if (!publicKey || touched) return
    let alive = true
    setTo(publicKey.toBase58())
    primaryName(publicKey)
      .then((n) => alive && n && !touched && setTo(n))
      .catch(() => undefined)
    return () => {
      alive = false
    }
  }, [publicKey, touched])

  async function submit(e: FormEvent) {
    e.preventDefault()
    setErr(null)
    setBusy(true)
    try {
      if (!to.trim()) throw new Error('Enter a recipient address or .cook name')
      if (!isPubkey(to.trim()) && !looksLikeName(to.trim())) throw new Error('Recipient must be a wallet address or a .cook name')
      parseUnits(amount, token.decimals)
      const r = await resolveRecipient(to)
      const request: PaymentRequest = {
        to: r.name ?? r.address.toBase58(),
        amount: amount.trim().replace(',', '.'),
        mint: token.mint,
        label: label.trim().slice(0, 60),
        message: message.trim().slice(0, 120),
        ref: newReference(),
      }
      saveLink({ ...request, createdAt: Date.now(), signature: null, paidAt: null })
      setResult({ request, resolved: r.address.toBase58(), name: r.name })
    } catch (e2) {
      setErr(e2 instanceof Error ? e2.message : String(e2))
    } finally {
      setBusy(false)
    }
  }

  const usd = (() => {
    const n = Number(amount)
    if (!Number.isFinite(n) || n <= 0) return null
    if (token.mint === COOK_TOKEN.mint) return cookUsd ? n * cookUsd : null
    return token.priceUsd ? n * token.priceUsd : null
  })()

  return (
    <div className="page">
      <section className="hero">
        <h1>Get paid on Cookie Chain with a link.</h1>
        <p className="lead">
          Create a payment request for COOK or any SPL token, share the link or QR, and get an on-chain receipt the
          second it is confirmed. No backend, no account — the chain is the database.
        </p>
      </section>

      <div className="grid-2">
        <form className="card" onSubmit={(e) => void submit(e)}>
          <h2>Create a payment link</h2>
          <label>
            Recipient <span className="muted small">wallet address or .cook name</span>
            <input
              value={to}
              onChange={(e) => {
                setTouched(true)
                setTo(e.target.value)
              }}
              placeholder="yourname.cook or a wallet address"
              spellCheck={false}
            />
          </label>
          <div className="row">
            <label className="grow">
              Amount
              <input value={amount} onChange={(e) => setAmount(e.target.value)} placeholder="0.00" inputMode="decimal" />
              {usd !== null && <span className="muted small">≈ {fmtUsd(usd)}</span>}
            </label>
            <label>
              Token
              <TokenPicker value={token} onChange={setToken} />
            </label>
          </div>
          <label>
            Label <span className="muted small">what is this for? (shown to the payer, stored in the memo)</span>
            <input value={label} onChange={(e) => setLabel(e.target.value)} placeholder="Invoice #42, Coffee, Tip jar…" maxLength={60} />
          </label>
          <label>
            Message <span className="muted small">optional</span>
            <input value={message} onChange={(e) => setMessage(e.target.value)} placeholder="Thanks for supporting the bakery 🍪" maxLength={120} />
          </label>
          {err && <p className="error">{err}</p>}
          <button className="btn btn-primary btn-lg" disabled={busy}>
            {busy ? 'Resolving…' : 'Create payment link'}
          </button>
        </form>

        <div className="card">
          {result ? (
            <>
              <h2>Your payment link is ready</h2>
              <div className="qr-wrap">
                <Qr value={paymentUrl(result.request)} />
              </div>
              <p>
                <strong>{result.request.amount} {token.symbol}</strong> to{' '}
                <span className="mono">{result.name ?? result.resolved}</span>
                {result.name && <span className="muted small"> → {result.resolved}</span>}
              </p>
              <CopyField label="Payment link" value={paymentUrl(result.request)} />
              <CopyField label="Receipt link (for you)" value={receiptUrl(result.request.ref)} />
              <div className="row">
                <a className="btn btn-primary" href={paymentUrl(result.request)}>Open pay page</a>
                <a className="btn btn-ghost" href="#/dashboard">Track in dashboard</a>
              </div>
              <p className="muted small">
                Reference <span className="mono">{result.request.ref}</span> is embedded in the transaction so the payment can be found on-chain without any server.
              </p>
            </>
          ) : (
            <>
              <h2>How it works</h2>
              <ol className="steps">
                <li><strong>Create a link.</strong> Amount, token, label. A unique on-chain reference key is generated in your browser.</li>
                <li><strong>Share it.</strong> Link or QR — Telegram, X, an invoice, a sticker on the counter.</li>
                <li><strong>Payer connects Nightly</strong> and signs one transaction: the transfer, the reference, and a memo with your label.</li>
                <li><strong>Receipt appears instantly.</strong> Sub-second finality, fee ≈ 0.000005 COOK. Track everything in your dashboard.</li>
              </ol>
              <p className="muted small">Works with native COOK, SPL tokens and Token-2022 mints. Recipients can be <span className="mono">.cook</span> names.</p>
            </>
          )}
        </div>
      </div>
    </div>
  )
}
