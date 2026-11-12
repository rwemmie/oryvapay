// PayPal Orders v2 + Payments v2 client.
// Real mode: talks to the PayPal REST API (sandbox by default).
// Demo mode: returns responses shaped like PayPal's so the whole flow can be tested with no keys.
import crypto from 'node:crypto';
import { config } from './config.js';

let tokenCache = { token: null, expires: 0 };

async function accessToken() {
  if (tokenCache.token && Date.now() < tokenCache.expires) return tokenCache.token;
  const basic = Buffer.from(`${config.paypal.clientId}:${config.paypal.clientSecret}`).toString('base64');
  const res = await fetch(`${config.paypal.apiBase}/v1/oauth2/token`, {
    method: 'POST',
    headers: { Authorization: `Basic ${basic}`, 'Content-Type': 'application/x-www-form-urlencoded' },
    body: 'grant_type=client_credentials',
  });
  const json = await res.json();
  if (!res.ok) throw new Error(`PayPal OAuth failed: ${json.error_description || res.status}`);
  tokenCache = { token: json.access_token, expires: Date.now() + (json.expires_in - 60) * 1000 };
  return tokenCache.token;
}

async function pp(method, path, body) {
  const token = await accessToken();
  const res = await fetch(`${config.paypal.apiBase}${path}`, {
    method,
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
      'PayPal-Request-Id': crypto.randomUUID(),
      Prefer: 'return=representation',
    },
    body: body ? JSON.stringify(body) : undefined,
  });
  const text = await res.text();
  const json = text ? JSON.parse(text) : {};
  if (!res.ok) {
    const detail = json.details?.map(d => d.description || d.issue).join('; ') || json.message || res.status;
    const err = new Error(`PayPal ${method} ${path} failed: ${detail}`);
    err.paypal = json;
    throw err;
  }
  return json;
}

const money = n => Number(n).toFixed(2);

// Build an itemized Orders v2 body from an agent cart.
export function buildOrderBody(cart, txId) {
  const items = cart.items.map(it => ({
    name: it.name.slice(0, 127),
    description: (it.description || '').slice(0, 127),
    sku: it.sku,
    quantity: String(it.quantity),
    unit_amount: { currency_code: 'USD', value: money(it.chargedUnitPrice ?? it.unitPrice) },
    category: it.kind === 'product' ? 'PHYSICAL_GOODS' : 'DIGITAL_GOODS',
  }));
  const itemTotal = cart.items.reduce((s, it) => s + (it.chargedUnitPrice ?? it.unitPrice) * it.quantity, 0);
  const shipping = cart.shipping?.price || 0;
  const handling = cart.serviceFee?.amount || 0;
  const total = itemTotal + shipping + handling;
  return {
    intent: 'AUTHORIZE',
    purchase_units: [{
      reference_id: txId,
      custom_id: txId,
      description: `${cart.merchant.name} order via AI shopping agent`.slice(0, 127),
      soft_descriptor: cart.merchant.name.replace(/[^A-Za-z0-9 ]/g, '').slice(0, 22),
      amount: {
        currency_code: 'USD',
        value: money(total),
        breakdown: {
          item_total: { currency_code: 'USD', value: money(itemTotal) },
          shipping: { currency_code: 'USD', value: money(shipping) },
          handling: { currency_code: 'USD', value: money(handling) },
        },
      },
      items,
    }],
    application_context: {
      brand_name: cart.merchant.name.slice(0, 127),
      shipping_preference: 'NO_SHIPPING',
      user_action: 'CONTINUE',
    },
  };
}

// ---------- demo simulator ----------
const demoOrders = new Map();
const fakeId = prefix => prefix + crypto.randomBytes(6).toString('hex').toUpperCase();

function demoCreate(body) {
  const id = fakeId('DEMO-ORD-');
  const order = { id, status: 'CREATED', intent: body.intent, purchase_units: structuredClone(body.purchase_units),
    application_context: body.application_context, create_time: new Date().toISOString(),
    links: [{ rel: 'approve', href: `https://www.sandbox.paypal.com/checkoutnow?token=${id}`, method: 'GET' }] };
  demoOrders.set(id, order);
  return structuredClone(order);
}
function demoGet(id) {
  const o = demoOrders.get(id);
  if (!o) throw new Error(`Demo order ${id} not found`);
  return structuredClone(o);
}
function demoAuthorize(id) {
  const o = demoOrders.get(id);
  if (!o) throw new Error(`Demo order ${id} not found`);
  const auth = { id: fakeId('DEMO-AUTH-'), status: 'CREATED', amount: o.purchase_units[0].amount,
    expiration_time: new Date(Date.now() + 29 * 864e5).toISOString(), create_time: new Date().toISOString() };
  o.status = 'COMPLETED';
  o.payer = { name: { given_name: 'Demo', surname: 'Buyer' }, email_address: 'sb-demo-buyer@personal.example.com' };
  o.purchase_units[0].payments = { authorizations: [auth] };
  return structuredClone(o);
}
function demoFindAuth(authId) {
  for (const o of demoOrders.values()) {
    const a = o.purchase_units[0].payments?.authorizations?.find(x => x.id === authId);
    if (a) return a;
  }
  throw new Error(`Demo authorization ${authId} not found`);
}

// ---------- public API ----------
export async function createOrder(cart, txId) {
  const body = buildOrderBody(cart, txId);
  return config.paypalLive ? pp('POST', '/v2/checkout/orders', body) : demoCreate(body);
}
export async function getOrder(orderId) {
  return config.paypalLive ? pp('GET', `/v2/checkout/orders/${orderId}`) : demoGet(orderId);
}
export async function authorizeOrder(orderId) {
  return config.paypalLive ? pp('POST', `/v2/checkout/orders/${orderId}/authorize`, {}) : demoAuthorize(orderId);
}
export async function captureAuthorization(authId) {
  if (config.paypalLive) return pp('POST', `/v2/payments/authorizations/${authId}/capture`, { final_capture: true });
  const a = demoFindAuth(authId);
  a.status = 'CAPTURED';
  return { id: fakeId('DEMO-CAP-'), status: 'COMPLETED', amount: a.amount, final_capture: true, create_time: new Date().toISOString() };
}
export async function voidAuthorization(authId) {
  if (config.paypalLive) {
    const r = await pp('POST', `/v2/payments/authorizations/${authId}/void`);
    return r && r.id ? r : { id: authId, status: 'VOIDED' };
  }
  const a = demoFindAuth(authId);
  a.status = 'VOIDED';
  return { id: authId, status: 'VOIDED', update_time: new Date().toISOString() };
}
