/**
 * @file centralApiClient.ts
 * Centralized Multi-Service Credentials Vault & Gateway Client Helper
 * 
 * Drop this helper into any of your approved frontend applications (e.g., Firebase web apps, React, Expo, Vue, Next.js).
 * 
 * SECURITY ARCHITECTURE:
 * 1. API keys (GEMINI_API_KEY, STRIPE_SECRET_KEY, PAYSTACK_SECRET_KEY) live ONLY in your Render environment.
 * 2. FastAPI enforces strict whitelist checks (ALLOWED_ORIGINS & Mobile Platform Validation)
 * 3. Mobile Apps (Expo Go, Android APK / Play Store, iOS) have continuous, secure permanent access.
 * 4. End users can NEVER inspect or steal your API keys!
 */

const CENTRAL_GATEWAY_URL = (typeof process !== 'undefined' && process.env?.VITE_CENTRAL_GATEWAY_URL) 
  || (typeof window !== 'undefined' && (window as any).__CENTRAL_GATEWAY_URL__)
  || (typeof window !== 'undefined' ? `${window.location.origin}/api` : 'http://localhost:3000/api');

// Auto-detect if running inside a native mobile app/environment (e.g., React Native, Expo, Capacitor)
const isNativeMobile = typeof navigator !== 'undefined' && navigator.product === 'ReactNative';

/**
 * Build default headers including mobile platform signals to assist backend verification
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
 * SERVICE 2: Stripe Payment Intent Proxy
 * Injects STRIPE_SECRET_KEY server-side on Render.
 */
export async function createStripePaymentIntent(
  amountInCents: number,
  currency: string = 'usd',
  metadata?: Record<string, string>
) {
  const response = await fetch(`${CENTRAL_GATEWAY_URL}/payments/create-stripe-intent`, {
    method: 'POST',
    headers: getHeaders(),
    credentials: 'include',
    body: JSON.stringify({
      amount: amountInCents,
      currency,
      metadata,
    }),
  });

  const data = await response.json();
  if (!response.ok || !data.success) {
    throw new Error(data.detail || data.error || 'Failed to create Stripe payment intent');
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
