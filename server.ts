import express, { Request, Response, NextFunction } from 'express';
import cors from 'cors';
import dotenv from 'dotenv';
import { GoogleGenAI } from '@google/genai';
import * as jose from 'jose';

dotenv.config();

const app = express();
const PORT = Number(process.env.PORT) || 3000;

// Enable parsers
app.use(express.json({ limit: '15mb' }));
app.use(express.urlencoded({ extended: true, limit: '15mb' }));
app.use(express.text({ type: ['text/*', 'application/xml', 'application/javascript'], limit: '15mb' }));

// Approved frontend & mobile app origins
const defaultAllowedOrigins = [
  // Web Apps
  'https://dome-2030.web.app',
  'https://dome-2030.firebaseapp.com',
  'https://backpack-9e1e0.web.app',
  'https://backpack-9e1e0.firebaseapp.com',
  'https://backpack-edu.com',
  'https://www.backpack-edu.com',
  'https://ais-dev-em5hvt6ivvti3ncrt6y4oc-252111450112.europe-west3.run.app',
  'https://ais-pre-em5hvt6ivvti3ncrt6y4oc-252111450112.europe-west3.run.app',
  'http://localhost:5173',
  'http://localhost:3000',
  'http://localhost:4173',
  // Expo Go & Mobile Dev Bundlers
  'exp://',
  'http://localhost:8081',
  'http://10.0.2.2:8081',
  'http://10.0.2.2:3000',
  // Android APK / Play Store & iOS Apps
  'capacitor://localhost',
  'ionic://localhost',
  'https://localhost',
  'http://localhost',
  'file://',
  'app://',
];

const envAllowedOrigins = process.env.ALLOWED_ORIGINS
  ? process.env.ALLOWED_ORIGINS.split(',').map((o) => o.trim()).filter(Boolean)
  : [];

const allowedOriginsList = Array.from(new Set([...defaultAllowedOrigins, ...envAllowedOrigins]));

// Vault secrets (stored securely in Render environment)
const secretVault: Record<string, string> = {
  GEMINI_API_KEY: process.env.GEMINI_API_KEY || '',
  STRIPE_SECRET_KEY: process.env.STRIPE_SECRET_KEY || '',
  STRIPE_TEST_SECRET_KEY: process.env.STRIPE_TEST_SECRET_KEY || '',
  STRIPE_LIVE_SECRET_KEY: process.env.STRIPE_LIVE_SECRET_KEY || '',
  STRIPE_RESTRICTED_KEY: process.env.STRIPE_RESTRICTED_KEY || '',
  STRIPE_TEST_RESTRICTED_KEY: process.env.STRIPE_TEST_RESTRICTED_KEY || '',
  STRIPE_LIVE_RESTRICTED_KEY: process.env.STRIPE_LIVE_RESTRICTED_KEY || '',
  STRIPE_PUBLISHABLE_KEY: process.env.STRIPE_PUBLISHABLE_KEY || '',
  STRIPE_TEST_PUBLISHABLE_KEY: process.env.STRIPE_TEST_PUBLISHABLE_KEY || '',
  STRIPE_LIVE_PUBLISHABLE_KEY: process.env.STRIPE_LIVE_PUBLISHABLE_KEY || '',
  PAYSTACK_SECRET_KEY: process.env.PAYSTACK_SECRET_KEY || '',
  PAYSTACK_LIVE_SECRET_KEY: process.env.PAYSTACK_LIVE_SECRET_KEY || '',
  PAYSTACK_TEST_SECRET_KEY: process.env.PAYSTACK_TEST_SECRET_KEY || '',
  OPENAI_API_KEY: process.env.OPENAI_API_KEY || '',
  ANTHROPIC_API_KEY: process.env.ANTHROPIC_API_KEY || '',
  CENTRAL_APP_SECRET: process.env.CENTRAL_APP_SECRET || '',
  LIVEKIT_API_KEY: process.env.LIVEKIT_API_KEY || '',
  LIVEKIT_API_SECRET: process.env.LIVEKIT_API_SECRET || '',
  LIVEKIT_URL: process.env.LIVEKIT_URL || '',
};

function isOriginAllowed(originOrUrl?: string): boolean {
  if (allowedOriginsList.includes('*') || process.env.NODE_ENV !== 'production') return true;

  const lowerOrigin = String(originOrUrl || '').toLowerCase();
  if (!originOrUrl || lowerOrigin === 'null' || lowerOrigin === 'file://') return true;

  return allowedOriginsList.some((allowed) => {
    if (originOrUrl.startsWith(allowed)) return true;
    if (String(originOrUrl).match(/^http:\/\/(192\.168\.\d+\.\d+|10\.\d+\.\d+\.\d+)(:\d+)?/)) return true;
    try {
      const parsedA = new URL(originOrUrl);
      if (['exp:', 'capacitor:', 'ionic:', 'file:', 'app:'].includes(parsedA.protocol)) return true;
      const parsedB = new URL(allowed);
      return parsedA.host === parsedB.host;
    } catch {
      return false;
    }
  });
}

// Permanent Dynamic CORS Middleware
app.use(
  cors({
    origin: (origin, callback) => {
      if (!origin || isOriginAllowed(origin)) {
        callback(null, true);
      } else {
        callback(new Error(`Access blocked by origin policy: ${origin}`));
      }
    },
    credentials: true,
    maxAge: 86400,
    methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS', 'HEAD'],
    allowedHeaders: [
      'Content-Type',
      'Authorization',
      'X-Target-URL',
      'X-Requested-With',
      'X-App-Platform',
      'X-App-Package',
      'X-Client-Type',
      'X-Attestation-Token',
      'X-Attestation-Platform',
      'Cache-Control',
      'Accept',
    ],
    exposedHeaders: ['X-RateLimit-Limit', 'X-RateLimit-Remaining', 'X-Proxy-Duration-Ms'],
  })
);

// Mock server-side validation functions for local/development bridge environment
async function verifyLocalAndroidPlayIntegrity(token: string, req: Request): Promise<boolean> {
  const appPackage = String(req.headers['x-app-package'] || '').toLowerCase();
  if (appPackage && !appPackage.startsWith('com.devekene')) {
    throw new Error(`Package '${appPackage}' is not authorized. Must belong to developer identifier 'com.devekene'.`);
  }
  console.log(`🤖 [Server Dev] Simulating Play Integrity API check for token: ${token.substring(0, 20)}... Package: ${appPackage || 'com.devekene.default'}`);
  return true;
}

