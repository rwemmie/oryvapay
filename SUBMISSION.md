# OryvaPay: Devpost submission drafts

## Tagline
Verify intent before payment.

## Short description (about 150 words)

AI shopping agents are starting to spend real money, and a payment can be valid while the purchase is wrong: a sneaked in warranty, a hidden monthly membership, two pairs instead of one, a look-alike merchant. Dispute rules were written for humans pressing a buy button.

OryvaPay is an independent AI verification layer that sits between the agent and the money. The buyer approves a PayPal authorization, so funds are held, not taken. OryvaPay reads the order PayPal actually received, runs rule checks for the numbers and an AI review for the meaning, then captures, voids, or asks the buyer, depending on Strict, Flexible or Approval mode. If blocked, the agent fixes the order and the corrected one is captured.

Every purchase leaves an Intent Record sealed with a SHA-256 hash chain, ready as dispute evidence. Built with PayPal Orders v2, Payments v2 and xAI Grok.

## Built with (Devpost tags)
paypal, paypal-orders-api, paypal-payments-api, paypal-javascript-sdk, xai, grok, ai, node.js, express, javascript, html, css, render

## Video script (target 2:45, AI voiceover is fine, no copyrighted music)

**Scene 1 (0:00 to 0:15) Hook.** Screen: OryvaPay home page, tagline in view.
Voice: "AI agents are starting to shop for us. But a payment can be completely valid while the purchase is wrong. Your AI shopping agent shouldn't be able to spend your money on something you never agreed to buy. This is OryvaPay."

**Scene 2 (0:15 to 0:35) The problem.** Screen: README problem section with NMI, Lowenstein and AP2 links, or simple title cards.
Voice: "Who pays when an agent buys the wrong thing? Card dispute rules were written for humans. Google's AP2 defines mandates as evidence, but leaves verification and retention to others. OryvaPay checks the agent's order against your intent before money is captured, using PayPal's authorize, capture and void."

**Scene 3 (0:35 to 0:55) Intent.** Screen: type the shoe request, click "Turn into purchase rules", constraint cards appear.
Voice: "I ask for black running shoes, size 10, under 80 dollars, one pair, from StrideLab, no subscriptions, delivered by Friday. AI turns that into rules the agent must follow. I pick Strict mode."

**Scene 4 (0:55 to 1:15) The agent misbehaves.** Screen: agent cart with the red line "Added Protection Plan", total $87.98.
Voice: "The agent shops. It found the right shoes, but it also added a 12.99 Protection Plan because the merchant suggested it. Exactly the kind of thing that slips through."

**Scene 5 (1:15 to 1:35) PayPal authorization.** Screen: PayPal sandbox popup, approve.
Voice: "I approve a PayPal authorization. That only holds the funds. Nothing is taken until OryvaPay checks the order PayPal actually received."

**Scene 6 (1:35 to 1:55) Blocked.** Screen: verification checklist, red BLOCK verdict, "Authorization voided".
Voice: "OryvaPay runs rule checks for the numbers and an AI review for the meaning. Unapproved add-on, over budget. Blocked. The authorization is voided and I can see exactly why, in plain words."

**Scene 7 (1:55 to 2:15) Fix and capture.** Screen: click Fix order, clean cart, approve PayPal again, green PASS, "Payment captured: $74.99".
Voice: "One click and the agent fixes the order. I approve the corrected payment, every check passes, and PayPal captures 74.99. Exactly what I asked for."

**Scene 8 (2:15 to 2:35) Intent Record.** Screen: Live Intent Record timeline, then record page, "Hash chain verified", Download JSON.
Voice: "Every step lands in an Intent Record: my request, the approved rules, what the merchant charged, why it was blocked or allowed, the PayPal order and authorization IDs, and the final capture or void. It is sealed with a SHA-256 hash chain, so it works as dispute evidence."

**Scene 9 (2:35 to 2:45) Modes and close.** Screen: quick flash of Flexible and Approval modes, then the logo.
Voice: "Strict, Flexible or Approval, you stay in control. OryvaPay, built with PayPal and AI. Verify intent before payment."
