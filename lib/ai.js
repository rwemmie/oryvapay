// AI layer. Uses any OpenAI-compatible chat completions API (xAI Grok by default, OpenAI works too).
// When no AI key is set, a local heuristic stands in so the demo still runs end to end.
import { config } from './config.js';

const isCrynux = () => /crynux/i.test(config.ai.baseUrl);

async function chatJSON(system, user) {
  const body = {
    model: config.ai.model,
    temperature: 0,
    max_tokens: 1200,
    response_format: { type: 'json_object' },
    messages: [{ role: 'system', content: system }, { role: 'user', content: user }],
  };
  // Crynux routes tasks by GPU memory. vram_limit is a Crynux only field, so it is never sent to other providers.
  if (isCrynux()) body.vram_limit = Number(process.env.AI_VRAM_LIMIT || 24);
  const timeout = Number(process.env.AI_TIMEOUT_MS || (isCrynux() ? 90000 : 45000));
  const send = b => fetch(`${config.ai.baseUrl}/chat/completions`, {
    method: 'POST',
    signal: AbortSignal.timeout(timeout),
    headers: { Authorization: `Bearer ${config.ai.apiKey}`, 'Content-Type': 'application/json' },
    body: JSON.stringify(b),
  });
  let res = await send(body);
  if (res.status === 400 || res.status === 422) {
    // Some OpenAI compatible servers reject response_format. Retry once without it; the prompt still asks for JSON.
    delete body.response_format;
    res = await send(body);
  }
  const json = await res.json();
  if (!res.ok) throw new Error(`AI request failed: ${json.error?.message || json.message || res.status}`);
  const text = json.choices?.[0]?.message?.content || '{}';
  const m = text.match(/\{[\s\S]*\}/);
  return JSON.parse(m ? m[0] : text);
}

const DAYS = ['sunday', 'monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday'];

export function resolveDeadline(text, now = new Date()) {
  if (!text) return null;
  const t = text.toLowerCase();
  if (/\btomorrow\b/.test(t)) { const d = new Date(now); d.setDate(d.getDate() + 1); return d.toISOString().slice(0, 10); }
  const iso = t.match(/\d{4}-\d{2}-\d{2}/);
  if (iso) return iso[0];
  for (let i = 0; i < 7; i++) {
    if (t.includes(DAYS[i])) {
      const d = new Date(now);
      let diff = (i - d.getDay() + 7) % 7;
      if (diff === 0) diff = 7;
      d.setDate(d.getDate() + diff);
      return d.toISOString().slice(0, 10);
    }
  }
  return null;
}

const SCHEMA_HINT = `{
  "summary": "one sentence restating what the buyer wants",
  "product": { "category": "e.g. running shoes", "attributes": { "color": "black", "size": "10" }, "description": "short" },
  "quantity": 1,
  "maxBudget": 80,
  "currency": "USD",
  "allowedMerchants": [],
  "recurringAllowed": false,
  "extrasAllowed": false,
  "serviceFeesAllowed": false,
  "deliveryDeadlineText": "Friday",
  "notes": []
}`;

// ---------- intent parsing ----------
export async function parseIntent(request) {
  if (config.aiLive) {
    try {
    const today = new Date().toISOString().slice(0, 10);
    const out = await chatJSON(
      `You turn a shopper's plain English request into strict purchase constraints for an AI shopping agent. Today is ${today}. ` +
      `Return only JSON matching this shape: ${SCHEMA_HINT}. Use null when the buyer did not say. ` +
      `allowedMerchants is empty unless the buyer named stores. recurringAllowed, extrasAllowed and serviceFeesAllowed are false unless the buyer clearly allowed them. ` +
      `maxBudget is the total the buyer will spend, as a number.`,
      request,
    );
    return normalize(out, request, 'ai');
    } catch (e) {
      console.error('AI parse failed, using heuristic:', e.message);
      return { ...normalize(heuristicParse(request), request, 'heuristic'), aiError: e.message };
    }
  }
  return normalize(heuristicParse(request), request, 'heuristic');
}

function normalize(c, request, source) {
  const out = {
    summary: c.summary || request,
    product: { category: c.product?.category || null, attributes: Object.fromEntries(Object.entries(c.product?.attributes || {}).filter(([, v]) => v != null && v !== '').map(([k, v]) => [k, String(v).toLowerCase()])), description: c.product?.description || null },
    quantity: Number(c.quantity) || 1,
    maxBudget: c.maxBudget != null ? Number(c.maxBudget) : null,
    currency: c.currency || 'USD',
    allowedMerchants: Array.isArray(c.allowedMerchants) ? c.allowedMerchants.filter(Boolean) : [],
    recurringAllowed: Boolean(c.recurringAllowed),
    extrasAllowed: Boolean(c.extrasAllowed),
    serviceFeesAllowed: Boolean(c.serviceFeesAllowed),
    deliveryDeadlineText: c.deliveryDeadlineText || null,
    notes: c.notes || [],
    parsedBy: source,
  };
  out.deliveryDeadline = resolveDeadline(out.deliveryDeadlineText);
  return out;
}

const COLORS = ['black', 'white', 'red', 'blue', 'green', 'grey', 'gray', 'navy', 'pink', 'brown'];
const WORDNUM = { one: 1, a: 1, single: 1, two: 2, three: 3, four: 4 };