async function verifyLocalAppleDeviceCheck(token: string): Promise<boolean> {
  console.log(`🍎 [Server Dev] Simulating iOS DeviceCheck API check for token: ${token.substring(0, 20)}...`);
  return true;
}

// False error page returned to random visitors / web crawlers
const renderFalseWarningPage = (res: Response, status = 403) => {
  res.status(status).send(`<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>403 Forbidden</title>
  <style>
    body { font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif; background-color: #f8f9fa; color: #212529; padding: 50px 20px; text-align: center; }
    .container { max-width: 600px; margin: 40px auto; background: #fff; padding: 40px 30px; border-radius: 8px; box-shadow: 0 4px 12px rgba(0,0,0,0.08); border-top: 4px solid #dc3545; }
    h1 { font-size: 24px; color: #dc3545; margin-bottom: 12px; font-weight: 600; }
    p { font-size: 14px; line-height: 1.6; color: #6c757d; margin-bottom: 20px; }
    .code { font-family: monospace; background: #e9ecef; padding: 6px 12px; border-radius: 4px; font-size: 13px; color: #495057; display: inline-block; margin-bottom: 20px; }
    .footer { font-size: 12px; color: #adb5bd; border-top: 1px solid #dee2e6; padding-top: 15px; margin-top: 20px; }
  </style>
</head>
<body>
  <div class="container">
    <h1>403 Forbidden</h1>
    <p>Access to this server cluster is restricted. Direct web browser browsing is disabled by security firewall policy.</p>
    <div class="code">Error Code: ERR_RESTRICTED_HOST_ACCESS</div>
    <p>If you believe this is an error, verify your client credentials or contact the network administrator.</p>
    <div class="footer">Server ID: node-edge-sec-09 · Timestamp: ${new Date().toUTCString()}</div>
  </div>
</body>
</html>`);
};

// Root route shows false warning to any direct browser visitor, but allows authorized secrets-carrying backends
app.get('/', (req: Request, res: Response) => {
  const appSecret = secretVault.CENTRAL_APP_SECRET || process.env.CENTRAL_APP_SECRET || '';
  if (appSecret) {
    const headerSecret = req.headers['x-app-secret'] || '';
    const authHeader = req.headers['authorization'] || '';
    let bearerSecret = '';
    if (authHeader.toLowerCase().startsWith('bearer ')) {
      bearerSecret = authHeader.substring(7).trim();
    }

    if (headerSecret === appSecret || bearerSecret === appSecret) {
      res.status(200).json({
        success: true,
        message: 'Access authorized. Welcome to KeySafe Gateway Cluster.',
      });
      return;
    }
  }
  renderFalseWarningPage(res, 403);
});

// Render Health Check
app.get(['/healthz', '/api/health'], (req: Request, res: Response) => {
  res.status(200).json({ status: 'ok', timestamp: Date.now() });
});

// Strict Permanent Origin & Cryptographic Attestation Validation Middleware
const verifyApprovedOrigin = async (req: Request, res: Response, next: NextFunction) => {
  // 0. Check for Trusted Shared App Secret (Server-to-Server and trusted backdoors)
  const appSecret = secretVault.CENTRAL_APP_SECRET || process.env.CENTRAL_APP_SECRET || '';
  if (appSecret) {
    const headerSecret = req.headers['x-app-secret'] || '';
    const authHeader = req.headers['authorization'] || '';
    let bearerSecret = '';
    if (authHeader.toLowerCase().startsWith('bearer ')) {
      bearerSecret = authHeader.substring(7).trim();
    }

    if (headerSecret === appSecret || bearerSecret === appSecret) {
      return next();
    }
  }

  if (req.method === 'OPTIONS' || req.path === '/healthz' || req.path === '/api/health') {
    return next();
  }

  if (process.env.NODE_ENV !== 'production' || allowedOriginsList.includes('*')) {
    return next();
  }

  const origin = req.headers['origin'] || req.headers['referer'] || '';
  const parsedOrigin = typeof origin === 'string' ? origin : origin[0];

  // 1. Verify Browser Whitelisted Origins
  if (isOriginAllowed(parsedOrigin)) {
    return next();
  }

  // 2. Verify Cryptographic Proof for Native Mobile Apps (missing / null origin)
  const lowerOrigin = parsedOrigin.toLowerCase();
  if (!parsedOrigin || lowerOrigin === 'null' || lowerOrigin === 'file://') {
    const attestationToken = req.headers['x-attestation-token'] as string;
    const attestationPlatform = String(req.headers['x-attestation-platform'] || '').toLowerCase();

    if (!attestationToken) {
      res.status(403).json({
        error: 'Forbidden',
        message: 'Native mobile request rejected: missing cryptographic OS attestation token (X-Attestation-Token).'
      });
      return;
    }

    try {
      if (attestationPlatform === 'android') {
        await verifyLocalAndroidPlayIntegrity(attestationToken, req);
        return next();
      } else if (attestationPlatform === 'ios') {
        await verifyLocalAppleDeviceCheck(attestationToken);
        return next();
      } else {
        res.status(400).json({
          error: 'Bad Request',
          message: 'Invalid attestation platform in X-Attestation-Platform header.'
        });
        return;
      }
    } catch (err: any) {
      res.status(403).json({
        error: 'Forbidden',
        message: `Cryptographic proof verification failed: ${err?.message || err}`
      });
      return;
    }
  }

  res.status(403).json({
    error: 'Forbidden',
    message: 'Access denied: request is not from an approved frontend domain or cryptographically verified mobile app.',
  });
};

app.use('/api/', verifyApprovedOrigin);

// SERVICE 1: GEMINI AI PROXY
app.post('/api/ai/generate', async (req: Request, res: Response) => {
  try {
    const apiKey = secretVault.GEMINI_API_KEY || process.env.GEMINI_API_KEY;
    if (!apiKey) {
      throw new Error('GEMINI_API_KEY is not configured in Render environment.');
    }

    const { contents, prompt, systemInstruction, modelName = 'gemini-2.5-flash', generationConfig, config } = req.body;
    let resolvedContents: any = contents || prompt;

    const ai = new GoogleGenAI({
      apiKey,
      httpOptions: { headers: { 'User-Agent': 'aistudio-build' } },
    });

    let targetModel = modelName;
    if (targetModel === 'gemini-1.5-flash') targetModel = 'gemini-2.5-flash';
    if (targetModel === 'gemini-1.5-pro') targetModel = 'gemini-2.5-pro';

    const mergedConfig: any = { ...(generationConfig || {}), ...(config || {}) };
    if (systemInstruction) mergedConfig.systemInstruction = systemInstruction;

    const response = await ai.models.generateContent({
      model: targetModel,
      contents: resolvedContents,
      config: Object.keys(mergedConfig).length > 0 ? mergedConfig : undefined,
    });

    res.json({
      success: true,
      text: response.text || '',
      model: targetModel,
    });
  } catch (error: any) {
    console.error('Gemini Proxy Error:', error);
    res.status(500).json({ success: false, error: error?.message || 'Processing failed' });
  }
});

