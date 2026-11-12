# OryvaPay

**Verify intent before payment.**

Your AI shopping agent shouldn't be able to spend your money on something you never agreed to buy.

OryvaPay is an independent AI verification layer for agentic commerce. It sits between an AI shopping agent and the payment. The buyer approves a PayPal **authorization** (funds are held, not taken), OryvaPay checks the order PayPal actually received against what the buyer asked for, and only then **captures** the payment or **voids** the authorization. Every purchase produces a tamper evident **Intent Record** that can be used as evidence if there is ever a dispute.

## The problem

AI agents are starting to buy things for people. A payment can be perfectly legitimate while the purchase itself is wrong: an extra warranty, a hidden monthly membership, two pairs instead of one, a look-alike merchant, a price that changed after the agent quoted it.

* NMI asks exactly this question, [who pays when an AI agent buys the wrong thing?](https://www.nmi.com/blog/who-pays-when-an-ai-agent-buys-the-wrong-thing/) Card network dispute rules were written for humans pressing a buy button.
* Lowenstein Sandler, [Who Said "Buy"? Agentic Payments and the Evidence Problem (October 2026)](https://www.lowenstein.com/news-insights/publications/articles/who-said-buy-agentic-payments-and-the-evidence-problem-october-2026-mushahwar-venora-wagner), describes the evidence gap when an agent, not a person, initiates a purchase.
* Google's [Agent Payments Protocol (AP2) specification](https://ap2-protocol.org/ap2/specification/) defines mandates and receipts that can serve as dispute evidence, but leaves detailed dispute resolution, evidence retrieval and retention outside its scope.

OryvaPay is not the only effort in this space and does not claim to be the first. Its focus is narrow and practical: check the agent's actual order against the buyer's actual intent **before money is captured**, using PayPal's authorize, capture and void flow, and keep the evidence.

## How it works

1. **Intent.** The buyer types a request in plain English, for example *"Black running shoes, size 10, under $80, one pair, from StrideLab, no subscriptions, deliver by Friday"*. The AI turns it into approved purchase constraints: product and attributes, quantity, max total, allowed merchant, subscriptions allowed or not, add-ons allowed or not, service fees allowed or not, delivery deadline.
2. **Agent cart.** A shopping agent builds a cart from a mock merchant store. A demo switch lets the agent or merchant sneak in a problem (unapproved $12.99 Protection Plan by default).
3. **PayPal authorization.** OryvaPay creates a PayPal Orders v2 order with `intent: AUTHORIZE` and itemized line items. The buyer approves in the PayPal popup. Funds are authorized, nothing is captured.
4. **Verification.** OryvaPay fetches the order back from PayPal (what the merchant actually charged) and runs:
   * **Rule checks** for the numbers: color and size, quantity, recurring charges, hidden service fees, unapproved add-ons and warranties, merchant, delivery deadline, price change between quote and charge, budget.
   * **AI review** for the meaning: does the item really match what the buyer described? Plus a plain words explanation and a risk score.
5. **Modes** chosen by the buyer:
   * **Strict:** any mismatch blocks capture.
   * **Flexible:** small price differences inside a set tolerance are allowed, everything else blocks.
   * **Approval:** problems are flagged and the buyer decides to capture or void.
6. **Outcome.** PASS captures the authorization. BLOCK voids it and shows exactly why. **Fix order** asks the agent to rebuild the cart without the flagged items, the buyer approves the new order, verification passes and the payment is captured.
7. **Intent Record.** Each purchase keeps the original request, approved constraints, merchant order details, AI verification result and reasoning, PayPal order and authorization IDs, and the final payment event (captured or voided) with timestamps. Every event is sealed in a SHA-256 hash chain (`hash = sha256(prevHash + canonicalJSON({seq,type,at,data}))`), so editing any past event breaks the chain. Records can be viewed, listed and downloaded as JSON.

## PayPal APIs used

| API | Use |
| --- | --- |
| `POST /v1/oauth2/token` | Client credentials OAuth |
| `POST /v2/checkout/orders` (`intent: AUTHORIZE`) | Itemized order for the agent's cart |
| PayPal JavaScript SDK Buttons (`intent=authorize`) | Buyer approval popup |
| `POST /v2/checkout/orders/{id}/authorize` | Hold the funds after buyer approval |
| `GET /v2/checkout/orders/{id}` | Read what the merchant actually charged |
| `POST /v2/payments/authorizations/{id}/capture` | Take the money when the order matches intent |
| `POST /v2/payments/authorizations/{id}/void` | Release the money when the order does not |

## AI used

* Any OpenAI compatible chat completions API, configured with `AI_BASE_URL`, `AI_API_KEY`, `AI_MODEL`. Default is **xAI Grok** (`https://api.x.ai/v1`, `grok-4`). OpenAI works by changing the base URL and model.
* AI jobs: parse the plain English request into structured constraints, and review the PayPal order against the intent (product match, extra findings, plain words explanation, risk score).
* Money logic never depends on the model alone: deterministic rule checks always run, and an AI failure falls back to a local heuristic.

## Run it

Requires Node 18 or newer.

```bash
npm install
cp .env.example .env     # optional, add keys for real PayPal sandbox and AI
npm start                # http://localhost:3000
npm test                 # end to end test against a running server (BASE=http://localhost:3000)
```

**Demo mode.** With no keys, OryvaPay runs in clearly labelled demo mode: PayPal responses are simulated with the same shapes as the real API, and a local heuristic stands in for the AI. Real mode switches on automatically when keys exist. The header shows which mode each side is in.

### Environment variables

| Variable | Required | Notes |
| --- | --- | --- |
| `PAYPAL_CLIENT_ID` | for real PayPal | Sandbox REST app client ID |
| `PAYPAL_CLIENT_SECRET` | for real PayPal | Sandbox REST app secret. Never commit it. |
| `PAYPAL_ENV` | no | `sandbox` (default) or `live` |
| `AI_API_KEY` | for real AI | xAI or OpenAI key |
| `AI_BASE_URL` | no | Default `https://api.x.ai/v1` |
| `AI_MODEL` | no | Default `grok-4` |
| `AI_TIMEOUT_MS` | no | Default 45000 |
| `PORT` | no | Default 3000 |
| `DATA_DIR` | no | Where `records.json` is stored, default `data` |
| `DEMO_MODE` | no | `true` forces demo mode |

### Deploy on Render

`render.yaml` defines a free Node web service (`npm install`, `npm start`, health check `/api/health`). Add the secrets in the Render dashboard. Note: on the free plan the disk is temporary, so Intent Records reset on redeploy.

## Project layout

```
server.js            Express API and static hosting
lib/config.js        Env and mode detection
lib/paypal.js        PayPal Orders v2 and Payments v2 client, plus demo simulator
lib/ai.js            Intent parsing and AI review (OpenAI compatible), heuristic fallback
lib/verify.js        Rule checks, mode logic, verdict
lib/catalog.js       Mock merchant store and the shopping agent with demo scenarios
lib/records.js       Intent Records with SHA-256 hash chain
public/              UI: verify wizard, records dashboard, record detail
scripts/e2e.mjs      End to end test of every scenario and mode
```

## Built with

* **PayPal** Orders v2 (authorize intent), Payments v2 (capture and void), PayPal JavaScript SDK, PayPal sandbox
* **AI:** xAI Grok through an OpenAI compatible API (swappable for OpenAI)
* Node.js, Express, vanilla HTML, CSS and JavaScript

## Known limits

* The merchant store and shopping agent are mocks so failures can be shown on demand.
* In the PayPal sandbox every order is paid to the developer's own sandbox business account. The merchant name comes from the agent's cart and the order's brand name.
* Records are stored in a JSON file, not a database.

## License

MIT
