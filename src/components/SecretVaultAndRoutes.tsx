import React, { useState } from 'react';
import { Key, Plus, Trash2, Edit3, ShieldCheck, Check, Save, Lock, Sliders, ExternalLink } from 'lucide-react';
import { RouteConfig, VaultSecretItem } from '../types';

interface SecretVaultAndRoutesProps {
  routes: RouteConfig[];
  vault: Record<string, VaultSecretItem>;
  onUpdateVaultKey: (key: string, value: string) => Promise<void>;
  onUpdateRoutes: (newRoutes: RouteConfig[]) => Promise<void>;
}

export const SecretVaultAndRoutes: React.FC<SecretVaultAndRoutesProps> = ({
  routes,
  vault,
  onUpdateVaultKey,
  onUpdateRoutes,
}) => {
  // Vault state
  const [editingKey, setEditingKey] = useState<string | null>(null);
  const [editingValue, setEditingValue] = useState<string>('');
  const [newKeyName, setNewKeyName] = useState<string>('');
  const [newKeyValue, setNewKeyValue] = useState<string>('');
  const [isSavingVault, setIsSavingVault] = useState<boolean>(false);
  const [vaultFeedback, setVaultFeedback] = useState<string | null>(null);

  // Route modal/editor state
  const [isRouteModalOpen, setIsRouteModalOpen] = useState<boolean>(false);
  const [editingRouteId, setEditingRouteId] = useState<string | null>(null);
  const [formData, setFormData] = useState<Partial<RouteConfig>>({
    id: '',
    name: '',
    prefix: '/proxy/',
    targetBaseUrl: '',
    authStrategy: 'bearer',
    authHeaderName: '',
    authQueryParamName: '',
    secretEnvKey: '',
    enabled: true,
  });

  const handleSaveKey = async (key: string, value: string) => {
    setIsSavingVault(true);
    try {
      await onUpdateVaultKey(key, value);
      setEditingKey(null);
      setEditingValue('');
      setVaultFeedback(`Saved key ${key}`);
      setTimeout(() => setVaultFeedback(null), 2500);
    } catch (e: any) {
      alert('Failed to save vault key: ' + e?.message);
    } finally {
      setIsSavingVault(false);
    }
  };

  const handleAddNewVaultKey = async () => {
    if (!newKeyName.trim()) return;
    const cleanKey = newKeyName.trim().toUpperCase().replace(/[^A-Z0-9_]/g, '_');
    await handleSaveKey(cleanKey, newKeyValue.trim());
    setNewKeyName('');
    setNewKeyValue('');
  };

  const handleDeleteVaultKey = async (key: string) => {
    if (confirm(`Remove ${key} from active runtime vault?`)) {
      await handleSaveKey(key, '');
    }
  };

  const handleOpenRouteModal = (route?: RouteConfig) => {
    if (route) {
      setEditingRouteId(route.id);
      setFormData({ ...route });
    } else {
      setEditingRouteId(null);
      setFormData({
        id: 'custom-' + Math.random().toString(36).substring(2, 6),
        name: 'New Custom Upstream',
        prefix: '/proxy/custom-api',
        targetBaseUrl: 'https://api.example.com',
        authStrategy: 'bearer',
        secretEnvKey: 'CUSTOM_API_KEY',
        enabled: true,
      });
    }
    setIsRouteModalOpen(true);
  };

  const handleSaveRoute = async () => {
    if (!formData.name || !formData.prefix || !formData.targetBaseUrl) {
      alert('Please fill out Name, Prefix, and Target URL');
      return;
    }

    const updatedRoutes = [...routes];
    if (editingRouteId) {
      const index = updatedRoutes.findIndex((r) => r.id === editingRouteId);
      if (index !== -1) {
        updatedRoutes[index] = formData as RouteConfig;
      }
    } else {
      updatedRoutes.push(formData as RouteConfig);
    }

    await onUpdateRoutes(updatedRoutes);
    setIsRouteModalOpen(false);
  };

  const handleDeleteRoute = async (routeId: string) => {
    if (confirm('Delete this proxy route configuration?')) {
      const filtered = routes.filter((r) => r.id !== routeId);
      await onUpdateRoutes(filtered);
    }
  };

  const handleToggleRoute = async (routeId: string, current: boolean) => {
    const updated = routes.map((r) => (r.id === routeId ? { ...r, enabled: !current } : r));
    await onUpdateRoutes(updated);
  };

  return (
    <div className="space-y-8">
      {/* 1. Secret Vault Section */}
      <div className="bg-slate-900/60 border border-slate-800 rounded-xl p-6">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between pb-4 border-b border-slate-800 gap-2">
          <div>
            <div className="flex items-center gap-2">
              <Key className="w-4 h-4 text-cyan-400" />
              <h2 className="text-base font-semibold text-slate-100">Server Secret Vault</h2>
            </div>
            <p className="text-xs text-slate-400 mt-1">
              Store sensitive upstream API keys securely on your Render server. These keys are never sent to the browser.
            </p>
          </div>

          {vaultFeedback && (
            <span className="text-xs font-mono text-emerald-400 bg-emerald-500/10 border border-emerald-500/20 px-2.5 py-1 rounded">
              {vaultFeedback}
            </span>
          )}
        </div>

        {/* Secret Keys List */}
        <div className="mt-4 divide-y divide-slate-800/60">
          {Object.entries(vault).map(([keyName, info]) => {
            const isEditing = editingKey === keyName;

            return (
              <div key={keyName} className="py-3 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                <div className="flex items-center gap-3">
                  <div
                    className={`w-2 h-2 rounded-full ${
                      info.configured ? 'bg-emerald-400' : 'bg-slate-600'
                    }`}
                  />
                  <div>
                    <span className="font-mono text-xs font-semibold text-slate-200">{keyName}</span>
                    <div className="text-[11px] text-slate-500">
                      {info.configured ? `Stored (${info.preview})` : 'Not configured'}
                    </div>
                  </div>
                </div>

                <div className="flex items-center gap-2">
                  {isEditing ? (
                    <div className="flex items-center gap-2 w-full sm:w-auto">
                      <input
                        type="password"
                        placeholder="Paste secret value..."
                        value={editingValue}
                        onChange={(e) => setEditingValue(e.target.value)}
                        className="bg-slate-950 border border-slate-700 text-xs font-mono text-cyan-200 rounded px-3 py-1.5 focus:outline-none focus:border-cyan-500"
                        autoFocus
                      />
                      <button
                        onClick={() => handleSaveKey(keyName, editingValue)}
                        disabled={isSavingVault}
                        className="p-1.5 bg-cyan-600 hover:bg-cyan-500 text-white rounded text-xs transition-colors"
                        title="Save key"
                      >
                        <Save className="w-3.5 h-3.5" />
                      </button>
                      <button
                        onClick={() => {
                          setEditingKey(null);
                          setEditingValue('');
                        }}
                        className="p-1.5 bg-slate-800 hover:bg-slate-700 text-slate-400 rounded text-xs transition-colors"
                        title="Cancel"
                      >
                        Cancel
                      </button>
                    </div>
                  ) : (
                    <>
                      <button
                        onClick={() => {
                          setEditingKey(keyName);
                          setEditingValue('');
                        }}
                        className="px-2.5 py-1 text-xs font-medium text-slate-300 hover:text-white bg-slate-800 hover:bg-slate-700 rounded transition-colors"
                      >
                        {info.configured ? 'Update' : 'Set Key'}
                      </button>
                      {info.configured && (
                        <button
                          onClick={() => handleDeleteVaultKey(keyName)}
                          className="p-1 text-slate-500 hover:text-rose-400 transition-colors"
                          title="Delete key"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      )}
                    </>
                  )}
                </div>
              </div>
            );
          })}
        </div>

        {/* Add New Key */}
        <div className="mt-5 pt-4 border-t border-slate-800/80">
          <span className="text-xs font-semibold text-slate-300 block mb-2">Add Custom Secret Key</span>
          <div className="flex flex-col sm:flex-row gap-2">
            <input
              type="text"
              placeholder="KEY_NAME (e.g. RESEND_API_KEY)"
              value={newKeyName}
              onChange={(e) => setNewKeyName(e.target.value)}
              className="flex-1 bg-slate-950 border border-slate-800 text-xs font-mono text-slate-200 rounded-lg px-3.5 py-2 focus:outline-none focus:border-cyan-500"
            />
            <input
              type="password"
              placeholder="Secret value"
              value={newKeyValue}
              onChange={(e) => setNewKeyValue(e.target.value)}
              className="flex-1 bg-slate-950 border border-slate-800 text-xs font-mono text-slate-200 rounded-lg px-3.5 py-2 focus:outline-none focus:border-cyan-500"
            />
            <button
              onClick={handleAddNewVaultKey}
              className="px-4 py-2 bg-slate-800 hover:bg-slate-700 text-slate-200 text-xs font-medium rounded-lg flex items-center justify-center gap-1.5 transition-colors whitespace-nowrap"
            >
              <Plus className="w-3.5 h-3.5" />
              <span>Add Key</span>
            </button>
          </div>
        </div>
      </div>

      {/* 2. Proxy Route Configurations */}
      <div className="bg-slate-900/60 border border-slate-800 rounded-xl p-6">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between pb-4 border-b border-slate-800 gap-2">
          <div>
            <div className="flex items-center gap-2">
              <Sliders className="w-4 h-4 text-cyan-400" />
              <h2 className="text-base font-semibold text-slate-100">Upstream Proxy Routes</h2>
            </div>
            <p className="text-xs text-slate-400 mt-1">
              Configure path prefixes that automatically forward to external APIs with injected secrets.
            </p>
          </div>

          <button
            onClick={() => handleOpenRouteModal()}
            className="flex items-center gap-1.5 px-3.5 py-1.5 text-xs font-medium text-white bg-cyan-600 hover:bg-cyan-500 rounded-lg transition-colors whitespace-nowrap self-start sm:self-auto"
          >
            <Plus className="w-3.5 h-3.5" />
            <span>Create New Route</span>
          </button>
        </div>

        {/* Routes Grid / Table */}
        <div className="mt-4 overflow-x-auto">
          <table className="w-full text-left text-xs">
            <thead>
              <tr className="border-b border-slate-800 text-slate-400 font-medium">
                <th className="py-2.5 pr-4">Service</th>
                <th className="py-2.5 px-4 font-mono">Proxy Path Prefix</th>
                <th className="py-2.5 px-4">Upstream Target URL</th>
                <th className="py-2.5 px-4">Auth Strategy</th>
                <th className="py-2.5 px-4">Vault Secret</th>
                <th className="py-2.5 px-4 text-center">Status</th>
                <th className="py-2.5 pl-4 text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-800/60">
              {routes.map((route) => {
                const isSecretBound = Boolean(route.secretEnvKey && vault[route.secretEnvKey]?.configured);

                return (
                  <tr key={route.id} className="hover:bg-slate-900/40 transition-colors">
                    <td className="py-3.5 pr-4 font-semibold text-slate-200">{route.name}</td>
                    <td className="py-3.5 px-4 font-mono text-cyan-400">{route.prefix}/*</td>
                    <td className="py-3.5 px-4 font-mono text-slate-400 truncate max-w-[200px]">
                      {route.targetBaseUrl}
                    </td>
                    <td className="py-3.5 px-4">
                      <span className="font-mono text-[11px] text-slate-300 capitalize">
                        {route.authStrategy} {route.authHeaderName ? `(${route.authHeaderName})` : ''}
                      </span>
                    </td>
                    <td className="py-3.5 px-4 font-mono text-[11px]">
                      {route.secretEnvKey ? (
                        <span
                          className={`inline-flex items-center gap-1 ${
                            isSecretBound ? 'text-emerald-400' : 'text-amber-400'
                          }`}
                        >
                          <Lock className="w-3 h-3" />
                          {route.secretEnvKey}
                        </span>
                      ) : (
                        <span className="text-slate-500">None</span>
                      )}
                    </td>
                    <td className="py-3.5 px-4 text-center">
                      <button
                        onClick={() => handleToggleRoute(route.id, route.enabled)}
                        className={`text-[11px] font-mono px-2 py-0.5 rounded cursor-pointer transition-colors ${
                          route.enabled
                            ? 'bg-emerald-500/10 text-emerald-400 border border-emerald-500/20'
                            : 'bg-slate-800 text-slate-500'
                        }`}
                      >
                        {route.enabled ? 'Enabled' : 'Disabled'}
                      </button>
                    </td>
                    <td className="py-3.5 pl-4 text-right space-x-2">
                      <button
                        onClick={() => handleOpenRouteModal(route)}
                        className="p-1 text-slate-400 hover:text-cyan-400 transition-colors"
                        title="Edit Route"
                      >
                        <Edit3 className="w-3.5 h-3.5" />
                      </button>
                      <button
                        onClick={() => handleDeleteRoute(route.id)}
                        className="p-1 text-slate-400 hover:text-rose-400 transition-colors"
                        title="Delete Route"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>

      {/* Edit Route Modal */}
      {isRouteModalOpen && (
        <div className="fixed inset-0 z-50 bg-black/70 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-slate-900 border border-slate-700 rounded-xl max-w-lg w-full p-6 space-y-4 shadow-2xl">
            <h3 className="text-base font-semibold text-slate-100">
              {editingRouteId ? 'Edit Proxy Route' : 'Create New Proxy Route'}
            </h3>

            <div className="space-y-3 text-xs">
              <div>
                <label className="block text-slate-400 mb-1">Service Display Name</label>
                <input
                  type="text"
                  value={formData.name || ''}
                  onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                  placeholder="e.g. Weather API"
                  className="w-full bg-slate-950 border border-slate-800 text-slate-200 rounded px-3 py-2 focus:outline-none focus:border-cyan-500"
                />
              </div>

              <div>
                <label className="block text-slate-400 mb-1">Proxy Prefix (starts with /proxy/)</label>
                <input
                  type="text"
                  value={formData.prefix || ''}
                  onChange={(e) => setFormData({ ...formData, prefix: e.target.value })}
                  placeholder="/proxy/weather"
                  className="w-full bg-slate-950 border border-slate-800 font-mono text-cyan-400 rounded px-3 py-2 focus:outline-none focus:border-cyan-500"
                />
              </div>

              <div>
                <label className="block text-slate-400 mb-1">Upstream Target URL</label>
                <input
                  type="text"
                  value={formData.targetBaseUrl || ''}
                  onChange={(e) => setFormData({ ...formData, targetBaseUrl: e.target.value })}
                  placeholder="https://api.weatherapi.com"
                  className="w-full bg-slate-950 border border-slate-800 font-mono text-slate-200 rounded px-3 py-2 focus:outline-none focus:border-cyan-500"
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-slate-400 mb-1">Auth Injection Strategy</label>
                  <select
                    value={formData.authStrategy || 'bearer'}
                    onChange={(e) => setFormData({ ...formData, authStrategy: e.target.value as any })}
                    aria-label="Auth Strategy"
                    className="w-full bg-slate-950 border border-slate-800 text-slate-200 rounded px-3 py-2 focus:outline-none focus:border-cyan-500"
                  >
                    <option value="bearer">Authorization: Bearer &lt;KEY&gt;</option>
                    <option value="header">Custom Header (e.g. x-api-key)</option>
                    <option value="query">Query Parameter (?key=&lt;KEY&gt;)</option>
                    <option value="none">No Secret Injection (Public)</option>
                  </select>
                </div>

                <div>
                  <label className="block text-slate-400 mb-1">Secret Key in Vault</label>
                  <input
                    type="text"
                    value={formData.secretEnvKey || ''}
                    onChange={(e) => setFormData({ ...formData, secretEnvKey: e.target.value.toUpperCase() })}
                    placeholder="WEATHER_API_KEY"
                    className="w-full bg-slate-950 border border-slate-800 font-mono text-amber-400 rounded px-3 py-2 focus:outline-none focus:border-cyan-500"
                  />
                </div>
              </div>

              {formData.authStrategy === 'header' && (
                <div>
                  <label className="block text-slate-400 mb-1">Header Name (e.g. x-api-key or x-goog-api-key)</label>
                  <input
                    type="text"
                    value={formData.authHeaderName || ''}
                    onChange={(e) => setFormData({ ...formData, authHeaderName: e.target.value })}
                    placeholder="x-api-key"
                    className="w-full bg-slate-950 border border-slate-800 font-mono text-slate-200 rounded px-3 py-2 focus:outline-none focus:border-cyan-500"
                  />
                </div>
              )}

              {formData.authStrategy === 'query' && (
                <div>
                  <label className="block text-slate-400 mb-1">Query Param Name (e.g. key or api_key)</label>
                  <input
                    type="text"
                    value={formData.authQueryParamName || ''}
                    onChange={(e) => setFormData({ ...formData, authQueryParamName: e.target.value })}
                    placeholder="key"
                    className="w-full bg-slate-950 border border-slate-800 font-mono text-slate-200 rounded px-3 py-2 focus:outline-none focus:border-cyan-500"
                  />
                </div>
              )}
            </div>

            <div className="flex items-center justify-end gap-2 pt-3 border-t border-slate-800">
              <button
                onClick={() => setIsRouteModalOpen(false)}
                className="px-3.5 py-1.5 text-xs text-slate-400 hover:text-slate-200 bg-slate-800 rounded transition-colors"
              >
                Cancel
              </button>
              <button
                onClick={handleSaveRoute}
                className="px-4 py-1.5 text-xs font-medium text-white bg-cyan-600 hover:bg-cyan-500 rounded transition-colors"
              >
                Save Route
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
