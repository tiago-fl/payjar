# X thread (required by the bounty) — post from your account, then share the thread link in the Cookie Chain Telegram

1/ 🍪 Meet CookiePay — payment links for @TheCookieChain.

Create a link or QR for COOK or any SPL token, share it, get paid in one Nightly transaction, and get an on-chain receipt the second it confirms.

No backend. No account. The chain is the database.

👉 https://COOKIEPAY_LIVE_URL

2/ How it works: every request embeds a unique *reference key* in the transfer instruction (the Solana Pay trick).

So "paid / not paid", receipts and the merchant dashboard are all read straight from Cookie Chain via getSignaturesForAddress. Nothing to host, nothing to trust.

3/ For payers: connect Nightly → review the request → Pay.

Live status: building → signature → sent → confirmed → finalized, with the Cookiescan link as soon as the signature exists. Errors are explained in plain words (rejected, not enough COOK, expired…).

4/ Built with the Cookie ecosystem:
• .cook names as recipients (CookOven program)
• Cookiescan DAS API for the token picker (6 000+ tokens) and COOK price
• Cookiebox aggregator quotes when you need the token
• Hyperlane bridge link when you are short on COOK for fees

5/ For merchants and creators: the dashboard shows every incoming COOK / SPL payment, totals per token, a 14-day activity chart and the status of each link you created.

Public read-only view of any address: /#/dashboard?address=book.cook

6/ New to Cookie Chain? Bridge COOK from Solana here 👉 https://hyperlane.cookiescan.io
Then install Nightly (https://nightly.app), add RPC https://rpc.cookiescan.io and you are ready to pay or get paid.

7/ Open source, MIT, no custom program — it composes the genesis programs (System, SPL Token, Token-2022, Memo).
Code: https://github.com/COOKIEPAY_REPO

Built for the Cookie Chain cApp bounty on @SuperteamEarn 🍪
