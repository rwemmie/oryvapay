// OryvaPay verification engine.
// Deterministic rule checks handle the numbers (so money logic never depends on a model guessing),
// and the AI review handles meaning (does this item match what the buyer described?).
import { aiReview } from './ai.js';

const RECURRING_RE = /(monthly|per month|\/mo\b|yearly|annual|auto.?renew|subscription|membership|billed every)/i;
const ADDON_RE = /(protection|warranty|insurance|care plan|guarantee|extended)/i;
const r2 = n => Math.round(n * 100) / 100;

// Turn the PayPal order (what the merchant actually charged) into flat lines, enriched with the agent cart.
export function orderLines(paypalOrder, cart) {
  const pu = paypalOrder.purchase_units?.[0] || {};
  const bySku = Object.fromEntries(cart.items.map(i => [i.sku, i]));
  const lines = (pu.items || []).map(it => {
    const c = bySku[it.sku] || {};
    const text = `${it.name} ${it.description || ''}`;
    return {
      sku: it.sku, name: it.name, description: it.description || '',
      quantity: Number(it.quantity), unitPrice: Number(it.unit_amount?.value),
      quotedUnitPrice: c.quotedUnitPrice ?? null,
      kind: c.kind || (RECURRING_RE.test(text) ? 'subscription' : ADDON_RE.test(text) ? 'warranty' : 'product'),
      recurring: c.recurring || (RECURRING_RE.test(text) ? 'recurring' : null),
      url: c.url || null, image: c.image || null, paypalUrl: it.url || null, paypalImageUrl: it.image_url || null,
    };
  });
  const bd = pu.amount?.breakdown || {};
  return {
    lines,
    shipping: Number(bd.shipping?.value || 0),
    handling: Number(bd.handling?.value || 0),
    total: Number(pu.amount?.value || 0),
    currency: pu.amount?.currency_code || 'USD',
    merchant: cart.merchant,
    delivery: cart.shipping,
  };
}

// Checks that catch charges a buyer never agreed to, even when the payment itself is legitimate.
export const SNEAKY = ['service_fees', 'addons', 'recurring', 'price_change', 'delivery'];

export function ruleChecks(constraints, order) {
  const checks = [];
  const add = (id, label, status, detail, lineItems = []) => checks.push({ id, label, status, detail, lineItems, source: 'rule', group: SNEAKY.includes(id) ? 'sneaky' : 'intent' });
  const main = order.lines.find(l => l.kind === 'product') || order.lines[0];

  // Hard attributes (color, size) must literally appear on the charged line. Safety net under the AI review.
  const hard = Object.entries(constraints.product?.attributes || {}).filter(([k]) => ['color', 'size'].includes(k));
  if (main && hard.length) {
    const text = `${main.name} ${main.description}`.toLowerCase();
    const miss = hard.filter(([k, v]) => !new RegExp(`\\b${String(v).toLowerCase().replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\b`).test(text));
    if (miss.length) add('attributes', 'Color and size', 'fail', `You asked for ${miss.map(([k, v]) => `${k} ${v}`).join(' and ')}, but the order says "${main.name}".`, [main.sku]);
    else add('attributes', 'Color and size', 'pass', `${hard.map(([k, v]) => `${k} ${v}`).join(', ')} confirmed on the order.`);
  }

  // Quantity
  const wantQty = constraints.quantity || 1;
  if (main && main.quantity !== wantQty) add('quantity', 'Quantity', 'fail', `You asked for ${wantQty}, but the order has ${main.quantity}.`, [main.sku]);
  else add('quantity', 'Quantity', 'pass', `Quantity is ${wantQty}, as requested.`);

  // Recurring charges
  const rec = order.lines.filter(l => l.recurring || l.kind === 'subscription');
  if (rec.length && !constraints.recurringAllowed) add('recurring', 'Surprise subscriptions', 'fail', `${rec.map(l => `"${l.name}" ($${l.unitPrice.toFixed(2)}, ${l.recurring || 'recurring'})`).join(', ')} would bill you again later. You did not agree to any subscription.`, rec.map(l => l.sku));
  else add('recurring', 'Surprise subscriptions', 'pass', 'No subscriptions or repeat billing.');

  // Hidden service fees
  const feeLines = order.lines.filter(l => l.kind === 'fee');
  if ((order.handling > 0 || feeLines.length) && !constraints.serviceFeesAllowed) add('service_fees', 'Hidden fees', 'fail', `A $${(order.handling + feeLines.reduce((s, l) => s + l.unitPrice * l.quantity, 0)).toFixed(2)} service fee was added that you never saw or approved.`, feeLines.map(l => l.sku));
  else add('service_fees', 'Hidden fees', 'pass', 'No hidden service or handling fees.');

  // Unapproved add-ons and warranties
  const extras = order.lines.filter(l => l.kind === 'warranty' || l.kind === 'addon');
  if (extras.length && !constraints.extrasAllowed) add('addons', 'Add-ons and warranties', 'fail', `${extras.map(l => `"${l.name}" ($${l.unitPrice.toFixed(2)})`).join(', ')} was added without your permission.`, extras.map(l => l.sku));
  else add('addons', 'Add-ons and warranties', 'pass', 'Nothing extra was added.');

  // Merchant
  const allowed = (constraints.allowedMerchants || []).map(m => m.toLowerCase());
  if (allowed.length && !allowed.includes(order.merchant.name.toLowerCase())) add('merchant', 'Merchant', 'fail', `You asked to buy from ${constraints.allowedMerchants.join(' or ')}, but this payment goes to "${order.merchant.name}".`);
  else if (order.merchant.verified === false) add('merchant', 'Merchant', 'fail', `"${order.merchant.name}" is not a verified merchant.`);
  else add('merchant', 'Merchant', 'pass', `Paying ${order.merchant.name}${allowed.length ? ', the store you named' : ''}.`);

  // Delivery
  if (constraints.deliveryDeadline && order.delivery?.eta && order.delivery.eta > constraints.deliveryDeadline) add('delivery', 'Delivery terms', 'fail', `You need it by ${fmtDate(constraints.deliveryDeadline)}, but "${order.delivery.method}" arrives ${fmtDate(order.delivery.eta)}.`);
  else add('delivery', 'Delivery terms', 'pass', constraints.deliveryDeadline ? `Arrives ${fmtDate(order.delivery?.eta)}, before your ${fmtDate(constraints.deliveryDeadline)} deadline.` : 'No delivery deadline set.');

  // Price change between the agent's quote and what the merchant charged
  const changed = order.lines.filter(l => l.quotedUnitPrice != null && r2(l.unitPrice) !== r2(l.quotedUnitPrice));
  if (changed.length) {
    const delta = r2(changed.reduce((s, l) => s + (l.unitPrice - l.quotedUnitPrice) * l.quantity, 0));
    add('price_change', 'Price change after approval', 'fail', changed.map(l => `"${l.name}" was quoted at $${l.quotedUnitPrice.toFixed(2)} but charged at $${l.unitPrice.toFixed(2)}.`).join(' '), changed.map(l => l.sku));
    checks[checks.length - 1].delta = delta;
  } else add('price_change', 'Price change after approval', 'pass', 'Prices match what the agent quoted.');

  // Budget
  if (constraints.maxBudget != null && order.total > constraints.maxBudget) {
    add('budget', 'Budget', 'fail', `The total is $${order.total.toFixed(2)}, which is over your $${constraints.maxBudget.toFixed(2)} limit.`);
    checks[checks.length - 1].delta = r2(order.total - constraints.maxBudget);
  } else add('budget', 'Budget', 'pass', constraints.maxBudget != null ? `Total $${order.total.toFixed(2)} is within your $${constraints.maxBudget.toFixed(2)} limit.` : 'No budget set.');

  return checks;
}

