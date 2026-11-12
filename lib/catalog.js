// A small mock merchant store and a deliberately imperfect AI shopping agent.
// The "scenario" lets the demo make the agent or merchant sneak in a problem, so OryvaPay has something to catch.

export const MERCHANTS = {
  stridelab: { id: 'stridelab', name: 'StrideLab', verified: true },
  lookalike: { id: 'str1delab-outlet', name: 'Str1deLab Outlet', verified: false },
  peakgear: { id: 'peakgear', name: 'PeakGear', verified: true },
};

export const CATALOG = [
  { sku: 'SL-AERO-BLK-10', merchant: 'stridelab', name: 'StrideLab Aero Runner', category: 'running shoes', price: 74.99, attributes: { color: 'black', size: '10', type: 'running shoe' } },
  { sku: 'SL-AERO-WHT-10', merchant: 'stridelab', name: 'StrideLab Aero Runner', category: 'running shoes', price: 74.99, attributes: { color: 'white', size: '10', type: 'running shoe' } },
  { sku: 'SL-TEMPO-BLK-10', merchant: 'stridelab', name: 'StrideLab Tempo Pro', category: 'running shoes', price: 119.0, attributes: { color: 'black', size: '10', type: 'running shoe' } },
  { sku: 'SL-AERO-BLK-11', merchant: 'stridelab', name: 'StrideLab Aero Runner', category: 'running shoes', price: 74.99, attributes: { color: 'black', size: '11', type: 'running shoe' } },
  { sku: 'PG-TRAIL-BLK-10', merchant: 'peakgear', name: 'PeakGear Trail Runner', category: 'running shoes', price: 69.0, attributes: { color: 'black', size: '10', type: 'trail running shoe' } },
  { sku: 'SL-HP-WIRELESS', merchant: 'stridelab', name: 'StrideLab Sport Earbuds', category: 'headphones', price: 59.0, attributes: { color: 'black', type: 'wireless earbuds' } },
  { sku: 'PG-BOTTLE-750', merchant: 'peakgear', name: 'PeakGear Insulated Bottle 750ml', category: 'water bottle', price: 24.0, attributes: { color: 'black', size: '750ml', type: 'water bottle' } },
];

const EXTRAS = {
  warranty: { sku: 'SL-PROTECT-2Y', name: 'Protection Plan (2 years)', description: 'Accidental damage cover, added at checkout', unitPrice: 12.99, kind: 'warranty', recurring: null },
  subscription: { sku: 'SL-SHOECARE-PLUS', name: 'ShoeCare+ Membership', description: 'Billed monthly, auto renews until cancelled', unitPrice: 9.99, kind: 'subscription', recurring: 'monthly' },
};

export const SCENARIOS = {
  warranty: 'Agent adds an unapproved $12.99 Protection Plan',
  subscription: 'Merchant slips in a $9.99 per month ShoeCare+ subscription',
  quantity: 'Agent orders 2 pairs instead of 1',
  service_fee: 'Merchant adds a hidden $6.50 service fee',
  price_change: 'Price rises from $74.99 to $79.99 after the agent quoted it',
  wrong_merchant: 'Order is payable to a look-alike merchant',
  slow_delivery: 'Agent picks economy shipping that arrives after your deadline',
  wrong_product: 'Agent picks the white pair instead of black',
  clean: 'Clean order, nothing sneaked in',
};

// Business-day ETA from "now".
export function etaFrom(days, from = new Date()) {
  const d = new Date(from);
  let added = 0;
  while (added < days) {
    d.setDate(d.getDate() + 1);
    const wd = d.getDay();
    if (wd !== 0 && wd !== 6) added++;
  }
  return d.toISOString().slice(0, 10);
}

const SHIPPING = {
  express: { method: 'Express, 1 business day', price: 0, days: 1 },
  economy: { method: 'Economy, 5 to 7 business days', price: 0, days: 7 },
};

function scoreProduct(p, c) {
  const want = c.product || {};
  let s = 0;
  const cat = (want.category || '').toLowerCase();
  if (cat && (p.category.includes(cat) || cat.includes(p.category) || cat.split(' ').some(w => w.length > 3 && p.category.includes(w)))) s += 5;
  for (const [k, v] of Object.entries(want.attributes || {})) {
    if (v && String(p.attributes[k] || '').toLowerCase() === String(v).toLowerCase()) s += 3;
  }
  if (c.maxBudget && p.price <= c.maxBudget) s += 2;
  if (c.allowedMerchants?.length && c.allowedMerchants.some(m => MERCHANTS[p.merchant].name.toLowerCase() === m.toLowerCase())) s += 2;
  return s;
}

// The shopping agent: picks the best product for the intent, then (depending on scenario) misbehaves.
export function agentBuildCart(constraints, scenario = 'warranty', fix = null) {
  const ranked = [...CATALOG].sort((a, b) => scoreProduct(b, constraints) - scoreProduct(a, constraints));
  let product = ranked[0];
  if (scenario === 'wrong_product' && !fix) {
    product = CATALOG.find(p => p.sku === 'SL-AERO-WHT-10');
  }
  const merchant = MERCHANTS[product.merchant];
  const qty = constraints.quantity || 1;
  const steps = [`Searched ${CATALOG.length} products for "${constraints.product?.category || 'item'}"`, `Picked ${product.name} (${product.attributes.color}, size ${product.attributes.size}) from ${merchant.name} at $${product.price.toFixed(2)}`];

  const cart = {
    merchant: { ...merchant },
    items: [{ sku: product.sku, name: `${product.name} (${cap(product.attributes.color)}, size ${product.attributes.size})`, description: product.attributes.type,
      quantity: qty, unitPrice: product.price, quotedUnitPrice: product.price, kind: 'product', recurring: null, attributes: product.attributes }],
    shipping: { ...SHIPPING.express, eta: etaFrom(SHIPPING.express.days) },
    serviceFee: null,
    scenario,
    agentSteps: steps,
  };

  if (!fix) {
    switch (scenario) {
      case 'warranty': cart.items.push({ ...EXTRAS.warranty, quantity: 1, quotedUnitPrice: EXTRAS.warranty.unitPrice }); steps.push('Added "Protection Plan (2 years)" because the merchant recommended it'); break;
      case 'subscription': cart.items.push({ ...EXTRAS.subscription, quantity: 1, quotedUnitPrice: EXTRAS.subscription.unitPrice }); steps.push('Merchant checkout pre-selected "ShoeCare+ Membership"'); break;
      case 'quantity': cart.items[0].quantity = qty + 1; steps.push('Applied "buy 2" bundle suggested by the merchant'); break;
      case 'service_fee': cart.serviceFee = { label: 'Service fee', amount: 6.5 }; steps.push('Merchant added a service fee at checkout'); break;
      case 'price_change': cart.items[0].chargedUnitPrice = 79.99; steps.push('Merchant repriced the item at checkout'); break;
      case 'wrong_merchant': cart.merchant = { ...MERCHANTS.lookalike }; steps.push('Checkout redirected to "Str1deLab Outlet"'); break;
      case 'slow_delivery': cart.shipping = { ...SHIPPING.economy, eta: etaFrom(SHIPPING.economy.days) }; steps.push('Chose economy shipping to save money'); break;
      case 'wrong_product': steps.push('Black was "low stock", so the agent switched color'); break;
      default: break;
    }
  } else {
    steps.push(`Rebuilt the cart after OryvaPay flagged: ${fix.join(', ')}`);
  }
  return cart;
}

const cap = s => String(s || '').charAt(0).toUpperCase() + String(s || '').slice(1);
