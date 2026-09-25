import React, { useState } from 'react';
import { Download, Copy, Check, Server, Terminal, ExternalLink, Cloud, CheckCircle, ShieldCheck, ArrowRight, FileCode } from 'lucide-react';
import JSZip from 'jszip';
import { RouteConfig, SecurityConfig, VaultSecretItem } from '../types';

interface RenderDeployHubProps {
  security: SecurityConfig;
  routes: RouteConfig[];
  vault: Record<string, VaultSecretItem>;
}

export const RenderDeployHub: React.FC<RenderDeployHubProps> = ({
  security,
  routes,
  vault,
}) => {
  const [activeFileTab, setActiveFileTab] = useState<'render-yaml' | 'server-ts' | 'package-json' | 'dockerfile' | 'env'>('render-yaml');
  const [copiedFile, setCopiedFile] = useState<string | null>(null);
  const [isDownloadingZip, setIsDownloadingZip] = useState<boolean>(false);

  const renderYamlContent = `# Render Blueprint for Pure Backend Web Service
# Deploy instantly at https://dashboard.render.com/blueprints

services:
  - type: web
    name: keyshield-backend-proxy
    runtime: node
    plan: free
    region: oregon # or frankfurt, ohio, singapore
    buildCommand: npm install && npm run build:server
    startCommand: npm run start
    healthCheckPath: /healthz
    envVars:
      - key: NODE_ENV
        value: production
      - key: BACKEND_ONLY
        value: "true"
      
      # 1. Port Configuration (Render automatically injects PORT)
      - key: PORT
        value: 3000

      # 2. Master Client Key (Render generates a high-entropy secret automatically)
      - key: PROXY_MASTER_KEY
        generateValue: true

      # 3. CORS Allowed Origins (Comma-separated list of your client frontends)
      - key: ALLOWED_ORIGINS
        value: "${security.allowedOrigins.join(',')}"

      # 4. Database Connection String (Optional: Neon, Supabase, Cloud SQL, MongoDB)
      - key: DATABASE_URL
        sync: false

      # 5. Upstream Secret API Keys (sync: false keeps them out of Git)
      - key: GEMINI_API_KEY
        sync: false
      - key: OPENAI_API_KEY
        sync: false
      - key: ANTHROPIC_API_KEY
        sync: false
      - key: GITHUB_TOKEN
        sync: false
      - key: STRIPE_SECRET_KEY
        sync: false
`;

  const packageJsonContent = `{
  "name": "keyshield-backend-proxy",
  "version": "1.0.0",
  "private": true,
  "type": "module",
  "scripts": {
    "dev": "tsx server.ts",
    "build:server": "esbuild server.ts --bundle --platform=node --format=esm --packages=external --outfile=dist/server.js",
    "start": "node dist/server.js"
  },
  "dependencies": {
    "express": "^4.21.2",
    "dotenv": "^17.2.3"
  },
  "devDependencies": {
    "@types/express": "^4.17.21",
    "@types/node": "^22.14.0",
    "esbuild": "^0.25.0",
    "tsx": "^4.21.0",
    "typescript": "^5.7.0"
  }
}
`;

  const dockerfileContent = `# Lightweight Standalone Backend Dockerfile
FROM node:20-alpine AS builder
WORKDIR /app
COPY package*.json tsconfig.json ./
RUN npm ci
COPY server.ts ./
RUN npx esbuild server.ts --bundle --platform=node --format=esm --packages=external --outfile=dist/server.js

FROM node:20-alpine AS runner
WORKDIR /app
ENV NODE_ENV=production
ENV PORT=3000
COPY package*.json ./
RUN npm ci --only=production
COPY --from=builder /app/dist ./dist

EXPOSE 3000
HEALTHCHECK --interval=30s --timeout=5s --start-period=5s --retries=3 \\
  CMD wget --no-verbose --tries=1 --spider http://localhost:3000/healthz || exit 1
CMD ["node", "dist/server.js"]
`;

  const envContent = `# KeyShield Production Backend Environment Variables for Render
PORT=3000
NODE_ENV=production
BACKEND_ONLY=true
PROXY_MASTER_KEY=${security.masterClientKey || 'pxy_live_1234567890'}
ALLOWED_ORIGINS=${security.allowedOrigins.join(',')}

# Database Connection String (Optional: PostgreSQL, Supabase, Neon, Cloud SQL, MongoDB)
DATABASE_URL=postgresql://user:password@db-host:5432/dbname?sslmode=require

# Upstream API Keys (Set these in Render Dashboard -> Environment)
GEMINI_API_KEY=your_gemini_key_here
OPENAI_API_KEY=your_openai_key_here
ANTHROPIC_API_KEY=your_claude_key_here
GITHUB_TOKEN=your_github_token_here
STRIPE_SECRET_KEY=your_stripe_secret_key_here
`;

  const readmeContent = `# KeyShield - Mini Backend API Proxy for Render

A high-performance, secure standalone Node.js / Express backend API proxy gateway designed for deployment on Render. Protects client-side API keys, enforces CORS origin restrictions, rate-limits requests, and routes securely to upstream services.

## 🚀 Standalone Backend Deployment on Render

1. Push this repository to GitHub.
2. In the **Render Dashboard**, click **New +** -> **Web Service** (or **Blueprint**).
3. Connect your GitHub repository.
4. Settings:
   - **Environment**: Node
   - **Build Command**: \`npm install && npm run build:server\`
   - **Start Command**: \`npm start\` (or \`node dist/server.js\`)
5. In the **Environment Variables** tab, add your secret API keys (\`OPENAI_API_KEY\`, \`GEMINI_API_KEY\`, etc.).
6. Click **Deploy Web Service**!

## 📡 Endpoints

- \`GET /healthz\` - Health check for Render monitor
- \`GET /api/docs\` - JSON API routes and schema documentation
- \`ALL /proxy/gemini/*\` - Google Gemini AI (injects GEMINI_API_KEY)
- \`ALL /proxy/openai/*\` - OpenAI API (injects OPENAI_API_KEY)
- \`ALL /proxy/anthropic/*\` - Anthropic Claude (injects ANTHROPIC_API_KEY)
- \`ALL /proxy/github/*\` - GitHub REST API (injects GITHUB_TOKEN)
- \`ALL /proxy/stripe/*\` - Stripe API (injects STRIPE_SECRET_KEY)
- \`ALL /api/proxy?target=https://...\` - Universal dynamic proxy
`;

  const copyToClipboard = (text: string, type: string) => {
    navigator.clipboard.writeText(text);
    setCopiedFile(type);
    setTimeout(() => setCopiedFile(null), 2000);
  };

  const handleDownloadZip = async () => {
    setIsDownloadingZip(true);
    try {
      const zip = new JSZip();
      zip.file('render.yaml', renderYamlContent);
      zip.file('package.json', packageJsonContent);
      zip.file('Dockerfile', dockerfileContent);
      zip.file('.env.example', envContent);
      zip.file('README.md', readmeContent);

      // Fetch server.ts content or bundle
      try {
        const serverRes = await fetch('/server.ts');
        if (serverRes.ok) {
          const serverText = await serverRes.text();
          zip.file('server.ts', serverText);
        }
      } catch (e) {
        // fallback
      }

      const content = await zip.generateAsync({ type: 'blob' });
      const url = URL.createObjectURL(content);
      const a = document.createElement('a');
      a.href = url;
      a.download = 'keyshield-render-proxy-bundle.zip';
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
    } catch (err: any) {
      alert('Error creating zip: ' + err?.message);
    } finally {
      setIsDownloadingZip(false);
    }
  };

  return (
    <div className="space-y-8">
      {/* Banner / Download Action */}
      <div className="bg-gradient-to-r from-cyan-950/40 via-slate-900 to-slate-900 border border-cyan-500/30 rounded-xl p-6 flex flex-col md:flex-row items-start md:items-center justify-between gap-4">
        <div>
          <div className="flex items-center gap-2">
            <Cloud className="w-5 h-5 text-cyan-400" />
            <h2 className="text-lg font-semibold text-slate-100">Ready for Render Deployment</h2>
          </div>
          <p className="text-xs text-slate-300 mt-1 max-w-2xl leading-relaxed">
            Download the complete standalone Render deployment bundle with your configured routes, environment blueprints, and Dockerfile ready to host on Render&apos;s free tier.
          </p>
        </div>

        <button
          onClick={handleDownloadZip}
          disabled={isDownloadingZip}
          className="flex items-center gap-2 px-5 py-2.5 bg-cyan-600 hover:bg-cyan-500 text-white font-medium text-xs rounded-lg transition-all shadow-lg shadow-cyan-950/60 whitespace-nowrap cursor-pointer"
        >
          {isDownloadingZip ? (
            <>
              <div className="w-3.5 h-3.5 border-2 border-white/30 border-t-white rounded-full animate-spin" />
              <span>Generating ZIP...</span>
            </>
          ) : (
            <>
              <Download className="w-4 h-4" />
              <span>Download Render Package (.zip)</span>
            </>
          )}
        </button>
      </div>

      {/* 4-Step Walkthrough */}
      <div className="bg-slate-900/60 border border-slate-800 rounded-xl p-6">
        <h3 className="text-sm font-semibold text-slate-100 mb-4 flex items-center gap-2">
          <CheckCircle className="w-4 h-4 text-cyan-400" />
          <span>Step-by-Step Render Setup Guide</span>
        </h3>

        <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
          <div className="bg-slate-950 border border-slate-800 rounded-lg p-4">
            <span className="text-[11px] font-mono text-cyan-400 font-semibold block mb-1">STEP 01</span>
            <h4 className="text-xs font-semibold text-slate-200 mb-1">Create GitHub Repo</h4>
            <p className="text-[11px] text-slate-400 leading-relaxed">
              Unzip the downloaded package or push these repository files to a new GitHub repository.
            </p>
          </div>

          <div className="bg-slate-950 border border-slate-800 rounded-lg p-4">
            <span className="text-[11px] font-mono text-cyan-400 font-semibold block mb-1">STEP 02</span>
            <h4 className="text-xs font-semibold text-slate-200 mb-1">Connect to Render</h4>
            <p className="text-[11px] text-slate-400 leading-relaxed">
              Go to <a href="https://dashboard.render.com" target="_blank" rel="noreferrer" className="text-cyan-400 underline">Render Dashboard</a> &rarr; <strong>New +</strong> &rarr; <strong>Web Service</strong> (or Blueprint).
            </p>
          </div>

          <div className="bg-slate-950 border border-slate-800 rounded-lg p-4">
            <span className="text-[11px] font-mono text-cyan-400 font-semibold block mb-1">STEP 03</span>
            <h4 className="text-xs font-semibold text-slate-200 mb-1">Add Secret Env Vars</h4>
            <p className="text-[11px] text-slate-400 leading-relaxed">
              In Render &gt; Environment, add your real API keys (<code className="text-amber-400">OPENAI_API_KEY</code>, <code className="text-amber-400">GEMINI_API_KEY</code>, etc.).
            </p>
          </div>

          <div className="bg-slate-950 border border-slate-800 rounded-lg p-4">
            <span className="text-[11px] font-mono text-emerald-400 font-semibold block mb-1">STEP 04</span>
            <h4 className="text-xs font-semibold text-slate-200 mb-1">Deploy &amp; Point Clients</h4>
            <p className="text-[11px] text-slate-400 leading-relaxed">
              Copy your live Render URL (<code className="text-cyan-300">https://your-app.onrender.com</code>) into your frontend client apps.
            </p>
          </div>
        </div>
      </div>

      {/* Code Inspector Tabs */}
      <div className="bg-slate-900/60 border border-slate-800 rounded-xl p-6">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between pb-4 border-b border-slate-800 gap-3">
          <div className="flex items-center gap-2 overflow-x-auto">
            {[
              { id: 'render-yaml', label: 'render.yaml (Blueprint)' },
              { id: 'dockerfile', label: 'Dockerfile' },
              { id: 'package-json', label: 'package.json' },
              { id: 'env', label: '.env.example' },
            ].map((tab) => (
              <button
                key={tab.id}
                onClick={() => setActiveFileTab(tab.id as any)}
                className={`px-3 py-1.5 text-xs font-mono rounded-lg transition-colors whitespace-nowrap ${
                  activeFileTab === tab.id
                    ? 'bg-slate-800 text-cyan-300 font-semibold border border-slate-700'
                    : 'text-slate-400 hover:text-slate-200'
                }`}
              >
                {tab.label}
              </button>
            ))}
          </div>

          <button
            onClick={() => {
              const textMap: Record<string, string> = {
                'render-yaml': renderYamlContent,
                dockerfile: dockerfileContent,
                'package-json': packageJsonContent,
                env: envContent,
              };
              copyToClipboard(textMap[activeFileTab], activeFileTab);
            }}
            className="flex items-center gap-1.5 px-3 py-1.5 bg-slate-800 hover:bg-slate-700 text-slate-300 text-xs rounded-lg transition-colors self-start sm:self-auto"
          >
            {copiedFile === activeFileTab ? <Check className="w-3.5 h-3.5 text-emerald-400" /> : <Copy className="w-3.5 h-3.5" />}
            <span>{copiedFile === activeFileTab ? 'Copied to Clipboard' : 'Copy File Content'}</span>
          </button>
        </div>

        {/* Tab content viewer */}
        <div className="mt-4">
          <pre className="bg-slate-950 border border-slate-800 rounded-lg p-4 text-xs font-mono text-cyan-300/90 overflow-x-auto leading-relaxed max-h-[420px]">
            {activeFileTab === 'render-yaml' && renderYamlContent}
            {activeFileTab === 'dockerfile' && dockerfileContent}
            {activeFileTab === 'package-json' && packageJsonContent}
            {activeFileTab === 'env' && envContent}
          </pre>
        </div>
      </div>
    </div>
  );
};