function fmtDate(iso) {
  if (!iso) return 'unknown';
  return new Date(iso + 'T12:00:00Z').toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric', timeZone: 'UTC' });
}

export const MODES = {
  strict: 'Strict: any mismatch blocks the payment.',
  flexible: 'Flexible: small price differences inside your tolerance are allowed, everything else blocks.',
  approval: 'Approval: OryvaPay flags problems and asks you before taking the money.',
};

export async function verify({ constraints, paypalOrder, cart, mode = 'strict', tolerance = 5 }) {
  const order = orderLines(paypalOrder, cart);
  const rules = ruleChecks(constraints, order);
  let review;
  try {
    review = await aiReview({ constraints, order, ruleChecks: rules });
  } catch (e) {
    review = { semanticChecks: [], extraFindings: [], explanation: 'The AI reviewer was unavailable, so only rule checks were applied.', reviewedBy: 'unavailable', error: e.message };
  }
  const product = (review.semanticChecks || []).find(c => c.id === 'product_match');
  const checks = [
    { id: 'product_match', label: 'Product match', status: product?.status === 'fail' ? 'fail' : 'pass', detail: product?.detail || 'Product matches the request.', lineItems: product?.lineItems || [], source: 'ai', group: 'intent' },
    ...rules,
    ...(review.extraFindings || []).map(f => ({ ...f, label: f.label || f.id, source: 'ai', group: 'intent' })),
  ];

  // Flexible mode: small price differences within tolerance become warnings.
  if (mode === 'flexible') {
    for (const c of checks) {
      if ((c.id === 'price_change' || c.id === 'budget') && c.status === 'fail' && Math.abs(c.delta || 0) <= tolerance) {
        c.status = 'warn';
        c.detail += ` Allowed because it is within your $${Number(tolerance).toFixed(2)} tolerance.`;
      }
    }
  }

  const fails = checks.filter(c => c.status === 'fail');
  let verdict = 'PASS';
  if (fails.length) verdict = mode === 'approval' ? 'NEEDS_APPROVAL' : 'BLOCK';

  const headline = verdict === 'PASS'
    ? 'Order matches your intent. Safe to capture.'
    : verdict === 'BLOCK'
      ? `Blocked: ${fails.length} problem${fails.length > 1 ? 's' : ''} found. Your money will not be taken.`
      : `${fails.length} problem${fails.length > 1 ? 's' : ''} found. Your approval is needed before any money moves.`;

  return {
    verdict, mode, tolerance: Number(tolerance), headline,
    explanation: review.explanation,
    riskScore: review.riskScore ?? null,
    reviewedBy: review.reviewedBy,
    aiError: review.error || null,
    checks,
    failedChecks: fails.map(f => f.id),
    sneakyCharges: fails.filter(f => f.group === 'sneaky').map(f => ({ id: f.id, label: f.label, detail: f.detail })),
    offendingSkus: [...new Set(fails.flatMap(f => f.lineItems || []))],
    order,
    verifiedAt: new Date().toISOString(),
  };
}
