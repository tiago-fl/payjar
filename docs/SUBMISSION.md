# Superteam Earn submission — "Create an App on Cookie Chain"

Fill in the two URLs after deploying, then paste into the submission form.

**Live application URL:** https://tiago-fl.github.io/payjar/
**GitHub repository:** https://github.com/tiago-fl/payjar
**Addresses used:** no custom program — composes genesis programs:
System Program, SPL Token `TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA`, Token-2022 `TokenzQdBNbLqP5VEhdkAS6EPFLC1PHnBqCXEpPxuEb`,
ATA `ATokenGPvbdGVxr1b2hvZbsiqW5xWH25efTNsLJA8knL`, Memo `MemoSq4gqABAXKb96qnH8TysNcWxMyWCqXgDLGmfcHr`,
CookOven names `H43Qtq4AMQ86y7yc3YtCKZJ2QMhhnCcHyZKeFeoQn7PA`. RPC `https://rpc.cookiescan.io`.
**Demo transaction:** https://cookiescan.io/tx/DEMO_TX_SIGNATURE
**X thread:** https://x.com/YOUR_HANDLE/status/THREAD_ID

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
