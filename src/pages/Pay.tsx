import { useCallback, useEffect, useState } from 'react'
import type { PublicKey } from '@solana/web3.js'
import { BRIDGE_URL, COOKIEBOX_AGG_URL, COOKIEBOX_APP_URL, NATIVE_MINT, fmtUsd, formatUnits, parseUnits } from '../lib/chain'
import { resolveRecipient } from '../lib/names'
import {
  buildPaymentTx,
  checkPayerBalance,
  decodeRequest,
  explainSendError,
  findSignatureByReference,
  receiptUrl,
  sendAndConfirm,
  type BalanceCheck,
  type PaymentRequest,
} from '../lib/payment'
import { updateLink } from '../lib/store'
import { COOK_TOKEN, cookUsdPrice, describeMint, type TokenInfo } from '../lib/tokens'
import { AddressLink, CopyField, TxLink, TxTimeline, type Stage } from '../components/ui'
import { WalletButton } from '../components/WalletButton'
import { useWallet } from '../components/WalletContext'

export function Pay({ params }: { params: URLSearchParams }) {
  const request = decodeRequest(params)
  if (!request) {
    return (
      <div className="page">
        <div className="card">
          <h2>Invalid payment link</h2>
          <p className="muted">This link is missing the recipient, amount or reference. Ask the merchant for a new one.</p>
          <a className="btn btn-primary" href="#/">Create a payment link</a>
        </div>
      </div>
    )
  }
  return <PayInner request={request} />
}