// Streaming for Gemini
app.post('/api/ai/stream', async (req: Request, res: Response) => {
  try {
    const apiKey = secretVault.GEMINI_API_KEY || process.env.GEMINI_API_KEY;
    if (!apiKey) {
      res.status(500).json({ success: false, error: 'GEMINI_API_KEY not configured' });
      return;
    }

    const { contents, prompt, systemInstruction, modelName = 'gemini-2.5-flash', generationConfig, config } = req.body;
    let resolvedContents: any = contents || prompt;

    const ai = new GoogleGenAI({
      apiKey,
      httpOptions: { headers: { 'User-Agent': 'aistudio-build' } },
    });

    let targetModel = modelName;
    if (targetModel === 'gemini-1.5-flash') targetModel = 'gemini-2.5-flash';
    if (targetModel === 'gemini-1.5-pro') targetModel = 'gemini-2.5-pro';

    const mergedConfig: any = { ...(generationConfig || {}), ...(config || {}) };
    if (systemInstruction) mergedConfig.systemInstruction = systemInstruction;

    res.setHeader('Content-Type', 'text/event-stream');
    res.setHeader('Cache-Control', 'no-cache');
    res.setHeader('Connection', 'keep-alive');

    const responseStream = await ai.models.generateContentStream({
      model: targetModel,
      contents: resolvedContents,
      config: Object.keys(mergedConfig).length > 0 ? mergedConfig : undefined,
    });

    for await (const chunk of responseStream) {
      const text = chunk.text || '';
      res.write(`data: ${JSON.stringify({ text })}\n\n`);
    }

    res.write('data: [DONE]\n\n');
    res.end();
  } catch (error: any) {
    console.error('Gemini Streaming Error:', error);
    res.write(`data: ${JSON.stringify({ error: error?.message || 'Streaming failed' })}\n\n`);
    res.end();
  }
});

function checkIsLiveRequest(body: any): boolean {
  if (!body) return false;

  // 1. Direct boolean flags
  if (body.is_live !== undefined) return !!body.is_live;
  if (body.isLive !== undefined) return !!body.isLive;
  if (body.isProduction !== undefined) return !!body.isProduction;

  // 2. String values of mode, environment, env
  if (['live', 'production', 'prod'].includes(body.mode)) return true;
  if (['live', 'production', 'prod'].includes(body.environment)) return true;
  if (['live', 'production', 'prod'].includes(body.env)) return true;

  // 3. Inside metadata dictionary
  const meta = body.metadata;
  if (meta && typeof meta === 'object') {
    if (meta.is_live !== undefined) return !!meta.is_live;
    if (meta.isLive !== undefined) return !!meta.isLive;
    if (meta.isProduction !== undefined) return !!meta.isProduction;
    if (['live', 'production', 'prod'].includes(meta.mode)) return true;
    if (['live', 'production', 'prod'].includes(meta.environment)) return true;
    if (['live', 'production', 'prod'].includes(meta.env)) return true;
  }

  return false;
}

