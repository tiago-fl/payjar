# 🍪 CookiePay — payment links & on-chain receipts for Cookie Chain

**Live app:** https://tiago-fl.github.io/cookiepay/  
**Deploy:** `npm run build` → contents of `dist/` pushed to the `gh-pages` branch (GitHub Pages, legacy source).  
**Network:** Cookie Chain (SVM) · RPC `https://rpc.cookiescan.io` · Explorer [cookiescan.io](https://cookiescan.io)

CookiePay is a Solana-Pay-style payment tool built natively for Cookie Chain. A merchant, creator or friend
creates a payment request (amount + token + label), shares a link or QR code, and the payer settles it with
one transaction from [Nightly](https://nightly.app). The payment is found on-chain through a unique
*reference key* embedded in the transaction — so receipts, "paid" status and the merchant dashboard work
with **no backend, no database and no accounts**. The chain is the source of truth.

## What it does

| Feature | How |
| --- | --- |
| **Payment links & QR codes** | Amount, token (native COOK, any SPL / Token-2022 mint), label and message are encoded in the URL. A fresh reference public key is generated in the browser for every link. |
| **`.cook` names as recipients** | `bakery.cook` resolves through the CookOven name-service program (`H43Qtq4A…`), honouring the resolver field when set. Connected wallets are prefilled with their primary name. |
| **One-transaction checkout** | `SystemProgram.transfer` (COOK) or `TransferChecked` (SPL) with an idempotent ATA creation for the recipient, + the reference account, + a Memo `cookiepay\|label\|message`. |
| **Real-time status** | Building → signature → sent → **confirmed** → **finalized**, with the explorer link as soon as the signature exists. Errors (rejected, insufficient funds, expired blockhash…) are explained in plain words. |
| **Balance-aware** | Before paying, the app checks COOK for fees, the token balance and the ~0.002 COOK rent if the recipient's token account must be created. If the payer lacks the token it asks the **Cookiebox aggregator** (`agg.cookiebox.app/quote`) how much COOK the amount is worth and points to Cookiebox / the bridge. |
| **On-chain receipts** | `#/receipt?ref=…` polls `getSignaturesForAddress(reference)` until the payment lands, then shows amount, payer, label/message from the memo, slot, fee and finality. Shareable. |
| **Merchant dashboard** | Incoming COOK and SPL payments (parsed from balance deltas, works for any sender app), totals per token, USD estimate from the Cookiescan price feed, a 14-day activity chart, and the status of every link created in this browser. |
| **Token registry** | Token picker backed by the Cookiescan DAS API (`api.cookiescan.io/api/tokens`) — search 6 000+ Cookie Chain tokens or paste any mint. |

Everything runs client-side against the community RPC; the wallet only ever **signs**, the app sends the
transaction itself, so the wallet's own RPC setting can never redirect a payment to another network.

## Ecosystem integrations

- **Nightly wallet** via the Wallet Standard (`standard:connect`, `solana:signTransaction`). Any other
  wallet-standard Solana wallet works too.
- **CookOven `.cook` names** — on-chain PDA reads (`["domain", label]`, `["primary", owner]`).
- **Cookiescan DAS API** — token registry, logos, decimals, COOK/USD price.
- **Cookiebox aggregator** — swap quotes when the payer needs the requested token.
- **Hyperlane bridge** — linked whenever a payer is short on COOK for fees.
- **Memo program** — every payment carries a human-readable memo that Cookiescan shows next to the transaction.

## Run it locally

```bash
git clone https://github.com/tiago-fl/cookiepay.git
cd cookiepay
npm install
npm run dev          # http://localhost:5173
npm run build        # static site in dist/
```

Requirements: Node 20+. No environment variables — the RPC and program ids are constants in `src/lib/chain.ts`.

### Using it

1. Install [Nightly](https://nightly.app) and add Cookie Chain as a custom SVM network
   (RPC `https://rpc.cookiescan.io`, WS `https://wss.cookiescan.io`). Bridge some COOK at
   [hyperlane.cookiescan.io](https://hyperlane.cookiescan.io) for fees.
2. Open the app → **Create** → enter a recipient (your address is prefilled; `.cook` names work), an
   amount, a token and a label → **Create payment link**.
3. Send the link/QR to the payer. They open it, connect Nightly, review the request and click **Pay**.
4. Both sides get the receipt (`#/receipt?ref=…`). The **Dashboard** lists every incoming payment.

## Project layout

```
src/
  lib/chain.ts      RPC connection, constants, amount formatting
  lib/wallet.ts     Wallet Standard discovery / connect / sign
  lib/names.ts      .cook name resolution (CookOven program layout)
  lib/tokens.ts     Cookiescan token registry + on-chain mint lookup
  lib/payment.ts    request encoding, tx building, confirmation, on-chain lookups
  lib/store.ts      localStorage memory of created links
  components/       wallet context/button, token picker, QR, tx timeline
  pages/            Home (create), Pay, Receipt, Dashboard
```

## Addresses used

| | |
| --- | --- |
| RPC | `https://rpc.cookiescan.io` |
| Memo program | `MemoSq4gqABAXKb96qnH8TysNcWxMyWCqXgDLGmfcHr` |
| CookOven name service | `H43Qtq4AMQ86y7yc3YtCKZJ2QMhhnCcHyZKeFeoQn7PA` |
| SPL Token / Token-2022 / ATA | canonical program ids (genesis-embedded on Cookie Chain) |

No custom program is deployed: CookiePay composes the chain's genesis programs, which keeps it
trust-minimised and free to run.

## Security notes

- The reference key is a random public key with no private key held by anyone; it only tags the transaction.
- Links are self-describing; always check the recipient and amount shown on the pay page before signing.
- The app never asks for seed phrases or private keys and never sends anything except the signed transaction.

## License

MIT — see [LICENSE](LICENSE). `.cook` account layouts follow the MIT-licensed
[cookie-mcp](https://github.com/cookiechain/cookie-mcp) reference.
