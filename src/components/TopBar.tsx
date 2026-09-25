import React from 'react';
import { Activity, Download, Eye, EyeOff, Terminal, Lock, Unlock } from 'lucide-react';

interface TopBarProps {
  activeTab: string;
  setActiveTab: (tab: string) => void;
  isHealthy: boolean;
  uptimeSeconds: number;
  onExportClick: () => void;
  isStealthMode: boolean;
  onToggleStealthMode: () => void;
  onOpenUnlockModal: () => void;
}

export const TopBar: React.FC<TopBarProps> = ({
  activeTab,
  setActiveTab,
  isHealthy,
  uptimeSeconds,
  onExportClick,
  isStealthMode,
  onToggleStealthMode,
  onOpenUnlockModal,
}) => {
  const formatUptime = (sec: number) => {
    const mins = Math.floor(sec / 60);
    const hours = Math.floor(mins / 60);
    if (hours > 0) return `${hours}h ${mins % 60}m`;
    if (mins > 0) return `${mins}m ${sec % 60}s`;
    return `${sec}s`;
  };

  const navItems = [
    { id: 'playground', label: 'Playground' },
    { id: 'vault-routes', label: 'Routes & Vault' },
    { id: 'security-cors', label: 'Security & CORS' },
    { id: 'logs', label: 'Audit Logs' },
    { id: 'render-deploy', label: 'Deploy to Render' },
    { id: 'client-sdks', label: 'Client SDKs' },
  ];

  return (
    <header className="sticky top-0 z-40 w-full border-b border-slate-800/80 bg-slate-950/90 backdrop-blur-md">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 h-16 flex items-center justify-between">
        {/* Zone 1: Disguised or Real Wordmark */}
        <div className="flex items-center gap-3">
          <button
            onClick={() => {
              if (isStealthMode) {
                onOpenUnlockModal();
              } else {
                setActiveTab('playground');
              }
            }}
            className="flex items-center gap-2.5 text-left focus-visible:outline-none cursor-pointer"
          >
            <div className="w-8 h-8 rounded-lg bg-cyan-500/10 border border-cyan-500/30 flex items-center justify-center text-cyan-400">
              <Activity className="w-4 h-4" />
            </div>
            <div>
              <span className="text-base font-semibold tracking-tight text-white block">
                {isStealthMode ? 'CoreGrid Telemetry' : 'Credentials Gateway'}
              </span>
              <span className="text-[11px] text-slate-400 font-mono">
                {isStealthMode ? 'Node Cluster v2.4' : 'Central Credentials Vault'}
              </span>
            </div>
          </button>

          <div className="hidden sm:flex items-center gap-1.5 pl-3 border-l border-slate-800 text-xs font-mono text-slate-400">
            <span
              className={`inline-block w-2 h-2 rounded-full ${
                isHealthy ? 'bg-emerald-400 animate-pulse' : 'bg-rose-400'
              }`}
            />
            <span className="text-slate-300 font-medium">{isHealthy ? '100% Operational' : 'Connecting'}</span>
            <span className="text-slate-600">·</span>
            <span className="text-slate-400 tabular-nums">{formatUptime(uptimeSeconds)}</span>
          </div>
        </div>

        {/* Zone 2: Navigation Links (Only shown when unlocked) */}
        {!isStealthMode && (
          <nav className="hidden lg:flex items-center gap-5 text-sm font-medium">
            {navItems.map((item) => {
              const isActive = activeTab === item.id;
              return (
                <button
                  key={item.id}
                  onClick={() => setActiveTab(item.id)}
                  className={`transition-colors whitespace-nowrap py-1 relative ${
                    isActive
                      ? 'text-cyan-400 font-semibold'
                      : 'text-slate-400 hover:text-slate-200'
                  }`}
                >
                  {item.label}
                  {isActive && (
                    <span className="absolute bottom-0 left-0 right-0 h-0.5 bg-cyan-400 rounded-full" />
                  )}
                </button>
              );
            })}
          </nav>
        )}

        {/* Zone 3: Actions & Stealth Toggle */}
        <div className="flex items-center gap-2.5">
          {isStealthMode ? (
            <button
              onClick={onOpenUnlockModal}
              className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-mono text-slate-400 hover:text-slate-200 bg-slate-900 border border-slate-800 hover:border-slate-700 rounded-lg transition-colors cursor-pointer"
            >
              <Terminal className="w-3.5 h-3.5 text-cyan-400" />
              <span>Console Access</span>
            </button>
          ) : (
            <>
              {/* Mobile Tab Selector */}
              <div className="lg:hidden">
                <select
                  value={activeTab}
                  onChange={(e) => setActiveTab(e.target.value)}
                  aria-label="Navigation View"
                  className="bg-slate-900 border border-slate-700 text-xs text-slate-200 rounded-md px-2 py-1 focus:outline-none focus:border-cyan-500"
                >
                  {navItems.map((item) => (
                    <option key={item.id} value={item.id}>
                      {item.label}
                    </option>
                  ))}
                </select>
              </div>

              <button
                onClick={onToggleStealthMode}
                className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-mono bg-slate-900 hover:bg-slate-800 text-amber-300 border border-amber-500/30 rounded-lg transition-colors cursor-pointer"
                title="Switch to Decoy Mode (Public mask)"
              >
                <EyeOff className="w-3.5 h-3.5 text-amber-400" />
                <span className="hidden sm:inline">Lock Decoy Mask</span>
              </button>

              <button
                onClick={onExportClick}
                className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-white bg-cyan-600 hover:bg-cyan-500 rounded-lg transition-colors shadow-sm shadow-cyan-900/30 whitespace-nowrap cursor-pointer"
              >
                <Download className="w-3.5 h-3.5" />
                <span className="hidden sm:inline">Export Bundle</span>
              </button>
            </>
          )}
        </div>
      </div>
    </header>
  );
};