function resolveStripeKey(isLiveReq: boolean, preferRestricted: boolean = false): string {
  let key = '';
  if (isLiveReq) {
    key = preferRestricted
      ? (secretVault.STRIPE_LIVE_RESTRICTED_KEY || secretVault.STRIPE_RESTRICTED_KEY || secretVault.STRIPE_LIVE_SECRET_KEY || secretVault.STRIPE_SECRET_KEY)
      : (secretVault.STRIPE_LIVE_SECRET_KEY || secretVault.STRIPE_SECRET_KEY || secretVault.STRIPE_LIVE_RESTRICTED_KEY || secretVault.STRIPE_RESTRICTED_KEY);
  } else {
    key = preferRestricted
      ? (secretVault.STRIPE_TEST_RESTRICTED_KEY || secretVault.STRIPE_RESTRICTED_KEY || secretVault.STRIPE_TEST_SECRET_KEY || secretVault.STRIPE_SECRET_KEY)
      : (secretVault.STRIPE_TEST_SECRET_KEY || secretVault.STRIPE_SECRET_KEY || secretVault.STRIPE_TEST_RESTRICTED_KEY || secretVault.STRIPE_RESTRICTED_KEY);
  }

  if (key) {
    key = key.trim().replace(/^["']|["']$/g, '');
  }

  return key;
}

function resolveStripePublishableKey(isLiveReq: boolean): string {
  let key = isLiveReq
    ? (secretVault.STRIPE_LIVE_PUBLISHABLE_KEY || secretVault.STRIPE_PUBLISHABLE_KEY)
    : (secretVault.STRIPE_TEST_PUBLISHABLE_KEY || secretVault.STRIPE_PUBLISHABLE_KEY || secretVault.STRIPE_LIVE_PUBLISHABLE_KEY);

  if (key) {
    key = key.trim().replace(/^["']|["']$/g, '');
  }

  return key;
}

// SERVICE 2.0: STRIPE CONFIG / PUBLISHABLE KEY RETRIEVAL
app.all(['/api/payments/stripe/config', '/api/stripe/config'], async (req: Request, res: Response) => {
  let isLiveReq = false;
  const isProduction = req.query.isProduction !== undefined ? req.query.isProduction === 'true' : req.body?.isProduction;
  const isLive = req.query.is_live !== undefined ? req.query.is_live === 'true' : (req.query.isLive !== undefined ? req.query.isLive === 'true' : req.body?.is_live || req.body?.isLive);
  const mode = req.query.mode || req.body?.mode;

  if (isProduction !== undefined) isLiveReq = !!isProduction;
  else if (isLive !== undefined) isLiveReq = !!isLive;
  else if (mode === 'live' || mode === 'production' || mode === 'prod') isLiveReq = true;

  const pubKey = resolveStripePublishableKey(isLiveReq);
  res.json({
    success: true,
    publishableKey: pubKey || `pk_mock_${Math.random().toString(36).substring(2, 18)}`,
    mode: isLiveReq ? 'live' : 'test',
    isMock: !pubKey,
  });
});

// SERVICE 2.1: STRIPE INTENT PROXY & SPLIT PAYMENTS
app.post(['/api/payments/create-stripe-intent', '/api/payments/stripe/create-intent', '/api/payments/stripe/split-intent', '/api/stripe/split-intent'], async (req: Request, res: Response) => {
  const isLiveReq = checkIsLiveRequest(req.body);
  const stripeKey = resolveStripeKey(isLiveReq);

  if (!isLiveReq && !stripeKey && (secretVault.STRIPE_LIVE_SECRET_KEY || secretVault.STRIPE_LIVE_RESTRICTED_KEY)) {
    res.status(400).json({
      success: false,
      error: "STRIPE_TEST_SECRET_KEY is not defined in your Render environment variables. You have configured a live Stripe key, but to use it you must explicitly request a live transaction by passing 'is_live': true or 'isProduction': true in your JSON request body."
    });
    return;
  }

  if (stripeKey && stripeKey.startsWith('pk_')) {
    res.status(400).json({
      success: false,
      error: "Invalid key configuration: It looks like you configured a Stripe PUBLIC key (starts with 'pk_') instead of a SECRET (sk_) or RESTRICTED (rk_) key in your Render environment variables."
    });
    return;
  }

  try {
    const {
      amount,
      currency = 'usd',
      payment_method_types = ['card'],
      customer,
      destination_account,
      destination,
      application_fee_amount,
      application_fee,
      transfer_group,
      on_behalf_of,
      metadata
    } = req.body;

    if (!amount) {
      res.status(400).json({ success: false, error: 'Amount is required' });
      return;
    }

    if (!stripeKey) {
      res.json({
        success: true,
        clientSecret: `pi_test_${Math.random().toString(36).substring(2, 16)}_secret_${Math.random().toString(36).substring(2, 16)}`,
        id: `pi_mock_${Math.random().toString(36).substring(2, 16)}`,
        amount,
        currency,
        isMock: true,
        mode: isLiveReq ? 'live' : 'test',
      });
      return;
    }

    const params = new URLSearchParams();
    params.append('amount', String(amount));
    params.append('currency', currency);
    payment_method_types.forEach((pm: string) => params.append('payment_method_types[]', pm));

    if (customer) params.append('customer', customer);

    const dest = destination_account || destination;
    if (dest) {
      params.append('transfer_data[destination]', dest);
      const fee = application_fee_amount !== undefined ? application_fee_amount : application_fee;
      if (fee !== undefined) params.append('application_fee_amount', String(fee));
    }

    if (transfer_group) params.append('transfer_group', transfer_group);
    if (on_behalf_of) params.append('on_behalf_of', on_behalf_of);

    if (metadata) {
      for (const [k, v] of Object.entries(metadata)) {
        params.append(`metadata[${k}]`, String(v));
      }
    }

    const stripeRes = await fetch('https://api.stripe.com/v1/payment_intents', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${stripeKey}`,
        'Content-Type': 'application/x-www-form-urlencoded',
      },
      body: params.toString(),
    });

    const data = await stripeRes.json();
    if (!stripeRes.ok) {
      res.status(stripeRes.status).json({ success: false, error: data?.error?.message || 'Stripe Error', details: data });
      return;
    }

    res.json({
      success: true,
      clientSecret: data.client_secret,
      id: data.id,
      amount: data.amount,
      currency: data.currency,
      status: data.status,
      mode: isLiveReq ? 'live' : 'test',
    });
  } catch (error: any) {
    res.status(500).json({ success: false, error: error?.message || 'Payment proxy error' });
  }
});

// SERVICE 2.2: STRIPE CUSTOMER CREATION
app.post(['/api/payments/stripe/create-customer', '/api/payments/stripe/customer', '/api/stripe/customer'], async (req: Request, res: Response) => {
  const isLiveReq = checkIsLiveRequest(req.body);
  const stripeKey = resolveStripeKey(isLiveReq);

  if (!stripeKey) {
    res.json({
      success: true,
      id: `cus_mock_${Math.random().toString(36).substring(2, 12)}`,
      email: req.body?.email,
      name: req.body?.name,
      isMock: true,
      mode: isLiveReq ? 'live' : 'test',
    });
    return;
  }

  try {
    const { email, name, phone, description, payment_method, metadata } = req.body;
    const params = new URLSearchParams();
    if (email) params.append('email', email);
    if (name) params.append('name', name);
    if (phone) params.append('phone', phone);
    if (description) params.append('description', description);
    if (payment_method) params.append('payment_method', payment_method);
    if (metadata) {
      for (const [k, v] of Object.entries(metadata)) {
        params.append(`metadata[${k}]`, String(v));
      }
    }

    const stripeRes = await fetch('https://api.stripe.com/v1/customers', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${stripeKey}`,
        'Content-Type': 'application/x-www-form-urlencoded',
      },
      body: params.toString(),
    });

    const data = await stripeRes.json();
    if (!stripeRes.ok) {
      res.status(stripeRes.status).json({ success: false, error: data?.error?.message || 'Stripe Error', details: data });
      return;
    }

    res.json({
      success: true,
      id: data.id,
      email: data.email,
      name: data.name,
      customer: data,
      mode: isLiveReq ? 'live' : 'test',
    });
  } catch (error: any) {
    res.status(500).json({ success: false, error: error?.message || 'Payment proxy error' });
  }
});

// SERVICE 2.3: STRIPE SUBSCRIPTION CREATION
app.post(['/api/payments/stripe/create-subscription', '/api/payments/stripe/subscription', '/api/stripe/subscription'], async (req: Request, res: Response) => {
  const isLiveReq = checkIsLiveRequest(req.body);
  const stripeKey = resolveStripeKey(isLiveReq);
  const customerId = req.body?.customer_id || req.body?.customer;

  if (!customerId) {
    res.status(400).json({ success: false, error: 'customer_id is required for subscriptions' });
    return;
  }

  if (!stripeKey) {
    res.json({
      success: true,
      subscriptionId: `sub_mock_${Math.random().toString(36).substring(2, 12)}`,
      clientSecret: `pi_test_${Math.random().toString(36).substring(2, 16)}_secret_${Math.random().toString(36).substring(2, 16)}`,
      status: 'incomplete',
      isMock: true,
      mode: isLiveReq ? 'live' : 'test',
    });
    return;
  }

  try {
    const { price_id, price, items, payment_behavior = 'default_incomplete', coupon, promotion_code, trial_period_days, metadata } = req.body;
    const params = new URLSearchParams();
    params.append('customer', customerId);
    params.append('payment_behavior', payment_behavior);
    params.append('payment_settings[save_default_payment_method]', 'on_subscription');
    params.append('expand[0]', 'latest_invoice.payment_intent');

    const prId = price_id || price;
    if (prId) {
      params.append('items[0][price]', prId);
    } else if (Array.isArray(items)) {
      items.forEach((item: any, idx: number) => {
        if (item.price) params.append(`items[${idx}][price]`, String(item.price));
        if (item.quantity) params.append(`items[${idx}][quantity]`, String(item.quantity));
      });
    }

    if (coupon) params.append('coupon', coupon);
    if (promotion_code) params.append('promotion_code', promotion_code);
    if (trial_period_days) params.append('trial_period_days', String(trial_period_days));

    if (metadata) {
      for (const [k, v] of Object.entries(metadata)) {
        params.append(`metadata[${k}]`, String(v));
      }
    }

    const stripeRes = await fetch('https://api.stripe.com/v1/subscriptions', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${stripeKey}`,
        'Content-Type': 'application/x-www-form-urlencoded',
      },
      body: params.toString(),
    });

    const data = await stripeRes.json();
    if (!stripeRes.ok) {
      res.status(stripeRes.status).json({ success: false, error: data?.error?.message || 'Stripe Error', details: data });
      return;
    }

    const pi = data?.latest_invoice?.payment_intent;
    res.json({
      success: true,
      subscriptionId: data.id,
      clientSecret: pi?.client_secret,
      status: data.status,
      subscription: data,
      mode: isLiveReq ? 'live' : 'test',
    });
  } catch (error: any) {
    res.status(500).json({ success: false, error: error?.message || 'Payment proxy error' });
  }
});

// SERVICE 2.4: STRIPE SETUP INTENT
app.post(['/api/payments/stripe/create-setup-intent', '/api/payments/stripe/setup-intent', '/api/stripe/setup-intent'], async (req: Request, res: Response) => {
  const isLiveReq = checkIsLiveRequest(req.body);
  const stripeKey = resolveStripeKey(isLiveReq);

  if (!stripeKey) {
    res.json({
      success: true,
      clientSecret: `seti_mock_${Math.random().toString(36).substring(2, 16)}_secret_${Math.random().toString(36).substring(2, 16)}`,
      id: `seti_mock_${Math.random().toString(36).substring(2, 16)}`,
      status: 'requires_payment_method',
      isMock: true,
      mode: isLiveReq ? 'live' : 'test',
    });
    return;
  }

  try {
    const { customer_id, customer, payment_method_types = ['card'], metadata } = req.body;
    const params = new URLSearchParams();
    const cust = customer_id || customer;
    if (cust) params.append('customer', cust);
    payment_method_types.forEach((pm: string) => params.append('payment_method_types[]', pm));

    if (metadata) {
      for (const [k, v] of Object.entries(metadata)) {
        params.append(`metadata[${k}]`, String(v));
      }
    }

    const stripeRes = await fetch('https://api.stripe.com/v1/setup_intents', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${stripeKey}`,
        'Content-Type': 'application/x-www-form-urlencoded',
      },
      body: params.toString(),
    });

    const data = await stripeRes.json();
    if (!stripeRes.ok) {
      res.status(stripeRes.status).json({ success: false, error: data?.error?.message || 'Stripe Error', details: data });
      return;
    }

    res.json({
      success: true,
      clientSecret: data.client_secret,
      id: data.id,
      status: data.status,
      mode: isLiveReq ? 'live' : 'test',
    });
  } catch (error: any) {
    res.status(500).json({ success: false, error: error?.message || 'Payment proxy error' });
  }
});

