import { APIRequestContext } from '@playwright/test';

export const API_URL = process.env.API_URL ?? 'http://localhost:8091';

/** Result of a single API call: the tests assert on the observed HTTP outcome. */
export interface ApiResult<T = unknown> {
  status: number;
  body: T;
}

export interface Customer {
  first_name: string;
  last_name: string;
  address: {
    street: string;
    house_number: string;
    city: string;
    state: string;
    country: string;
    postal_code: string;
  };
  phone: string;
  dob: string;
  email: string;
  password: string;
}

export interface Product {
  id: string;
  name: string;
  price: number;
  category_id: string;
  brand_id: string;
  /** The customer-facing API exposes availability as a flag, not as a number. */
  in_stock: boolean;
}

export interface CartItem {
  id: string;
  product_id: string;
  quantity: number;
  product: Product;
  discounted_price?: number | null;
  discount_percentage?: number | null;
}

export interface Cart {
  id: string;
  cart_items: CartItem[];
}

export interface InvoiceLine {
  id: string;
  product_id: string;
  quantity: number;
  unit_price: number;
}

export interface Invoice {
  id: string;
  invoice_number: string;
  total: number;
  billing_city?: string;
  billing_country?: string;
  billing_street?: string;
  invoicelines?: InvoiceLine[];
  payment?: { payment_method?: string };
}

export interface InvoicePayload {
  billing_street: string;
  billing_city: string;
  billing_state: string;
  billing_country: string;
  billing_postal_code: string;
  payment_method: string;
  payment_details: Record<string, unknown>;
  cart_id: string;
}

export type PaymentMethod =
  | 'bank-transfer'
  | 'cash-on-delivery'
  | 'credit-card'
  | 'buy-now-pay-later'
  | 'gift-card';

/**
 * Typed client over the Toolshop REST API.
 *
 * It uses the Playwright `request` fixture (not a private context) so every
 * call performed by a test, including the arrange steps, appears in that
 * test's trace. That is what makes a trace usable as evidence for an API
 * defect: the request body and the response are on the timeline.
 *
 * Calls return `{ status, body }` and never throw on a non-2xx status, so a
 * test always asserts on what the server actually answered.
 */
export class ShopApi {
  constructor(
    private readonly ctx: APIRequestContext,
    private readonly baseURL: string = API_URL,
  ) {}

  private async send<T>(
    method: 'GET' | 'POST' | 'PUT' | 'DELETE',
    path: string,
    options: { data?: unknown; token?: string } = {},
  ): Promise<ApiResult<T>> {
    const headers: Record<string, string> = {};
    if (options.token) headers.Authorization = `Bearer ${options.token}`;

    const response = await this.ctx.fetch(`${this.baseURL}${path}`, {
      method,
      data: options.data,
      headers,
      failOnStatusCode: false,
    });

    const text = await response.text();
    let body: unknown = text;
    try {
      body = text ? JSON.parse(text) : null;
    } catch {
      // Keep the raw text: an HTML error page is itself a finding.
    }
    return { status: response.status(), body: body as T };
  }

  // ---------------------------------------------------------------- users ---

  register(customer: Customer): Promise<ApiResult<{ id: string }>> {
    return this.send('POST', '/users/register', { data: customer });
  }

  login(
    email: string,
    password: string,
  ): Promise<ApiResult<{ access_token?: string; token_type?: string }>> {
    return this.send('POST', '/users/login', { data: { email, password } });
  }

  me(token: string): Promise<ApiResult<{ id: string; email: string }>> {
    return this.send('GET', '/users/me', { token });
  }

  /** Registers a throw-away customer and returns its bearer token. */
  async registerAndLogin(customer: Customer): Promise<{ token: string; userId: string }> {
    const registration = await this.register(customer);
    if (registration.status !== 201) {
      throw new Error(
        `Registration failed: HTTP ${registration.status} ${JSON.stringify(registration.body)}`,
      );
    }

    const login = await this.login(customer.email, customer.password);
    if (login.status !== 200 || !login.body?.access_token) {
      throw new Error(`Login failed: HTTP ${login.status} ${JSON.stringify(login.body)}`);
    }

    return {
      token: login.body.access_token,
      userId: (registration.body as { id: string }).id,
    };
  }

  // ------------------------------------------------------------- products ---

  async products(query: Record<string, string | number> = {}): Promise<Product[]> {
    const qs = new URLSearchParams(
      Object.entries(query).map(([key, value]) => [key, String(value)]),
    ).toString();
    const response = await this.send<{ data: Product[] }>('GET', `/products?${qs}`);
    if (response.status !== 200) {
      throw new Error(`GET /products failed: HTTP ${response.status}`);
    }
    return response.body.data;
  }

  product(id: string): Promise<ApiResult<Product>> {
    return this.send<Product>('GET', `/products/${id}`);
  }

  postcodeLookup(
    country: string,
    postcode: string,
    houseNumber = '',
  ): Promise<
    ApiResult<{ street: string; city: string; state: string; country: string; postcode: string }>
  > {
    const qs = new URLSearchParams({ country, postcode, house_number: houseNumber }).toString();
    return this.send('GET', `/postcode-lookup?${qs}`);
  }

  // ----------------------------------------------------------------- carts ---

  async createCart(token?: string): Promise<string> {
    const response = await this.send<{ id: string }>('POST', '/carts', { data: {}, token });
    if (response.status !== 201 || !response.body?.id) {
      throw new Error(`POST /carts failed: HTTP ${response.status} ${JSON.stringify(response.body)}`);
    }
    return response.body.id;
  }

  addToCart(
    token: string,
    cartId: string,
    productId: string,
    quantity: number,
  ): Promise<ApiResult<Cart>> {
    return this.send<Cart>('POST', `/carts/${cartId}`, {
      data: { product_id: productId, quantity },
      token,
    });
  }

  getCart(token: string, cartId: string): Promise<ApiResult<Cart>> {
    return this.send<Cart>('GET', `/carts/${cartId}`, { token });
  }

  updateQuantity(
    token: string,
    cartId: string,
    productId: string,
    quantity: number,
  ): Promise<ApiResult<Cart>> {
    return this.send<Cart>('PUT', `/carts/${cartId}/product/quantity`, {
      data: { product_id: productId, quantity },
      token,
    });
  }

  removeFromCart(token: string, cartId: string, productId: string): Promise<ApiResult<unknown>> {
    return this.send('DELETE', `/carts/${cartId}/product/${productId}`, { token });
  }

  // -------------------------------------------------------------- payment ---

  checkPayment(
    paymentMethod: PaymentMethod,
    details: Record<string, unknown> = {},
  ): Promise<ApiResult<{ message?: string }>> {
    return this.send('POST', '/payment/check', {
      data: { payment_method: paymentMethod, payment_details: details },
    });
  }

  // ------------------------------------------------------------- invoices ---

  createInvoice(token: string, payload: InvoicePayload): Promise<ApiResult<Invoice>> {
    return this.send<Invoice>('POST', '/invoices', { data: payload, token });
  }

  getInvoice(token: string, id: string): Promise<ApiResult<Invoice>> {
    return this.send<Invoice>('GET', `/invoices/${id}`, { token });
  }

  listInvoices(token: string): Promise<ApiResult<{ data: Invoice[] }>> {
    return this.send<{ data: Invoice[] }>('GET', '/invoices', { token });
  }
}
