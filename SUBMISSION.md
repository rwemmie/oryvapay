# OryvaPay: Devpost submission drafts

## Tagline
Verify intent before payment.

## Short description (about 150 words)

A payment can be legitimate while the purchase is wrong. When an AI agent shops for you, the risk is not only a hijacked agent. It is the sneaky stuff: a $12.99 warranty, a monthly membership, a hidden service fee, a price that rose after you approved, shipping that misses your deadline.

OryvaPay is an independent verification layer between the agent and the money. You approve a PayPal authorization, so funds are held, not taken. OryvaPay reads the order PayPal actually received, runs its sneaky charges detector and an AI intent check, then captures, voids, or asks you, in Strict, Flexible or Approval mode.

Every purchase leaves an Intent Record sealed with a SHA-256 hash chain, plus a one click Dispute Evidence Pack that a buyer or merchant can attach to a PayPal dispute, including the "wrong item" claims that Seller Protection does not cover. Built with PayPal Orders v2, Payments v2 and AI.

## Built with (Devpost tags)
paypal, paypal-orders-api, paypal-payments-api, paypal-javascript-sdk, groq, gpt-oss, ai, node.js, express, javascript, html, css, render

## Video script (target 2:45, AI voiceover is fine, no copyrighted music)

**Scene 1 (0:00 to 0:15) Hook.** Screen: OryvaPay home page, tagline in view.
Voice: "AI agents are starting to shop for us. A payment can be legitimate while the purchase is wrong. Your AI shopping agent shouldn't be able to spend your money on something you never agreed to buy. This is OryvaPay."

**Scene 2 (0:15 to 0:35) The problem.** Screen: README problem section with NMI, Lowenstein and AP2 links, or simple title cards.
Voice: "Who pays when an agent buys the wrong thing? Card dispute rules were written for humans. Google's AP2 defines mandates as evidence, but leaves verification and retention to others. OryvaPay checks the agent's order against your intent before money is captured, using PayPal's authorize, capture and void."

**Scene 3 (0:35 to 0:55) Intent.** Screen: type the shoe request, click "Turn into purchase rules", constraint cards appear.
Voice: "I ask for black running shoes, size 10, under 80 dollars, one pair, from StrideLab, no subscriptions, delivered by Friday. AI turns that into rules the agent must follow. I pick Strict mode."

**Scene 4 (0:55 to 1:15) The agent misbehaves.** Screen: agent cart with the red line "Added Protection Plan", total $87.98.
Voice: "The agent shops. It found the right shoes, but it also added a 12.99 Protection Plan because the merchant suggested it. Exactly the kind of thing that slips through."

**Scene 5 (1:15 to 1:35) PayPal authorization.** Screen: PayPal sandbox popup, approve.
Voice: "I approve a PayPal authorization. That only holds the funds. Nothing is taken until OryvaPay checks the order PayPal actually received."

**Scene 6 (1:35 to 1:55) Sneaky charge caught.** Screen: red BLOCK verdict, "Sneaky charge caught: Add-ons and warranties", the Sneaky charges detector group, "Authorization voided".
Voice: "The sneaky charges detector checks for hidden fees, add-on warranties, surprise subscriptions, price changes after approval, and delivery terms. AI checks the product itself. Caught: an add-on I never agreed to. The authorization is voided, nothing is taken, and I see exactly why."

**Scene 7 (1:55 to 2:15) Fix and capture.** Screen: click Fix order, clean cart, approve PayPal again, green PASS, "Payment captured: $74.99".
Voice: "One click and the agent fixes the order. I approve the corrected payment, every check passes, and PayPal captures 74.99. Exactly what I asked for."

**Scene 8 (2:15 to 2:35) Evidence.** Screen: record page, "Hash chain verified", flip to Merchant view, click Dispute Evidence Pack, show the printable page.
Voice: "Every step lands in an Intent Record sealed with a SHA-256 hash chain. One click makes a Dispute Evidence Pack with the request, the rules, the charged lines, the verdict and the PayPal IDs. Merchants can use it for 'wrong item' disputes, which PayPal Seller Protection for agent checkout does not cover."

**Scene 9 (2:35 to 2:45) Modes and close.** Screen: quick flash of Flexible and Approval modes, then the logo.
Voice: "Strict, Flexible or Approval, you stay in control. OryvaPay, built with PayPal and AI. Verify intent before payment."