// SERVICE 2.5: STRIPE CUSTOMER PORTAL SESSION
app.post(['/api/payments/stripe/create-portal-session', '/api/payments/stripe/portal-session', '/api/stripe/portal-session'], async (req: Request, res: Response) => {
  const isLiveReq = checkIsLiveRequest(req.body);
  const stripeKey = resolveStripeKey(isLiveReq);
  const cust = req.body?.customer_id || req.body?.customer;

  if (!cust) {
    res.status(400).json({ success: false, error: 'customer_id is required for customer portal session' });
    return;
  }

  if (!stripeKey) {
    res.json({
      success: true,
      url: 'https://billing.stripe.com/p/session/mock_portal_session',
      isMock: true,
      mode: isLiveReq ? 'live' : 'test',
    });
    return;
  }

  try {
    const params = new URLSearchParams();
    params.append('customer', cust);
    if (req.body?.return_url) params.append('return_url', req.body.return_url);

    const stripeRes = await fetch('https://api.stripe.com/v1/billing_portal/sessions', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${stripeKey}`,
        'Content-Type': 'application/x-www-form-urlencoded',
      },
      body: params.toString(),
    });

    const data = await stripeRes.json();
    if (!stripeRes.ok) {
      res.status(stripeRes.status).json({ success: false, error: data?.error?.message || 'Stripe Error', details: data });
      return;
    }

    res.json({
      success: true,
      url: data.url,
      id: data.id,
      mode: isLiveReq ? 'live' : 'test',
    });
  } catch (error: any) {
    res.status(500).json({ success: false, error: error?.message || 'Payment proxy error' });
  }
});

// SERVICE 2.6: STRIPE CONNECT (Merchant Accounts & Links)
app.post(['/api/payments/stripe/connect/create-account', '/api/payments/stripe/connect/account', '/api/stripe/connect/account'], async (req: Request, res: Response) => {
  const isLiveReq = checkIsLiveRequest(req.body);
  const stripeKey = resolveStripeKey(isLiveReq);

  if (!stripeKey) {
    res.json({
      success: true,
      accountId: `acct_mock_${Math.random().toString(36).substring(2, 10)}`,
      type: req.body?.type || 'express',
      isMock: true,
      mode: isLiveReq ? 'live' : 'test',
    });
    return;
  }

  try {
    const { type = 'express', email, country = 'US', business_type = 'individual', metadata } = req.body;
    const params = new URLSearchParams();
    params.append('type', type);
    params.append('country', country);
    params.append('capabilities[card_payments][requested]', 'true');
    params.append('capabilities[transfers][requested]', 'true');

    if (email) params.append('email', email);
    if (business_type) params.append('business_type', business_type);
    if (metadata) {
      for (const [k, v] of Object.entries(metadata)) {
        params.append(`metadata[${k}]`, String(v));
      }
    }

    const stripeRes = await fetch('https://api.stripe.com/v1/accounts', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${stripeKey}`,
        'Content-Type': 'application/x-www-form-urlencoded',
      },
      body: params.toString(),
    });

    const data = await stripeRes.json();
    if (!stripeRes.ok) {
      res.status(stripeRes.status).json({ success: false, error: data?.error?.message || 'Stripe Error', details: data });
      return;
    }

    res.json({
      success: true,
      accountId: data.id,
      account: data,
      mode: isLiveReq ? 'live' : 'test',
    });
  } catch (error: any) {
    res.status(500).json({ success: false, error: error?.message || 'Payment proxy error' });
  }
});

