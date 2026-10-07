/**
 * @file centralApiClient.ts
 * Centralized Multi-Service Credentials Vault & Gateway Client Helper
 * 
 * Drop this helper into any of your approved frontend applications (e.g., Firebase web apps, React, Expo, Vue, Next.js).
 * 
 * SECURITY ARCHITECTURE:
 * 1. API keys (GEMINI_API_KEY, STRIPE_SECRET_KEY, PAYSTACK_SECRET_KEY) live ONLY in your Render environment.
 * 2. FastAPI enforces strict whitelist checks (ALLOWED_ORIGINS) for browsers.
 * 3. Mobile Apps (Android APK, iOS) are protected with hardware-backed cryptographic proofs:
 *    - Android: Google Play Integrity API
 *    - iOS: Apple DeviceCheck / App Attest
 * 4. End users can NEVER inspect or steal your API keys!
 */

const CENTRAL_GATEWAY_URL = (typeof process !== 'undefined' && process.env?.VITE_CENTRAL_GATEWAY_URL) 
  || (typeof window !== 'undefined' && (window as any).__CENTRAL_GATEWAY_URL__)
  || (typeof window !== 'undefined' ? `${window.location.origin}/api` : 'http://localhost:3000/api');

// Auto-detect if running inside a native mobile app/environment (e.g., React Native, Expo, Capacitor)
const isNativeMobile = typeof navigator !== 'undefined' && navigator.product === 'ReactNative';

// Hardware attestation storage
let activeAttestationToken: string | null = null;
let activeAttestationPlatform: 'android' | 'ios' | null = null;
let activeAppPackage: string | null = null;

/**
 * Configure your Android Play Integrity or iOS DeviceCheck attestation tokens globally.
 * Call this function on app startup after requesting OS-level attestation.
 */
export function setMobileAttestation(token: string, platform: 'android' | 'ios', packageName?: string) {
  activeAttestationToken = token;
  activeAttestationPlatform = platform;
  if (packageName) {
    activeAppPackage = packageName;
  }
}

/**
 * Build default headers including mobile platform signals and cryptographic proofs
 */
function getHeaders(customHeaders: Record<string, string> = {}): Record<string, string> {
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    ...customHeaders,
  };

  if (isNativeMobile) {
    headers['X-App-Platform'] = 'ReactNative';
    headers['X-Client-Type'] = 'mobile';
  }

  if (activeAppPackage) {
    headers['X-App-Package'] = activeAppPackage;
  }

  if (activeAttestationToken && activeAttestationPlatform) {
    headers['X-Attestation-Token'] = activeAttestationToken;
    headers['X-Attestation-Platform'] = activeAttestationPlatform;
  }
  
  return headers;
}

export interface GeminiOptions {
  modelName?: string;
  systemInstruction?: string;
  temperature?: number;
  topP?: number;
  topK?: number;
  responseMimeType?: string;
  responseSchema?: any;
}

/**
 * SERVICE 1: Neutral Gemini AI Proxy
 * Calls FastAPI backend which injects GEMINI_API_KEY server-side.
 */
export async function callCentralGemini(
  userPrompt: string | Array<{ role?: string; parts: Array<{ text: string }> }>,
  appSpecificPersona?: string,
  options?: GeminiOptions
): Promise<string> {
  const contents = typeof userPrompt === 'string' 
    ? [{ role: 'user', parts: [{ text: userPrompt }] }] 
    : userPrompt;

  const response = await fetch(`${CENTRAL_GATEWAY_URL}/ai/generate`, {
    method: 'POST',
    headers: getHeaders(),
    credentials: 'include',
    body: JSON.stringify({
      modelName: options?.modelName || 'gemini-2.5-flash',
      systemInstruction: appSpecificPersona || options?.systemInstruction,
      contents,
      config: {
        temperature: options?.temperature,
        topP: options?.topP,
        topK: options?.topK,
        responseMimeType: options?.responseMimeType,
        responseSchema: options?.responseSchema,
      },
    }),
  });

  const data = await response.json();
  if (!response.ok || !data.success) {
    throw new Error(data.detail || data.error || `Gateway returned status ${response.status}`);
  }
  return data.text;
}

/**
 * Stream Gemini output in real-time chunk by chunk via Server-Sent Events (SSE)
 */
