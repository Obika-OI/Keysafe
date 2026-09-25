import React, { useState } from 'react';
import { Play, Copy, Check, Sparkles, Send, ShieldAlert, Key, Clock, FileJson, ArrowUpRight } from 'lucide-react';
import { RouteConfig, VaultSecretItem } from '../types';

interface PlaygroundProps {
  routes: RouteConfig[];
  vault: Record<string, VaultSecretItem>;
  masterClientKey: string;
  requireClientKey: boolean;
  onNavigateToVault: () => void;
}

export const Playground: React.FC<PlaygroundProps> = ({
  routes,
  vault,
  masterClientKey,
  requireClientKey,
  onNavigateToVault,
}) => {
  const [selectedPresetId, setSelectedPresetId] = useState<string>('gemini');
  const [method, setMethod] = useState<'GET' | 'POST' | 'PUT' | 'DELETE' | 'PATCH'>('POST');
  const [endpointUrl, setEndpointUrl] = useState<string>('/proxy/gemini/v1beta/models/gemini-2.5-flash:generateContent');
  const [requestHeaders, setRequestHeaders] = useState<string>('{\n  "Content-Type": "application/json"\n}');
  const [requestBody, setRequestBody] = useState<string>(
    '{\n  "contents": [\n    {\n      "parts": [\n        {\n          "text": "Explain why using a backend API proxy is essential for web app security in two concise sentences."\n        }\n      ]\n    }\n  ]\n}'
  );
  const [sendProxySecret, setSendProxySecret] = useState<boolean>(true);

  // Response state
  const [isLoading, setIsLoading] = useState<boolean>(false);
  const [responseStatus, setResponseStatus] = useState<number | null>(null);
  const [responseStatusText, setResponseStatusText] = useState<string>('');
  const [responseDuration, setResponseDuration] = useState<number | null>(null);
  const [responseHeaders, setResponseHeaders] = useState<Record<string, string>>({});
  const [responseBody, setResponseBody] = useState<string>('');
  const [responseError, setResponseError] = useState<string | null>(null);
  const [copiedType, setCopiedType] = useState<string | null>(null);
  const [activeOutputTab, setActiveOutputTab] = useState<'response' | 'security-trace' | 'curl'>('response');

  const presets = [
    {
      id: 'gemini-neutral',
      name: 'Neutral Gemini (Custom Persona)',
      service: 'gemini',
      method: 'POST' as const,
      path: '/api/ai/generate',
      secretKey: 'GEMINI_API_KEY',
      body: '{\n  "modelName": "gemini-2.5-flash",\n  "systemInstruction": "You are an enthusiastic AI assistant for the Dome-2030 platform. Answer concisely and politely.",\n  "prompt": "Explain why keeping API keys on a central Render backend is better than frontend embedding in two clear bullet points."\n}',
      description: 'Neutral Gemini API proxy. Each independent frontend app injects its own custom persona & prompt.',
    },
    {
      id: 'stripe-intent',
      name: 'Stripe Payment Intent',
      service: 'stripe',
      method: 'POST' as const,
      path: '/api/payments/create-stripe-intent',
      secretKey: 'STRIPE_SECRET_KEY',
      body: '{\n  "amount": 2500,\n  "currency": "usd",\n  "metadata": {\n    "order_id": "ord_98765",\n    "app": "dome-2030"\n  }\n}',
      description: 'Creates a Stripe PaymentIntent securely using STRIPE_SECRET_KEY in server vault.',
    },
    {
      id: 'paystack-init',
      name: 'Paystack Checkout Init',
      service: 'paystack',
      method: 'POST' as const,
      path: '/api/payments/paystack-init',
      secretKey: 'PAYSTACK_SECRET_KEY',
      body: '{\n  "email": "customer@example.com",\n  "amount": 500000,\n  "callback_url": "https://dome-2030.web.app/checkout/success",\n  "metadata": {\n    "custom_fields": [\n      {\n        "display_name": "App",\n        "variable_name": "app_name",\n        "value": "Dome 2030 Web"\n      }\n    ]\n  }\n}',
      description: 'Initializes a Paystack transaction securely without leaking PAYSTACK_SECRET_KEY.',
    },
    {
      id: 'universal-target',
      name: 'Universal Proxy Target',
      service: 'custom',
      method: 'GET' as const,
      path: '/api/proxy?target=https://api.github.com/zen',
      secretKey: '',
      body: '',
      description: 'Universal dynamic proxy forwarding with sanitized headers and token injection.',
    },
  ];

  const handleSelectPreset = (presetId: string) => {
    const preset = presets.find((p) => p.id === presetId);
    if (!preset) return;
    setSelectedPresetId(presetId);
    setMethod(preset.method);
    setEndpointUrl(preset.path);
    setRequestBody(preset.body);
    setResponseBody('');
    setResponseStatus(null);
    setResponseError(null);
  };

  const handleSendRequest = async () => {
    setIsLoading(true);
    setResponseError(null);
    setResponseBody('');
    setResponseStatus(null);
    setResponseDuration(null);

    const startTime = performance.now();

    try {
      let parsedHeaders: Record<string, string> = {};
      try {
        parsedHeaders = JSON.parse(requestHeaders || '{}');
      } catch (e) {
        parsedHeaders = { 'Content-Type': 'application/json' };
      }

      if (sendProxySecret && masterClientKey) {
        parsedHeaders['X-Proxy-Secret'] = masterClientKey;
      }

      const fetchOptions: RequestInit = {
        method,
        headers: parsedHeaders,
      };

      if (!['GET', 'HEAD'].includes(method) && requestBody.trim()) {
        fetchOptions.body = requestBody;
      }

      const res = await fetch(endpointUrl, fetchOptions);
      const endTime = performance.now();
      const duration = Math.round(endTime - startTime);

      setResponseStatus(res.status);
      setResponseStatusText(res.statusText);
      setResponseDuration(duration);

      // Collect headers
      const resHeaders: Record<string, string> = {};
      res.headers.forEach((val, key) => {
        resHeaders[key] = val;
      });
      setResponseHeaders(resHeaders);

      const contentType = res.headers.get('content-type') || '';
      if (contentType.includes('application/json')) {
        const json = await res.json();
        setResponseBody(JSON.stringify(json, null, 2));
      } else {
        const text = await res.text();
        setResponseBody(text);
      }
    } catch (err: any) {
      const endTime = performance.now();
      setResponseDuration(Math.round(endTime - startTime));
      setResponseError(err?.message || 'Network request failed');
      setResponseStatus(500);
    } finally {
      setIsLoading(false);
    }
  };

  const generateCurlCommand = () => {
    let curl = `curl -X ${method} "${window.location.origin}${endpointUrl}" \\\n`;
    if (sendProxySecret && masterClientKey) {
      curl += `  -H "X-Proxy-Secret: ${masterClientKey}" \\\n`;
    }
    curl += `  -H "Content-Type: application/json"`;

    if (!['GET', 'HEAD'].includes(method) && requestBody.trim()) {
      curl += ` \\\n  -d '${requestBody.replace(/'/g, "\\'")}'`;
    }
    return curl;
  };

  const copyToClipboard = (text: string, type: string) => {
    navigator.clipboard.writeText(text);
    setCopiedType(type);
    setTimeout(() => setCopiedType(null), 2000);
  };

  // Find associated secret configuration status
  const currentPreset = presets.find((p) => p.id === selectedPresetId);
  const secretKey = currentPreset?.secretKey;
  const isSecretConfigured = secretKey ? vault[secretKey]?.configured : true;

  return (
    <div className="space-y-6">
      {/* Preset Selector Tabs */}
      <div className="bg-slate-900/50 border border-slate-800 rounded-xl p-3 flex flex-wrap items-center gap-2">
        <span className="text-xs font-medium text-slate-400 px-2 flex items-center gap-1.5">
          <Sparkles className="w-3.5 h-3.5 text-cyan-400" />
          Quick Presets:
        </span>
        {presets.map((preset) => (
          <button
            key={preset.id}
            onClick={() => handleSelectPreset(preset.id)}
            className={`px-3 py-1.5 text-xs font-medium rounded-lg transition-all ${
              selectedPresetId === preset.id
                ? 'bg-cyan-500/15 text-cyan-300 border border-cyan-500/40 shadow-sm'
                : 'bg-slate-950/60 text-slate-400 hover:text-slate-200 border border-slate-800/80'
            }`}
          >
            {preset.name}
          </button>
        ))}
      </div>

      {/* Secret warning banner if missing */}
      {secretKey && !isSecretConfigured && (
        <div className="bg-amber-950/30 border border-amber-500/40 rounded-xl p-3.5 flex items-start justify-between gap-3 text-xs text-amber-200">
          <div className="flex items-start gap-2.5">
            <ShieldAlert className="w-4 h-4 text-amber-400 shrink-0 mt-0.5" />
            <div>
              <span className="font-semibold text-amber-300">Vault Secret Missing: {secretKey}</span>
              <p className="text-amber-300/80 mt-0.5">
                The proxy route is active, but `{secretKey}` is not set in your server vault yet. Requests to this upstream might fail with 401.
              </p>
            </div>
          </div>
          <button
            onClick={onNavigateToVault}
            className="flex items-center gap-1 px-2.5 py-1 text-xs font-medium bg-amber-500/20 hover:bg-amber-500/30 text-amber-300 border border-amber-500/40 rounded-lg whitespace-nowrap transition-colors"
          >
            <Key className="w-3 h-3" />
            <span>Set in Vault</span>
          </button>
        </div>
      )}

      {/* Main Request & Response Grid */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        {/* Left Column: Request Builder */}
        <div className="lg:col-span-6 bg-slate-900/60 border border-slate-800 rounded-xl p-5 flex flex-col">
          <div className="flex items-center justify-between pb-3 border-b border-slate-800/80 mb-4">
            <span className="text-xs font-semibold uppercase tracking-wider text-slate-300">Client Request Builder</span>
            <div className="flex items-center gap-2">
              <label className="flex items-center gap-1.5 text-xs text-slate-400 cursor-pointer select-none">
                <input
                  type="checkbox"
                  checked={sendProxySecret}
                  onChange={(e) => setSendProxySecret(e.target.checked)}
                  className="rounded border-slate-700 bg-slate-950 text-cyan-500 focus:ring-cyan-500/20"
                />
                <span>Attach Master Key</span>
              </label>
            </div>
          </div>

          {/* Method & URL */}
          <div className="flex gap-2 mb-4">
            <select
              value={method}
              onChange={(e) => setMethod(e.target.value as any)}
              aria-label="HTTP Method"
              className="bg-slate-950 border border-slate-800 text-cyan-400 font-mono text-xs font-bold rounded-lg px-3 py-2.5 focus:outline-none focus:border-cyan-500"
            >
              <option value="GET">GET</option>
              <option value="POST">POST</option>
              <option value="PUT">PUT</option>
              <option value="PATCH">PATCH</option>
              <option value="DELETE">DELETE</option>
            </select>
            <div className="flex-1 relative">
              <input
                type="text"
                value={endpointUrl}
                onChange={(e) => setEndpointUrl(e.target.value)}
                placeholder="/proxy/service/path or /api/proxy?target=..."
                className="w-full bg-slate-950 border border-slate-800 text-slate-200 font-mono text-xs rounded-lg px-3.5 py-2.5 focus:outline-none focus:border-cyan-500 focus:ring-1 focus:ring-cyan-500/20"
              />
            </div>
          </div>

          {/* Request Headers */}
          <div className="mb-4">
            <div className="flex items-center justify-between text-xs text-slate-400 mb-1.5 font-medium">
              <span>Client Request Headers (JSON)</span>
              <span className="text-[11px] text-slate-500 font-mono">No upstream secrets here!</span>
            </div>
            <textarea
              value={requestHeaders}
              onChange={(e) => setRequestHeaders(e.target.value)}
              rows={2}
              className="w-full bg-slate-950/90 border border-slate-800 rounded-lg p-3 text-xs font-mono text-slate-300 focus:outline-none focus:border-cyan-500 focus:ring-1 focus:ring-cyan-500/20 resize-none"
            />
          </div>

          {/* Request Body */}
          {['POST', 'PUT', 'PATCH'].includes(method) && (
            <div className="flex-1 mb-4 flex flex-col">
              <div className="flex items-center justify-between text-xs text-slate-400 mb-1.5 font-medium">
                <span>Request Payload (JSON)</span>
                <button
                  onClick={() => {
                    try {
                      setRequestBody(JSON.stringify(JSON.parse(requestBody), null, 2));
                    } catch (e) {}
                  }}
                  className="text-[11px] text-cyan-400 hover:text-cyan-300 font-mono"
                >
                  Format JSON
                </button>
              </div>
              <textarea
                value={requestBody}
                onChange={(e) => setRequestBody(e.target.value)}
                rows={9}
                className="w-full flex-1 bg-slate-950/90 border border-slate-800 rounded-lg p-3 text-xs font-mono text-slate-300 focus:outline-none focus:border-cyan-500 focus:ring-1 focus:ring-cyan-500/20 resize-none leading-relaxed"
              />
            </div>
          )}

          {/* Action Button */}
          <div className="pt-2">
            <button
              onClick={handleSendRequest}
              disabled={isLoading}
              className="w-full flex items-center justify-center gap-2 py-2.5 px-4 bg-cyan-600 hover:bg-cyan-500 disabled:bg-slate-800 disabled:text-slate-500 text-white font-medium text-xs rounded-lg transition-all shadow-md shadow-cyan-950/50 cursor-pointer disabled:cursor-not-allowed"
            >
              {isLoading ? (
                <>
                  <div className="w-3.5 h-3.5 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                  <span>Forwarding Request via KeyShield...</span>
                </>
              ) : (
                <>
                  <Send className="w-3.5 h-3.5" />
                  <span>Send Request Through Proxy</span>
                </>
              )}
            </button>
          </div>
        </div>

        {/* Right Column: Response Inspector & Security Trace */}
        <div className="lg:col-span-6 bg-slate-900/60 border border-slate-800 rounded-xl p-5 flex flex-col">
          {/* Header & Tabs */}
          <div className="flex items-center justify-between pb-3 border-b border-slate-800/80 mb-4">
            <div className="flex items-center gap-2">
              <button
                onClick={() => setActiveOutputTab('response')}
                className={`text-xs font-semibold uppercase tracking-wider pb-1 transition-colors ${
                  activeOutputTab === 'response'
                    ? 'text-cyan-400 border-b-2 border-cyan-400'
                    : 'text-slate-400 hover:text-slate-200'
                }`}
              >
                Response Output
              </button>
              <button
                onClick={() => setActiveOutputTab('security-trace')}
                className={`text-xs font-semibold uppercase tracking-wider pb-1 transition-colors ${
                  activeOutputTab === 'security-trace'
                    ? 'text-cyan-400 border-b-2 border-cyan-400'
                    : 'text-slate-400 hover:text-slate-200'
                }`}
              >
                Security Trace
              </button>
              <button
                onClick={() => setActiveOutputTab('curl')}
                className={`text-xs font-semibold uppercase tracking-wider pb-1 transition-colors ${
                  activeOutputTab === 'curl'
                    ? 'text-cyan-400 border-b-2 border-cyan-400'
                    : 'text-slate-400 hover:text-slate-200'
                }`}
              >
                cURL
              </button>
            </div>

            {/* Status & Latency Badges */}
            <div className="flex items-center gap-2">
              {responseStatus !== null && (
                <span
                  className={`text-[11px] font-mono font-medium px-2 py-0.5 rounded ${
                    responseStatus >= 200 && responseStatus < 300
                      ? 'bg-emerald-500/15 text-emerald-300 border border-emerald-500/30'
                      : responseStatus >= 400 && responseStatus < 500
                      ? 'bg-amber-500/15 text-amber-300 border border-amber-500/30'
                      : 'bg-rose-500/15 text-rose-300 border border-rose-500/30'
                  }`}
                >
                  HTTP {responseStatus} {responseStatusText}
                </span>
              )}
              {responseDuration !== null && (
                <span className="text-[11px] font-mono text-slate-400 flex items-center gap-1">
                  <Clock className="w-3 h-3 text-slate-500" />
                  <span className="tabular-nums">{responseDuration}ms</span>
                </span>
              )}
            </div>
          </div>

          {/* Response Output Tab */}
          {activeOutputTab === 'response' && (
            <div className="flex-1 flex flex-col min-h-[340px]">
              {isLoading ? (
                <div className="flex-1 flex flex-col items-center justify-center text-slate-500 space-y-3">
                  <div className="w-8 h-8 border-2 border-cyan-500/30 border-t-cyan-400 rounded-full animate-spin" />
                  <span className="text-xs font-mono text-slate-400">Connecting to upstream provider...</span>
                </div>
              ) : responseError ? (
                <div className="flex-1 bg-rose-950/20 border border-rose-500/30 rounded-lg p-4 font-mono text-xs text-rose-300 overflow-auto">
                  <div className="font-semibold text-rose-200 mb-1">Proxy Error Occurred</div>
                  <div>{responseError}</div>
                </div>
              ) : responseBody ? (
                <div className="flex-1 flex flex-col relative">
                  <button
                    onClick={() => copyToClipboard(responseBody, 'response')}
                    className="absolute top-2 right-2 p-1.5 bg-slate-800/80 hover:bg-slate-700 text-slate-300 rounded border border-slate-700 text-xs flex items-center gap-1 transition-colors"
                  >
                    {copiedType === 'response' ? <Check className="w-3 h-3 text-emerald-400" /> : <Copy className="w-3 h-3" />}
                    <span>{copiedType === 'response' ? 'Copied' : 'Copy'}</span>
                  </button>
                  <pre className="flex-1 bg-slate-950/90 border border-slate-800 rounded-lg p-3 text-xs font-mono text-cyan-300/90 overflow-auto max-h-[380px] leading-relaxed select-text">
                    {responseBody}
                  </pre>
                </div>
              ) : (
                <div className="flex-1 flex flex-col items-center justify-center text-slate-600 border border-dashed border-slate-800 rounded-lg p-6 text-center">
                  <FileJson className="w-8 h-8 text-slate-700 mb-2" />
                  <span className="text-xs text-slate-400">Click &quot;Send Request Through Proxy&quot; to test.</span>
                  <span className="text-[11px] text-slate-500 mt-1">
                    Your API key is automatically injected by the backend proxy.
                  </span>
                </div>
              )}
            </div>
          )}

          {/* Security Trace Tab */}
          {activeOutputTab === 'security-trace' && (
            <div className="flex-1 flex flex-col space-y-3 font-mono text-xs overflow-auto max-h-[380px]">
              <div className="bg-slate-950 border border-slate-800 rounded-lg p-3">
                <div className="text-cyan-400 font-semibold mb-1 flex items-center gap-1.5">
                  <ArrowUpRight className="w-3.5 h-3.5" />
                  <span>1. What Client Dispatched</span>
                </div>
                <div className="text-slate-400 text-[11px] space-y-0.5">
                  <div>Endpoint: {endpointUrl}</div>
                  <div>Headers Sent: {requestHeaders}</div>
                  <div className="text-emerald-400">Zero upstream API keys in client memory.</div>
                </div>
              </div>

              <div className="bg-slate-950 border border-cyan-500/30 rounded-lg p-3">
                <div className="text-cyan-300 font-semibold mb-1 flex items-center gap-1.5">
                  <Key className="w-3.5 h-3.5 text-cyan-400" />
                  <span>2. Backend Proxy Injection</span>
                </div>
                <div className="text-slate-300 text-[11px] space-y-0.5">
                  <div>Secret Injected: {secretKey || 'Auto-matched from route config'}</div>
                  <div>Injection Header: {secretKey === 'OPENAI_API_KEY' ? 'Authorization: Bearer sk-••••••' : secretKey === 'ANTHROPIC_API_KEY' ? 'x-api-key: sk-ant-••••••' : secretKey === 'GEMINI_API_KEY' ? 'x-goog-api-key: AIzaSy••••••' : 'Bearer / Header injected'}</div>
                  <div>Stripped Internal Headers: X-Proxy-Secret, X-Target-URL, Host</div>
                </div>
              </div>

              <div className="bg-slate-950 border border-slate-800 rounded-lg p-3">
                <div className="text-emerald-400 font-semibold mb-1 flex items-center gap-1.5">
                  <Check className="w-3.5 h-3.5" />
                  <span>3. Response Sanitization</span>
                </div>
                <div className="text-slate-400 text-[11px] space-y-0.5">
                  <div>CORS Access-Control-Allow-Origin: Enforced</div>
                  <div>Rate Limit Headers: Injected for client telemetry</div>
                  <div>Sensitive Upstream Server Headers: Filtered</div>
                </div>
              </div>
            </div>
          )}

          {/* cURL Tab */}
          {activeOutputTab === 'curl' && (
            <div className="flex-1 flex flex-col relative">
              <button
                onClick={() => copyToClipboard(generateCurlCommand(), 'curl')}
                className="absolute top-2 right-2 p-1.5 bg-slate-800/80 hover:bg-slate-700 text-slate-300 rounded border border-slate-700 text-xs flex items-center gap-1 transition-colors"
              >
                {copiedType === 'curl' ? <Check className="w-3 h-3 text-emerald-400" /> : <Copy className="w-3 h-3" />}
                <span>{copiedType === 'curl' ? 'Copied' : 'Copy cURL'}</span>
              </button>
              <pre className="flex-1 bg-slate-950/90 border border-slate-800 rounded-lg p-3 text-xs font-mono text-emerald-300/90 overflow-auto max-h-[380px] leading-relaxed">
                {generateCurlCommand()}
              </pre>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