export function heuristicParse(request) {
  const t = request.toLowerCase();
  const attrs = {};
  const color = COLORS.find(c => new RegExp(`\\b${c}\\b`).test(t));
  if (color) attrs.color = color;
  const size = t.match(/size\s*(\d+(?:\.\d+)?)/);
  if (size) attrs.size = size[1];
  const budget = t.match(/(?:under|below|max(?:imum)?|less than|up to|budget(?: of)?)\s*\$?\s*(\d+(?:\.\d+)?)/) || t.match(/\$\s*(\d+(?:\.\d+)?)/);
  let qty = 1;
  const q = t.match(/\b(\d+|one|a|single|two|three|four)\s+(?:pair|pairs|unit|units|item|items|piece|pieces)\b/);
  if (q) qty = WORDNUM[q[1]] || Number(q[1]) || 1;
  let category = null;
  for (const c of ['running shoes', 'trail shoes', 'shoes', 'sneakers', 'earbuds', 'headphones', 'water bottle', 'bottle']) if (t.includes(c)) { category = c === 'sneakers' ? 'shoes' : c; break; }
  const merchants = [];
  const from = request.match(/\bfrom\s+([A-Z][\w]+)/);
  if (from) merchants.push(from[1]);
  const deadline = t.match(/(?:deliver(?:ed)?|arrive|arriving|by)\s+(?:by\s+)?(tomorrow|monday|tuesday|wednesday|thursday|friday|saturday|sunday|\d{4}-\d{2}-\d{2})/);
  const noSubs = /no (subscriptions?|recurring|memberships?)/.test(t);
  const noExtras = !/(add-?ons? (are )?ok|extras? (are )?ok|warranty (is )?ok)/.test(t);
  return {
    summary: request.trim(),
    product: { category, attributes: attrs, description: category },
    quantity: qty,
    maxBudget: budget ? Number(budget[1]) : null,
    allowedMerchants: merchants,
    recurringAllowed: noSubs ? false : /subscription (is )?ok/.test(t),
    extrasAllowed: !noExtras,
    serviceFeesAllowed: false,
    deliveryDeadlineText: deadline ? deadline[1] : null,
    notes: [],
  };
}

// ---------- semantic verification ----------
// The AI reviews the order against the intent and the deterministic findings.
// It can add findings (for example a product attribute mismatch) and explains the verdict in plain words.
export async function aiReview({ constraints, order, ruleChecks }) {
  if (config.aiLive) {
    try {
    const out = await chatJSON(
      `You are OryvaPay, an independent verification agent that sits between an AI shopping agent and a PayPal payment capture. ` +
      `You compare what the buyer asked for with what the merchant actually put on the PayPal order. Be strict and concrete. ` +
      `Return only JSON: {"semanticChecks":[{"id":"product_match","status":"pass|fail","detail":"plain words","lineItems":["sku"]}],` +
      `"extraFindings":[{"id":"short_id","label":"Short label","status":"fail|warn","detail":"plain words","lineItems":["sku"]}],` +
      `"explanation":"2 to 3 plain sentences for the buyer, no jargon, no dashes","riskScore":0-100}. ` +
      `semanticChecks must contain exactly one entry with id product_match judging whether the main product matches the requested product and attributes. ` +
      `Only add extraFindings for real problems the deterministic checks missed.`,
      JSON.stringify({ buyerIntent: constraints, paypalOrderLines: order, deterministicChecks: ruleChecks }),
    );
    return { ...out, reviewedBy: `${config.ai.model} via ${new URL(config.ai.baseUrl).host}` };
    } catch (e) {
      console.error('AI review failed, using heuristic:', e.message);
      return { ...heuristicReview({ constraints, order, ruleChecks }), reviewedBy: 'local heuristic (AI call failed)', error: e.message };
    }
  }
  return heuristicReview({ constraints, order, ruleChecks });
}

function heuristicReview({ constraints, order, ruleChecks }) {
  const main = order.lines.find(l => l.kind === 'product') || order.lines[0];
  const want = constraints.product?.attributes || {};
  const misses = [];
  const nameLc = `${main?.name || ''} ${main?.description || ''}`.toLowerCase();
  for (const [k, v] of Object.entries(want)) {
    if (!nameLc.includes(String(v).toLowerCase())) misses.push(`${k} should be ${v}`);
  }
  const cat = (constraints.product?.category || '').toLowerCase();
  if (cat && !cat.split(' ').some(w => w.length > 3 && nameLc.includes(w.replace(/s$/, '')) ) && !nameLc.includes('runner')) misses.push(`item does not look like ${cat}`);
  const fails = ruleChecks.filter(c => c.status === 'fail');
  const productCheck = misses.length
    ? { id: 'product_match', status: 'fail', detail: `The main item does not match your request: ${misses.join(', ')}.`, lineItems: [main?.sku] }
    : { id: 'product_match', status: 'pass', detail: `${main?.name} matches what you asked for.`, lineItems: [main?.sku] };
  const allFails = [...fails, ...(productCheck.status === 'fail' ? [productCheck] : [])];
  const explanation = allFails.length
    ? `This order does not match what you asked for. ${allFails.map(f => f.detail).join(' ')}`
    : 'Everything on this order matches what you asked for, so it is safe to take the payment.';
  return { semanticChecks: [productCheck], extraFindings: [], explanation, riskScore: Math.min(100, allFails.length * 35), reviewedBy: 'local heuristic (demo mode, no AI key set)' };
}