export async function streamCentralGemini(
  userPrompt: string,
  appSpecificPersona: string,
  onChunk: (chunkText: string) => void,
  options?: GeminiOptions
): Promise<string> {
  const response = await fetch(`${CENTRAL_GATEWAY_URL}/ai/stream`, {
    method: 'POST',
    headers: getHeaders(),
    credentials: 'include',
    body: JSON.stringify({
      modelName: options?.modelName || 'gemini-2.5-flash',
      systemInstruction: appSpecificPersona,
      prompt: userPrompt,
    }),
  });

  if (!response.ok) {
    throw new Error(`Streaming failed: HTTP ${response.status}`);
  }

  const reader = response.body?.getReader();
  const decoder = new TextDecoder();
  let fullText = '';

  if (reader) {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      const rawLines = decoder.decode(value).split('\n');
      for (const line of rawLines) {
        if (line.startsWith('data: ')) {
          const payload = line.slice(6).trim();
          if (payload === '[DONE]') break;
          try {
            const parsed = JSON.parse(payload);
            const textChunk = parsed?.candidates?.[0]?.content?.parts?.[0]?.text || parsed?.text || '';
            if (textChunk) {
              fullText += textChunk;
              onChunk(textChunk);
            }
          } catch {
            // pass
          }
        }
      }
    }
  }

  return fullText;
}

/**
 * SERVICE 2: Stripe Payment & Billing Helpers
 * Safely fetches Publishable keys and initiates Subscriptions, Split Payments, and Customer Portals
 * without ever exposing Stripe Secret or Restricted Keys to frontend clients.
 */

export interface StripeGatewayOptions {
  isProduction?: boolean;
  isLive?: boolean;
  mode?: string;
}

/**
 * Fetch the active Stripe Publishable Key (pk_test_... or pk_live_...) dynamically for Stripe Elements
 */
export async function getStripePublishableKey(options?: StripeGatewayOptions): Promise<{ publishableKey: string; mode: string; isMock: boolean }> {
  const query = options?.isProduction !== undefined ? `?isProduction=${options.isProduction}` : (options?.mode ? `?mode=${options.mode}` : '');
  const response = await fetch(`${CENTRAL_GATEWAY_URL}/payments/stripe/config${query}`, {
    method: 'GET',
    headers: getHeaders(),
    credentials: 'include',
  });

  const data = await response.json();
  if (!response.ok || !data.success) {
    throw new Error(data.detail || data.error || 'Failed to fetch Stripe config');
  }
  return data;
}

/**
 * SERVICE 2.1: Stripe Payment Intent Proxy (Supports direct charges and split payments)
 */
export async function createStripePaymentIntent(
  amountInCents: number,
  currency: string = 'usd',
  metadata?: Record<string, any>,
  options?: StripeGatewayOptions & {
    customer?: string;
    destinationAccount?: string;
    applicationFeeAmount?: number;
    transferGroup?: string;
    onBehalfOf?: string;
    paymentMethodTypes?: string[];
  }
) {
  const response = await fetch(`${CENTRAL_GATEWAY_URL}/payments/create-stripe-intent`, {
    method: 'POST',
    headers: getHeaders(),
    credentials: 'include',
    body: JSON.stringify({
      amount: amountInCents,
      currency,
      metadata,
      customer: options?.customer,
      destination_account: options?.destinationAccount,
      application_fee_amount: options?.applicationFeeAmount,
      transfer_group: options?.transferGroup,
      on_behalf_of: options?.onBehalfOf,
      payment_method_types: options?.paymentMethodTypes || ['card'],
      is_live: options?.isLive,
      isProduction: options?.isProduction,
      mode: options?.mode,
    }),
  });

  const data = await response.json();
  if (!response.ok || !data.success) {
    throw new Error(data.detail || data.error || 'Failed to create Stripe payment intent');
  }
  return data;
}

/**
 * SERVICE 2.2: Stripe Customer Creation
 */
export async function createStripeCustomer(
  email?: string,
  name?: string,
  paymentMethod?: string,
  options?: StripeGatewayOptions & {
    phone?: string;
    description?: string;
    metadata?: Record<string, any>;
  }
) {
  const response = await fetch(`${CENTRAL_GATEWAY_URL}/payments/stripe/create-customer`, {
    method: 'POST',
    headers: getHeaders(),
    credentials: 'include',
    body: JSON.stringify({
      email,
      name,
      payment_method: paymentMethod,
      phone: options?.phone,
      description: options?.description,
      metadata: options?.metadata,
      is_live: options?.isLive,
      isProduction: options?.isProduction,
      mode: options?.mode,
    }),
  });

  const data = await response.json();
  if (!response.ok || !data.success) {
    throw new Error(data.detail || data.error || 'Failed to create Stripe customer');
  }
  return data;
}

/**
 * SERVICE 2.3: Stripe Recurring Subscription Creation
 */
