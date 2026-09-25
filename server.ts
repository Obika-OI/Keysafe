import express, { Request, Response, NextFunction } from 'express';
import cors from 'cors';
import dotenv from 'dotenv';
import { GoogleGenAI } from '@google/genai';

dotenv.config();

const app = express();
const PORT = Number(process.env.PORT) || 3000;

// Enable parsers
app.use(express.json({ limit: '15mb' }));
app.use(express.urlencoded({ extended: true, limit: '15mb' }));
app.use(express.text({ type: ['text/*', 'application/xml', 'application/javascript'], limit: '15mb' }));

// Allowed origins default supporting Firebase apps & local development
const defaultAllowedOrigins = [
  'https://dome-2030.web.app',
  'https://dome-2030.firebaseapp.com',
  'http://localhost:5173',
  'http://localhost:3000',
  'http://localhost:4173',
];

const envAllowedOrigins = process.env.ALLOWED_ORIGINS
  ? process.env.ALLOWED_ORIGINS.split(',').map((o) => o.trim()).filter(Boolean)
  : [];

const initialAllowedOrigins = Array.from(new Set([...defaultAllowedOrigins, ...envAllowedOrigins]));

let securityConfig = {
  requireClientKey: Boolean(process.env.REQUIRE_CLIENT_KEY === 'true' || process.env.CENTRAL_APP_SECRET),
  masterClientKey: process.env.CENTRAL_APP_SECRET || process.env.PROXY_MASTER_KEY || 'app_live_' + Math.random().toString(36).substring(2, 14),
  allowedOrigins: initialAllowedOrigins,
  rateLimitMaxRequests: Number(process.env.RATE_LIMIT_MAX) || 120,
  rateLimitWindowSeconds: Number(process.env.RATE_LIMIT_WINDOW) || 60,
};

// Vault secrets (in-memory overlay on top of process.env)
const secretVault: Record<string, string> = {
  GEMINI_API_KEY: process.env.GEMINI_API_KEY || '',
  STRIPE_SECRET_KEY: process.env.STRIPE_SECRET_KEY || '',
  PAYSTACK_SECRET_KEY: process.env.PAYSTACK_SECRET_KEY || '',
  OPENAI_API_KEY: process.env.OPENAI_API_KEY || '',
  ANTHROPIC_API_KEY: process.env.ANTHROPIC_API_KEY || '',
  GITHUB_TOKEN: process.env.GITHUB_TOKEN || '',
};

// Dynamic CORS Middleware
app.use(
  cors({
    origin: (origin, callback) => {
      if (
        !origin ||
        securityConfig.allowedOrigins.includes('*') ||
        securityConfig.allowedOrigins.includes(origin) ||
        process.env.NODE_ENV !== 'production'
      ) {
        callback(null, true);
      } else {
        callback(new Error(`Not allowed by CORS origin policy: ${origin}`));
      }
    },
    credentials: true,
    methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS', 'HEAD'],
    allowedHeaders: [
      'Content-Type',
      'Authorization',
      'X-App-Secret',
      'X-Proxy-Secret',
      'X-Target-URL',
      'X-Requested-With',
      'Cache-Control',
      'Accept',
      'anthropic-version',
    ],
    exposedHeaders: ['X-RateLimit-Limit', 'X-RateLimit-Remaining', 'X-RateLimit-Reset', 'X-Proxy-Duration-Ms'],
  })
);

