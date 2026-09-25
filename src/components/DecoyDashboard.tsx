import React, { useState, useEffect } from 'react';
import { Activity, Server, Shield, Cpu, HardDrive, Wifi, CheckCircle2, Clock, Globe2, Terminal, Lock, ChevronRight, BarChart2 } from 'lucide-react';

interface DecoyDashboardProps {
  uptimeSeconds: number;
  isHealthy: boolean;
  onUnlockRequest: () => void;
}

export const DecoyDashboard: React.FC<DecoyDashboardProps> = ({
  uptimeSeconds,
  isHealthy,
  onUnlockRequest,
}) => {
  const [latency, setLatency] = useState<number>(24);
  const [cpuUsage, setCpuUsage] = useState<number>(18);
  const [memoryUsage, setMemoryUsage] = useState<number>(42);
  const [throughput, setThroughput] = useState<number>(1420);
  const [pingTarget, setPingTarget] = useState<string>('node-cluster-main');
  const [pingHistory, setPingHistory] = useState<Array<{ id: string; time: string; target: string; ms: number; status: string }>>([
    { id: '1', time: '12:04:12', target: 'core-edge-us-east', ms: 18, status: '200 OK' },
    { id: '2', time: '12:04:15', target: 'core-edge-eu-west', ms: 29, status: '200 OK' },
    { id: '3', time: '12:04:18', target: 'core-edge-ap-south', ms: 44, status: '200 OK' },
  ]);
  const [isPinging, setIsPinging] = useState<boolean>(false);

  // Random realistic subtle fluctuation for telemetry
  useEffect(() => {
    const interval = setInterval(() => {
      setLatency(Math.floor(20 + Math.random() * 12));
      setCpuUsage(Math.floor(14 + Math.random() * 10));
      setMemoryUsage(Math.floor(40 + Math.random() * 6));
      setThroughput(Math.floor(1380 + Math.random() * 120));
    }, 4000);
    return () => clearInterval(interval);
  }, []);

  const handleRunPing = async () => {
    setIsPinging(true);
    const start = performance.now();
    try {
      await fetch('/healthz');
      const ms = Math.round(performance.now() - start);
      const newEntry = {
        id: Math.random().toString(36).substring(2, 7),
        time: new Date().toTimeString().split(' ')[0],
        target: pingTarget,
        ms: ms || Math.floor(16 + Math.random() * 8),
        status: '200 OK',
      };
      setPingHistory((prev) => [newEntry, ...prev.slice(0, 5)]);
    } catch {
      // pass
    } finally {
      setIsPinging(false);
    }
  };

  const formatUptime = (sec: number) => {
    const days = Math.floor(sec / 86400);
    const hours = Math.floor((sec % 86400) / 3600);
    const mins = Math.floor((sec % 3600) / 60);
    const secs = sec % 60;
    if (days > 0) return `${days}d ${hours}h ${mins}m`;
    if (hours > 0) return `${hours}h ${mins}m ${secs}s`;
    if (mins > 0) return `${mins}m ${secs}s`;
    return `${secs}s`;
  };

  return (
    <div className="space-y-8 font-sans">
      {/* Decoy Hero Status Banner */}
      <div className="bg-slate-900/60 border border-slate-800 rounded-2xl p-6 relative overflow-hidden">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-6">
          <div className="space-y-1.5">
            <div className="flex items-center gap-2">
              <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-[11px] font-mono font-medium bg-emerald-500/10 text-emerald-400 border border-emerald-500/20">
                <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse" />
                All Node Systems Operational
              </span>
              <span className="text-xs text-slate-500 font-mono">Cluster ID: cg-node-88f2</span>
            </div>
            <h1 className="text-xl font-bold text-white tracking-tight">
              CoreGrid Edge Telemetry &amp; Micro-Cluster Monitor
            </h1>
            <p className="text-xs text-slate-400 max-w-2xl leading-relaxed">
              Real-time packet routing telemetry, microservice health verification, edge latency buffers, and network infrastructure diagnostics.
            </p>
          </div>

          <div className="flex items-center gap-3 self-start md:self-auto">
            <div className="bg-slate-950 border border-slate-800/80 rounded-xl px-4 py-3 text-right">
              <div className="text-[10px] uppercase font-mono text-slate-500">Service Uptime</div>
              <div className="text-sm font-mono font-bold text-slate-200 tabular-nums">
                {formatUptime(uptimeSeconds)}
              </div>
            </div>
            <div className="bg-slate-950 border border-slate-800/80 rounded-xl px-4 py-3 text-right">
              <div className="text-[10px] uppercase font-mono text-slate-500">Avg Edge RTT</div>
              <div className="text-sm font-mono font-bold text-cyan-400 tabular-nums">
                {latency} ms
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Metrics Row */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <div className="bg-slate-900/60 border border-slate-800 rounded-xl p-4 flex items-center gap-3.5">
          <div className="w-10 h-10 rounded-lg bg-cyan-500/10 border border-cyan-500/20 flex items-center justify-center text-cyan-400 shrink-0">
            <Cpu className="w-5 h-5" />
          </div>
          <div>
            <div className="text-[11px] text-slate-400 font-mono">CPU Allocation</div>
            <div className="text-lg font-bold text-white tabular-nums font-mono">{cpuUsage}%</div>
            <div className="text-[10px] text-emerald-400">Normal operating range</div>
          </div>
        </div>

        <div className="bg-slate-900/60 border border-slate-800 rounded-xl p-4 flex items-center gap-3.5">
          <div className="w-10 h-10 rounded-lg bg-emerald-500/10 border border-emerald-500/20 flex items-center justify-center text-emerald-400 shrink-0">
            <HardDrive className="w-5 h-5" />
          </div>
          <div>
            <div className="text-[11px] text-slate-400 font-mono">Memory Heap</div>
            <div className="text-lg font-bold text-white tabular-nums font-mono">{memoryUsage} MB</div>
            <div className="text-[10px] text-slate-500">512 MB Max allocation</div>
          </div>
        </div>

        <div className="bg-slate-900/60 border border-slate-800 rounded-xl p-4 flex items-center gap-3.5">
          <div className="w-10 h-10 rounded-lg bg-indigo-500/10 border border-indigo-500/20 flex items-center justify-center text-indigo-400 shrink-0">
            <Wifi className="w-5 h-5" />
          </div>
          <div>
            <div className="text-[11px] text-slate-400 font-mono">Packet Throughput</div>
            <div className="text-lg font-bold text-white tabular-nums font-mono">{throughput} req/m</div>
            <div className="text-[10px] text-emerald-400">0% Packet loss</div>
          </div>
        </div>

        <div className="bg-slate-900/60 border border-slate-800 rounded-xl p-4 flex items-center gap-3.5">
          <div className="w-10 h-10 rounded-lg bg-amber-500/10 border border-amber-500/20 flex items-center justify-center text-amber-400 shrink-0">
            <Shield className="w-5 h-5" />
          </div>
          <div>
            <div className="text-[11px] text-slate-400 font-mono">Security Protocol</div>
            <div className="text-lg font-bold text-white font-mono">TLS 1.3</div>
            <div className="text-[10px] text-slate-400">Strict HTTPS enforced</div>
          </div>
        </div>
      </div>

      {/* Cluster Node Status & Diagnostics Ping */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        {/* Left: Active Micro-Cluster Nodes */}
        <div className="lg:col-span-7 bg-slate-900/60 border border-slate-800 rounded-xl p-5">
          <div className="flex items-center justify-between pb-3 border-b border-slate-800/80 mb-4">
            <div className="flex items-center gap-2">
              <Server className="w-4 h-4 text-cyan-400" />
              <h2 className="text-xs font-semibold uppercase tracking-wider text-slate-300">Active Cluster Nodes</h2>
            </div>
            <span className="text-[11px] font-mono text-emerald-400">3/3 Online</span>
          </div>

          <div className="divide-y divide-slate-800/60 text-xs font-mono">
            {[
              { id: 'node-us-east-1', region: 'US East (N. Virginia)', protocol: 'HTTP/2 Edge', status: 'Healthy', ping: '18ms' },
              { id: 'node-eu-central-1', region: 'EU Central (Frankfurt)', protocol: 'HTTP/2 Edge', status: 'Healthy', ping: '29ms' },
              { id: 'node-ap-south-1', region: 'AP South (Singapore)', protocol: 'HTTP/2 Edge', status: 'Healthy', ping: '44ms' },
            ].map((node) => (
              <div key={node.id} className="py-3 flex items-center justify-between">
                <div>
                  <div className="text-slate-200 font-semibold flex items-center gap-1.5">
                    <span className="w-1.5 h-1.5 rounded-full bg-emerald-400" />
                    <span>{node.id}</span>
                  </div>
                  <div className="text-[11px] text-slate-500">{node.region}</div>
                </div>
                <div className="text-right">
                  <div className="text-cyan-400">{node.ping}</div>
                  <div className="text-[10px] text-slate-500">{node.protocol}</div>
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* Right: Edge Connectivity Diagnostic */}
        <div className="lg:col-span-5 bg-slate-900/60 border border-slate-800 rounded-xl p-5 flex flex-col justify-between">
          <div>
            <div className="flex items-center justify-between pb-3 border-b border-slate-800/80 mb-4">
              <div className="flex items-center gap-2">
                <Activity className="w-4 h-4 text-cyan-400" />
                <h2 className="text-xs font-semibold uppercase tracking-wider text-slate-300">Live Diagnostic Probe</h2>
              </div>
            </div>

            <div className="space-y-3">
              <div>
                <label className="block text-[11px] text-slate-400 font-mono mb-1">Target Cluster Endpoint</label>
                <div className="flex gap-2">
                  <select
                    value={pingTarget}
                    onChange={(e) => setPingTarget(e.target.value)}
                    aria-label="Target Cluster Endpoint"
                    className="flex-1 bg-slate-950 border border-slate-800 text-xs font-mono text-slate-200 rounded-lg px-3 py-2 focus:outline-none focus:border-cyan-500"
                  >
                    <option value="node-cluster-main">node-cluster-main (/healthz)</option>
                    <option value="edge-relay-alpha">edge-relay-alpha</option>
                    <option value="edge-relay-beta">edge-relay-beta</option>
                  </select>
                  <button
                    onClick={handleRunPing}
                    disabled={isPinging}
                    className="px-3.5 py-2 bg-slate-800 hover:bg-slate-700 text-slate-200 text-xs font-mono rounded-lg transition-colors cursor-pointer"
                  >
                    {isPinging ? 'Probing...' : 'Probe RTT'}
                  </button>
                </div>
              </div>

              {/* Ping History */}
              <div className="bg-slate-950 border border-slate-800/80 rounded-lg p-3 text-[11px] font-mono space-y-1.5">
                <div className="text-slate-500 text-[10px] uppercase border-b border-slate-800/60 pb-1 flex justify-between">
                  <span>Timestamp</span>
                  <span>Target / Latency</span>
                </div>
                {pingHistory.map((p) => (
                  <div key={p.id} className="flex items-center justify-between text-slate-300">
                    <span className="text-slate-500">{p.time}</span>
                    <span className="text-cyan-300">{p.target}</span>
                    <span className="text-emerald-400">{p.ms}ms</span>
                  </div>
                ))}
              </div>
            </div>
          </div>

          {/* Discreet Developer Console Trigger */}
          <div className="pt-4 border-t border-slate-800/80 mt-4 flex items-center justify-between">
            <span className="text-[11px] text-slate-500 font-mono">Protocol: v2.4.1-edge</span>
            <button
              onClick={onUnlockRequest}
              className="text-[11px] font-mono text-slate-500 hover:text-slate-400 flex items-center gap-1.5 transition-colors cursor-pointer"
              title="Terminal Console"
            >
              <Terminal className="w-3.5 h-3.5" />
              <span>Console Access</span>
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};
