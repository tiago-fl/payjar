import { useEffect, useMemo, useState } from 'react'
import { isPubkey, shortAddr } from '../lib/chain'
import { COOK_TOKEN, describeMint, loadRegistry, type TokenInfo } from '../lib/tokens'

export function TokenPicker({ value, onChange }: { value: TokenInfo; onChange: (t: TokenInfo) => void }) {
  const [open, setOpen] = useState(false)
  const [query, setQuery] = useState('')
  const [tokens, setTokens] = useState<TokenInfo[] | null>(null)
  const [loading, setLoading] = useState(false)
  const [err, setErr] = useState<string | null>(null)

  useEffect(() => {
    if (!open || tokens) return
    setLoading(true)
    loadRegistry()
      .then((r) => setTokens(r.tokens))
      .catch((e) => setErr(e instanceof Error ? e.message : String(e)))
      .finally(() => setLoading(false))
  }, [open, tokens])

  const results = useMemo(() => {
    const q = query.trim().toLowerCase()
    const list = tokens ?? []
    const filtered = q
      ? list.filter((t) => t.symbol.toLowerCase().includes(q) || t.name.toLowerCase().includes(q) || t.mint.toLowerCase() === q)
      : list
    return filtered.slice(0, 40)
  }, [tokens, query])

  async function pickCustomMint() {
    const mint = query.trim()
    setErr(null)
    try {
      const { info } = await describeMint(mint)
      onChange(info)
      setOpen(false)
    } catch (e) {
      setErr(e instanceof Error ? e.message : String(e))
    }
  }

  return (
    <div className="token-picker">
      <button type="button" className="token-current" onClick={() => setOpen((o) => !o)}>
        {value.logo ? <img src={value.logo} alt="" width={20} height={20} /> : <span className="token-dot" />}
        <strong>{value.symbol}</strong>
        <span className="muted small">{value.mint === COOK_TOKEN.mint ? 'native' : shortAddr(value.mint)}</span>
        <span className="chev">▾</span>
      </button>
      {open && (
        <div className="token-menu">
          <input
            autoFocus
            placeholder="Search symbol, name, or paste a mint address"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
          />
          <button type="button" className="token-row" onClick={() => { onChange(COOK_TOKEN); setOpen(false) }}>
            <span className="token-dot" /> <strong>COOK</strong> <span className="muted small">native token</span>
          </button>
          {isPubkey(query.trim()) && (
            <button type="button" className="token-row" onClick={() => void pickCustomMint()}>
              Use mint <span className="mono small">{shortAddr(query.trim(), 6)}</span>
            </button>
          )}
          {loading && <div className="muted small pad">Loading Cookiescan token registry…</div>}
          {err && <div className="error small pad">{err}</div>}
          <div className="token-scroll">
            {results.map((t) => (
              <button type="button" key={t.mint} className="token-row" onClick={() => { onChange(t); setOpen(false) }}>
                {t.logo ? <img src={t.logo} alt="" width={20} height={20} loading="lazy" /> : <span className="token-dot" />}
                <strong>{t.symbol}</strong>
                <span className="muted small">{t.name}</span>
                {t.holders !== undefined && <span className="muted small right">{t.holders} holders</span>}
              </button>
            ))}
            {tokens && results.length === 0 && <div className="muted small pad">No token matches.</div>}
          </div>
        </div>
      )}
    </div>
  )
}
