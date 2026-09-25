import React, { useState } from 'react';
import { Copy, Check, Code, ShieldCheck, FileText } from 'lucide-react';
import { SecurityConfig } from '../types';

interface ClientCodeGeneratorsProps {
  security: SecurityConfig;
}

export const ClientCodeGenerators: React.FC<ClientCodeGeneratorsProps> = ({
  security,
}) => {
  const [selectedLang, setSelectedLang] = useState<'helper' | 'react' | 'stripe' | 'paystack' | 'curl' | 'nextjs'>('helper');
  const [copied, setCopied] = useState<boolean>(false);

  const proxyUrl = window.location.origin;
  const masterKey = security.masterClientKey || 'a_long_random_shared_string_to_protect_your_endpoints';

  const snippets = {
    helper: `// centralApiClient.ts
// Drop this helper into any frontend app (e.g. Firebase dome-2030.web.app, Vite, Next.js)
const CENTRAL_GATEWAY_URL = "${proxyUrl}/api";
const APP_SECRET = "${masterKey}"; // Store in your frontend .env as VITE_CENTRAL_APP_SECRET

/**
 * SERVICE 1: Neutral Gemini AI Caller
 * Each app injects its unique system personality and prompt!
 */
export async function callCentralGemini(userPrompt: string, appSpecificPersona: string) {
  const response = await fetch(\`\${CENTRAL_GATEWAY_URL}/ai/generate\`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "X-App-Secret": APP_SECRET,
    },
    body: JSON.stringify({
      modelName: "gemini-2.5-flash",
      // Each calling app provides its own personality/system prompt!
      systemInstruction: appSpecificPersona,
      prompt: userPrompt,
    }),
  });

  const data = await response.json();
  if (!data.success) throw new Error(data.error);
  return data.text;
}

/**
 * SERVICE 2: Stripe Payment Intent Creator
 */
export async function createStripeIntent(amountInCents: number, currency: string = "usd") {
  const response = await fetch(\`\${CENTRAL_GATEWAY_URL}/payments/create-stripe-intent\`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "X-App-Secret": APP_SECRET,
    },
    body: JSON.stringify({ amount: amountInCents, currency }),
  });

  const data = await response.json();
  if (!data.success) throw new Error(data.error);
  return data;
}

/**
 * SERVICE 3: Paystack Transaction Initializer
 */
export async function initPaystack(email: string, amountInKobo: number, callbackUrl?: string) {
  const response = await fetch(\`\${CENTRAL_GATEWAY_URL}/payments/paystack-init\`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "X-App-Secret": APP_SECRET,
    },
    body: JSON.stringify({ email, amount: amountInKobo, callback_url: callbackUrl }),
  });

  const data = await response.json();
  if (!data.success) throw new Error(data.error);
  return data;
}`,

    react: `// Example Firebase / React Component using callCentralGemini
import React, { useState } from 'react';
import { callCentralGemini } from './centralApiClient';

export function DomeAssistant() {
  const [input, setInput] = useState('');
  const [response, setResponse] = useState('');
  const [loading, setLoading] = useState(false);

  // App-specific persona for Dome-2030
  const DOME_PERSONA = "You are the central intelligence for Dome-2030. Provide precise, technical summaries.";

  const handleSend = async () => {
    setLoading(true);
    try {
      const reply = await callCentralGemini(input, DOME_PERSONA);
      setResponse(reply);
    } catch (err: any) {
      alert('Gateway Error: ' + err.message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="p-4 bg-slate-900 rounded-lg text-white">
      <textarea value={input} onChange={(e) => setInput(e.target.value)} placeholder="Ask anything..." />
      <button onClick={handleSend} disabled={loading}>{loading ? 'Thinking...' : 'Submit'}</button>
      {response && <div className="mt-3 p-3 bg-slate-800 rounded">{response}</div>}
    </div>
  );
}`,

    stripe: `// Frontend Checkout Component (Stripe)
import { createStripeIntent } from './centralApiClient';

export async function handleCheckout() {
  try {
    // 1. Ask central Render backend to create intent with secret key
    const { clientSecret } = await createStripeIntent(2500, 'usd');
    
    // 2. Confirm payment on client with Stripe.js using clientSecret
    // const { error } = await stripe.confirmCardPayment(clientSecret, { ... });
    console.log("Stripe Client Secret ready:", clientSecret);
  } catch (e: any) {
    console.error("Checkout failed:", e.message);
  }
}`,

    paystack: `// Frontend Checkout Component (Paystack)
import { initPaystack } from './centralApiClient';

export async function handlePaystackCheckout(userEmail: string) {
  try {
    const { authorization_url, reference } = await initPaystack(userEmail, 500000, "https://dome-2030.web.app/success");
    // Redirect user to Paystack checkout window
    window.location.href = authorization_url;
  } catch (e: any) {
    console.error("Paystack Init Failed:", e.message);
  }
}`,

    curl: `# Test Neutral Gemini via Central Render Gateway:
curl -X POST "${proxyUrl}/api/ai/generate" \\
  -H "X-App-Secret: ${masterKey}" \\
  -H "Content-Type: application/json" \\
  -d '{
    "modelName": "gemini-2.5-flash",
    "systemInstruction": "You are a customer support agent for Dome-2030.",
    "prompt": "What are the core features of Dome-2030?"
  }'

# Test Stripe Payment Intent via Central Gateway:
curl -X POST "${proxyUrl}/api/payments/create-stripe-intent" \\
  -H "X-App-Secret: ${masterKey}" \\
  -H "Content-Type: application/json" \\
  -d '{"amount": 2500, "currency": "usd"}'

# Test Paystack Initialize via Central Gateway:
curl -X POST "${proxyUrl}/api/payments/paystack-init" \\
  -H "X-App-Secret: ${masterKey}" \\
  -H "Content-Type: application/json" \\
  -d '{"email": "customer@example.com", "amount": 500000}'`,

    nextjs: `// Next.js App Router (Server / Client integration)
import { callCentralGemini } from '@/centralApiClient';

export async function POST(req: Request) {
  const { prompt, persona } = await req.json();
  const text = await callCentralGemini(prompt, persona || "You are a helpful assistant.");
  return Response.json({ text });
}`,
  };

  const copyCode = () => {
    navigator.clipboard.writeText(snippets[selectedLang]);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <div className="space-y-6">
      <div className="bg-slate-900/60 border border-slate-800 rounded-xl p-6">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between pb-4 border-b border-slate-800 gap-3">
          <div>
            <div className="flex items-center gap-2">
              <Code className="w-4 h-4 text-cyan-400" />
              <h2 className="text-base font-semibold text-slate-100">Client Integration Snippets</h2>
            </div>
            <p className="text-xs text-slate-400 mt-1">
              Copy and paste ready-to-use code into your frontend app to call external APIs securely through your Render proxy.
            </p>
          </div>

          <div className="flex items-center gap-2">
            <button
              onClick={copyCode}
              className="flex items-center gap-1.5 px-3 py-1.5 bg-slate-800 hover:bg-slate-700 text-slate-200 text-xs rounded-lg transition-colors whitespace-nowrap"
            >
              {copied ? <Check className="w-3.5 h-3.5 text-emerald-400" /> : <Copy className="w-3.5 h-3.5" />}
              <span>{copied ? 'Copied' : 'Copy Snippet'}</span>
            </button>
          </div>
        </div>

        {/* Language Tabs */}
        <div className="mt-4 flex items-center gap-1.5 overflow-x-auto pb-2">
          {[
            { id: 'react', label: 'React (Hook)' },
            { id: 'nextjs', label: 'Next.js' },
            { id: 'axios', label: 'Axios' },
            { id: 'python', label: 'Python' },
            { id: 'curl', label: 'cURL' },
            { id: 'flutter', label: 'Flutter' },
          ].map((lang) => (
            <button
              key={lang.id}
              onClick={() => setSelectedLang(lang.id as any)}
              className={`px-3 py-1.5 text-xs font-mono rounded-lg transition-colors whitespace-nowrap ${
                selectedLang === lang.id
                  ? 'bg-slate-800 text-cyan-300 font-semibold border border-slate-700'
                  : 'text-slate-400 hover:text-slate-200'
              }`}
            >
              {lang.label}
            </button>
          ))}
        </div>

        {/* Code Viewer */}
        <div className="mt-3">
          <pre className="bg-slate-950 border border-slate-800 rounded-lg p-4 text-xs font-mono text-cyan-300/90 overflow-x-auto max-h-[460px] leading-relaxed">
            {snippets[selectedLang]}
          </pre>
        </div>
      </div>
    </div>
  );
};
