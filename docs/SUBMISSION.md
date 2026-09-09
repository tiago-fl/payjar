# Superteam Earn submission — "Create an App on Cookie Chain"

STATUS (2026-09-09): submitted and updated on Superteam; X thread live (7 posts) and shared in the Cookie Chain Telegram; still to add: demo transaction link once the wallet has COOK.

**Live application URL:** https://tiago-fl.github.io/payjar/
**GitHub repository:** https://github.com/tiago-fl/payjar
**Addresses used:** no custom program — composes genesis programs:
System Program, SPL Token `TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA`, Token-2022 `TokenzQdBNbLqP5VEhdkAS6EPFLC1PHnBqCXEpPxuEb`,
ATA `ATokenGPvbdGVxr1b2hvZbsiqW5xWH25efTNsLJA8knL`, Memo `MemoSq4gqABAXKb96qnH8TysNcWxMyWCqXgDLGmfcHr`,
CookOven names `H43Qtq4AMQ86y7yc3YtCKZJ2QMhhnCcHyZKeFeoQn7PA`. RPC `https://rpc.cookiescan.io`.
**Demo transaction:** pending (receipt will appear at https://tiago-fl.github.io/payjar/#/receipt?ref=86MT7dMuLp99SsaSg978HzjdCGmBUZq7CXY6hWNtU3mk)
**X thread:** https://x.com/tiagocrazymania/status/2097503975859798160

## Short description (for the form)

PayJar is Solana Pay for Cookie Chain: payment links and QR codes for COOK and any SPL / Token-2022
token, paid in one Nightly transaction, with on-chain receipts and a merchant dashboard — and no backend.
Every request embeds a unique reference key in the transfer instruction, so "paid / not paid", receipts and
analytics are read straight from the chain. Recipients can be `.cook` names (CookOven program), the token
picker is powered by the Cookiescan DAS API, and payers who lack a token get a live quote from the
Cookiebox aggregator plus a link to the bridge. Open source (MIT), static site, works on any host.

## What judges can try in 60 seconds

1. https://tiago-fl.github.io/payjar/ → Create → recipient `book.cook`, 1 COOK, label "Test" → QR + link appear.
2. Open the link, connect Nightly, click **Pay** → watch the timeline go sent → confirmed → finalized.
3. Open the receipt link → amount, payer, memo, slot, fee, explorer link.
4. Dashboard → incoming payments, 14-day chart, link statuses.
   Public read-only view of any address: `#/dashboard?address=book.cook`.
