import React from 'react';
import { ArrowRight, ShieldCheck, Server, Globe, Key, Lock, Zap } from 'lucide-react';

export const ArchitectureDiagram: React.FC = () => {
  return (
    <div className="bg-slate-900/60 border border-slate-800 rounded-xl p-5 mb-6">
      <div className="flex flex-col md:flex-row items-stretch justify-between gap-4">
        {/* Step 1: Independent Frontend Apps */}
        <div className="flex-1 bg-slate-950/80 border border-slate-800/80 rounded-lg p-3.5 flex flex-col justify-between">
          <div>
            <div className="flex items-center gap-2 mb-1.5">
              <Globe className="w-4 h-4 text-cyan-400" />
              <span className="text-xs font-semibold text-slate-200">1. Independent Frontend Apps</span>
            </div>
            <p className="text-xs text-slate-400 leading-relaxed">
              Firebase web apps (<code>dome-2030.web.app</code>), Next.js, Mobile apps send requests with custom persona &amp; <code>X-App-Secret</code>.
            </p>
          </div>
          <div className="mt-3 pt-2.5 border-t border-slate-800/60 flex items-center justify-between text-[11px] font-mono text-emerald-400">
            <span>Auth: X-App-Secret</span>
            <Lock className="w-3 h-3 text-emerald-400" />
          </div>
        </div>

        <div className="hidden md:flex items-center justify-center text-slate-600">
          <ArrowRight className="w-5 h-5 text-cyan-500/70" />
        </div>

        {/* Step 2: Central Render Credentials Vault */}
        <div className="flex-1 bg-cyan-950/20 border border-cyan-500/30 rounded-lg p-3.5 flex flex-col justify-between relative overflow-hidden">
          <div className="absolute -right-6 -bottom-6 w-20 h-20 bg-cyan-500/5 rounded-full blur-xl pointer-events-none" />
          <div>
            <div className="flex items-center gap-2 mb-1.5">
              <Server className="w-4 h-4 text-cyan-400" />
              <span className="text-xs font-semibold text-cyan-300">2. Central Render Gateway</span>
            </div>
            <p className="text-xs text-slate-300 leading-relaxed">
              Neutral API gateway validates CORS, rate limits, and injects server-side secrets (Gemini, Stripe, Paystack).
            </p>
          </div>
          <div className="mt-3 pt-2.5 border-t border-cyan-500/20 flex items-center justify-between text-[11px] font-mono text-cyan-300">
            <span>Vault: Injects Real Secrets</span>
            <Key className="w-3 h-3 text-cyan-400" />
          </div>
        </div>

        <div className="hidden md:flex items-center justify-center text-slate-600">
          <ArrowRight className="w-5 h-5 text-cyan-500/70" />
        </div>

        {/* Step 3: Upstream Service */}
        <div className="flex-1 bg-slate-950/80 border border-slate-800/80 rounded-lg p-3.5 flex flex-col justify-between">
          <div>
            <div className="flex items-center gap-2 mb-1.5">
              <Zap className="w-4 h-4 text-amber-400" />
              <span className="text-xs font-semibold text-slate-200">3. External Providers</span>
            </div>
            <p className="text-xs text-slate-400 leading-relaxed">
              Google Gemini (AI), Stripe (Payments), Paystack (Africa/Intl Payments), OpenAI, or custom APIs.
            </p>
          </div>
          <div className="mt-3 pt-2.5 border-t border-slate-800/60 flex items-center justify-between text-[11px] font-mono text-slate-400">
            <span>Returns: Sanitized Payload</span>
            <ShieldCheck className="w-3 h-3 text-emerald-400" />
          </div>
        </div>
      </div>
    </div>
  );
};
