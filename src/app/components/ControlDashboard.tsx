import { useState, useEffect, useCallback } from 'react';
import {
  Activity,
  Clock,
  Cpu,
  Key,
  Eye,
  EyeOff,
  Copy,
  Check,
  Shuffle,
  Save,
  AlertTriangle,
  TrendingUp,
  Zap,
  Shield,
  ChevronDown,
  ChevronUp,
  Server,
  Terminal,
} from 'lucide-react';
import { Button } from './ui/button';
import { Badge } from './ui/badge';
import { Separator } from './ui/separator';
import { ServerLogsPanel } from './ServerLogsPanel';
import type { LogEntry, ServerStatus, UsageStats } from '../services/serverLogs';
import {
  fetchAuthKey,
  updateAuthKey,
  generateRandomKey,
} from '../services/authKeyService';
import type { Model } from './ModelSidebar';

type Props = {
  logs: LogEntry[];
  serverStatus: ServerStatus;
  usageStats: UsageStats;
  onClearLogs: () => void;
  models: Model[];
  enabledModels: Set<string>;
};

// ── Helpers ──────────────────────────────────────────────────────────

function formatUptime(startIso: string | null): string {
  if (!startIso) return '--:--:--';
  const start = new Date(startIso).getTime();
  const now = Date.now();
  const diff = Math.max(0, now - start);
  const h = Math.floor(diff / 3_600_000);
  const m = Math.floor((diff % 3_600_000) / 60_000);
  const s = Math.floor((diff % 60_000) / 1000);
  return `${h.toString().padStart(2, '0')}:${m.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}`;
}

function formatTimeSince(iso: string): string {
  const diff = Date.now() - new Date(iso).getTime();
  if (diff < 60_000) return `${Math.round(diff / 1000)}s ago`;
  if (diff < 3_600_000) return `${Math.round(diff / 60_000)}m ago`;
  return `${Math.round(diff / 3_600_000)}h ago`;
}

function maskKey(key: string): string {
  if (key.length <= 6) return '••••••';
  return key.slice(0, 3) + '•'.repeat(Math.min(key.length - 6, 18)) + key.slice(-3);
}

// ── Stat Card Component ──────────────────────────────────────────────

function StatCard({
  label,
  value,
  subValue,
  color,
  icon: Icon,
}: {
  label: string;
  value: string | number;
  subValue?: string;
  color: string;
  icon: typeof Activity;
}) {
  return (
    <div
      style={{
        background: `${color}08`,
        border: `1px solid ${color}20`,
        borderRadius: 12,
        padding: '1rem 1.1rem',
        position: 'relative',
        overflow: 'hidden',
      }}
    >
      <div
        style={{
          position: 'absolute',
          top: 10,
          right: 10,
          opacity: 0.15,
        }}
      >
        <Icon size={28} color={color} />
      </div>
      <div
        style={{
          fontSize: '0.65rem',
          color: 'rgba(255,255,255,0.45)',
          textTransform: 'uppercase',
          letterSpacing: '0.06em',
          marginBottom: '0.3rem',
        }}
      >
        {label}
      </div>
      <div
        style={{
          fontSize: '1.5rem',
          fontWeight: 800,
          color: color,
          lineHeight: 1.1,
        }}
      >
        {value}
      </div>
      {subValue && (
        <div
          style={{
            fontSize: '0.62rem',
            color: 'rgba(255,255,255,0.35)',
            marginTop: '0.2rem',
          }}
        >
          {subValue}
        </div>
      )}
    </div>
  );
}

// ── Main Dashboard ───────────────────────────────────────────────────

