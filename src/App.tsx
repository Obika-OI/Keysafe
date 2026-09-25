import React from 'react';

export default function App() {
  return (
    <div className="min-h-screen bg-slate-100 text-slate-800 font-sans p-6 flex flex-col items-center justify-center select-none">
      <div className="max-w-md w-full bg-white rounded-lg p-8 shadow-sm border border-slate-200 text-center space-y-4">
        <div className="w-12 h-12 rounded-full bg-rose-50 text-rose-600 flex items-center justify-center mx-auto text-xl font-bold">
          !
        </div>
        <h1 className="text-xl font-semibold text-slate-900">403 Forbidden</h1>
        <p className="text-xs text-slate-500 leading-relaxed">
          Access to this server cluster is restricted. Direct web browser browsing is disabled by security policy.
        </p>
        <div className="inline-block px-3 py-1 bg-slate-100 text-slate-600 font-mono text-[11px] rounded">
          Error: ERR_RESTRICTED_HOST_ACCESS
        </div>
        <div className="pt-4 border-t border-slate-100 text-[10px] text-slate-400 font-mono">
          Host ID: srv-edge-sec-09 · {new Date().toUTCString()}
        </div>
      </div>
    </div>
  );
}
