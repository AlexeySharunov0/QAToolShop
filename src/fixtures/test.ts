import { test as base, expect } from '@playwright/test';
import { API_URL, Customer, Product, ShopApi } from '../api/shop-api';
import { buildCustomer } from '../data/factories';
import './matchers';

export interface AuthedCustomer {
  customer: Customer;
  token: string;
  userId: string;
}

interface Fixtures {
  /**
   * API client bound to the test's own `request` fixture, so every call is
   * visible in the test trace.
   */
  api: ShopApi;
  /** Fresh customer payload, unique for this test. */
  customer: Customer;
  /** A customer that exists in the database and holds a bearer token. */
  authed: AuthedCustomer;
  /** A regular, in-stock product that the defect tests do not consume. */
  product: Product;
}

/**
 * Products the known-defect tests deliberately drive out of stock or oversell.
 * They are excluded from the `product` fixture so a defect test can never
 * destabilise an unrelated test that runs in parallel.
 */
const RESERVED_FOR_DEFECT_TESTS = new Set(['Washers', 'Long Nose Pliers']);

export const test = base.extend<Fixtures>({
  api: async ({ request }, use) => {
    await use(new ShopApi(request, API_URL));
  },

  customer: async ({}, use) => {
    await use(buildCustomer());
  },

  authed: async ({ api, customer }, use) => {
    const { token, userId } = await api.registerAndLogin(customer);
    await use({ customer, token, userId });
  },

  /**
   * Picks a product that is really available right now.
   *
   * The list endpoint is cached for a couple of minutes, so `in_stock` there
   * can be stale. The detail endpoint is authoritative and is what the product
   * page uses to enable "Add to cart".
   */
  product: async ({ api }, use) => {
    const list = await api.products({ between: 'price,1,100', sort: 'price,asc' });

    for (const candidate of list) {
      if (RESERVED_FOR_DEFECT_TESTS.has(candidate.name)) continue;

      const detail = await api.product(candidate.id);
      if (detail.status === 200 && detail.body.in_stock !== false) {
        await use(detail.body);
        return;
      }
    }

    throw new Error('No in-stock product found in the seeded catalogue');
  },
});

export { expect };
