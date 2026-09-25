import React, { useState } from 'react';
import { ShieldCheck, RefreshCw, Lock, Globe, Zap, AlertTriangle, Check, Save } from 'lucide-react';
import { SecurityConfig } from '../types';

interface SecurityAndCORSProps {
  security: SecurityConfig;
  onUpdateSecurity: (config: SecurityConfig) => Promise<void>;
}

export const SecurityAndCORS: React.FC<SecurityAndCORSProps> = ({
  security,
  onUpdateSecurity,
}) => {
  const [localConfig, setLocalConfig] = useState<SecurityConfig>({ ...security });
  const [newOrigin, setNewOrigin] = useState<string>('');
  const [isSaving, setIsSaving] = useState<boolean>(false);
  const [saveSuccess, setSaveSuccess] = useState<boolean>(false);
  const [copiedKey, setCopiedKey] = useState<boolean>(false);

  const handleGenerateNewKey = () => {
    const newKey = 'pxy_live_' + Array.from(crypto.getRandomValues(new Uint8Array(16)))
      .map((b) => b.toString(16).padStart(2, '0'))
      .join('');
    setLocalConfig({ ...localConfig, masterClientKey: newKey });
  };

  const handleAddOrigin = () => {
    if (!newOrigin.trim()) return;
    const clean = newOrigin.trim();
    if (!localConfig.allowedOrigins.includes(clean)) {
      setLocalConfig({
        ...localConfig,
        allowedOrigins: [...localConfig.allowedOrigins, clean],
      });
      setNewOrigin('');
    }
  };

  const handleRemoveOrigin = (originToRemove: string) => {
    setLocalConfig({
      ...localConfig,
      allowedOrigins: localConfig.allowedOrigins.filter((o) => o !== originToRemove),
    });
  };

  const handleSave = async () => {
    setIsSaving(true);
    try {
      await onUpdateSecurity(localConfig);
      setSaveSuccess(true);
      setTimeout(() => setSaveSuccess(false), 2500);
    } catch (e: any) {
      alert('Failed to save security settings: ' + e?.message);
    } finally {
      setIsSaving(false);
    }
  };

  const copyKey = () => {
    navigator.clipboard.writeText(localConfig.masterClientKey);
    setCopiedKey(true);
    setTimeout(() => setCopiedKey(false), 2000);
  };

  return (
    <div className="space-y-8">
      {/* 1. Client Authorization Layer */}
      <div className="bg-slate-900/60 border border-slate-800 rounded-xl p-6">
        <div className="flex items-center justify-between pb-4 border-b border-slate-800">
          <div>
            <div className="flex items-center gap-2">
              <Lock className="w-4 h-4 text-cyan-400" />
              <h2 className="text-base font-semibold text-slate-100">Client-to-Proxy Authentication</h2>
            </div>
            <p className="text-xs text-slate-400 mt-1">
              Require frontend applications to send a lightweight proxy key so arbitrary users cannot abuse your proxy.
            </p>
          </div>

          <label className="relative inline-flex items-center cursor-pointer">
            <input
              type="checkbox"
              checked={localConfig.requireClientKey}
              onChange={(e) => setLocalConfig({ ...localConfig, requireClientKey: e.target.checked })}
              className="sr-only peer"
            />
            <div className="w-11 h-6 bg-slate-800 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-slate-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-cyan-600"></div>
          </label>
        </div>

        <div className="mt-4 space-y-4">
          <div className="text-xs text-slate-300">
            {localConfig.requireClientKey ? (
              <div className="p-3 bg-cyan-950/20 border border-cyan-500/30 rounded-lg text-cyan-300">
                <span className="font-semibold">Proxy Authentication is Enforced:</span> Clients must supply header{' '}
                <code className="bg-slate-950 px-1 py-0.5 rounded text-cyan-200">X-Proxy-Secret: {localConfig.masterClientKey.substring(0, 10)}...</code>{' '}
                or <code className="bg-slate-950 px-1 py-0.5 rounded text-cyan-200">Authorization: Bearer &lt;key&gt;</code>.
              </div>
            ) : (
              <div className="p-3 bg-slate-950 border border-slate-800 rounded-lg text-slate-400">
                <span className="font-medium text-slate-300">Public Gateway Mode:</span> Any client matching your CORS origins can call proxy routes without a proxy secret. (Recommended if your CORS is restricted to your frontend domain).
              </div>
            )}
          </div>

          {/* Master Key input & generator */}
          <div>
            <label className="block text-xs font-semibold text-slate-300 mb-1">Master Proxy Key</label>
            <div className="flex gap-2">
              <input
                type="text"
                value={localConfig.masterClientKey}
                onChange={(e) => setLocalConfig({ ...localConfig, masterClientKey: e.target.value })}
                className="flex-1 bg-slate-950 border border-slate-800 text-xs font-mono text-cyan-300 rounded-lg px-3.5 py-2 focus:outline-none focus:border-cyan-500"
              />
              <button
                onClick={copyKey}
                className="px-3 py-2 bg-slate-800 hover:bg-slate-700 text-slate-300 text-xs rounded-lg transition-colors"
              >
                {copiedKey ? 'Copied!' : 'Copy'}
              </button>
              <button
                onClick={handleGenerateNewKey}
                className="px-3 py-2 bg-slate-800 hover:bg-slate-700 text-slate-300 text-xs rounded-lg flex items-center gap-1.5 transition-colors"
                title="Generate new random key"
              >
                <RefreshCw className="w-3.5 h-3.5" />
                <span>Regenerate</span>
              </button>
            </div>
          </div>
        </div>
      </div>

      {/* 2. CORS Whitelist Security */}
      <div className="bg-slate-900/60 border border-slate-800 rounded-xl p-6">
        <div className="flex items-center justify-between pb-4 border-b border-slate-800">
          <div>
            <div className="flex items-center gap-2">
              <Globe className="w-4 h-4 text-cyan-400" />
              <h2 className="text-base font-semibold text-slate-100">CORS Allowed Origins</h2>
            </div>
            <p className="text-xs text-slate-400 mt-1">
              Restrict browser access to your proxy to specific frontend domains (prevents unauthorized domains from making API calls).
            </p>
          </div>
        </div>

        <div className="mt-4 space-y-4">
          <div className="flex flex-wrap gap-2">
            {localConfig.allowedOrigins.map((origin) => (
              <span
                key={origin}
                className="inline-flex items-center gap-2 bg-slate-950 border border-slate-800 text-xs font-mono text-slate-300 px-3 py-1.5 rounded-lg"
              >
                <span>{origin === '*' ? '* (Allow All Origins)' : origin}</span>
                {localConfig.allowedOrigins.length > 1 && (
                  <button
                    onClick={() => handleRemoveOrigin(origin)}
                    className="text-slate-500 hover:text-rose-400 text-sm font-bold"
                  >
                    &times;
                  </button>
                )}
              </span>
            ))}
          </div>

          <div className="flex gap-2">
            <input
              type="text"
              placeholder="e.g. https://my-frontend.vercel.app or http://localhost:5173"
              value={newOrigin}
              onChange={(e) => setNewOrigin(e.target.value)}
              className="flex-1 bg-slate-950 border border-slate-800 text-xs font-mono text-slate-200 rounded-lg px-3.5 py-2 focus:outline-none focus:border-cyan-500"
            />
            <button
              onClick={handleAddOrigin}
              className="px-4 py-2 bg-slate-800 hover:bg-slate-700 text-slate-200 text-xs font-medium rounded-lg transition-colors"
            >
              Add Origin
            </button>
          </div>
        </div>
      </div>

      {/* 3. Rate Limiting Rules */}
      <div className="bg-slate-900/60 border border-slate-800 rounded-xl p-6">
        <div className="flex items-center justify-between pb-4 border-b border-slate-800">
          <div>
            <div className="flex items-center gap-2">
              <Zap className="w-4 h-4 text-amber-400" />
              <h2 className="text-base font-semibold text-slate-100">Rate Limiting &amp; DDoS Throttling</h2>
            </div>
            <p className="text-xs text-slate-400 mt-1">
              Prevent upstream quota exhaustion and unexpected bills by limiting requests per IP address.
            </p>
          </div>
        </div>

        <div className="mt-4 grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div>
            <label className="block text-xs font-semibold text-slate-300 mb-1">Max Requests per Window</label>
            <input
              type="number"
              min="1"
              max="10000"
              value={localConfig.rateLimitMaxRequests}
              onChange={(e) => setLocalConfig({ ...localConfig, rateLimitMaxRequests: Number(e.target.value) })}
              className="w-full bg-slate-950 border border-slate-800 text-xs font-mono text-slate-200 rounded-lg px-3.5 py-2 focus:outline-none focus:border-cyan-500"
            />
            <span className="text-[11px] text-slate-500 mt-1 block">Returns HTTP 429 once exceeded.</span>
          </div>

          <div>
            <label className="block text-xs font-semibold text-slate-300 mb-1">Window Duration (Seconds)</label>
            <input
              type="number"
              min="1"
              max="3600"
              value={localConfig.rateLimitWindowSeconds}
              onChange={(e) => setLocalConfig({ ...localConfig, rateLimitWindowSeconds: Number(e.target.value) })}
              className="w-full bg-slate-950 border border-slate-800 text-xs font-mono text-slate-200 rounded-lg px-3.5 py-2 focus:outline-none focus:border-cyan-500"
            />
            <span className="text-[11px] text-slate-500 mt-1 block">Default 60 seconds (1 minute window).</span>
          </div>
        </div>
      </div>

      {/* Save Action Footer */}
      <div className="flex items-center justify-between pt-2">
        <div>
          {saveSuccess && (
            <span className="text-xs font-mono text-emerald-400 flex items-center gap-1.5">
              <Check className="w-4 h-4" />
              Security policy applied to runtime gateway!
            </span>
          )}
        </div>
        <button
          onClick={handleSave}
          disabled={isSaving}
          className="flex items-center gap-2 px-5 py-2.5 bg-cyan-600 hover:bg-cyan-500 text-white font-medium text-xs rounded-lg transition-colors shadow-md shadow-cyan-950/40"
        >
          <Save className="w-4 h-4" />
          <span>Save Security Settings</span>
        </button>
      </div>
    </div>
  );
};
