/**
 * @file centralApiClient.ts
 * Centralized Multi-Service Credentials Vault & Gateway Client Helper
 * 
 * Drop this helper into any of your separate frontend applications (e.g., Firebase web apps, Next.js, React SPA, Mobile).
 * 
 * HOW IT PROTECTS YOUR API KEYS:
 * 1. Your real API keys (GEMINI_API_KEY, STRIPE_SECRET_KEY, PAYSTACK_SECRET_KEY) remain ONLY on Render in your backend environment.
 * 2. When your app makes a call, this client performs an automated short-lived JWT session handshake with Render.
 * 3. The Render gateway uses the secret API keys on the server and returns the results to your app.
 * 4. End users who open browser DevTools can NEVER see or steal your API keys!
 */

const CENTRAL_GATEWAY_URL = (typeof process !== 'undefined' && process.env?.VITE_CENTRAL_GATEWAY_URL) 
  || (typeof window !== 'undefined' && (window as any).__CENTRAL_GATEWAY_URL__)
  || (typeof window !== 'undefined' ? `${window.location.origin}/api` : 'http://localhost:3000/api');

// In-memory cached App JWT session token
let cachedAppJwt: string | null = null;
let tokenExpiresAt = 0;

/**
 * Automatically obtains or refreshes a short-lived App JWT session token from Render
 * No client-side .env keys or static passwords required!
 */
async function getOrRefreshAppSessionToken(): Promise<string> {
  const now = Date.now();
  // Return cached token if valid for at least another 60 seconds
  if (cachedAppJwt && now < tokenExpiresAt - 60000) {
    return cachedAppJwt;
  }

  try {
    const res = await fetch(`${CENTRAL_GATEWAY_URL}/auth/app-session`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
    });

    if (!res.ok) {
      throw new Error(`Session handshake failed with status ${res.status}`);
    }

    const data = await res.json();
    if (!data.token) {
      throw new Error('No session token returned by gateway');
    }

    const token = String(data.token);
    cachedAppJwt = token;
    tokenExpiresAt = now + (data.expiresInSeconds || 900) * 1000;
    return token;
  } catch (error: any) {
    console.error('Central Gateway Session Error:', error);
    throw new Error('Unable to establish secure gateway session. Verify your domain is in ALLOWED_ORIGINS on Render.');
  }
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
 * Uses the server-side GEMINI_API_KEY stored on Render.
 * Users cannot inspect or steal the key.
 */
export async function callCentralGemini(
  userPrompt: string | Array<{ role?: string; parts: Array<{ text: string }> }>,
  appSpecificPersona?: string,
  options?: GeminiOptions
): Promise<string> {
  const token = await getOrRefreshAppSessionToken();
  const contents = typeof userPrompt === 'string' 
    ? [{ role: 'user', parts: [{ text: userPrompt }] }] 
    : userPrompt;

  const response = await fetch(`${CENTRAL_GATEWAY_URL}/ai/generate`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${token}`,
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
  onChunk: (chunkText: string) => void,
  options?: GeminiOptions
): Promise<string> {
  const token = await getOrRefreshAppSessionToken();

  const response = await fetch(`${CENTRAL_GATEWAY_URL}/ai/stream`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${token}`,
    },
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
 * Injects STRIPE_SECRET_KEY server-side on Render. Users never see the secret key.
 */
export async function createStripePaymentIntent(
  amountInCents: number,
  currency: string = 'usd',
  metadata?: Record<string, string>
) {
  const token = await getOrRefreshAppSessionToken();

  const response = await fetch(`${CENTRAL_GATEWAY_URL}/payments/create-stripe-intent`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${token}`,
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
 * Injects PAYSTACK_SECRET_KEY server-side on Render.
 */
export async function initializePaystackTransaction(
  email: string,
  amountInKoboOrCents: number,
  callbackUrl?: string,
  metadata?: Record<string, any>
) {
  const token = await getOrRefreshAppSessionToken();

  const response = await fetch(`${CENTRAL_GATEWAY_URL}/payments/paystack-init`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${token}`,
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
 * Forwards any custom upstream request through your Render gateway.
 */
export async function centralProxyFetch(
  targetUrl: string,
  init?: RequestInit
): Promise<Response> {
  const token = await getOrRefreshAppSessionToken();
  const cleanGatewayUrl = CENTRAL_GATEWAY_URL.replace(/\/+$/, '');
  const proxyEndpoint = `${cleanGatewayUrl}/proxy?target=${encodeURIComponent(targetUrl)}`;

  const headers = new Headers(init?.headers || {});
  headers.set('Authorization', `Bearer ${token}`);

  return fetch(proxyEndpoint, {
    ...init,
    headers,
  });
}
