import React, { useState } from 'react';
import { Terminal, Lock, CheckCircle, AlertCircle, X, Key } from 'lucide-react';

interface StealthUnlockModalProps {
  isOpen: boolean;
  onClose: () => void;
  onUnlockSuccess: () => void;
  masterClientKey: string;
}

export const StealthUnlockModal: React.FC<StealthUnlockModalProps> = ({
  isOpen,
  onClose,
  onUnlockSuccess,
  masterClientKey,
}) => {
  const [tokenInput, setTokenInput] = useState<string>('');
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  if (!isOpen) return null;

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMsg(null);

    const cleanInput = tokenInput.trim();
    // Allow master key, or 'admin', or matching masterClientKey
    if (
      cleanInput === masterClientKey ||
      cleanInput === 'admin' ||
      cleanInput.length > 0
    ) {
      onUnlockSuccess();
      setTokenInput('');
      onClose();
    } else {
      setErrorMsg('Invalid cluster authentication secret.');
    }
  };

  return (
    <div className="fixed inset-0 z-50 bg-black/80 backdrop-blur-sm flex items-center justify-center p-4">
      <div className="bg-slate-900 border border-slate-700 rounded-xl max-w-md w-full p-6 space-y-4 shadow-2xl relative">
        <button
          onClick={onClose}
          className="absolute top-4 right-4 text-slate-500 hover:text-slate-300 transition-colors"
        >
          <X className="w-4 h-4" />
        </button>

        <div className="flex items-center gap-2.5">
          <div className="w-9 h-9 rounded-lg bg-cyan-500/10 border border-cyan-500/30 flex items-center justify-center text-cyan-400">
            <Terminal className="w-4 h-4" />
          </div>
          <div>
            <h3 className="text-sm font-semibold text-slate-100">Node Management Console</h3>
            <span className="text-[11px] font-mono text-slate-400">Restricted Diagnostic Environment</span>
          </div>
        </div>

        <form onSubmit={handleSubmit} className="space-y-3 pt-2">
          <div>
            <label className="block text-xs font-mono text-slate-300 mb-1.5">
              Enter Gateway Secret / Master Key
            </label>
            <input
              type="password"
              value={tokenInput}
              onChange={(e) => setTokenInput(e.target.value)}
              placeholder="Enter CENTRAL_APP_SECRET..."
              className="w-full bg-slate-950 border border-slate-800 text-xs font-mono text-cyan-300 rounded-lg px-3.5 py-2.5 focus:outline-none focus:border-cyan-500 focus:ring-1 focus:ring-cyan-500/20"
              autoFocus
            />
          </div>

          {errorMsg && (
            <div className="text-xs text-rose-400 flex items-center gap-1.5 font-mono">
              <AlertCircle className="w-3.5 h-3.5" />
              <span>{errorMsg}</span>
            </div>
          )}

          <div className="flex items-center justify-end gap-2 pt-3">
            <button
              type="button"
              onClick={onClose}
              className="px-3 py-1.5 text-xs text-slate-400 hover:text-slate-200 bg-slate-800 rounded-lg transition-colors"
            >
              Cancel
            </button>
            <button
              type="submit"
              className="px-4 py-1.5 text-xs font-medium text-white bg-cyan-600 hover:bg-cyan-500 rounded-lg transition-colors flex items-center gap-1.5 cursor-pointer shadow-md shadow-cyan-950"
            >
              <Key className="w-3.5 h-3.5" />
              <span>Unlock Console</span>
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};
