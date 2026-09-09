import { useEffect, useState } from 'react'
import { chainStats, EXPLORER_URL } from './lib/chain'
import { useRoute } from './lib/router'
import { WalletButton } from './components/WalletButton'
import { WalletProvider } from './components/WalletContext'
import { Dashboard } from './pages/Dashboard'
import { Home } from './pages/Home'
import { Pay } from './pages/Pay'
import { Receipt } from './pages/Receipt'

function ChainBadge() {
  const [s, setS] = useState<{ slot: number; tps: number | null } | null>(null)
  const [down, setDown] = useState(false)
  useEffect(() => {
    let alive = true
    const tick = () =>
      chainStats()
        .then((x) => alive && (setS(x), setDown(false)))
        .catch(() => alive && setDown(true))
    void tick()
    const id = setInterval(tick, 10_000)
    return () => {
      alive = false
      clearInterval(id)
    }
  }, [])
  return (
    <a className={`chain-badge ${down ? 'down' : ''}`} href={EXPLORER_URL} target="_blank" rel="noreferrer" title="Cookie Chain RPC status">
      <span className="pulse" /> Cookie Chain {s ? `· slot ${s.slot.toLocaleString()}${s.tps !== null ? ` · ${s.tps} tps` : ''}` : down ? '· RPC unreachable' : ''}
    </a>
  )
}

export default function App() {
  const route = useRoute()
  const page =
    route.path === '/pay' ? <Pay params={route.params} /> :
    route.path === '/receipt' ? <Receipt params={route.params} /> :
    route.path === '/dashboard' ? <Dashboard params={route.params} /> :
    <Home />

  return (
    <WalletProvider>
      <header className="topbar">
        <a className="brand" href="#/">🍪 <span>CookiePay</span></a>
        <nav>
          <a href="#/" className={route.path === '/' ? 'active' : ''}>Create</a>
          <a href="#/dashboard" className={route.path === '/dashboard' ? 'active' : ''}>Dashboard</a>
        </nav>
        <div className="topbar-right">
          <ChainBadge />
          <WalletButton />
        </div>
      </header>
      <main>{page}</main>
      <footer className="footer">
        <span>Open source · MIT · built for the Cookie Chain cApp bounty</span>
        <span>
          <a href="https://github.com/tiago-fl/cookiepay" target="_blank" rel="noreferrer">GitHub</a> ·{' '}
          <a href="https://docs.cookiechain.wtf" target="_blank" rel="noreferrer">Cookie Chain docs</a> ·{' '}
          <a href="https://hyperlane.cookiescan.io" target="_blank" rel="noreferrer">Bridge COOK</a>
        </span>
      </footer>
    </WalletProvider>
  )
}
