import React, { useState } from 'react';
import { Activity, Trash2, RefreshCw, Eye, Search, Filter, ShieldCheck, AlertCircle, Clock } from 'lucide-react';
import { LogEntry } from '../types';

interface AuditLogsProps {
  logs: LogEntry[];
  onRefreshLogs: () => Promise<void>;
  onClearLogs: () => Promise<void>;
}

export const AuditLogs: React.FC<AuditLogsProps> = ({
  logs,
  onRefreshLogs,
  onClearLogs,
}) => {
  const [selectedLog, setSelectedLog] = useState<LogEntry | null>(null);
  const [filterStatus, setFilterStatus] = useState<string>('all');
  const [searchQuery, setSearchQuery] = useState<string>('');
  const [isRefreshing, setIsRefreshing] = useState<boolean>(false);

  const handleRefresh = async () => {
    setIsRefreshing(true);
    try {
      await onRefreshLogs();
    } finally {
      setIsRefreshing(false);
    }
  };

  const filteredLogs = logs.filter((log) => {
    const matchesSearch =
      log.path.toLowerCase().includes(searchQuery.toLowerCase()) ||
      log.upstreamUrl.toLowerCase().includes(searchQuery.toLowerCase()) ||
      log.clientIp.includes(searchQuery);

    if (!matchesSearch) return false;

    if (filterStatus === '2xx') return log.status >= 200 && log.status < 300;
    if (filterStatus === '4xx') return log.status >= 400 && log.status < 500;
    if (filterStatus === '5xx') return log.status >= 500;
    return true;
  });

  const getStatusBadge = (status: number) => {
    if (status >= 200 && status < 300) {
      return (
        <span className="font-mono text-[11px] px-2 py-0.5 rounded bg-emerald-500/10 text-emerald-300 border border-emerald-500/20">
          {status}
        </span>
      );
    }
    if (status >= 400 && status < 500) {
      return (
        <span className="font-mono text-[11px] px-2 py-0.5 rounded bg-amber-500/10 text-amber-300 border border-amber-500/20">
          {status}
        </span>
      );
    }
    return (
      <span className="font-mono text-[11px] px-2 py-0.5 rounded bg-rose-500/10 text-rose-300 border border-rose-500/20">
        {status}
      </span>
    );
  };

  const getMethodBadge = (method: string) => {
    const colors: Record<string, string> = {
      GET: 'text-cyan-400 bg-cyan-950/40 border-cyan-500/30',
      POST: 'text-emerald-400 bg-emerald-950/40 border-emerald-500/30',
      PUT: 'text-amber-400 bg-amber-950/40 border-amber-500/30',
      DELETE: 'text-rose-400 bg-rose-950/40 border-rose-500/30',
      PATCH: 'text-purple-400 bg-purple-950/40 border-purple-500/30',
    };
    return (
      <span className={`font-mono text-[11px] font-bold px-1.5 py-0.5 rounded border ${colors[method] || 'text-slate-400'}`}>
        {method}
      </span>
    );
  };

  return (
    <div className="space-y-6">
      {/* Top Filter Bar */}
      <div className="bg-slate-900/60 border border-slate-800 rounded-xl p-4 flex flex-col sm:flex-row items-center justify-between gap-3">
        <div className="flex flex-1 items-center gap-2 w-full sm:w-auto">
          <div className="relative flex-1 max-w-sm">
            <Search className="w-3.5 h-3.5 text-slate-500 absolute left-3 top-1/2 -translate-y-1/2" />
            <input
              type="text"
              placeholder="Search by path, upstream, or IP..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full bg-slate-950 border border-slate-800 rounded-lg pl-8 pr-3 py-1.5 text-xs text-slate-200 placeholder-slate-500 focus:outline-none focus:border-cyan-500"
            />
          </div>

          <div className="flex items-center gap-1 bg-slate-950 border border-slate-800 p-1 rounded-lg">
            {['all', '2xx', '4xx', '5xx'].map((st) => (
              <button
                key={st}
                onClick={() => setFilterStatus(st)}
                className={`px-2.5 py-1 text-xs font-mono uppercase rounded transition-colors ${
                  filterStatus === st
                    ? 'bg-slate-800 text-cyan-300 font-semibold'
                    : 'text-slate-400 hover:text-slate-200'
                }`}
              >
                {st}
              </button>
            ))}
          </div>
        </div>

        <div className="flex items-center gap-2 w-full sm:w-auto justify-end">
          <button
            onClick={handleRefresh}
            disabled={isRefreshing}
            className="flex items-center gap-1 px-3 py-1.5 text-xs text-slate-300 bg-slate-800 hover:bg-slate-700 rounded-lg transition-colors"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${isRefreshing ? 'animate-spin' : ''}`} />
            <span>Refresh</span>
          </button>
          <button
            onClick={onClearLogs}
            className="flex items-center gap-1 px-3 py-1.5 text-xs text-rose-300 bg-rose-950/30 hover:bg-rose-950/60 border border-rose-500/20 rounded-lg transition-colors"
          >
            <Trash2 className="w-3.5 h-3.5" />
            <span>Clear Logs</span>
          </button>
        </div>
      </div>

      {/* Logs Table */}
      <div className="bg-slate-900/60 border border-slate-800 rounded-xl overflow-hidden">
        {filteredLogs.length === 0 ? (
          <div className="p-12 text-center text-slate-500 space-y-2">
            <Activity className="w-8 h-8 text-slate-700 mx-auto" />
            <p className="text-xs text-slate-400">No proxy requests captured yet.</p>
            <p className="text-[11px] text-slate-600">
              Trigger requests in the Playground or make calls from your client application to see real-time audit logs.
            </p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs">
              <thead>
                <tr className="border-b border-slate-800 text-slate-400 font-medium bg-slate-950/40">
                  <th className="py-2.5 px-4">Method</th>
                  <th className="py-2.5 px-3">Status</th>
                  <th className="py-2.5 px-4 font-mono">Proxy Path</th>
                  <th className="py-2.5 px-4 font-mono">Upstream Target</th>
                  <th className="py-2.5 px-3 text-right">Latency</th>
                  <th className="py-2.5 px-4">Timestamp</th>
                  <th className="py-2.5 pr-4 text-right">Details</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-800/60 font-mono text-[11px]">
                {filteredLogs.map((log) => (
                  <tr
                    key={log.id}
                    onClick={() => setSelectedLog(log)}
                    className="hover:bg-slate-850/60 transition-colors cursor-pointer group"
                  >
                    <td className="py-3 px-4 whitespace-nowrap">{getMethodBadge(log.method)}</td>
                    <td className="py-3 px-3 whitespace-nowrap">{getStatusBadge(log.status)}</td>
                    <td className="py-3 px-4 text-cyan-300 truncate max-w-[200px]" title={log.path}>
                      {log.path}
                    </td>
                    <td className="py-3 px-4 text-slate-400 truncate max-w-[250px]" title={log.upstreamUrl}>
                      {log.upstreamUrl}
                    </td>
                    <td className="py-3 px-3 text-right text-slate-300 tabular-nums">
                      {log.durationMs}ms
                    </td>
                    <td className="py-3 px-4 text-slate-500 whitespace-nowrap font-sans text-xs">
                      {new Date(log.timestamp).toLocaleTimeString()}
                    </td>
                    <td className="py-3 pr-4 text-right">
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          setSelectedLog(log);
                        }}
                        className="p-1 text-slate-400 group-hover:text-cyan-400 transition-colors"
                      >
                        <Eye className="w-4 h-4" />
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Detail Slide-over / Modal */}
      {selectedLog && (
        <div className="fixed inset-0 z-50 bg-black/70 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-slate-900 border border-slate-700 rounded-xl max-w-2xl w-full max-h-[85vh] flex flex-col shadow-2xl overflow-hidden">
            {/* Modal Header */}
            <div className="p-4 border-b border-slate-800 flex items-center justify-between bg-slate-950/60">
              <div className="flex items-center gap-2.5">
                {getMethodBadge(selectedLog.method)}
                {getStatusBadge(selectedLog.status)}
                <span className="font-mono text-xs text-slate-200 truncate max-w-[300px]">
                  {selectedLog.path}
                </span>
              </div>
              <button
                onClick={() => setSelectedLog(null)}
                className="text-slate-400 hover:text-white text-lg font-bold"
              >
                &times;
              </button>
            </div>

            {/* Modal Body */}
            <div className="p-5 overflow-y-auto space-y-4 text-xs font-mono">
              {/* Summary Bar */}
              <div className="grid grid-cols-3 gap-3 bg-slate-950 p-3 rounded-lg text-slate-400 text-[11px]">
                <div>
                  <span className="block text-slate-500 text-[10px] uppercase">Duration</span>
                  <span className="text-cyan-300 font-semibold">{selectedLog.durationMs} ms</span>
                </div>
                <div>
                  <span className="block text-slate-500 text-[10px] uppercase">Client IP</span>
                  <span className="text-slate-200">{selectedLog.clientIp}</span>
                </div>
                <div>
                  <span className="block text-slate-500 text-[10px] uppercase">Payload Size</span>
                  <span className="text-slate-200">{selectedLog.responseSize} bytes</span>
                </div>
              </div>

              {/* Upstream URL */}
              <div>
                <span className="text-slate-400 text-[11px] font-semibold block mb-1 font-sans">
                  Target Upstream URL
                </span>
                <div className="bg-slate-950 border border-slate-800 p-2.5 rounded text-cyan-300 break-all text-[11px]">
                  {selectedLog.upstreamUrl}
                </div>
              </div>

              {/* Upstream Headers Sent (Sanitized) */}
              <div>
                <span className="text-slate-400 text-[11px] font-semibold block mb-1 font-sans">
                  Server Injected Headers (Masked)
                </span>
                <pre className="bg-slate-950 border border-slate-800 p-2.5 rounded text-emerald-400/90 text-[11px] overflow-x-auto">
                  {JSON.stringify(selectedLog.upstreamHeadersSentRedacted, null, 2)}
                </pre>
              </div>

              {/* Request Body */}
              {selectedLog.requestBodyPreview && (
                <div>
                  <span className="text-slate-400 text-[11px] font-semibold block mb-1 font-sans">
                    Client Request Body
                  </span>
                  <pre className="bg-slate-950 border border-slate-800 p-2.5 rounded text-slate-300 text-[11px] overflow-x-auto max-h-36">
                    {selectedLog.requestBodyPreview}
                  </pre>
                </div>
              )}

              {/* Response Body */}
              {selectedLog.responseBodyPreview && (
                <div>
                  <span className="text-slate-400 text-[11px] font-semibold block mb-1 font-sans">
                    Response Preview
                  </span>
                  <pre className="bg-slate-950 border border-slate-800 p-2.5 rounded text-slate-300 text-[11px] overflow-x-auto max-h-48">
                    {selectedLog.responseBodyPreview}
                  </pre>
                </div>
              )}

              {/* Error Trace if any */}
              {selectedLog.error && (
                <div className="p-3 bg-rose-950/30 border border-rose-500/30 rounded text-rose-300 text-[11px]">
                  <span className="font-semibold block mb-1">Error Trace:</span>
                  <div>{selectedLog.error}</div>
                </div>
              )}
            </div>

            {/* Modal Footer */}
            <div className="p-3 border-t border-slate-800 bg-slate-950/60 flex justify-end">
              <button
                onClick={() => setSelectedLog(null)}
                className="px-4 py-1.5 bg-slate-800 hover:bg-slate-700 text-slate-200 text-xs rounded transition-colors"
              >
                Close
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
