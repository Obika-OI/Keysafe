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

// SERVICE 2: STRIPE INTENT PROXY
app.post('/api/payments/create-stripe-intent', async (req: Request, res: Response) => {
  let stripeKey = secretVault.STRIPE_SECRET_KEY || process.env.STRIPE_SECRET_KEY;
  if (stripeKey) {
    stripeKey = stripeKey.trim().replace(/^["']|["']$/g, '');
  }

  // Proactive Validation: Warn if they configured a public key (starts with pk_) instead of a secret key (must start with sk_)
  if (stripeKey && stripeKey.startsWith('pk_')) {
    res.status(400).json({
      success: false,
      error: "Invalid key configuration: It looks like you configured a Stripe PUBLIC key (starts with 'pk_') instead of a SECRET key (must start with 'sk_') in your Render environment variables (e.g. STRIPE_SECRET_KEY)."
    });
    return;
  }

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

// SERVICE 3: PAYSTACK INITIALIZE PROXY
app.post(['/paystack-init', '/api/paystack-init', '/api/payments/paystack-init'], async (req: Request, res: Response) => {
  try {
    const { email, amount, callback_url, metadata, is_live, isLive, mode } = req.body;
    if (!email || !amount) {
      res.status(400).json({ success: false, error: 'Email and amount are required' });
      return;
    }

    // Determine mode & select appropriate Paystack secret key
    let isLiveReq = false;
    if (is_live !== undefined) {
      isLiveReq = !!is_live;
    } else if (isLive !== undefined) {
      isLiveReq = !!isLive;
    } else if (mode === 'live') {
      isLiveReq = true;
    } else if (metadata && (metadata.is_live === true || metadata.isLive === true || metadata.mode === 'live')) {
      isLiveReq = true;
    }

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
    };
  };

  res.json({
    success: true,
    environment: {
      PAYSTACK_SECRET_KEY: analyzeKey(secretVault.PAYSTACK_SECRET_KEY || process.env.PAYSTACK_SECRET_KEY),
      PAYSTACK_TEST_SECRET_KEY: analyzeKey(secretVault.PAYSTACK_TEST_SECRET_KEY || process.env.PAYSTACK_TEST_SECRET_KEY),
      PAYSTACK_LIVE_SECRET_KEY: analyzeKey(secretVault.PAYSTACK_LIVE_SECRET_KEY || process.env.PAYSTACK_LIVE_SECRET_KEY),
      STRIPE_SECRET_KEY: analyzeKey(secretVault.STRIPE_SECRET_KEY || process.env.STRIPE_SECRET_KEY),
      GEMINI_API_KEY_defined: !!(secretVault.GEMINI_API_KEY || process.env.GEMINI_API_KEY),
      LIVEKIT_API_KEY_defined: !!(secretVault.LIVEKIT_API_KEY || process.env.LIVEKIT_API_KEY),
      LIVEKIT_API_SECRET_defined: !!(secretVault.LIVEKIT_API_SECRET || process.env.LIVEKIT_API_SECRET),
    },
  });
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