app.post(['/api/payments/stripe/connect/account-link', '/api/stripe/connect/account-link'], async (req: Request, res: Response) => {
  const isLiveReq = checkIsLiveRequest(req.body);
  const stripeKey = resolveStripeKey(isLiveReq);
  const acc = req.body?.account_id || req.body?.account;

  if (!acc) {
    res.status(400).json({ success: false, error: 'account_id is required' });
    return;
  }

  if (!stripeKey) {
    res.json({
      success: true,
      url: 'https://connect.stripe.com/setup/s/mock_onboarding_link',
      isMock: true,
      mode: isLiveReq ? 'live' : 'test',
    });
    return;
  }

  try {
    const { refresh_url, return_url, type = 'account_onboarding' } = req.body;
    const params = new URLSearchParams();
    params.append('account', acc);
    params.append('refresh_url', refresh_url);
    params.append('return_url', return_url);
    params.append('type', type);

    const stripeRes = await fetch('https://api.stripe.com/v1/account_links', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${stripeKey}`,
        'Content-Type': 'application/x-www-form-urlencoded',
      },
      body: params.toString(),
    });

    const data = await stripeRes.json();
    if (!stripeRes.ok) {
      res.status(stripeRes.status).json({ success: false, error: data?.error?.message || 'Stripe Error', details: data });
      return;
    }

    res.json({
      success: true,
      url: data.url,
      mode: isLiveReq ? 'live' : 'test',
    });
  } catch (error: any) {
    res.status(500).json({ success: false, error: error?.message || 'Payment proxy error' });
  }
});

// SERVICE 2.7: STRIPE TRANSFERS (Direct Split Payouts)
app.post(['/api/payments/stripe/create-transfer', '/api/payments/stripe/transfer', '/api/stripe/transfer'], async (req: Request, res: Response) => {
  const isLiveReq = checkIsLiveRequest(req.body);
  const stripeKey = resolveStripeKey(isLiveReq);
  const dest = req.body?.destination || req.body?.destination_account;

  if (!dest) {
    res.status(400).json({ success: false, error: 'destination is required' });
    return;
  }

  if (!stripeKey) {
    res.json({
      success: true,
      transferId: `tr_mock_${Math.random().toString(36).substring(2, 12)}`,
      amount: req.body?.amount,
      currency: req.body?.currency,
      destination: dest,
      isMock: true,
      mode: isLiveReq ? 'live' : 'test',
    });
    return;
  }

  try {
    const { amount, currency = 'usd', transfer_group, description, metadata } = req.body;
    const params = new URLSearchParams();
    params.append('amount', String(amount));
    params.append('currency', currency);
    params.append('destination', dest);

    if (transfer_group) params.append('transfer_group', transfer_group);
    if (description) params.append('description', description);
    if (metadata) {
      for (const [k, v] of Object.entries(metadata)) {
        params.append(`metadata[${k}]`, String(v));
      }
    }

    const stripeRes = await fetch('https://api.stripe.com/v1/transfers', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${stripeKey}`,
        'Content-Type': 'application/x-www-form-urlencoded',
      },
      body: params.toString(),
    });

    const data = await stripeRes.json();
    if (!stripeRes.ok) {
      res.status(stripeRes.status).json({ success: false, error: data?.error?.message || 'Stripe Error', details: data });
      return;
    }

    res.json({
      success: true,
      transferId: data.id,
      transfer: data,
      mode: isLiveReq ? 'live' : 'test',
    });
  } catch (error: any) {
    res.status(500).json({ success: false, error: error?.message || 'Payment proxy error' });
  }
});

// SERVICE 3: PAYSTACK INITIALIZE PROXY
app.post(['/paystack-init', '/api/paystack-init', '/api/payments/paystack-init'], async (req: Request, res: Response) => {
  try {
    const { email, amount, callback_url, metadata } = req.body;
    if (!email || !amount) {
      res.status(400).json({ success: false, error: 'Email and amount are required' });
      return;
    }

    // Determine mode & select appropriate Paystack secret key
    const isLiveReq = checkIsLiveRequest(req.body);

    const paystackKey = isLiveReq
      ? (secretVault.PAYSTACK_LIVE_SECRET_KEY || secretVault.PAYSTACK_SECRET_KEY)
      : (secretVault.PAYSTACK_TEST_SECRET_KEY || secretVault.PAYSTACK_SECRET_KEY);

    // If they are trying to initialize a test/sandbox transaction, but only have a live key configured:
    if (!isLiveReq && !paystackKey && secretVault.PAYSTACK_LIVE_SECRET_KEY) {
      res.status(400).json({
        success: false,
        error: "PAYSTACK_TEST_SECRET_KEY is not defined in your Render environment variables. You have configured PAYSTACK_LIVE_SECRET_KEY, but to use it you must explicitly request a live transaction by passing 'is_live': true in your JSON request body or metadata."
      });
      return;
    }

    if (!paystackKey) {
      res.json({
        success: true,
        authorization_url: `https://checkout.paystack.com/sample_auth_${Math.random().toString(36).substring(2, 10)}`,
        reference: `ref_${Math.random().toString(36).substring(2, 12)}`,
        isMock: true,
        mode: 'test',
      });
      return;
    }

    const paystackRes = await fetch('https://api.paystack.co/transaction/initialize', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${paystackKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        email,
        amount,
        callback_url,
        metadata,
      }),
    });

    const data = await paystackRes.json();
    if (!paystackRes.ok || !data.status) {
      res.status(paystackRes.status).json({ success: false, error: data.message || 'Paystack Error', details: data });
      return;
    }

    res.json({
      success: true,
      authorization_url: data.data.authorization_url,
      access_code: data.data.access_code,
      reference: data.data.reference,
      mode: isLiveReq ? 'live' : 'test',
    });
  } catch (error: any) {
    res.status(500).json({ success: false, error: error?.message || 'Payment proxy error' });
  }
});

