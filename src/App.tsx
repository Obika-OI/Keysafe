import React, { useState, useEffect } from 'react';
import {
  Video,
  CreditCard,
  Sparkles,
  ShieldCheck,
  Code2,
  Copy,
  Check,
  ExternalLink,
  RefreshCw,
  Play,
  Key,
  Globe,
  Layers,
  ChevronRight,
  Terminal,
  Zap,
  Building,
  Users,
  CheckCircle2,
  AlertCircle
} from 'lucide-react';
import {
  getLiveKitToken,
  getLiveKitConfig,
  createPaystackSubaccount,
  initializePaystackSplitTransaction,
  getPaystackConfig,
  callCentralGemini,
  streamCentralGemini,
  getGatewayPublicConfig
} from '../centralApiClient';

export default function App() {
  const [activeTab, setActiveTab] = useState<'livekit' | 'paystack' | 'gemini' | 'guide' | 'diagnostics'>('guide');
  const [copiedId, setCopiedId] = useState<string | null>(null);

  // Status & Config state
  const [diagnosticsData, setDiagnosticsData] = useState<any>(null);
  const [loadingDiagnostics, setLoadingDiagnostics] = useState(false);

  // LiveKit Test State
  const [livekitRoom, setLivekitRoom] = useState('math-grade10-live');
  const [livekitIdentity, setLivekitIdentity] = useState('student_chidi_99');
  const [livekitName, setLivekitName] = useState('Chidi Eze');
  const [livekitResult, setLivekitResult] = useState<any>(null);
  const [livekitLoading, setLivekitLoading] = useState(false);
  const [livekitError, setLivekitError] = useState<string | null>(null);

  // Paystack Subaccount State
  const [paystackBizName, setPaystackBizName] = useState('Apex International School');
  const [paystackBank, setPaystackBank] = useState('058'); // GTBank
  const [paystackAccount, setPaystackAccount] = useState('0123456789');
  const [paystackPercentage, setPaystackPercentage] = useState('20');
  const [paystackIsLive, setPaystackIsLive] = useState(false);
  const [subaccountResult, setSubaccountResult] = useState<any>(null);
  const [subaccountLoading, setSubaccountLoading] = useState(false);
  const [subaccountError, setSubaccountError] = useState<string | null>(null);

  // Paystack Split Payment State
  const [splitEmail, setSplitEmail] = useState('parent@backpack-edu.com');
  const [splitAmount, setSplitAmount] = useState('15000'); // NGN
  const [splitSubaccountCode, setSplitSubaccountCode] = useState('ACCT_mock_9921ef');
  const [splitResult, setSplitResult] = useState<any>(null);
  const [splitLoading, setSplitLoading] = useState(false);
  const [splitError, setSplitError] = useState<string | null>(null);

  // Gemini Test State
  const [geminiPrompt, setGeminiPrompt] = useState('Create a 3-question interactive pop quiz on cell mitosis for high school biology.');
  const [geminiPersona, setGeminiPersona] = useState('You are Backpack Edu AI tutor, encouraging, concise, and pedagogical.');
  const [geminiModel, setGeminiModel] = useState('gemini-2.5-flash');
  const [geminiResult, setGeminiResult] = useState('');
  const [geminiLoading, setGeminiLoading] = useState(false);
  const [geminiError, setGeminiError] = useState<string | null>(null);

  const fetchDiagnostics = async () => {
    setLoadingDiagnostics(true);
    try {
      const res = await fetch('/api/diagnostics');
      if (res.ok) {
        const data = await res.json();
        setDiagnosticsData(data);
      }
    } catch (e) {
      console.warn('Diagnostics fetch failed:', e);
    } finally {
      setLoadingDiagnostics(false);
    }
  };

  useEffect(() => {
    fetchDiagnostics();
  }, []);

  const copyToClipboard = (text: string, id: string) => {
    navigator.clipboard.writeText(text);
    setCopiedId(id);
    setTimeout(() => setCopiedId(null), 2000);
  };

  // Handlers
  const handleGenerateLivekitToken = async () => {
    setLivekitLoading(true);
    setLivekitError(null);
    setLivekitResult(null);
    try {
      const res = await getLiveKitToken(livekitRoom, livekitIdentity, { name: livekitName });
      setLivekitResult(res);
    } catch (err: any) {
      setLivekitError(err.message || 'Failed to generate token');
    } finally {
      setLivekitLoading(false);
    }
  };

  const handleCreateSubaccount = async () => {
    setSubaccountLoading(true);
    setSubaccountError(null);
    setSubaccountResult(null);
    try {
      const res = await createPaystackSubaccount(
        paystackBizName,
        paystackBank,
        paystackAccount,
        parseFloat(paystackPercentage) || 20,
        { isLive: paystackIsLive, mode: paystackIsLive ? 'live' : 'test' }
      );
      setSubaccountResult(res);
      const code = res?.data?.subaccount_code;
      if (code) {
        setSplitSubaccountCode(code);
      }
    } catch (err: any) {
      setSubaccountError(err.message || 'Failed to create subaccount');
    } finally {
      setSubaccountLoading(false);
    }
  };

  const handleInitializeSplit = async () => {
    setSplitLoading(true);
    setSplitError(null);
    setSplitResult(null);
    try {
      // Amount in kobo: e.g. 15,000 NGN * 100 = 1,500,000 kobo
      const amountInKobo = Math.round((parseFloat(splitAmount) || 100) * 100);
      const res = await initializePaystackSplitTransaction(
        splitEmail,
        amountInKobo,
        splitSubaccountCode,
        'https://backpack-edu.com/payment/callback',
        { app: 'backpack-edu', purpose: 'school_fees_split' },
        { isLive: paystackIsLive, mode: paystackIsLive ? 'live' : 'test' }
      );
      setSplitResult(res);
    } catch (err: any) {
      setSplitError(err.message || 'Failed to initialize split transaction');
    } finally {
      setSplitLoading(false);
    }
  };

  const handleRunGemini = async (stream: boolean = false) => {
    setGeminiLoading(true);
    setGeminiError(null);
    setGeminiResult('');
    try {
      if (stream) {
        await streamCentralGemini(
          geminiPrompt,
          geminiPersona,
          (chunk) => {
            setGeminiResult((prev) => prev + chunk);
          },
          { modelName: geminiModel }
        );
      } else {
        const text = await callCentralGemini(
          geminiPrompt,
          geminiPersona,
          { modelName: geminiModel }
        );
        setGeminiResult(text);
      }
    } catch (err: any) {
      setGeminiError(err.message || 'Failed to generate AI response');
    } finally {
      setGeminiLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100 font-sans selection:bg-cyan-500/20 selection:text-cyan-200">
      {/* Header */}
      <header className="border-b border-slate-800/80 bg-slate-900/60 backdrop-blur sticky top-0 z-40">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 h-16 flex items-center justify-between">
          <div className="flex items-center space-x-3">
            <div className="w-10 h-10 rounded-xl bg-gradient-to-tr from-cyan-600 to-blue-600 flex items-center justify-center shadow-lg shadow-cyan-500/20 text-white font-bold">
              <ShieldCheck className="w-6 h-6" />
            </div>
            <div>
              <div className="flex items-center space-x-2">
                <span className="font-bold text-base tracking-tight text-white">KeySafe Gateway</span>
                <span className="inline-flex items-center px-2 py-0.5 rounded text-[11px] font-medium bg-emerald-500/10 text-emerald-400 border border-emerald-500/20">
                  <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 mr-1.5 animate-pulse"></span>
                  Active & Whitelisted
                </span>
              </div>
              <p className="text-xs text-slate-400">Backpack Edu API Bridge for LiveKit, Paystack & Gemini AI</p>
            </div>
          </div>

          <div className="flex items-center space-x-3 text-xs">
            <div className="hidden sm:flex items-center space-x-2 bg-slate-800/70 border border-slate-700/60 rounded-lg px-3 py-1.5 text-slate-300">
              <Globe className="w-3.5 h-3.5 text-cyan-400" />
              <span>backpack-edu.com & *.web.app</span>
            </div>
            <button
              onClick={fetchDiagnostics}
              className="flex items-center space-x-1.5 bg-slate-800 hover:bg-slate-700 border border-slate-700 text-slate-200 px-3 py-1.5 rounded-lg transition"
            >
              <RefreshCw className={`w-3.5 h-3.5 ${loadingDiagnostics ? 'animate-spin text-cyan-400' : ''}`} />
              <span>Verify Keys</span>
            </button>
          </div>
        </div>
      </header>

      {/* Main Tabs Navigation */}
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 pt-6">
        <div className="flex space-x-1 border-b border-slate-800/80 pb-px overflow-x-auto">
          {[
            { id: 'guide', label: 'Frontend Integration Guide', icon: Code2, badge: 'Crucial' },
            { id: 'livekit', label: 'LiveKit Live Class Tester', icon: Video },
            { id: 'paystack', label: 'Paystack Subaccounts & Splits', icon: CreditCard },
            { id: 'gemini', label: 'Gemini AI Proxy', icon: Sparkles },
            { id: 'diagnostics', label: 'Environment Diagnostics', icon: Terminal },
          ].map((tab) => {
            const Icon = tab.icon;
            const isActive = activeTab === tab.id;
            return (
              <button
                key={tab.id}
                onClick={() => setActiveTab(tab.id as any)}
                className={`flex items-center space-x-2 px-4 py-2.5 text-sm font-medium rounded-t-lg transition relative whitespace-nowrap ${
                  isActive
                    ? 'text-cyan-400 bg-slate-900 border-t border-x border-slate-800'
                    : 'text-slate-400 hover:text-slate-200 hover:bg-slate-900/40'
                }`}
              >
                <Icon className={`w-4 h-4 ${isActive ? 'text-cyan-400' : 'text-slate-500'}`} />
                <span>{tab.label}</span>
                {tab.badge && (
                  <span className="text-[10px] bg-cyan-500/10 text-cyan-400 border border-cyan-500/30 px-1.5 py-0.2 rounded-full">
                    {tab.badge}
                  </span>
                )}
                {isActive && (
                  <div className="absolute bottom-0 left-0 right-0 h-0.5 bg-cyan-400" />
                )}
              </button>
            );
          })}
        </div>
      </div>

      {/* Main Content Area */}
      <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-6">
        {/* TAB 1: FRONTEND INTEGRATION GUIDE */}
        {activeTab === 'guide' && (
          <div className="space-y-6">
            <div className="bg-gradient-to-r from-cyan-950/40 via-blue-950/30 to-slate-900/40 border border-cyan-500/20 rounded-2xl p-6">
              <h2 className="text-xl font-bold text-white flex items-center space-x-2">
                <span>Direct Answer: How Your Frontend Calls This Backend</span>
              </h2>
              <p className="mt-2 text-sm text-slate-300 leading-relaxed">
                In security architecture, your frontend applications (<code>backpack-9e1e0.web.app</code> and <code>backpack-edu.com</code>) 
                <strong className="text-white"> never fetch the raw secret keys into the browser</strong>. Doing so would expose your Paystack secret key, LiveKit API secret, and Gemini API keys to any user in Chrome DevTools.
              </p>
              <p className="mt-2 text-sm text-slate-300 leading-relaxed">
                Instead, your frontend uses the included client helper (<code>centralApiClient.ts</code>) or standard <code>fetch()</code> to call KeySafe on Render. KeySafe injects your credentials securely server-side and returns the completed action.
              </p>
            </div>

            {/* Step by Step Implementation Boxes */}
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
              {/* Card 1: LiveKit Live Class */}
              <div className="bg-slate-900/90 border border-slate-800 rounded-xl p-5 space-y-4">
                <div className="flex items-center justify-between">
                  <div className="flex items-center space-x-2.5">
                    <div className="p-2 bg-indigo-500/10 text-indigo-400 rounded-lg border border-indigo-500/20">
                      <Video className="w-5 h-5" />
                    </div>
                    <div>
                      <h3 className="font-semibold text-white text-base">1. LiveKit Live Classroom Token</h3>
                      <p className="text-xs text-slate-400">Generate session JWT to join live video rooms</p>
                    </div>
                  </div>
                  <span className="text-[11px] bg-slate-800 text-slate-300 px-2 py-1 rounded font-mono">POST /api/livekit/token</span>
                </div>

                <div className="bg-slate-950 border border-slate-800 rounded-lg p-3 font-mono text-xs text-slate-300 space-y-2 relative">
                  <button
                    onClick={() => copyToClipboard(`// Step 1: Call KeySafe to get signed live class token
const response = await fetch("https://keysafe-ntia.onrender.com/api/livekit/token", {
  method: "POST",
  headers: { "Content-Type": "application/json" },
  body: JSON.stringify({
    room: "math-grade10-class",
    identity: studentId,
    name: studentFullName
  })
});
const { token, livekitUrl } = await response.json();

// Step 2: Connect LiveKit Room component or client
// In React with @livekit/components-react:
// <LiveKitRoom token={token} serverUrl={livekitUrl} connect={true} />`, 'livekit-code')}
                    className="absolute top-2.5 right-2.5 text-slate-400 hover:text-white p-1 rounded bg-slate-800/80"
                    title="Copy Code"
                  >
                    {copiedId === 'livekit-code' ? <Check className="w-4 h-4 text-emerald-400" /> : <Copy className="w-4 h-4" />}
                  </button>
                  <pre className="overflow-x-auto text-[11px] leading-relaxed text-indigo-200">
{`// In backpack-edu.com frontend:
const response = await fetch(
  "https://keysafe-ntia.onrender.com/api/livekit/token", 
  {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      room: "math-grade10-class",
      identity: studentId,
      name: studentFullName
    })
  }
);
const { token, livekitUrl } = await response.json();

// Join classroom:
// <LiveKitRoom token={token} serverUrl={livekitUrl} connect={true} />`}
                  </pre>
                </div>
              </div>

              {/* Card 2: Paystack Subaccount Creation */}
              <div className="bg-slate-900/90 border border-slate-800 rounded-xl p-5 space-y-4">
                <div className="flex items-center justify-between">
                  <div className="flex items-center space-x-2.5">
                    <div className="p-2 bg-emerald-500/10 text-emerald-400 rounded-lg border border-emerald-500/20">
                      <Building className="w-5 h-5" />
                    </div>
                    <div>
                      <h3 className="font-semibold text-white text-base">2. Paystack Subaccount Creation</h3>
                      <p className="text-xs text-slate-400">Register teacher or school bank settlement</p>
                    </div>
                  </div>
                  <span className="text-[11px] bg-slate-800 text-slate-300 px-2 py-1 rounded font-mono">POST /api/subaccount</span>
                </div>

                <div className="bg-slate-950 border border-slate-800 rounded-lg p-3 font-mono text-xs text-slate-300 space-y-2 relative">
                  <button
                    onClick={() => copyToClipboard(`// In backpack-edu.com frontend:
const response = await fetch("https://keysafe-ntia.onrender.com/api/subaccount", {
  method: "POST",
  headers: { "Content-Type": "application/json" },
  body: JSON.stringify({
    business_name: "Apex School Abuja",
    settlement_bank: "058",      // 058 = GTBank, 011 = First Bank
    account_number: "0123456789",
    percentage_charge: 20,       // 20% platform fee
    is_live: false               // true for live, false for test
  })
});
const data = await response.json();
const subaccountCode = data.data.subaccount_code; // e.g. "ACCT_xxxxxxx"
console.log("Teacher Subaccount Code:", subaccountCode);`, 'subaccount-code')}
                    className="absolute top-2.5 right-2.5 text-slate-400 hover:text-white p-1 rounded bg-slate-800/80"
                    title="Copy Code"
                  >
                    {copiedId === 'subaccount-code' ? <Check className="w-4 h-4 text-emerald-400" /> : <Copy className="w-4 h-4" />}
                  </button>
                  <pre className="overflow-x-auto text-[11px] leading-relaxed text-emerald-200">
{`// In backpack-edu.com frontend:
const response = await fetch(
  "https://keysafe-ntia.onrender.com/api/subaccount", 
  {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      business_name: "Apex School Abuja",
      settlement_bank: "058",       // 058=GTBank
      account_number: "0123456789",
      percentage_charge: 20,        // 20% to platform
      is_live: false                // true for live
    })
  }
);
const data = await response.json();
// Store data.data.subaccount_code in Firestore!`}
                  </pre>
                </div>
              </div>

              {/* Card 3: Paystack Split Payment Initialization */}
              <div className="bg-slate-900/90 border border-slate-800 rounded-xl p-5 space-y-4">
                <div className="flex items-center justify-between">
                  <div className="flex items-center space-x-2.5">
                    <div className="p-2 bg-cyan-500/10 text-cyan-400 rounded-lg border border-cyan-500/20">
                      <CreditCard className="w-5 h-5" />
                    </div>
                    <div>
                      <h3 className="font-semibold text-white text-base">3. Paystack Split Payment Init</h3>
                      <p className="text-xs text-slate-400">Initialize checkout split with school subaccount</p>
                    </div>
                  </div>
                  <span className="text-[11px] bg-slate-800 text-slate-300 px-2 py-1 rounded font-mono">POST /api/split-payment</span>
                </div>

                <div className="bg-slate-950 border border-slate-800 rounded-lg p-3 font-mono text-xs text-slate-300 space-y-2 relative">
                  <button
                    onClick={() => copyToClipboard(`// In backpack-edu.com frontend:
const response = await fetch("https://keysafe-ntia.onrender.com/api/split-payment", {
  method: "POST",
  headers: { "Content-Type": "application/json" },
  body: JSON.stringify({
    email: "parent@backpack-edu.com",
    amount: 15000 * 100, // Paystack expects lowest unit (15,000 NGN = 1,500,000 Kobo)
    subaccount_code: "ACCT_xxxxxxx", // Code from Step 2
    callback_url: "https://backpack-edu.com/tuition/success",
    is_live: false
  })
});
const data = await response.json();
// Redirect parent to checkout:
window.location.href = data.data.authorization_url;`, 'split-code')}
                    className="absolute top-2.5 right-2.5 text-slate-400 hover:text-white p-1 rounded bg-slate-800/80"
                    title="Copy Code"
                  >
                    {copiedId === 'split-code' ? <Check className="w-4 h-4 text-emerald-400" /> : <Copy className="w-4 h-4" />}
                  </button>
                  <pre className="overflow-x-auto text-[11px] leading-relaxed text-cyan-200">
{`// In backpack-edu.com frontend:
const response = await fetch(
  "https://keysafe-ntia.onrender.com/api/split-payment", 
  {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      email: "parent@backpack-edu.com",
      amount: 15000 * 100, // 15,000 NGN in Kobo
      subaccount_code: "ACCT_xxxxxxx",
      callback_url: "https://backpack-edu.com/tuition/success",
      is_live: false
    })
  }
);
const data = await response.json();
window.location.href = data.data.authorization_url;`}
                  </pre>
                </div>
              </div>

              {/* Card 4: Gemini AI Integration */}
              <div className="bg-slate-900/90 border border-slate-800 rounded-xl p-5 space-y-4">
                <div className="flex items-center justify-between">
                  <div className="flex items-center space-x-2.5">
                    <div className="p-2 bg-purple-500/10 text-purple-400 rounded-lg border border-purple-500/20">
                      <Sparkles className="w-5 h-5" />
                    </div>
                    <div>
                      <h3 className="font-semibold text-white text-base">4. Gemini AI Tutor & Assistant</h3>
                      <p className="text-xs text-slate-400">Generate lesson plans, quizzes, and tutor chats</p>
                    </div>
                  </div>
                  <span className="text-[11px] bg-slate-800 text-slate-300 px-2 py-1 rounded font-mono">POST /api/ai/generate</span>
                </div>

                <div className="bg-slate-950 border border-slate-800 rounded-lg p-3 font-mono text-xs text-slate-300 space-y-2 relative">
                  <button
                    onClick={() => copyToClipboard(`// In backpack-edu.com frontend:
import { callCentralGemini } from './centralApiClient';

const answer = await callCentralGemini(
  "Explain photosynthesis with a grade 6 real-world analogy",
  "You are a friendly Backpack Edu virtual science teacher."
);
console.log("AI Answer:", answer);`, 'gemini-code')}
                    className="absolute top-2.5 right-2.5 text-slate-400 hover:text-white p-1 rounded bg-slate-800/80"
                    title="Copy Code"
                  >
                    {copiedId === 'gemini-code' ? <Check className="w-4 h-4 text-emerald-400" /> : <Copy className="w-4 h-4" />}
                  </button>
                  <pre className="overflow-x-auto text-[11px] leading-relaxed text-purple-200">
{`// In backpack-edu.com frontend:
const response = await fetch(
  "https://keysafe-ntia.onrender.com/api/ai/generate", 
  {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      prompt: "Explain photosynthesis with a real-world analogy",
      systemInstruction: "You are Backpack Edu AI tutor.",
      modelName: "gemini-2.5-flash"
    })
  }
);
const data = await response.json();
console.log("AI Text:", data.text);`}
                  </pre>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* TAB 2: LIVEKIT TESTER */}
        {activeTab === 'livekit' && (
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
            <div className="lg:col-span-5 bg-slate-900 border border-slate-800 rounded-xl p-6 space-y-4">
              <div className="flex items-center space-x-2 pb-3 border-b border-slate-800">
                <Video className="w-5 h-5 text-indigo-400" />
                <h3 className="font-semibold text-white">Generate LiveKit Room Token</h3>
              </div>

              <div className="space-y-3 text-xs">
                <div>
                  <label className="block text-slate-400 mb-1">Classroom / Room Name</label>
                  <input
                    type="text"
                    value={livekitRoom}
                    onChange={(e) => setLivekitRoom(e.target.value)}
                    className="w-full bg-slate-950 border border-slate-800 rounded-lg px-3 py-2 text-white focus:outline-none focus:border-indigo-500 font-mono"
                    placeholder="e.g. math-101"
                  />
                </div>

                <div>
                  <label className="block text-slate-400 mb-1">Participant Identity (Unique ID)</label>
                  <input
                    type="text"
                    value={livekitIdentity}
                    onChange={(e) => setLivekitIdentity(e.target.value)}
                    className="w-full bg-slate-950 border border-slate-800 rounded-lg px-3 py-2 text-white focus:outline-none focus:border-indigo-500 font-mono"
                    placeholder="e.g. user_123"
                  />
                </div>

                <div>
                  <label className="block text-slate-400 mb-1">Display Name</label>
                  <input
                    type="text"
                    value={livekitName}
                    onChange={(e) => setLivekitName(e.target.value)}
                    className="w-full bg-slate-950 border border-slate-800 rounded-lg px-3 py-2 text-white focus:outline-none focus:border-indigo-500"
                    placeholder="e.g. Chidi Eze"
                  />
                </div>
              </div>

              <button
                onClick={handleGenerateLivekitToken}
                disabled={livekitLoading || !livekitRoom || !livekitIdentity}
                className="w-full py-2.5 px-4 bg-indigo-600 hover:bg-indigo-500 disabled:opacity-50 text-white font-medium rounded-lg text-xs flex items-center justify-center space-x-2 transition shadow-lg shadow-indigo-600/20"
              >
                {livekitLoading ? <RefreshCw className="w-4 h-4 animate-spin" /> : <Play className="w-4 h-4" />}
                <span>Generate Live Class Token</span>
              </button>

              {livekitError && (
                <div className="p-3 bg-rose-500/10 border border-rose-500/20 text-rose-400 rounded-lg text-xs flex items-start space-x-2">
                  <AlertCircle className="w-4 h-4 mt-0.5 shrink-0" />
                  <span>{livekitError}</span>
                </div>
              )}
            </div>

            <div className="lg:col-span-7 bg-slate-900 border border-slate-800 rounded-xl p-6 space-y-4">
              <h4 className="text-sm font-semibold text-white flex items-center justify-between">
                <span>LiveKit Session Response</span>
                {livekitResult?.isMock && (
                  <span className="text-[10px] bg-amber-500/10 text-amber-400 border border-amber-500/20 px-2 py-0.5 rounded">
                    Sandbox Token (No LIVEKIT_API_SECRET set)
                  </span>
                )}
              </h4>

              {livekitResult ? (
                <div className="space-y-3">
                  <div>
                    <div className="flex items-center justify-between text-xs text-slate-400 mb-1">
                      <span>LiveKit Server URL:</span>
                      <button
                        onClick={() => copyToClipboard(livekitResult.livekitUrl, 'lk-url')}
                        className="text-indigo-400 hover:text-indigo-300 flex items-center space-x-1"
                      >
                        {copiedId === 'lk-url' ? <Check className="w-3.5 h-3.5 text-emerald-400" /> : <Copy className="w-3.5 h-3.5" />}
                        <span>Copy URL</span>
                      </button>
                    </div>
                    <div className="bg-slate-950 p-2.5 rounded-lg border border-slate-800 font-mono text-xs text-indigo-300">
                      {livekitResult.livekitUrl}
                    </div>
                  </div>

                  <div>
                    <div className="flex items-center justify-between text-xs text-slate-400 mb-1">
                      <span>JWT Access Token (1-2 Hours Validity):</span>
                      <button
                        onClick={() => copyToClipboard(livekitResult.token, 'lk-tok')}
                        className="text-indigo-400 hover:text-indigo-300 flex items-center space-x-1"
                      >
                        {copiedId === 'lk-tok' ? <Check className="w-3.5 h-3.5 text-emerald-400" /> : <Copy className="w-3.5 h-3.5" />}
                        <span>Copy Token</span>
                      </button>
                    </div>
                    <div className="bg-slate-950 p-2.5 rounded-lg border border-slate-800 font-mono text-[11px] text-slate-300 break-all max-h-36 overflow-y-auto">
                      {livekitResult.token}
                    </div>
                  </div>

                  <div className="pt-2 border-t border-slate-800">
                    <p className="text-xs text-slate-400 leading-relaxed">
                      To connect your frontend live classroom, pass this token and URL into your <code>LiveKitRoom</code> or <code>new Room()</code> instance.
                    </p>
                  </div>
                </div>
              ) : (
                <div className="h-64 border border-dashed border-slate-800 rounded-lg flex flex-col items-center justify-center text-slate-500 text-xs text-center p-6 space-y-2">
                  <Video className="w-8 h-8 text-slate-700" />
                  <p>Click "Generate Live Class Token" to test token generation and verify LiveKit credentials.</p>
                </div>
              )}
            </div>
          </div>
        )}

        {/* TAB 3: PAYSTACK TESTER */}
        {activeTab === 'paystack' && (
          <div className="space-y-6">
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
              {/* Subaccount Creator */}
              <div className="bg-slate-900 border border-slate-800 rounded-xl p-6 space-y-4">
                <div className="flex items-center space-x-2 pb-3 border-b border-slate-800">
                  <Building className="w-5 h-5 text-emerald-400" />
                  <div>
                    <h3 className="font-semibold text-white">Create Paystack Subaccount</h3>
                    <p className="text-xs text-slate-400">Generates unique <code>subaccount_code</code></p>
                  </div>
                </div>

                <div className="space-y-3 text-xs">
                  <div>
                    <label className="block text-slate-400 mb-1">School / Business Name</label>
                    <input
                      type="text"
                      value={paystackBizName}
                      onChange={(e) => setPaystackBizName(e.target.value)}
                      className="w-full bg-slate-950 border border-slate-800 rounded-lg px-3 py-2 text-white focus:outline-none focus:border-emerald-500"
                    />
                  </div>

                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <label className="block text-slate-400 mb-1">Bank Code (e.g. 058 GTB)</label>
                      <input
                        type="text"
                        value={paystackBank}
                        onChange={(e) => setPaystackBank(e.target.value)}
                        className="w-full bg-slate-950 border border-slate-800 rounded-lg px-3 py-2 text-white focus:outline-none focus:border-emerald-500 font-mono"
                      />
                    </div>
                    <div>
                      <label className="block text-slate-400 mb-1">Account Number (10 Digits)</label>
                      <input
                        type="text"
                        value={paystackAccount}
                        onChange={(e) => setPaystackAccount(e.target.value)}
                        className="w-full bg-slate-950 border border-slate-800 rounded-lg px-3 py-2 text-white focus:outline-none focus:border-emerald-500 font-mono"
                      />
                    </div>
                  </div>

                  <div className="flex items-center justify-between pt-1">
                    <div>
                      <label className="block text-slate-400 mb-1">Platform Percentage (%)</label>
                      <input
                        type="number"
                        value={paystackPercentage}
                        onChange={(e) => setPaystackPercentage(e.target.value)}
                        className="w-24 bg-slate-950 border border-slate-800 rounded-lg px-3 py-2 text-white focus:outline-none focus:border-emerald-500 font-mono"
                      />
                    </div>
                    <label className="flex items-center space-x-2 text-xs text-slate-300 cursor-pointer pt-4">
                      <input
                        type="checkbox"
                        checked={paystackIsLive}
                        onChange={(e) => setPaystackIsLive(e.target.checked)}
                        className="rounded border-slate-700 text-emerald-500 focus:ring-emerald-500 bg-slate-950"
                      />
                      <span>Is Live Mode (Production)</span>
                    </label>
                  </div>
                </div>

                <button
                  onClick={handleCreateSubaccount}
                  disabled={subaccountLoading}
                  className="w-full py-2.5 px-4 bg-emerald-600 hover:bg-emerald-500 disabled:opacity-50 text-white font-medium rounded-lg text-xs flex items-center justify-center space-x-2 transition shadow-lg shadow-emerald-600/20"
                >
                  {subaccountLoading ? <RefreshCw className="w-4 h-4 animate-spin" /> : <Building className="w-4 h-4" />}
                  <span>Create Subaccount</span>
                </button>

                {subaccountError && (
                  <div className="p-3 bg-rose-500/10 border border-rose-500/20 text-rose-400 rounded-lg text-xs">
                    {subaccountError}
                  </div>
                )}

                {subaccountResult && (
                  <div className="p-3 bg-slate-950 border border-slate-800 rounded-lg space-y-2">
                    <div className="flex items-center justify-between text-xs">
                      <span className="text-slate-400">Subaccount Code:</span>
                      <span className="font-mono font-bold text-emerald-400 text-sm">
                        {subaccountResult?.data?.subaccount_code}
                      </span>
                    </div>
                    <pre className="text-[10px] text-slate-400 font-mono max-h-28 overflow-y-auto bg-slate-900/50 p-2 rounded">
                      {JSON.stringify(subaccountResult, null, 2)}
                    </pre>
                  </div>
                )}
              </div>

              {/* Split Payment Initializer */}
              <div className="bg-slate-900 border border-slate-800 rounded-xl p-6 space-y-4">
                <div className="flex items-center space-x-2 pb-3 border-b border-slate-800">
                  <CreditCard className="w-5 h-5 text-cyan-400" />
                  <div>
                    <h3 className="font-semibold text-white">Initialize Split Payment</h3>
                    <p className="text-xs text-slate-400">Splits transaction with school's <code>subaccount_code</code></p>
                  </div>
                </div>

                <div className="space-y-3 text-xs">
                  <div>
                    <label className="block text-slate-400 mb-1">Customer / Parent Email</label>
                    <input
                      type="email"
                      value={splitEmail}
                      onChange={(e) => setSplitEmail(e.target.value)}
                      className="w-full bg-slate-950 border border-slate-800 rounded-lg px-3 py-2 text-white focus:outline-none focus:border-cyan-500 font-mono"
                    />
                  </div>

                  <div>
                    <label className="block text-slate-400 mb-1">Amount in Naira (NGN)</label>
                    <input
                      type="number"
                      value={splitAmount}
                      onChange={(e) => setSplitAmount(e.target.value)}
                      className="w-full bg-slate-950 border border-slate-800 rounded-lg px-3 py-2 text-white focus:outline-none focus:border-cyan-500 font-mono"
                      placeholder="e.g. 15000"
                    />
                  </div>

                  <div>
                    <label className="block text-slate-400 mb-1">Recipient Subaccount Code</label>
                    <input
                      type="text"
                      value={splitSubaccountCode}
                      onChange={(e) => setSplitSubaccountCode(e.target.value)}
                      className="w-full bg-slate-950 border border-slate-800 rounded-lg px-3 py-2 text-white focus:outline-none focus:border-cyan-500 font-mono"
                      placeholder="ACCT_xxxxxxx"
                    />
                  </div>
                </div>

                <button
                  onClick={handleInitializeSplit}
                  disabled={splitLoading}
                  className="w-full py-2.5 px-4 bg-cyan-600 hover:bg-cyan-500 disabled:opacity-50 text-white font-medium rounded-lg text-xs flex items-center justify-center space-x-2 transition shadow-lg shadow-cyan-600/20"
                >
                  {splitLoading ? <RefreshCw className="w-4 h-4 animate-spin" /> : <Zap className="w-4 h-4" />}
                  <span>Initialize Split Payment</span>
                </button>

                {splitError && (
                  <div className="p-3 bg-rose-500/10 border border-rose-500/20 text-rose-400 rounded-lg text-xs">
                    {splitError}
                  </div>
                )}

                {splitResult && (
                  <div className="p-3 bg-slate-950 border border-slate-800 rounded-lg space-y-2">
                    <div className="flex items-center justify-between text-xs">
                      <span className="text-slate-400">Authorization URL:</span>
                      <a
                        href={splitResult?.data?.authorization_url}
                        target="_blank"
                        rel="noreferrer"
                        className="text-cyan-400 hover:underline flex items-center space-x-1"
                      >
                        <span>Open Checkout</span>
                        <ExternalLink className="w-3 h-3" />
                      </a>
                    </div>
                    <pre className="text-[10px] text-slate-400 font-mono max-h-28 overflow-y-auto bg-slate-900/50 p-2 rounded">
                      {JSON.stringify(splitResult, null, 2)}
                    </pre>
                  </div>
                )}
              </div>
            </div>
          </div>
        )}

        {/* TAB 4: GEMINI AI PROXY */}
        {activeTab === 'gemini' && (
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
            <div className="lg:col-span-5 bg-slate-900 border border-slate-800 rounded-xl p-6 space-y-4">
              <div className="flex items-center space-x-2 pb-3 border-b border-slate-800">
                <Sparkles className="w-5 h-5 text-purple-400" />
                <h3 className="font-semibold text-white">Gemini AI Educational Assistant</h3>
              </div>

              <div className="space-y-3 text-xs">
                <div>
                  <label className="block text-slate-400 mb-1">Model Name</label>
                  <select
                    value={geminiModel}
                    onChange={(e) => setGeminiModel(e.target.value)}
                    className="w-full bg-slate-950 border border-slate-800 rounded-lg px-3 py-2 text-white focus:outline-none focus:border-purple-500"
                  >
                    <option value="gemini-2.5-flash">gemini-2.5-flash (Fast, Recommended)</option>
                    <option value="gemini-2.5-pro">gemini-2.5-pro (High Reasoning)</option>
                  </select>
                </div>

                <div>
                  <label className="block text-slate-400 mb-1">System Instruction / Persona</label>
                  <input
                    type="text"
                    value={geminiPersona}
                    onChange={(e) => setGeminiPersona(e.target.value)}
                    className="w-full bg-slate-950 border border-slate-800 rounded-lg px-3 py-2 text-white focus:outline-none focus:border-purple-500"
                  />
                </div>

                <div>
                  <label className="block text-slate-400 mb-1">Prompt / Question</label>
                  <textarea
                    rows={4}
                    value={geminiPrompt}
                    onChange={(e) => setGeminiPrompt(e.target.value)}
                    className="w-full bg-slate-950 border border-slate-800 rounded-lg px-3 py-2 text-white focus:outline-none focus:border-purple-500"
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <button
                  onClick={() => handleRunGemini(false)}
                  disabled={geminiLoading}
                  className="py-2.5 px-4 bg-purple-600 hover:bg-purple-500 disabled:opacity-50 text-white font-medium rounded-lg text-xs flex items-center justify-center space-x-1.5 transition shadow-lg shadow-purple-600/20"
                >
                  {geminiLoading ? <RefreshCw className="w-3.5 h-3.5 animate-spin" /> : <Play className="w-3.5 h-3.5" />}
                  <span>Generate</span>
                </button>
                <button
                  onClick={() => handleRunGemini(true)}
                  disabled={geminiLoading}
                  className="py-2.5 px-4 bg-slate-800 hover:bg-slate-700 disabled:opacity-50 text-purple-300 border border-purple-500/30 font-medium rounded-lg text-xs flex items-center justify-center space-x-1.5 transition"
                >
                  <Zap className="w-3.5 h-3.5" />
                  <span>Stream SSE</span>
                </button>
              </div>

              {geminiError && (
                <div className="p-3 bg-rose-500/10 border border-rose-500/20 text-rose-400 rounded-lg text-xs">
                  {geminiError}
                </div>
              )}
            </div>

            <div className="lg:col-span-7 bg-slate-900 border border-slate-800 rounded-xl p-6 space-y-3 flex flex-col">
              <div className="flex items-center justify-between">
                <h4 className="text-sm font-semibold text-white">Gemini AI Output</h4>
                {geminiResult && (
                  <button
                    onClick={() => copyToClipboard(geminiResult, 'gem-res')}
                    className="text-xs text-purple-400 hover:text-purple-300 flex items-center space-x-1"
                  >
                    {copiedId === 'gem-res' ? <Check className="w-3.5 h-3.5 text-emerald-400" /> : <Copy className="w-3.5 h-3.5" />}
                    <span>Copy Text</span>
                  </button>
                )}
              </div>

              <div className="flex-1 bg-slate-950 p-4 rounded-lg border border-slate-800 text-xs text-slate-200 leading-relaxed overflow-y-auto max-h-[460px] whitespace-pre-wrap">
                {geminiResult || (
                  <span className="text-slate-600 italic">Generated AI output will display here...</span>
                )}
              </div>
            </div>
          </div>
        )}

        {/* TAB 5: DIAGNOSTICS */}
        {activeTab === 'diagnostics' && (
          <div className="space-y-6">
            <div className="bg-slate-900 border border-slate-800 rounded-xl p-6 space-y-4">
              <div className="flex items-center justify-between pb-3 border-b border-slate-800">
                <div className="flex items-center space-x-2">
                  <Terminal className="w-5 h-5 text-cyan-400" />
                  <h3 className="font-semibold text-white">Gateway Environment Security Diagnostics</h3>
                </div>
                <button
                  onClick={fetchDiagnostics}
                  className="text-xs text-cyan-400 hover:underline flex items-center space-x-1"
                >
                  <RefreshCw className={`w-3.5 h-3.5 ${loadingDiagnostics ? 'animate-spin' : ''}`} />
                  <span>Refresh Status</span>
                </button>
              </div>

              <p className="text-xs text-slate-400">
                This endpoint reads your Render environment variables directly without revealing raw secrets.
              </p>

              {diagnosticsData ? (
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  {Object.entries(diagnosticsData.environment || {}).map(([key, val]: [string, any]) => {
                    const isDefined = typeof val === 'object' ? val?.defined : !!val;
                    return (
                      <div
                        key={key}
                        className="bg-slate-950 border border-slate-800/80 rounded-lg p-3 text-xs flex items-center justify-between"
                      >
                        <div className="space-y-0.5">
                          <span className="font-mono text-slate-300 font-medium">{key}</span>
                          {typeof val === 'object' && val?.prefix && (
                            <div className="text-[10px] text-slate-500 font-mono">
                              Prefix: {val.prefix} · Suffix: {val.suffix} (length {val.length})
                            </div>
                          )}
                        </div>
                        <span
                          className={`px-2 py-0.5 rounded text-[10px] font-mono ${
                            isDefined
                              ? 'bg-emerald-500/10 text-emerald-400 border border-emerald-500/20'
                              : 'bg-rose-500/10 text-rose-400 border border-rose-500/20'
                          }`}
                        >
                          {isDefined ? 'CONFIGURED' : 'NOT SET'}
                        </span>
                      </div>
                    );
                  })}
                </div>
              ) : (
                <div className="text-center py-10 text-slate-500 text-xs">
                  Loading diagnostics from /api/diagnostics...
                </div>
              )}
            </div>
          </div>
        )}
      </main>
    </div>
  );
}
