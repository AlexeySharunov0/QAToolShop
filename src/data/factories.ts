import { randomUUID } from 'node:crypto';
import { Customer, InvoicePayload, PaymentMethod, ShopApi } from '../api/shop-api';

/**
 * Test data is generated per test and never shared.
 *
 * Reason: the application locks an account after three failed logins
 * (`UserService::MAX_LOGIN_ATTEMPTS = 3`). A single demo customer would turn
 * one negative authentication test into a cascade of unrelated failures and
 * would make the suite order-dependent.
 */
export function buildCustomer(overrides: Partial<Customer> = {}): Customer {
  const suffix = randomUUID().replace(/-/g, '').slice(0, 10);

  return {
    first_name: 'QA',
    last_name: 'Automation',
    // Values that the local postcode lookup really returns for NL/1011AB.
    // An invented "Amsterdam, 1011AB" address is rejected by the API with 422
    // "city does not belong to the country", which is easy to mistake for a
    // product defect.
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
    email: `qa.${suffix}@example.com`,
    // Password policy: at least 8 characters, mixed case, digits and symbols.
    password: `Qa!${suffix}Zz9`,
    ...overrides,
  };
}

export interface BillingAddress {
  billing_street: string;
  billing_city: string;
  billing_state: string;
  billing_country: string;
  billing_postal_code: string;
}

/**
 * Builds the billing address from `GET /postcode-lookup`.
 *
 * The API validates that city/state match the country and postcode, so the
 * payload is derived from the lookup rather than typed by hand.
 */
export async function billingFromLookup(
  api: ShopApi,
  { country = 'NL', postcode = '1011AB', houseNumber = '12' } = {},
): Promise<BillingAddress> {
  const lookup = await api.postcodeLookup(country, postcode, houseNumber);
  if (lookup.status !== 200) {
    throw new Error(
      `postcode-lookup failed: HTTP ${lookup.status} ${JSON.stringify(lookup.body)}`,
    );
  }

  return {
    billing_street: lookup.body.street || 'Autarboulevard',
    billing_city: lookup.body.city,
    billing_state: lookup.body.state,
    billing_country: country,
    billing_postal_code: postcode,
  };
}

export function buildInvoicePayload(
  cartId: string,
  billing: BillingAddress,
  paymentMethod: PaymentMethod = 'cash-on-delivery',
): InvoicePayload {
  return {
    ...billing,
    payment_method: paymentMethod,
    payment_details: {},
    cart_id: cartId,
  };
}