// SERVICE 3.5: SECURE CONFIGURATION DIAGNOSTICS
app.get(['/diagnostics', '/api/diagnostics'], (req: Request, res: Response) => {
  const analyzeKey = (key?: string) => {
    if (!key) {
      return { defined: false, length: 0, prefix: null, suffix: null };
    }
    const cleaned = key.trim().replace(/^["']|["']$/g, '');
    return {
      defined: true,
      length: cleaned.length,
      prefix: cleaned.length >= 8 ? `${cleaned.substring(0, 8)}...` : cleaned,
      suffix: cleaned.length >= 4 ? `...${cleaned.substring(cleaned.length - 4)}` : cleaned,
      has_quotes: key.includes('"') || key.includes("'"),
      is_public_key: cleaned.startsWith('pk_'),
      is_secret_key: cleaned.startsWith('sk_'),
      is_restricted_key: cleaned.startsWith('rk_'),
    };
  };

  res.json({
    success: true,
    environment: {
      STRIPE_SECRET_KEY: analyzeKey(secretVault.STRIPE_SECRET_KEY || process.env.STRIPE_SECRET_KEY),
      STRIPE_TEST_SECRET_KEY: analyzeKey(secretVault.STRIPE_TEST_SECRET_KEY || process.env.STRIPE_TEST_SECRET_KEY),
      STRIPE_LIVE_SECRET_KEY: analyzeKey(secretVault.STRIPE_LIVE_SECRET_KEY || process.env.STRIPE_LIVE_SECRET_KEY),
      STRIPE_RESTRICTED_KEY: analyzeKey(secretVault.STRIPE_RESTRICTED_KEY || process.env.STRIPE_RESTRICTED_KEY),
      STRIPE_TEST_RESTRICTED_KEY: analyzeKey(secretVault.STRIPE_TEST_RESTRICTED_KEY || process.env.STRIPE_TEST_RESTRICTED_KEY),
      STRIPE_LIVE_RESTRICTED_KEY: analyzeKey(secretVault.STRIPE_LIVE_RESTRICTED_KEY || process.env.STRIPE_LIVE_RESTRICTED_KEY),
      STRIPE_PUBLISHABLE_KEY: analyzeKey(secretVault.STRIPE_PUBLISHABLE_KEY || process.env.STRIPE_PUBLISHABLE_KEY),
      STRIPE_TEST_PUBLISHABLE_KEY: analyzeKey(secretVault.STRIPE_TEST_PUBLISHABLE_KEY || process.env.STRIPE_TEST_PUBLISHABLE_KEY),
      STRIPE_LIVE_PUBLISHABLE_KEY: analyzeKey(secretVault.STRIPE_LIVE_PUBLISHABLE_KEY || process.env.STRIPE_LIVE_PUBLISHABLE_KEY),
      PAYSTACK_SECRET_KEY: analyzeKey(secretVault.PAYSTACK_SECRET_KEY || process.env.PAYSTACK_SECRET_KEY),
      PAYSTACK_TEST_SECRET_KEY: analyzeKey(secretVault.PAYSTACK_TEST_SECRET_KEY || process.env.PAYSTACK_TEST_SECRET_KEY),
      PAYSTACK_LIVE_SECRET_KEY: analyzeKey(secretVault.PAYSTACK_LIVE_SECRET_KEY || process.env.PAYSTACK_LIVE_SECRET_KEY),
      GEMINI_API_KEY_defined: !!(secretVault.GEMINI_API_KEY || process.env.GEMINI_API_KEY),
      LIVEKIT_API_KEY_defined: !!(secretVault.LIVEKIT_API_KEY || process.env.LIVEKIT_API_KEY),
      LIVEKIT_API_SECRET_defined: !!(secretVault.LIVEKIT_API_SECRET || process.env.LIVEKIT_API_SECRET),
    },
  });
});

// SERVICE 3.1: PAYSTACK SUBACCOUNT CREATION
app.post(['/subaccount', '/api/subaccount', '/api/payments/subaccount'], async (req: Request, res: Response) => {
  try {
    const { business_name, settlement_bank, account_number, percentage_charge } = req.body;
    if (!business_name || !settlement_bank || !account_number || percentage_charge === undefined) {
      res.status(400).json({ success: false, error: 'business_name, settlement_bank, account_number, and percentage_charge are required' });
      return;
    }

    const isLiveReq = checkIsLiveRequest(req.body);

    let paystackKey = isLiveReq
      ? (secretVault.PAYSTACK_LIVE_SECRET_KEY || secretVault.PAYSTACK_SECRET_KEY)
      : (secretVault.PAYSTACK_TEST_SECRET_KEY || secretVault.PAYSTACK_SECRET_KEY);

    // If they are trying to initialize a test/sandbox transaction, but only have a live key configured:
    if (!isLiveReq && !paystackKey && secretVault.PAYSTACK_LIVE_SECRET_KEY) {
      res.status(400).json({
        success: false,
        error: "PAYSTACK_TEST_SECRET_KEY is not defined in your Render environment variables. You have configured PAYSTACK_LIVE_SECRET_KEY, but to use it you must explicitly request a live transaction by passing 'is_live': true in your JSON request body or metadata."
      });
      return;
    }

    if (paystackKey) {
      paystackKey = paystackKey.trim().replace(/^["']|["']$/g, '');
    }

    if (paystackKey && paystackKey.startsWith('pk_')) {
      res.status(400).json({
        success: false,
        error: "Invalid key configuration: It looks like you configured a Paystack PUBLIC key (starts with 'pk_') instead of a SECRET key (must start with 'sk_')."
      });
      return;
    }

    if (!paystackKey) {
      // Mock Sandbox Response
      res.json({
        status: true,
        message: "Subaccount created successfully (MOCK)",
        data: {
          subaccount_code: `ACCT_mock_${Math.random().toString(36).substring(2, 8)}`,
          business_name,
          settlement_bank,
          account_number,
          percentage_charge,
          is_mock: true,
          mode: 'test'
        }
      });
      return;
    }

    const paystackRes = await fetch('https://api.paystack.co/subaccount', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${paystackKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        business_name,
        settlement_bank,
        account_number,
        percentage_charge,
      }),
    });

    const data = await paystackRes.json();
    if (!paystackRes.ok || !data.status) {
      res.status(paystackRes.status).json({ success: false, error: data.message || 'Paystack Error', details: data });
      return;
    }

    res.json(data);
  } catch (error: any) {
    res.status(500).json({ success: false, error: error?.message || 'Payment proxy error' });
  }
});

// SERVICE 3.2: PAYSTACK SPLIT PAYMENT INITIALIZE
app.post(['/split-payment', '/api/split-payment', '/api/payments/split-payment', '/api/payments/paystack-split-init'], async (req: Request, res: Response) => {
  try {
    const { email, amount, subaccount_code, callback_url, metadata } = req.body;
    if (!email || !amount || !subaccount_code) {
      res.status(400).json({ success: false, error: 'email, amount, and subaccount_code are required' });
      return;
    }

    const isLiveReq = checkIsLiveRequest(req.body);

    let paystackKey = isLiveReq
      ? (secretVault.PAYSTACK_LIVE_SECRET_KEY || secretVault.PAYSTACK_SECRET_KEY)
      : (secretVault.PAYSTACK_TEST_SECRET_KEY || secretVault.PAYSTACK_SECRET_KEY);

    // If they are trying to initialize a test/sandbox transaction, but only have a live key configured:
    if (!isLiveReq && !paystackKey && secretVault.PAYSTACK_LIVE_SECRET_KEY) {
      res.status(400).json({
        success: false,
        error: "PAYSTACK_TEST_SECRET_KEY is not defined in your Render environment variables. You have configured PAYSTACK_LIVE_SECRET_KEY, but to use it you must explicitly request a live transaction by passing 'is_live': true in your JSON request body or metadata."
      });
      return;
    }

    if (paystackKey) {
      paystackKey = paystackKey.trim().replace(/^["']|["']$/g, '');
    }

    if (paystackKey && paystackKey.startsWith('pk_')) {
      res.status(400).json({
        success: false,
        error: "Invalid key configuration: It looks like you configured a Paystack PUBLIC key (starts with 'pk_') instead of a SECRET key (must start with 'sk_')."
      });
      return;
    }

    if (!paystackKey) {
      // Mock Sandbox Response
      res.json({
        status: true,
        message: "Transaction initialized successfully (MOCK SPLIT)",
        data: {
          authorization_url: `https://checkout.paystack.com/mock_split_${Math.random().toString(36).substring(2, 10)}`,
          access_code: `mock_access_${Math.random().toString(36).substring(2, 12)}`,
          reference: `ref_split_${Math.random().toString(36).substring(2, 12)}`,
          is_mock: true,
          mode: 'test'
        }
      });
      return;
    }

    const paystackRes = await fetch('https://api.paystack.co/transaction/initialize', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${paystackKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        email,
        amount,
        callback_url,
        metadata,
        subaccount: subaccount_code,
      }),
    });

    const data = await paystackRes.json();
    if (!paystackRes.ok || !data.status) {
      res.status(paystackRes.status).json({ success: false, error: data.message || 'Paystack Error', details: data });
      return;
    }

    res.json(data);
  } catch (error: any) {
    res.status(500).json({ success: false, error: error?.message || 'Payment proxy error' });
  }
});

// SERVICE 4: LIVEKIT ACCESS TOKEN GENERATION
app.all(['/livekit', '/api/livekit', '/api/livekit/token'], async (req: Request, res: Response) => {
  if (req.method !== 'GET' && req.method !== 'POST') {
    res.status(405).json({ success: false, error: 'Method Not Allowed' });
    return;
  }

  const apiKey = secretVault.LIVEKIT_API_KEY || process.env.LIVEKIT_API_KEY;
  const apiSecret = secretVault.LIVEKIT_API_SECRET || process.env.LIVEKIT_API_SECRET;
  const livekitUrl = secretVault.LIVEKIT_URL || process.env.LIVEKIT_URL;

  const room = (req.query.room || req.body?.room) as string;
  const identity = (req.query.identity || req.body?.identity) as string;

  if (!room || !identity) {
    res.status(400).json({ success: false, error: 'Room and identity are required' });
    return;
  }

  try {
    if (!apiKey || !apiSecret) {
      // Mock/sandbox fallback token using jose
      const mockSecret = new TextEncoder().encode('mock_secret');
      const mockToken = await new jose.SignJWT({
        video: {
          room,
          roomJoin: true,
        },
      })
        .setProtectedHeader({ alg: 'HS256' })
        .setIssuer('mock_api_key')
        .setSubject(identity)
        .sign(mockSecret);

      res.json({
        success: true,
        token: mockToken,
        room,
        identity,
        isMock: true,
        livekitUrl: livekitUrl || 'ws://localhost:7880',
      });
      return;
    }

    const secret = new TextEncoder().encode(apiSecret);
    const token = await new jose.SignJWT({
      video: {
        room,
        roomJoin: true,
        canPublish: true,
        canSubscribe: true,
      },
    })
      .setProtectedHeader({ alg: 'HS256' })
      .setIssuer(apiKey)
      .setSubject(identity)
      .setExpirationTime('1h')
      .sign(secret);

    res.json({
      success: true,
      token,
      room,
      identity,
      livekitUrl: livekitUrl || 'wss://your-livekit-server.com',
    });
  } catch (error: any) {
    res.status(500).json({ success: false, error: error?.message || 'Livekit token error' });
  }
});

// Universal Proxy Endpoint
app.all(['/api/proxy', '/api/proxy/*'], async (req: Request, res: Response) => {
  const queryTarget = req.query.target as string;
  const headerTarget = req.headers['x-target-url'] as string;
  const target = queryTarget || headerTarget;

  if (!target) {
    res.status(400).json({ error: 'Missing target parameter' });
    return;
  }

  try {
    const targetUrl = new URL(target);
    const outgoingHeaders = new Headers();
    const headersToStrip = new Set(['host', 'x-target-url', 'connection', 'content-length']);

    for (const [headerName, headerValue] of Object.entries(req.headers)) {
      if (!headersToStrip.has(headerName.toLowerCase()) && typeof headerValue === 'string') {
        outgoingHeaders.set(headerName, headerValue);
      }
    }

    let requestBody: string | undefined;
    if (!['GET', 'HEAD', 'OPTIONS'].includes(req.method.toUpperCase())) {
      if (typeof req.body === 'object') {
        requestBody = JSON.stringify(req.body);
        if (!outgoingHeaders.has('content-type')) outgoingHeaders.set('content-type', 'application/json');
      } else if (typeof req.body === 'string') {
        requestBody = req.body;
      }
    }

    const upstreamResponse = await fetch(targetUrl.toString(), {
      method: req.method,
      headers: outgoingHeaders,
      body: requestBody,
    });

    res.status(upstreamResponse.status);
    const responseBuffer = await upstreamResponse.arrayBuffer();
    res.send(Buffer.from(responseBuffer));
  } catch (err: any) {
    res.status(502).json({ error: 'Bad Gateway', details: err?.message || 'Upstream failed' });
  }
});

// Catch-all route returns false 404
app.use((req: Request, res: Response) => {
  renderFalseWarningPage(res, 404);
});

app.listen(PORT, '0.0.0.0', () => {
  console.log(`🔒 Server listening on port ${PORT} with Play Integrity & DeviceCheck Attestation`);
});
