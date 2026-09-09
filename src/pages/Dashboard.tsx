import { useCallback, useEffect, useMemo, useState } from 'react'
import type { PublicKey } from '@solana/web3.js'
import { NATIVE_MINT, connection, fmtTime, fmtUsd, formatUnits, shortAddr } from '../lib/chain'
import { primaryName, resolveRecipient } from '../lib/names'
import { findSignatureByReference, incomingPayments, parseCookieMemo, paymentUrl, receiptUrl, type Transfer } from '../lib/payment'
import { loadLinks, removeLink, updateLink, type SavedLink } from '../lib/store'
import { cookUsdPrice, describeMint, type TokenInfo } from '../lib/tokens'
import { AddressLink, CopyButton, Spinner, TxLink } from '../components/ui'
import { WalletButton } from '../components/WalletButton'
import { useWallet } from '../components/WalletContext'

/** Dashboard for the connected wallet, or a read-only view of any address / .cook name via `?address=`. */
export function Dashboard({ params }: { params: URLSearchParams }) {
  const { publicKey: connected } = useWallet()
  const viewParam = params.get('address')?.trim() ?? ''
  const [viewKey, setViewKey] = useState<PublicKey | null>(null)
  const [viewErr, setViewErr] = useState<string | null>(null)
  useEffect(() => {
    if (!viewParam) {
      setViewKey(null)
      setViewErr(null)
      return
    }
    let alive = true
    resolveRecipient(viewParam)
      .then((r) => alive && setViewKey(r.address))
      .catch((e) => alive && setViewErr(e instanceof Error ? e.message : String(e)))
    return () => {
      alive = false
    }
  }, [viewParam])
  const publicKey = viewParam ? viewKey : connected
  const readOnly = !!viewParam
  const [name, setName] = useState<string | null>(null)
  const [cook, setCook] = useState<bigint | null>(null)
  const [cookUsd, setCookUsd] = useState<number | null>(null)
  const [payments, setPayments] = useState<Transfer[] | null>(null)
  const [tokens, setTokens] = useState<Record<string, TokenInfo>>({})
  const [links, setLinks] = useState<SavedLink[]>(() => loadLinks())
  const [loading, setLoading] = useState(false)
  const [err, setErr] = useState<string | null>(null)
  const [checking, setChecking] = useState<string | null>(null)

  const refresh = useCallback(async () => {
    if (!publicKey) return
    setLoading(true)
    setErr(null)
    try {
      const [n, bal, usd, list] = await Promise.all([
        primaryName(publicKey).catch(() => null),
        connection.getBalance(publicKey),
        cookUsdPrice(),
        incomingPayments(publicKey, 80),
      ])
      setName(n)
      setCook(BigInt(bal))
      setCookUsd(usd)
      setPayments(list)
      const mints = [...new Set(list.map((t) => t.mint))]
      const entries = await Promise.all(mints.map(async (m) => [m, (await describeMint(m).catch(() => null))?.info] as const))
      setTokens(Object.fromEntries(entries.filter((e): e is readonly [string, TokenInfo] => !!e[1])))
    } catch (e) {
      setErr(e instanceof Error ? e.message : String(e))
    } finally {
      setLoading(false)
    }
  }, [publicKey])

  useEffect(() => {
    void refresh()
  }, [refresh])

  const totals = useMemo(() => {
    const m = new Map<string, { raw: bigint; decimals: number; count: number }>()
    for (const t of payments ?? []) {
      const cur = m.get(t.mint) ?? { raw: 0n, decimals: t.decimals, count: 0 }
      m.set(t.mint, { raw: cur.raw + t.amountRaw, decimals: t.decimals, count: cur.count + 1 })
    }
    return [...m.entries()].sort((a, b) => b[1].count - a[1].count)
  }, [payments])

  const symbol = (mint: string) => tokens[mint]?.symbol ?? (mint === NATIVE_MINT ? 'COOK' : shortAddr(mint))
  const cookiePayCount = (payments ?? []).filter((t) => parseCookieMemo(t.memo)).length

  async function checkLink(l: SavedLink) {
    setChecking(l.ref)
    try {
      const sig = await findSignatureByReference(l.ref)
      updateLink(l.ref, { signature: sig, paidAt: sig ? Date.now() : null })
      setLinks(loadLinks())
    } finally {
      setChecking(null)
    }
  }

  if (!publicKey) {
    return (
      <div className="page narrow">
        <div className="card center">
          <h2>Your dashboard</h2>
          {viewErr ? (
            <p className="error">{viewErr}</p>
          ) : readOnly ? (
            <p className="muted"><Spinner /> Resolving {viewParam}…</p>
          ) : (
            <>
              <p className="muted">Connect a wallet to see incoming payments, totals and the status of the links you created.</p>
              <WalletButton />
              <p className="muted small" style={{ marginTop: 14 }}>
                Or look up any address / .cook name: <a href="#/dashboard?address=book.cook">#/dashboard?address=book.cook</a>
              </p>
            </>
          )}
        </div>
      </div>
    )
  }

  return (
    <div className="page">
      <div className="dash-head">
        <div>
          <span className="eyebrow">{readOnly ? 'Public view' : 'Dashboard'}</span>
          <h1>{name ?? shortAddr(publicKey.toBase58(), 6)}</h1>
          <div className="muted mono small">{publicKey.toBase58()}</div>
        </div>
        <button className="btn btn-ghost" onClick={() => void refresh()} disabled={loading}>{loading ? <Spinner /> : '↻ Refresh'}</button>
      </div>

      <div className="stats">
        <div className="stat">
          <div className="stat-label">COOK balance</div>
          <div className="stat-value">{cook !== null ? formatUnits(cook, 9, 4) : '…'}</div>
          {cook !== null && cookUsd && <div className="muted small">≈ {fmtUsd(Number(formatUnits(cook, 9)) * cookUsd)}</div>}
        </div>
        <div className="stat">
          <div className="stat-label">Incoming transfers</div>
          <div className="stat-value">{payments ? payments.length : '…'}</div>
          <div className="muted small">{cookiePayCount} via CookiePay links · last 80 txs</div>
        </div>
        {totals.slice(0, 2).map(([mint, t]) => (
          <div className="stat" key={mint}>
            <div className="stat-label">Received {symbol(mint)}</div>
            <div className="stat-value">{formatUnits(t.raw, t.decimals, 4)}</div>
            <div className="muted small">{t.count} payment{t.count === 1 ? '' : 's'}</div>
          </div>
        ))}
      </div>

      {err && <p className="error">{err}</p>}

      <div className="grid-2">
        <div className="card">
          <h2>Activity (last 14 days)</h2>
          <ActivityChart payments={payments ?? []} />
        </div>
        <div className="card">
          <h2>My payment links</h2>
          {links.length === 0 && <p className="muted">Links you create are remembered in this browser. <a href="#/">Create one</a>.</p>}
          <ul className="link-list">
            {links.map((l) => (
              <li key={l.ref}>
                <div>
                  <strong>{l.amount} {l.mint === NATIVE_MINT ? 'COOK' : symbol(l.mint)}</strong>
                  {l.label && <span className="muted"> · {l.label}</span>}
                  <div className="muted small">{new Date(l.createdAt).toLocaleString()} · to {l.to.length > 20 ? shortAddr(l.to) : l.to}</div>
                </div>
                <div className="link-actions">
                  {l.signature ? (
                    <a className="badge ok" href={receiptUrl(l.ref)}>paid ✓</a>
                  ) : (
                    <button className="btn btn-ghost btn-sm" onClick={() => void checkLink(l)} disabled={checking === l.ref}>
                      {checking === l.ref ? <Spinner /> : 'Check'}
                    </button>
                  )}
                  <CopyButton text={paymentUrl(l)} label="Copy link" />
                  <button className="btn btn-ghost btn-sm" onClick={() => { removeLink(l.ref); setLinks(loadLinks()) }} aria-label="Remove">✕</button>
                </div>
              </li>
            ))}
          </ul>
        </div>
      </div>

      <div className="card">
        <h2>Incoming payments</h2>
        {payments === null ? (
          <p className="muted"><Spinner /> Reading the chain…</p>
        ) : payments.length === 0 ? (
          <p className="muted">Nothing received yet. Share a payment link and it will show up here within a second of confirmation.</p>
        ) : (
          <div className="table-wrap">
            <table>
              <thead>
                <tr><th>When</th><th>Amount</th><th>From</th><th>For</th><th>Tx</th></tr>
              </thead>
              <tbody>
                {payments.map((t, i) => {
                  const memo = parseCookieMemo(t.memo)
                  return (
                    <tr key={t.signature + i} className={t.err ? 'muted' : ''}>
                      <td>{fmtTime(t.blockTime)}</td>
                      <td><strong>{formatUnits(t.amountRaw, t.decimals, 6)} {symbol(t.mint)}</strong></td>
                      <td>{t.from ? <AddressLink address={t.from} /> : '—'}</td>
                      <td>{memo ? <>{memo.label}{memo.message && <span className="muted"> — {memo.message}</span>}</> : t.memo ? <span className="muted small">{t.memo.slice(0, 60)}</span> : <span className="muted">—</span>}</td>
                      <td><TxLink signature={t.signature} /></td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  )
}

function ActivityChart({ payments }: { payments: Transfer[] }) {
  const days = 14
  const now = new Date()
  const buckets = Array.from({ length: days }, (_, i) => {
    const d = new Date(now)
    d.setDate(now.getDate() - (days - 1 - i))
    d.setHours(0, 0, 0, 0)
    return { day: d, count: 0, cook: 0 }
  })
  for (const t of payments) {
    if (!t.blockTime) continue
    const d = new Date(t.blockTime * 1000)
    d.setHours(0, 0, 0, 0)
    const b = buckets.find((x) => x.day.getTime() === d.getTime())
    if (!b) continue
    b.count++
    if (t.mint === NATIVE_MINT) b.cook += Number(formatUnits(t.amountRaw, 9))
  }
  const max = Math.max(1, ...buckets.map((b) => b.count))
  const W = 560, H = 160, pad = 24
  const bw = (W - pad * 2) / days
  return (
    <div className="chart-wrap">
      <svg viewBox={`0 0 ${W} ${H}`} className="chart" role="img" aria-label="Payments per day">
        {buckets.map((b, i) => {
          const h = (b.count / max) * (H - pad * 2)
          const x = pad + i * bw + 4
          return (
            <g key={i}>
              <rect x={x} y={H - pad - h} width={bw - 8} height={h} rx={4} className={b.count ? 'bar' : 'bar bar-empty'} />
              {b.count > 0 && <text x={x + (bw - 8) / 2} y={H - pad - h - 4} textAnchor="middle" className="bar-label">{b.count}</text>}
              <text x={x + (bw - 8) / 2} y={H - 6} textAnchor="middle" className="axis">{b.day.getDate()}</text>
            </g>
          )
        })}
      </svg>
      <div className="muted small">Payments per day · {buckets.reduce((s, b) => s + b.count, 0)} in the last {days} days · {buckets.reduce((s, b) => s + b.cook, 0).toLocaleString('en-US', { maximumFractionDigits: 2 })} COOK</div>
    </div>
  )
}