function PayInner({ request }: { request: PaymentRequest }) {
  const { publicKey, sign } = useWallet()
  const [recipient, setRecipient] = useState<{ address: PublicKey; name: string | null } | null>(null)
  const [token, setToken] = useState<TokenInfo | null>(null)
  const [loadErr, setLoadErr] = useState<string | null>(null)
  const [cookUsd, setCookUsd] = useState<number | null>(null)
  const [alreadyPaid, setAlreadyPaid] = useState<string | null>(null)
  const [balance, setBalance] = useState<BalanceCheck | null>(null)
  const [needsAta, setNeedsAta] = useState(false)
  const [stage, setStage] = useState<Stage>('idle')
  const [signature, setSignature] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [swapQuote, setSwapQuote] = useState<string | null>(null)

  // Resolve recipient + token metadata, and check whether this reference was already paid.
  useEffect(() => {
    let alive = true
    setLoadErr(null)
    Promise.all([resolveRecipient(request.to), describeMint(request.mint), cookUsdPrice(), findSignatureByReference(request.ref)])
      .then(([r, m, usd, sig]) => {
        if (!alive) return
        setRecipient(r)
        setToken(m.info)
        setCookUsd(usd)
        if (sig) setAlreadyPaid(sig)
      })
      .catch((e) => alive && setLoadErr(e instanceof Error ? e.message : String(e)))
    return () => {
      alive = false
    }
  }, [request.to, request.mint, request.ref])

  const refreshBalance = useCallback(async () => {
    if (!publicKey || !token || !recipient) return
    try {
      const amountRaw = parseUnits(request.amount, token.decimals)
      const { createsRecipientAccount } = await buildPaymentTx(publicKey, recipient.address, request)
      setNeedsAta(createsRecipientAccount)
      setBalance(await checkPayerBalance(publicKey, token, amountRaw, createsRecipientAccount))
    } catch (e) {
      setError(explainSendError(e))
    }
  }, [publicKey, token, recipient, request])

  useEffect(() => {
    void refreshBalance()
  }, [refreshBalance])

  // If the payer lacks the token, ask the Cookiebox aggregator how much COOK the amount is worth.
  useEffect(() => {
    if (!token || !balance || balance.ok || token.mint === NATIVE_MINT) return
    let alive = true
    const amountRaw = parseUnits(request.amount, token.decimals).toString()
    fetch(`${COOKIEBOX_AGG_URL}/quote?inputMint=${token.mint}&outputMint=${NATIVE_MINT}&amount=${amountRaw}&slippageBps=100`)
      .then((r) => (r.ok ? r.json() : null))
      .then((j: { route?: { outAmount?: string } } | null) => {
        if (!alive || !j?.route?.outAmount) return
        setSwapQuote(formatUnits(BigInt(j.route.outAmount), 9, 2))
      })
      .catch(() => undefined)
    return () => {
      alive = false
    }
  }, [token, balance, request.amount])

  async function pay() {
    if (!publicKey || !recipient || !token) return
    setError(null)
    setSignature(null)
    try {
      setStage('building')
      const built = await buildPaymentTx(publicKey, recipient.address, request)
      setStage('signing')
      const signed = await sign(built.tx)
      setStage('sent')
      const sig = await sendAndConfirm(signed, built.blockhash, built.lastValidBlockHeight, (s, sg) => {
        setSignature(sg)
        setStage(s)
      })
      setSignature(sig)
      updateLink(request.ref, { signature: sig, paidAt: Date.now() })
      void refreshBalance()
    } catch (e) {
      setStage('error')
      setError(explainSendError(e))
    }
  }

  const usd = (() => {
    const n = Number(request.amount)
    if (!token || !Number.isFinite(n)) return null
    if (token.mint === NATIVE_MINT) return cookUsd ? n * cookUsd : null
    return token.priceUsd ? n * token.priceUsd : null
  })()

  const busy = stage === 'building' || stage === 'signing' || stage === 'sent'
  const done = stage === 'confirmed' || stage === 'finalized'

  return (
    <div className="page narrow">
      <div className="card pay-card">
        <div className="pay-head">
          <span className="eyebrow">Payment request</span>
          <h1>
            {request.amount} <span className="accent">{token?.symbol ?? '…'}</span>
          </h1>
          {usd !== null && <div className="muted">≈ {fmtUsd(usd)}</div>}
          {request.label && <div className="pay-label">{request.label}</div>}
          {request.message && <p className="muted">{request.message}</p>}
        </div>

        <dl className="kv">
          <dt>To</dt>
          <dd>{recipient ? <AddressLink address={recipient.address.toBase58()} name={recipient.name} /> : loadErr ? <span className="error">{loadErr}</span> : 'Resolving…'}</dd>
          <dt>Token</dt>
          <dd>{token ? (token.mint === NATIVE_MINT ? 'COOK (native)' : <span className="mono small">{token.mint}</span>) : '…'}</dd>
          <dt>Network</dt>
          <dd>Cookie Chain · fee ≈ 0.000005 COOK</dd>
        </dl>

        {alreadyPaid && !done && (
          <div className="callout success">
            This request was already paid: <TxLink signature={alreadyPaid} />. <a href={receiptUrl(request.ref)}>View receipt</a>.
          </div>
        )}

        {!publicKey ? (
          <div className="center">
            <p className="muted">Connect your wallet to pay. Nightly is recommended on Cookie Chain.</p>
            <WalletButton />
          </div>
        ) : done && signature ? (
          <div className="success-box">
            <div className="big">✓ Paid</div>
            <p>
              Transaction <TxLink signature={signature} /> is {stage}. {stage === 'confirmed' && 'Waiting for finalization…'}
            </p>
            <CopyField label="Receipt" value={receiptUrl(request.ref)} />
            <div className="row">
              <a className="btn btn-primary" href={receiptUrl(request.ref)}>Open receipt</a>
              <a className="btn btn-ghost" href="#/">Create your own link</a>
            </div>
          </div>
        ) : (
          <>
            {balance && token && (
              <div className={`callout ${balance.ok ? '' : 'warn'}`}>
                Your balance: <strong>{formatUnits(balance.balanceRaw, token.decimals, 6)} {token.symbol}</strong>
                {token.mint !== NATIVE_MINT && <> · {formatUnits(balance.cookLamports, 9, 4)} COOK for fees</>}
                {needsAta && <> · the recipient's token account will be created (≈0.002 COOK rent, paid by you)</>}
                {!balance.ok && (
                  <div className="small" style={{ marginTop: 6 }}>
                    {token.mint === NATIVE_MINT || balance.cookLamports < balance.needLamports ? (
                      <>
                        Not enough COOK. <a href={BRIDGE_URL} target="_blank" rel="noreferrer">Bridge COOK from Solana</a> to top up.
                      </>
                    ) : (
                      <>
                        Not enough {token.symbol}. Swap on <a href={COOKIEBOX_APP_URL} target="_blank" rel="noreferrer">Cookiebox</a>
                        {swapQuote && <> — the Cookiebox aggregator values this amount at ≈ <strong>{swapQuote} COOK</strong></>}.
                      </>
                    )}
                  </div>
                )}
              </div>
            )}
            {stage !== 'idle' && <TxTimeline stage={stage} error={error} />}
            {stage === 'idle' && error && <p className="error">{error}</p>}
            <button className="btn btn-primary btn-lg" disabled={busy || !recipient || !token || (balance !== null && !balance.ok)} onClick={() => void pay()}>
              {busy ? 'Processing…' : stage === 'error' ? 'Try again' : `Pay ${request.amount} ${token?.symbol ?? ''}`}
            </button>
            <p className="muted small center">
              You will sign one transaction: transfer + on-chain reference + memo “{request.label || 'cookiepay'}”. Nothing else.
            </p>
          </>
        )}
      </div>
    </div>
  )
}

export { COOK_TOKEN }