export async function createStripeSubscription(
  customerId: string,
  priceIdOrItems: string | Array<{ price: string; quantity?: number }>,
  options?: StripeGatewayOptions & {
    paymentBehavior?: string;
    coupon?: string;
    promotionCode?: string;
    trialPeriodDays?: number;
    metadata?: Record<string, any>;
  }
) {
  const bodyPayload: Record<string, any> = {
    customer_id: customerId,
    payment_behavior: options?.paymentBehavior || 'default_incomplete',
    coupon: options?.coupon,
    promotion_code: options?.promotionCode,
    trial_period_days: options?.trialPeriodDays,
    metadata: options?.metadata,
    is_live: options?.isLive,
    isProduction: options?.isProduction,
    mode: options?.mode,
  };

  if (typeof priceIdOrItems === 'string') {
    bodyPayload.price_id = priceIdOrItems;
  } else {
    bodyPayload.items = priceIdOrItems;
  }

  const response = await fetch(`${CENTRAL_GATEWAY_URL}/payments/stripe/create-subscription`, {
    method: 'POST',
    headers: getHeaders(),
    credentials: 'include',
    body: JSON.stringify(bodyPayload),
  });

  const data = await response.json();
  if (!response.ok || !data.success) {
    throw new Error(data.detail || data.error || 'Failed to create Stripe subscription');
  }
  return data;
}

/**
 * SERVICE 2.4: Stripe SetupIntent (Card Registration)
 */
export async function createStripeSetupIntent(
  customerId?: string,
  options?: StripeGatewayOptions & {
    paymentMethodTypes?: string[];
    metadata?: Record<string, any>;
  }
) {
  const response = await fetch(`${CENTRAL_GATEWAY_URL}/payments/stripe/create-setup-intent`, {
    method: 'POST',
    headers: getHeaders(),
    credentials: 'include',
    body: JSON.stringify({
      customer_id: customerId,
      payment_method_types: options?.paymentMethodTypes || ['card'],
      metadata: options?.metadata,
      is_live: options?.isLive,
      isProduction: options?.isProduction,
      mode: options?.mode,
    }),
  });

  const data = await response.json();
  if (!response.ok || !data.success) {
    throw new Error(data.detail || data.error || 'Failed to create SetupIntent');
  }
  return data;
}

/**
 * SERVICE 2.5: Stripe Customer Billing Portal Session
 */
export async function createStripePortalSession(
  customerId: string,
  returnUrl?: string,
  options?: StripeGatewayOptions
) {
  const response = await fetch(`${CENTRAL_GATEWAY_URL}/payments/stripe/create-portal-session`, {
    method: 'POST',
    headers: getHeaders(),
    credentials: 'include',
    body: JSON.stringify({
      customer_id: customerId,
      return_url: returnUrl,
      is_live: options?.isLive,
      isProduction: options?.isProduction,
      mode: options?.mode,
    }),
  });

  const data = await response.json();
  if (!response.ok || !data.success) {
    throw new Error(data.detail || data.error || 'Failed to create Billing Portal session');
  }
  return data;
}

/**
 * SERVICE 2.6: Stripe Connect Merchant Account Creation
 */
export async function createStripeConnectAccount(
  type: 'express' | 'standard' | 'custom' = 'express',
  options?: StripeGatewayOptions & {
    email?: string;
    country?: string;
    businessType?: string;
    metadata?: Record<string, any>;
  }
) {
  const response = await fetch(`${CENTRAL_GATEWAY_URL}/payments/stripe/connect/create-account`, {
    method: 'POST',
    headers: getHeaders(),
    credentials: 'include',
    body: JSON.stringify({
      type,
      email: options?.email,
      country: options?.country || 'US',
      business_type: options?.businessType || 'individual',
      metadata: options?.metadata,
      is_live: options?.isLive,
      isProduction: options?.isProduction,
      mode: options?.mode,
    }),
  });

  const data = await response.json();
  if (!response.ok || !data.success) {
    throw new Error(data.detail || data.error || 'Failed to create Stripe Connect account');
  }
  return data;
}

/**
 * SERVICE 2.7: Stripe Connect Onboarding Account Link
 */
export async function createStripeConnectAccountLink(
  accountId: string,
  refreshUrl: string,
  returnUrl: string,
  options?: StripeGatewayOptions & {
    type?: string;
  }
) {
  const response = await fetch(`${CENTRAL_GATEWAY_URL}/payments/stripe/connect/account-link`, {
    method: 'POST',
    headers: getHeaders(),
    credentials: 'include',
    body: JSON.stringify({
      account_id: accountId,
      refresh_url: refreshUrl,
      return_url: returnUrl,
      type: options?.type || 'account_onboarding',
      is_live: options?.isLive,
      isProduction: options?.isProduction,
      mode: options?.mode,
    }),
  });

  const data = await response.json();
  if (!response.ok || !data.success) {
    throw new Error(data.detail || data.error || 'Failed to create Stripe Connect account link');
  }
  return data;
}

