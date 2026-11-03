#!/usr/bin/env node
/**
 * Reproduces BUG-01 ... BUG-04 through the public API and writes
 * machine-readable evidence to reports/evidence/.
 *
 * Why a separate script when Playwright already covers the same behaviour:
 *   - the evidence in BUGS.md has to be readable without a trace viewer;
 *   - a reviewer can rerun it and compare the numbers;
 *   - it documents the exact request sequence that produces each defect.
 *
 * Usage:  node scripts/reproduce-defects.mjs
 * Requires a running local instance at API_URL (default http://localhost:8091).
 */
import { mkdir, writeFile } from 'node:fs/promises';

const API = process.env.API_URL ?? 'http://localhost:8091';
const OUT = 'reports/evidence';

async function call(method, path, { token, body } = {}) {
  const headers = { Accept: 'application/json', 'Content-Type': 'application/json' };
  if (token) headers.Authorization = `Bearer ${token}`;

  const response = await fetch(`${API}${path}`, {
    method,
    headers,
    body: body === undefined ? undefined : JSON.stringify(body),
  });

  const text = await response.text();
  let parsed;
  try {
    parsed = text ? JSON.parse(text) : null;
  } catch {
    parsed = text;
  }
  return { status: response.status, body: parsed };
}

async function newCustomer(tag) {
  const email = `${tag}.${Date.now()}.${Math.floor(Math.random() * 1e6)}@example.com`;
  const password = 'Qa!Evidence9Zz';

  const registration = await call('POST', '/users/register', {
    body: {
      first_name: 'Evidence',
      last_name: 'Run',
      address: {
        street: 'Autarboulevard',
        house_number: '12',
        city: 'Stroe',
        state: 'Groningen',
        country: 'NL',
        postal_code: '1011AB',
      },
      phone: '0612345678',
      dob: '1990-01-01',
      email,
      password,
    },
  });

  const login = await call('POST', '/users/login', { body: { email, password } });
  if (login.status !== 200 || !login.body?.access_token) {
    throw new Error(`login failed for ${email}: HTTP ${login.status}`);
  }
  return { email, token: login.body.access_token, registrationStatus: registration.status };
}

async function billingAddress() {
  const lookup = await call('GET', '/postcode-lookup?country=NL&postcode=1011AB&house_number=12');
  return {
    billing_street: lookup.body.street,
    billing_city: lookup.body.city,
    billing_state: lookup.body.state,
    billing_country: 'NL',
    billing_postal_code: '1011AB',
  };
}

async function placeOrder(token, cartId) {
  return call('POST', '/invoices', {
    token,
    body: {
      ...(await billingAddress()),
      payment_method: 'cash-on-delivery',
      payment_details: {},
      cart_id: cartId,
    },
  });
}

async function productByName(name) {
  const response = await call('GET', `/products?q=${encodeURIComponent(name)}`);
  return response.body.data.find((product) => product.name === name);
}

const observedAt = new Date().toISOString();
const evidence = {};

// BUG-01 - an out-of-stock product can be ordered.
{
  const user = await newCustomer('bug01');
  const product = await productByName('Long Nose Pliers');
  const cart = await call('POST', '/carts', { token: user.token, body: {} });
  const added = await call('POST', `/carts/${cart.body.id}`, {
    token: user.token,
    body: { product_id: product.id, quantity: 1 },
  });
  const order = await placeOrder(user.token, cart.body.id);

  evidence['BUG-01'] = {
    title: 'Out-of-stock product can be added to the cart and ordered',
    observedAt,
    environment: { apiUrl: API, sprint: 'sprint5' },
    product: { id: product.id, name: product.name, in_stock: product.in_stock, price: product.price },
    cartId: cart.body.id,
    addToCart: { status: added.status, body: added.body },
    createOrder: {
      status: order.status,
      invoice_number: order.body?.invoice_number,
      total: order.body?.total,
    },
    expected: 'add-to-cart rejected (4xx) and the order rejected (4xx)',
  };
}

// BUG-02 - quantity is not limited by stock.
{
  const user = await newCustomer('bug02');
  const product = await productByName('Washers');
  const cart = await call('POST', '/carts', { token: user.token, body: {} });
  const requestedQuantity = 26; // the seeder gives hand tools stock = 25
  const added = await call('POST', `/carts/${cart.body.id}`, {
    token: user.token,
    body: { product_id: product.id, quantity: requestedQuantity },
  });
  const order = await placeOrder(user.token, cart.body.id);

  evidence['BUG-02'] = {
    title: 'Cart and order accept more units than are in stock',
    observedAt,
    environment: { apiUrl: API, sprint: 'sprint5' },
    product: { id: product.id, name: product.name, in_stock: product.in_stock, price: product.price },
    seededStock: 25,
    requestedQuantity,
    cartId: cart.body.id,
    addToCart: { status: added.status, body: added.body },
    createOrder: {
      status: order.status,
      invoice_number: order.body?.invoice_number,
      total: order.body?.total,
    },
    expected: 'add-to-cart or checkout rejected with 4xx',
  };
}

// BUG-03 - an empty cart becomes an order.
{
  const user = await newCustomer('bug03');
  const cart = await call('POST', '/carts', { token: user.token, body: {} });
  const order = await placeOrder(user.token, cart.body.id);

  evidence['BUG-03'] = {
    title: 'An empty cart can be turned into an order with total 0',
    observedAt,
    environment: { apiUrl: API, sprint: 'sprint5' },
    cartId: cart.body.id,
    createOrder: {
      status: order.status,
      invoice_number: order.body?.invoice_number,
      total: order.body?.total,
    },
    expected: 'checkout rejected with 4xx because the cart has no items',
  };
}

// BUG-04 - any authenticated user can pay for another customer's cart.
{
  const owner = await newCustomer('bug04-owner');
  const stranger = await newCustomer('bug04-stranger');
  const products = await call('GET', '/products?between=price,1,100&sort=price,asc');
  // Deliberately not "Washers": that product is used by the BUG-02 evidence and
  // must keep a predictable stock level for the manual stock check.
  const product = products.body.data.find((item) => item.name !== 'Washers');

  const cart = await call('POST', '/carts', { token: owner.token, body: {} });
  await call('POST', `/carts/${cart.body.id}`, {
    token: owner.token,
    body: { product_id: product.id, quantity: 1 },
  });

  const asStranger = await placeOrder(stranger.token, cart.body.id);

  evidence['BUG-04'] = {
    title: "Any authenticated customer can place an order from another customer's cart",
    observedAt,
    environment: { apiUrl: API, sprint: 'sprint5' },
    ownerCartId: cart.body.id,
    product: { id: product.id, name: product.name },
    strangerCreatesOrder: {
      status: asStranger.status,
      invoice_number: asStranger.body?.invoice_number,
      total: asStranger.body?.total,
    },
    expected: "403/404 - the cart does not belong to the stranger's account",
  };
}

await mkdir(OUT, { recursive: true });
for (const [id, data] of Object.entries(evidence)) {
  const file = `${OUT}/${id}.json`;
  await writeFile(file, `${JSON.stringify(data, null, 2)}\n`, 'utf8');
  const status =
    data.addToCart?.status ??
    data.createOrder?.status ??
    data.strangerCreatesOrder?.status;
  console.log(`${id}: last HTTP status ${status} -> ${file}`);
}

console.log('\nDone. The same behaviour is covered by tests/api/known-defects.spec.ts (test.fail).');
