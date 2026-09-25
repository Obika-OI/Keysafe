/**
 * @file centralApiClient.ts
 * Centralized Multi-Service Credentials Vault & Gateway Client Helper
 * 
 * Drop this helper into any of your separate frontend applications (e.g., Firebase web apps, Next.js, React SPA, Mobile).
 * Each app feeds its own unique personality, prompts, and payload details while keeping all API keys secure on Render.
 */

const CENTRAL_GATEWAY_URL = (typeof process !== 'undefined' && process.env?.VITE_CENTRAL_GATEWAY_URL) 
  || (typeof window !== 'undefined' && (window as any).__CENTRAL_GATEWAY_URL__)
  || (typeof window !== 'undefined' ? `${window.location.origin}/api` : 'http://localhost:3000/api');

const APP_SECRET = (typeof process !== 'undefined' && (process.env?.VITE_CENTRAL_APP_SECRET || process.env?.CENTRAL_APP_SECRET))
  || 'app_live_secret_token';

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
 * Fully respects whatever unique personality or system prompt the calling app sends.
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
    headers: {
      'Content-Type': 'application/json',
      'X-App-Secret': APP_SECRET,
    },
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
    throw new Error(data.error || `Gateway returned status ${response.status}`);
  }
  return data.text;
}

/**
 * Stream Gemini output in real-time chunk by chunk via Server-Sent Events
 */
export async function streamCentralGemini(
  userPrompt: string,
  appSpecificPersona: string,
  onChunk: (chunkText: string) => void
): Promise<string> {
  const response = await fetch(`${CENTRAL_GATEWAY_URL}/ai/stream`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'X-App-Secret': APP_SECRET,
    },
    body: JSON.stringify({
      modelName: 'gemini-2.5-flash',
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
            if (parsed.text) {
              fullText += parsed.text;
              onChunk(parsed.text);
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
 * SERVICE 2: Stripe Payment Intent Proxy
 * Injects STRIPE_SECRET_KEY server-side.
 */
export async function createStripePaymentIntent(
  amountInCents: number,
  currency: string = 'usd',
  metadata?: Record<string, string>
) {
  const response = await fetch(`${CENTRAL_GATEWAY_URL}/payments/create-stripe-intent`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'X-App-Secret': APP_SECRET,
    },
    body: JSON.stringify({
      amount: amountInCents,
      currency,
      metadata,
    }),
  });

  const data = await response.json();
  if (!response.ok || !data.success) {
    throw new Error(data.error || 'Failed to create Stripe payment intent');
  }
  return data;
}

/**
 * SERVICE 3: Paystack Initialize Proxy
 * Injects PAYSTACK_SECRET_KEY server-side.
 */
export async function initializePaystackTransaction(
  email: string,
  amountInKoboOrCents: number,
  callbackUrl?: string,
  metadata?: Record<string, any>
) {
  const response = await fetch(`${CENTRAL_GATEWAY_URL}/payments/paystack-init`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'X-App-Secret': APP_SECRET,
    },
    body: JSON.stringify({
      email,
      amount: amountInKoboOrCents,
      callback_url: callbackUrl,
      metadata,
    }),
  });

  const data = await response.json();
  if (!response.ok || !data.success) {
    throw new Error(data.error || 'Failed to initialize Paystack payment');
  }
  return data;
}

/**
 * Generic Universal Proxy Caller
 * Forwards any custom request through your Render gateway without exposing API keys in client JavaScript.
 */
export async function centralProxyFetch(targetUrl: string, init?: RequestInit): Promise<Response> {
  const cleanGatewayUrl = CENTRAL_GATEWAY_URL.replace(/\/+$/, '');
  const proxyEndpoint = `${cleanGatewayUrl}/proxy?target=${encodeURIComponent(targetUrl)}`;

  const headers = new Headers(init?.headers || {});
  headers.set('X-App-Secret', APP_SECRET);

  return fetch(proxyEndpoint, {
    ...init,
    headers,
  });
}