export function ControlDashboard({
  logs,
  serverStatus,
  usageStats,
  onClearLogs,
  models,
  enabledModels,
}: Props) {
  // Uptime ticker
  const [uptime, setUptime] = useState('--:--:--');
  useEffect(() => {
    const timer = setInterval(() => {
      setUptime(formatUptime(usageStats.serverStartTime));
    }, 1000);
    return () => clearInterval(timer);
  }, [usageStats.serverStartTime]);

  // Auth key state
  const [authKey, setAuthKey] = useState('');
  const [editKey, setEditKey] = useState('');
  const [showKey, setShowKey] = useState(false);
  const [isEditing, setIsEditing] = useState(false);
  const [saving, setSaving] = useState(false);
  const [saveResult, setSaveResult] = useState<{ ok: boolean; msg: string } | null>(null);
  const [copied, setCopied] = useState(false);

  // Logs panel expanded
  const [logsExpanded, setLogsExpanded] = useState(true);

  // Fetch auth key on mount
  useEffect(() => {
    fetchAuthKey().then((key) => {
      if (key) {
        setAuthKey(key);
        setEditKey(key);
      }
    });
  }, []);

  const handleGenerateRandom = () => {
    const newKey = generateRandomKey(24);
    setEditKey(newKey);
    setIsEditing(true);
  };

  const handleSave = async () => {
    setSaving(true);
    setSaveResult(null);
    const result = await updateAuthKey(editKey);
    setSaving(false);
    if (result.ok) {
      setAuthKey(editKey);
      setIsEditing(false);
      setSaveResult({ ok: true, msg: 'Saved to Firebase ✓' });
      setTimeout(() => setSaveResult(null), 3000);
    } else {
      setSaveResult({ ok: false, msg: result.error || 'Failed' });
    }
  };

  const handleCopy = () => {
    navigator.clipboard.writeText(isEditing ? editKey : authKey);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const activeCount = enabledModels.size;
  const errorRate =
    usageStats.totalRequests > 0
      ? ((usageStats.errorsCount / (usageStats.totalRequests + usageStats.errorsCount)) * 100).toFixed(1)
      : '0';

  return (
    <div
      style={{
        flex: 1,
        display: 'flex',
        flexDirection: 'column',
        background: 'linear-gradient(180deg, #0a0b10 0%, #0f1117 100%)',
        height: '100%',
        overflow: 'hidden',
      }}
    >
      {/* ── Scrollable content area ── */}
      <div
        style={{
          flex: 1,
          minHeight: 0,
          overflowY: 'auto',
          padding: '1.5rem',
          scrollbarWidth: 'thin',
          scrollbarColor: 'rgba(255,255,255,0.12) transparent',
        }}
      >
        {/* Header */}
        <div style={{ marginBottom: '1.5rem' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.6rem' }}>
            <div
              style={{
                width: 36,
                height: 36,
                borderRadius: 10,
                background: 'linear-gradient(135deg,#6366f1,#8b5cf6)',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
              }}
            >
              <Server size={18} color="#fff" />
            </div>
            <div>
              <h1
                style={{
                  color: '#fff',
                  fontSize: '1.15rem',
                  fontWeight: 700,
                  margin: 0,
                  lineHeight: 1.2,
                }}
              >
                Control Dashboard
              </h1>
              <p
                style={{
                  color: 'rgba(255,255,255,0.4)',
                  fontSize: '0.72rem',
                  margin: 0,
                }}
              >
                LLM Backend Monitoring & Configuration
              </p>
            </div>

            {/* Server status badge */}
            <div style={{ marginLeft: 'auto', display: 'flex', gap: '0.5rem', alignItems: 'center' }}>
              {usageStats.errorsCount > 0 && (
                <span
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: 4,
                    fontSize: '0.68rem',
                    color: '#ef4444',
                    background: 'rgba(239,68,68,0.1)',
                    border: '1px solid rgba(239,68,68,0.2)',
                    padding: '0.2rem 0.5rem',
                    borderRadius: 6,
                    fontWeight: 600,
                  }}
                >
                  <AlertTriangle size={12} />
                  {usageStats.errorsCount} error{usageStats.errorsCount !== 1 ? 's' : ''}
                </span>
              )}
              <span
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: 4,
                  fontSize: '0.68rem',
                  color: serverStatus === 'online' ? '#4ade80' : '#ef4444',
                  background:
                    serverStatus === 'online'
                      ? 'rgba(74,222,128,0.1)'
                      : 'rgba(239,68,68,0.1)',
                  border: `1px solid ${
                    serverStatus === 'online'
                      ? 'rgba(74,222,128,0.2)'
                      : 'rgba(239,68,68,0.2)'
                  }`,
                  padding: '0.2rem 0.5rem',
                  borderRadius: 6,
                  fontWeight: 600,
                }}
              >
                <span
                  style={{
                    width: 6,
                    height: 6,
                    borderRadius: '50%',
                    background: serverStatus === 'online' ? '#4ade80' : '#ef4444',
                    boxShadow: `0 0 6px ${serverStatus === 'online' ? '#4ade80' : '#ef4444'}`,
                  }}
                />
                {serverStatus === 'online' ? 'Online' : serverStatus === 'offline' ? 'Offline' : 'Connecting'}
              </span>
            </div>
          </div>
        </div>

        {/* ── Stats Grid (3x2) ── */}
        <div
          style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(3, 1fr)',
            gap: '0.75rem',
            marginBottom: '1.5rem',
          }}
        >
          <StatCard
            label="Total Queries"
            value={usageStats.totalRequests}
            subValue={usageStats.authFailures > 0 ? `${usageStats.authFailures} auth failures` : undefined}
            color="#60a5fa"
            icon={Activity}
          />
          <StatCard
            label="Total Tokens"
            value={usageStats.totalTokens.toLocaleString()}
            subValue={usageStats.tokensPerSecond > 0 ? `${usageStats.tokensPerSecond} tok/s` : undefined}
            color="#a78bfa"
            icon={TrendingUp}
          />
          <StatCard
            label="Avg Latency"
            value={usageStats.avgLatencyMs ? `${usageStats.avgLatencyMs}ms` : '--'}
            subValue={
              usageStats.peakLatencyMs > 0
                ? `Peak: ${usageStats.peakLatencyMs}ms • Min: ${usageStats.minLatencyMs === Infinity ? '--' : usageStats.minLatencyMs + 'ms'}`
                : undefined
            }
            color="#4ade80"
            icon={Zap}
          />
          <StatCard
            label="Server Uptime"
            value={uptime}
            subValue={usageStats.serverStartTime ? `Since ${new Date(usageStats.serverStartTime).toLocaleTimeString()}` : 'Waiting for startup log'}
            color="#22d3ee"
            icon={Clock}
          />
          <StatCard
            label="Active Models"
            value={activeCount}
            subValue={`${models.length} registered • ${models.filter(m => m.status === 'loaded').length} downloaded`}
            color="#f59e0b"
            icon={Cpu}
          />
          <StatCard
            label="Tokens/sec"
            value={usageStats.tokensPerSecond || '--'}
            subValue={`Error rate: ${errorRate}%`}
            color="#f472b6"
            icon={TrendingUp}
          />
        </div>

        {/* ── Per-Model Breakdown Table ── */}
        {Object.keys(usageStats.modelUsage).length > 0 && (
          <div style={{ marginBottom: '1.5rem' }}>
            <div
              style={{
                fontSize: '0.75rem',
                fontWeight: 600,
                color: 'rgba(255,255,255,0.6)',
                textTransform: 'uppercase',
                letterSpacing: '0.06em',
                marginBottom: '0.6rem',
              }}
            >
              Per-Model Performance
            </div>
            <div
              style={{
                background: 'rgba(255,255,255,0.03)',
                border: '1px solid rgba(255,255,255,0.07)',
                borderRadius: 10,
                overflow: 'hidden',
              }}
            >
              {/* Table header */}
              <div
                style={{
                  display: 'grid',
                  gridTemplateColumns: '1.5fr 0.7fr 0.9fr 0.9fr 0.8fr',
                  gap: '0.5rem',
                  padding: '0.6rem 1rem',
                  borderBottom: '1px solid rgba(255,255,255,0.07)',
                  fontSize: '0.62rem',
                  color: 'rgba(255,255,255,0.4)',
                  textTransform: 'uppercase',
                  letterSpacing: '0.05em',
                  fontWeight: 600,
                }}
              >
                <span>Model</span>
                <span style={{ textAlign: 'right' }}>Requests</span>
                <span style={{ textAlign: 'right' }}>Tokens</span>
                <span style={{ textAlign: 'right' }}>Avg Latency</span>
                <span style={{ textAlign: 'right' }}>Last Used</span>
              </div>
              {/* Table rows */}
              {Object.entries(usageStats.modelUsage).map(([model, stats]) => (
                <div
                  key={model}
                  style={{
                    display: 'grid',
                    gridTemplateColumns: '1.5fr 0.7fr 0.9fr 0.9fr 0.8fr',
                    gap: '0.5rem',
                    padding: '0.5rem 1rem',
                    borderBottom: '1px solid rgba(255,255,255,0.04)',
                    fontSize: '0.72rem',
                    alignItems: 'center',
                  }}
                >
                  <span
                    style={{
                      color: '#a78bfa',
                      fontWeight: 600,
                      overflow: 'hidden',
                      textOverflow: 'ellipsis',
                      whiteSpace: 'nowrap',
                    }}
                  >
                    {model}
                  </span>
                  <span style={{ textAlign: 'right', color: '#60a5fa', fontWeight: 600 }}>
                    {stats.requests}
                  </span>
                  <span style={{ textAlign: 'right', color: 'rgba(255,255,255,0.6)' }}>
                    {stats.tokens.toLocaleString()}
                  </span>
                  <span style={{ textAlign: 'right', color: '#4ade80' }}>
                    {stats.avgLatencyMs}ms
                  </span>
                  <span
                    style={{
                      textAlign: 'right',
                      color: 'rgba(255,255,255,0.35)',
                      fontSize: '0.65rem',
                    }}
                  >
                    {stats.lastUsed ? formatTimeSince(stats.lastUsed) : '--'}
                  </span>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* ── Auth Key Manager ── */}
        <div style={{ marginBottom: '1.5rem' }}>
          <div
            style={{
              fontSize: '0.75rem',
              fontWeight: 600,
              color: 'rgba(255,255,255,0.6)',
              textTransform: 'uppercase',
              letterSpacing: '0.06em',
              marginBottom: '0.6rem',
              display: 'flex',
              alignItems: 'center',
              gap: '0.4rem',
            }}
          >
            <Key size={13} />
            API Key Management
          </div>
          <div
            style={{
              background: 'rgba(255,255,255,0.03)',
              border: '1px solid rgba(255,255,255,0.07)',
              borderRadius: 10,
              padding: '1rem',
            }}
          >
            {/* Current key display */}
            <div
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: '0.5rem',
                marginBottom: '0.75rem',
              }}
            >
              <div
                style={{
                  flex: 1,
                  fontFamily: "'JetBrains Mono', 'Fira Code', monospace",
                  fontSize: '0.78rem',
                  background: 'rgba(0,0,0,0.3)',
                  border: '1px solid rgba(255,255,255,0.1)',
                  borderRadius: 6,
                  padding: '0.5rem 0.7rem',
                  color: isEditing ? '#f59e0b' : '#4ade80',
                  overflow: 'hidden',
                  textOverflow: 'ellipsis',
                  whiteSpace: 'nowrap',
                }}
              >
                {isEditing
                  ? editKey
                  : showKey
                  ? authKey || 'No key loaded'
                  : maskKey(authKey || 'No key')}
              </div>

              {/* Toggle visibility */}
              <button
                onClick={() => setShowKey(!showKey)}
                style={{
                  background: 'rgba(255,255,255,0.05)',
                  border: '1px solid rgba(255,255,255,0.1)',
                  borderRadius: 6,
                  padding: '0.45rem',
                  cursor: 'pointer',
                  color: 'rgba(255,255,255,0.5)',
                  display: 'flex',
                  alignItems: 'center',
                }}
                title={showKey ? 'Hide key' : 'Reveal key'}
              >
                {showKey ? <EyeOff size={14} /> : <Eye size={14} />}
              </button>

              {/* Copy */}
              <button
                onClick={handleCopy}
                style={{
                  background: 'rgba(255,255,255,0.05)',
                  border: '1px solid rgba(255,255,255,0.1)',
                  borderRadius: 6,
                  padding: '0.45rem',
                  cursor: 'pointer',
                  color: copied ? '#4ade80' : 'rgba(255,255,255,0.5)',
                  display: 'flex',
                  alignItems: 'center',
                  transition: 'color 0.2s',
                }}
                title="Copy to clipboard"
              >
                {copied ? <Check size={14} /> : <Copy size={14} />}
              </button>
            </div>

            {/* Edit area */}
            {isEditing && (
              <div style={{ marginBottom: '0.75rem' }}>
                <input
                  type="text"
                  value={editKey}
                  onChange={(e) => setEditKey(e.target.value)}
                  style={{
                    width: '100%',
                    fontFamily: "'JetBrains Mono', 'Fira Code', monospace",
                    fontSize: '0.75rem',
                    background: 'rgba(0,0,0,0.4)',
                    border: '1px solid rgba(245,158,11,0.3)',
                    borderRadius: 6,
                    padding: '0.5rem 0.7rem',
                    color: '#f59e0b',
                    outline: 'none',
                  }}
                  placeholder="Enter new API key..."
                />
              </div>
            )}

            {/* Action buttons */}
            <div
              style={{
                display: 'flex',
                gap: '0.5rem',
                flexWrap: 'wrap',
              }}
            >
              <button
                onClick={() => {
                  if (isEditing) {
                    setEditKey(authKey);
                    setIsEditing(false);
                  } else {
                    setIsEditing(true);
                  }
                }}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: 4,
                  fontSize: '0.7rem',
                  fontWeight: 600,
                  padding: '0.35rem 0.7rem',
                  borderRadius: 6,
                  background: isEditing ? 'rgba(239,68,68,0.12)' : 'rgba(255,255,255,0.06)',
                  color: isEditing ? '#ef4444' : 'rgba(255,255,255,0.6)',
                  border: `1px solid ${isEditing ? 'rgba(239,68,68,0.25)' : 'rgba(255,255,255,0.1)'}`,
                  cursor: 'pointer',
                  transition: 'all 0.15s',
                }}
              >
                {isEditing ? 'Cancel' : 'Edit'}
              </button>

              <button
                onClick={handleGenerateRandom}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: 4,
                  fontSize: '0.7rem',
                  fontWeight: 600,
                  padding: '0.35rem 0.7rem',
                  borderRadius: 6,
                  background: 'rgba(167,139,250,0.12)',
                  color: '#a78bfa',
                  border: '1px solid rgba(167,139,250,0.25)',
                  cursor: 'pointer',
                  transition: 'all 0.15s',
                }}
              >
                <Shuffle size={12} />
                Generate Random
              </button>

              {isEditing && (
                <button
                  onClick={handleSave}
                  disabled={saving || editKey.length < 4}
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: 4,
                    fontSize: '0.7rem',
                    fontWeight: 600,
                    padding: '0.35rem 0.7rem',
                    borderRadius: 6,
                    background: saving ? 'rgba(74,222,128,0.08)' : 'rgba(74,222,128,0.15)',
                    color: '#4ade80',
                    border: '1px solid rgba(74,222,128,0.3)',
                    cursor: saving ? 'not-allowed' : 'pointer',
                    opacity: editKey.length < 4 ? 0.4 : 1,
                    transition: 'all 0.15s',
                  }}
                >
                  <Save size={12} />
                  {saving ? 'Saving...' : 'Save to Firebase'}
                </button>
              )}
            </div>

            {/* Save result feedback */}
            {saveResult && (
              <div
                style={{
                  marginTop: '0.5rem',
                  fontSize: '0.68rem',
                  fontWeight: 600,
                  color: saveResult.ok ? '#4ade80' : '#ef4444',
                  display: 'flex',
                  alignItems: 'center',
                  gap: 4,
                }}
              >
                {saveResult.ok ? <Check size={12} /> : <AlertTriangle size={12} />}
                {saveResult.msg}
              </div>
            )}

            {/* Firebase path info */}
            <div
              style={{
                marginTop: '0.5rem',
                fontSize: '0.6rem',
                color: 'rgba(255,255,255,0.25)',
              }}
            >
              Firebase path: <code style={{ color: 'rgba(255,255,255,0.35)' }}>config/authKey</code>
              {' • '}
              <code style={{ color: 'rgba(255,255,255,0.35)' }}>localhost:8321</code>
            </div>
          </div>
        </div>
      </div>

      {/* ── Server Logs (collapsible bottom) ── */}
      <div
        style={{
          flex: logsExpanded ? 1 : undefined,
          display: 'flex',
          flexDirection: 'column',
          borderTop: '1px solid rgba(255,255,255,0.07)',
          minHeight: logsExpanded ? '200px' : undefined,
        }}
      >
        {/* Logs header bar */}
        <button
          onClick={() => setLogsExpanded(!logsExpanded)}
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: '0.5rem',
            padding: '0.5rem 1rem',
            background: 'rgba(255,255,255,0.03)',
            border: 'none',
            borderBottom: logsExpanded ? '1px solid rgba(255,255,255,0.07)' : 'none',
            cursor: 'pointer',
            flexShrink: 0,
            width: '100%',
            textAlign: 'left',
          }}
        >
          <Terminal size={14} color="rgba(255,255,255,0.5)" />
          <span
            style={{
              fontSize: '0.72rem',
              fontWeight: 600,
              color: 'rgba(255,255,255,0.6)',
            }}
          >
            Server Logs
          </span>
          <span
            style={{
              fontSize: '0.62rem',
              color: 'rgba(255,255,255,0.3)',
            }}
          >
            {logs.length} entries
          </span>
          <span
            style={{
              width: 6,
              height: 6,
              borderRadius: '50%',
              background: serverStatus === 'online' ? '#4ade80' : '#ef4444',
              boxShadow: `0 0 4px ${serverStatus === 'online' ? '#4ade80' : '#ef4444'}`,
              marginLeft: 2,
            }}
          />
          <span style={{ marginLeft: 'auto' }}>
            {logsExpanded ? (
              <ChevronDown size={14} color="rgba(255,255,255,0.4)" />
            ) : (
              <ChevronUp size={14} color="rgba(255,255,255,0.4)" />
            )}
          </span>
        </button>

        {/* Logs content */}
        {logsExpanded && (
          <div style={{ flex: 1, minHeight: 0 }}>
            <ServerLogsPanel
              logs={logs}
              serverStatus={serverStatus}
              usageStats={usageStats}
              onClear={onClearLogs}
            />
          </div>
        )}
      </div>
    </div>
  );
}
