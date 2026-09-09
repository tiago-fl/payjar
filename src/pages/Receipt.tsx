import { useEffect, useState } from 'react'
import { NATIVE_MINT, connection, fmtTime, formatUnits, isPubkey } from '../lib/chain'
import { findSignatureByReference, parseCookieMemo, paymentBySignature, type PaymentDetails } from '../lib/payment'
import { describeMint } from '../lib/tokens'
import { AddressLink, CopyField, Spinner, TxLink } from '../components/ui'

export function Receipt({ params }: { params: URLSearchParams }) {
  const ref = params.get('ref') ?? ''
  const sigParam = params.get('sig') ?? ''
  const [signature, setSignature] = useState<string | null>(sigParam || null)
  const [details, setDetails] = useState<PaymentDetails | null>(null)
  const [symbols, setSymbols] = useState<Record<string, string>>({})
  const [status, setStatus] = useState<string>('confirmed')
  const [attempts, setAttempts] = useState(0)
  const [err, setErr] = useState<string | null>(null)

  // Reference → signature (poll while the payment has not landed yet).
  useEffect(() => {
    if (signature || !isPubkey(ref)) return
    let alive = true
    const tick = async () => {
      try {
        const s = await findSignatureByReference(ref)
        if (!alive) return
        if (s) setSignature(s)
        else setAttempts((a) => a + 1)
      } catch (e) {
        if (alive) setErr(e instanceof Error ? e.message : String(e))
      }
    }
    void tick()
    const id = setInterval(() => void tick(), 4000)
    return () => {
      alive = false
      clearInterval(id)
    }
  }, [ref, signature])

  // Signature → details + token symbols + finality.
  useEffect(() => {
    if (!signature) return
    let alive = true
    paymentBySignature(signature)
      .then(async (d) => {
        if (!alive || !d) return
        setDetails(d)
        const mints = [...new Set(d.transfers.map((t) => t.mint))]
        const entries = await Promise.all(mints.map(async (m) => [m, (await describeMint(m).catch(() => null))?.info.symbol ?? m.slice(0, 4)] as const))
        if (alive) setSymbols(Object.fromEntries(entries))
      })
      .catch((e) => alive && setErr(e instanceof Error ? e.message : String(e)))
    const id = setInterval(() => {
      connection
        .getSignatureStatuses([signature])
        .then((s) => {
          const st = s.value[0]?.confirmationStatus
          if (st && alive) setStatus(st)
          if (st === 'finalized') clearInterval(id)
        })
        .catch(() => undefined)
    }, 2500)
    return () => {
      alive = false
      clearInterval(id)
    }
  }, [signature])

  if (!isPubkey(ref) && !signature) {
    return (
      <div className="page narrow"><div className="card"><h2>Invalid receipt link</h2></div></div>
    )
  }

  const memo = parseCookieMemo(details?.memo ?? null)

  return (
    <div className="page narrow">
      <div className="card">
        <span className="eyebrow">On-chain receipt</span>
        {!signature ? (
          <>
            <h2><Spinner /> Waiting for payment…</h2>
            <p className="muted">
              No transaction references this request yet. This page refreshes automatically
              {attempts > 0 && <> (checked {attempts}×)</>}.
            </p>
            <CopyField label="Reference" value={ref} />
          </>
        ) : !details ? (
          <h2><Spinner /> Loading transaction…</h2>
        ) : (
          <>
            <h1 className={details.err ? 'error' : 'accent'}>{details.err ? 'Transaction failed' : '✓ Paid'}</h1>
            {details.transfers.length === 0 && <p className="muted">No value transfer found in this transaction.</p>}
            {details.transfers.map((t, i) => (
              <div key={i} className="amount-line">
                <strong>{formatUnits(t.amountRaw, t.decimals)} {symbols[t.mint] ?? (t.mint === NATIVE_MINT ? 'COOK' : '…')}</strong>
                <span className="muted"> to </span>
                <AddressLink address={t.to} />
              </div>
            ))}
            <dl className="kv">
              {memo?.label && (<><dt>For</dt><dd>{memo.label}</dd></>)}
              {memo?.message && (<><dt>Message</dt><dd>{memo.message}</dd></>)}
              <dt>From</dt>
              <dd>{details.payer ? <AddressLink address={details.payer} /> : '—'}</dd>
              <dt>Time</dt>
              <dd>{fmtTime(details.blockTime)}</dd>
              <dt>Status</dt>
              <dd><span className={`badge ${status === 'finalized' ? 'ok' : ''}`}>{status}</span> · slot {details.slot.toLocaleString()}</dd>
              <dt>Network fee</dt>
              <dd>{formatUnits(details.fee, 9)} COOK</dd>
              <dt>Transaction</dt>
              <dd><TxLink signature={details.signature} /></dd>
              {ref && (<><dt>Reference</dt><dd className="mono small">{ref}</dd></>)}
            </dl>
            <CopyField label="Share this receipt" value={location.href} />
          </>
        )}
        {err && <p className="error">{err}</p>}
      </div>
    </div>
  )
}