/**
 * SERVICE 2.8: Stripe Direct Transfer (Split Payout)
 */
export async function createStripeTransfer(
  amountInCents: number,
  destinationAccountId: string,
  currency: string = 'usd',
  options?: StripeGatewayOptions & {
    transferGroup?: string;
    description?: string;
    metadata?: Record<string, any>;
  }
) {
  const response = await fetch(`${CENTRAL_GATEWAY_URL}/payments/stripe/create-transfer`, {
    method: 'POST',
    headers: getHeaders(),
    credentials: 'include',
    body: JSON.stringify({
      amount: amountInCents,
      destination: destinationAccountId,
      currency,
      transfer_group: options?.transferGroup,
      description: options?.description,
      metadata: options?.metadata,
      is_live: options?.isLive,
      isProduction: options?.isProduction,
      mode: options?.mode,
    }),
  });

  const data = await response.json();
  if (!response.ok || !data.success) {
    throw new Error(data.detail || data.error || 'Failed to create Stripe transfer');
  }
  return data;
}

/**
 * SERVICE 3: Paystack Initialize Proxy
 * Injects PAYSTACK_SECRET_KEY server-side on Render.
 */
export async function initializePaystackTransaction(
  email: string,
  amountInKoboOrCents: number,
  callbackUrl?: string,
  metadata?: Record<string, any>
) {
  const response = await fetch(`${CENTRAL_GATEWAY_URL}/payments/paystack-init`, {
    method: 'POST',
    headers: getHeaders(),
    credentials: 'include',
    body: JSON.stringify({
      email,
      amount: amountInKoboOrCents,
      callback_url: callbackUrl,
      metadata,
    }),
  });

  const data = await response.json();
  if (!response.ok || !data.success) {
    throw new Error(data.detail || data.error || 'Failed to initialize Paystack payment');
  }
  return data;
}

/**
 * SERVICE 3.1: Create Paystack Subaccount
 * Safely triggers subaccount creation on the gateway without exposing secret keys.
 */
export async function createPaystackSubaccount(
  businessName: string,
  settlementBank: string,
  accountNumber: string,
  percentageCharge: number,
  options?: { isLive?: boolean; mode?: string }
) {
  const response = await fetch(`${CENTRAL_GATEWAY_URL}/payments/subaccount`, {
    method: 'POST',
    headers: getHeaders(),
    credentials: 'include',
    body: JSON.stringify({
      business_name: businessName,
      settlement_bank: settlementBank,
      account_number: accountNumber,
      percentage_charge: percentageCharge,
      is_live: options?.isLive,
      mode: options?.mode,
    }),
  });

  const data = await response.json();
  if (!response.ok) {
    throw new Error(data.detail?.message || data.error || 'Failed to create subaccount');
  }
  return data;
}

/**
 * SERVICE 3.2: Initialize Split Payment Transaction
 * Inits a transaction split with the specified subaccount code.
 */
export async function initializePaystackSplitTransaction(
  email: string,
  amountInKoboOrCents: number,
  subaccountCode: string,
  callbackUrl?: string,
  metadata?: Record<string, any>,
  options?: { isLive?: boolean; mode?: string }
) {
  const response = await fetch(`${CENTRAL_GATEWAY_URL}/payments/split-payment`, {
    method: 'POST',
    headers: getHeaders(),
    credentials: 'include',
    body: JSON.stringify({
      email,
      amount: amountInKoboOrCents,
      subaccount_code: subaccountCode,
      callback_url: callbackUrl,
      metadata,
      is_live: options?.isLive,
      mode: options?.mode,
    }),
  });

  const data = await response.json();
  if (!response.ok) {
    throw new Error(data.detail?.message || data.error || 'Failed to initialize split transaction');
  }
  return data;
}

/**
 * Generic Universal Proxy Caller
 * Forwards any custom upstream request through your FastAPI gateway.
 */
export async function centralProxyFetch(
  targetUrl: string,
  init?: RequestInit
): Promise<Response> {
  const cleanGatewayUrl = CENTRAL_GATEWAY_URL.replace(/\/+$/, '');
  const proxyEndpoint = `${cleanGatewayUrl}/proxy?target=${encodeURIComponent(targetUrl)}`;

  const outgoingHeaders = getHeaders();
  if (init?.headers) {
    Object.assign(outgoingHeaders, init.headers);
  }

  return fetch(proxyEndpoint, {
    ...init,
    headers: outgoingHeaders,
    credentials: 'include',
  });
}