// Generic false error page returned to random visitors / web crawlers
const renderFalseWarningPage = (res: Response, status = 403) => {
  res.status(status).send(`<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>403 Forbidden - Access Denied</title>
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

// Root route shows false warning / error message to any direct visitor
app.get('/', (req: Request, res: Response) => {
  renderFalseWarningPage(res, 403);
});

// Render Health Check (Minimal non-revealing response for Render uptime monitoring)
app.get(['/healthz', '/api/health'], (req: Request, res: Response) => {
  res.status(200).json({ status: 'ok', timestamp: Date.now() });
});

// Gateway Auth Verification Middleware for Protected API Endpoints
const verifyAppSecret = (req: Request, res: Response, next: NextFunction) => {
  if (req.method === 'OPTIONS' || req.path === '/healthz' || req.path === '/api/health') {
    return next();
  }

  if (!securityConfig.requireClientKey) {
    return next();
  }

  const clientSecret = req.headers['x-app-secret'] || req.headers['x-proxy-secret'] || req.headers['authorization'];
  const token = typeof clientSecret === 'string' && clientSecret.startsWith('Bearer ') ? clientSecret.slice(7).trim() : clientSecret;

  if (!token || token !== securityConfig.masterClientKey) {
    res.status(401).json({
      error: 'Unauthorized',
      message: 'Invalid client authentication token.',
    });
    return;
  }

  next();
};

app.use('/api/', verifyAppSecret);

// ==========================================
// SERVICE 1: GEMINI NEUTRAL AI PROXY
// ==========================================
app.post('/api/ai/generate', async (req: Request, res: Response) => {
  try {
    const apiKey = secretVault.GEMINI_API_KEY || process.env.GEMINI_API_KEY;
    if (!apiKey) {
      throw new Error('GEMINI_API_KEY is not configured on the central backend.');
    }

    const { contents, prompt, systemInstruction, modelName = 'gemini-2.5-flash', generationConfig, config } = req.body;

    let resolvedContents: any = contents;
    if (!resolvedContents && prompt) {
      resolvedContents = prompt;
    } else if (typeof resolvedContents === 'string') {
      resolvedContents = resolvedContents;
    }

    const ai = new GoogleGenAI({
      apiKey,
      httpOptions: {
        headers: {
          'User-Agent': 'aistudio-build',
        },
      },
    });

    let targetModel = modelName;
    if (targetModel === 'gemini-1.5-flash') targetModel = 'gemini-2.5-flash';
    if (targetModel === 'gemini-1.5-pro') targetModel = 'gemini-2.5-pro';

    const mergedConfig: any = {
      ...(generationConfig || {}),
      ...(config || {}),
    };

    if (systemInstruction) {
      mergedConfig.systemInstruction = systemInstruction;
    }

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
    res.status(500).json({
      success: false,
      error: error?.message || 'Processing failed',
    });
  }
});

// SSE Streaming for Gemini
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

// ==========================================
// SERVICE 2: STRIPE INTENT / CHECKOUT PROXY
// ==========================================
app.post('/api/payments/create-stripe-intent', async (req: Request, res: Response) => {
  const stripeKey = secretVault.STRIPE_SECRET_KEY || process.env.STRIPE_SECRET_KEY;

  try {
    const { amount, currency = 'usd', payment_method_types = ['card'], metadata } = req.body;

    if (!amount) {
      res.status(400).json({ success: false, error: 'Amount is required' });
      return;
    }

    if (!stripeKey) {
      res.json({
        success: true,
        clientSecret: `pi_test_${Math.random().toString(36).substring(2, 16)}_secret_${Math.random().toString(36).substring(2, 16)}`,
        amount,
        currency,
      });
      return;
    }

    const params = new URLSearchParams();
    params.append('amount', String(amount));
    params.append('currency', currency);
    payment_method_types.forEach((pm: string) => params.append('payment_method_types[]', pm));
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
    });
  } catch (error: any) {
    res.status(500).json({ success: false, error: error?.message || 'Payment proxy error' });
  }
});

// ==========================================
// SERVICE 3: PAYSTACK INITIALIZE PROXY
// ==========================================
app.post('/api/payments/paystack-init', async (req: Request, res: Response) => {
  const paystackKey = secretVault.PAYSTACK_SECRET_KEY || process.env.PAYSTACK_SECRET_KEY;

  try {
    const { email, amount, callback_url, metadata } = req.body;

    if (!email || !amount) {
      res.status(400).json({ success: false, error: 'Email and amount are required' });
      return;
    }

    if (!paystackKey) {
      res.json({
        success: true,
        authorization_url: `https://checkout.paystack.com/sample_auth_${Math.random().toString(36).substring(2, 10)}`,
        reference: `ref_${Math.random().toString(36).substring(2, 12)}`,
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
    });
  } catch (error: any) {
    res.status(500).json({ success: false, error: error?.message || 'Paystack proxy error' });
  }
});

// Universal Dynamic Proxy Endpoint
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
    const headersToStrip = new Set(['host', 'x-app-secret', 'x-proxy-secret', 'x-target-url', 'connection', 'content-length']);

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

// All other unmatched routes return standard 404 / 403 False Error
app.use((req: Request, res: Response) => {
  renderFalseWarningPage(res, 404);
});

app.listen(PORT, '0.0.0.0', () => {
  console.log(`🔒 Server listening on port ${PORT}`);
});
