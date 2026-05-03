import { useState, useRef, useEffect } from 'react';
import {
  Terminal,
  Trash2,
  Filter,
  Circle,
  ChevronDown,
  ChevronUp,
  Activity,
  Cpu,
  MessageSquare,
  Shield,
  Heart,
  AlertTriangle,
  Zap,
  Server,
} from 'lucide-react';
import { Button } from './ui/button';
import { Badge } from './ui/badge';
import { Switch } from './ui/switch';
import { Label } from './ui/label';
import { Separator } from './ui/separator';
import { ScrollArea } from './ui/scroll-area';
import type {
  LogEntry,
  LogType,
  ServerStatus,
  UsageStats,
} from '../services/serverLogs';
import {
  getLogColor,
  getLogTypeLabel,
  isMeaningfulLog,
} from '../services/serverLogs';

type Props = {
  logs: LogEntry[];
  serverStatus: ServerStatus;
  usageStats: UsageStats;
  onClear: () => void;
};

const LOG_TYPE_ICONS: Partial<Record<LogType, typeof Terminal>> = {
  startup: Server,
  shutdown: AlertTriangle,
  model_load: Cpu,
  chat_request: MessageSquare,
  auth: Shield,
  health: Heart,
  error: AlertTriangle,
  general: Terminal,
};

const STATUS_CONFIG: Record<ServerStatus, { color: string; label: string; glow: string }> = {
  connecting: {
    color: '#facc15',
    label: 'Connecting...',
    glow: '0 0 6px #facc15',
  },
  online: {
    color: '#4ade80',
    label: 'Server Online',
    glow: '0 0 8px #4ade80',
  },
  offline: {
    color: '#ef4444',
    label: 'Server Offline',
    glow: '0 0 8px #ef4444',
  },
  error: {
    color: '#ef4444',
    label: 'Connection Error',
    glow: '0 0 8px #ef4444',
  },
};

function formatTimestamp(iso: string): string {
  try {
    const d = new Date(iso);
    return d.toLocaleTimeString('en-US', {
      hour12: false,
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
    });
  } catch {
    return '--:--:--';
  }
}

export function ServerLogsPanel({ logs, serverStatus, usageStats, onClear }: Props) {
  const [showHealth, setShowHealth] = useState(false);
  const [autoScroll, setAutoScroll] = useState(true);
  const [expanded, setExpanded] = useState(true);
  const scrollRef = useRef<HTMLDivElement>(null);

  // Filter logs
  const visibleLogs = showHealth ? logs : logs.filter(isMeaningfulLog);

  // Auto-scroll
  useEffect(() => {
    if (autoScroll && scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [visibleLogs.length, autoScroll]);

  const statusCfg = STATUS_CONFIG[serverStatus];

  return (
    <div className="flex flex-col h-full">
      {/* ── Server Status Header ── */}
      <div
        style={{
          padding: '0.75rem 1rem',
          borderBottom: '1px solid rgba(255,255,255,0.07)',
          flexShrink: 0,
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginBottom: '0.5rem' }}>
          <span
            style={{
              width: 8,
              height: 8,
              borderRadius: '50%',
              background: statusCfg.color,
              boxShadow: statusCfg.glow,
              display: 'inline-block',
              animation: serverStatus === 'connecting' ? 'pulse 1.5s infinite' : undefined,
            }}
          />
          <span
            style={{
              color: statusCfg.color,
              fontSize: '0.75rem',
              fontWeight: 600,
              letterSpacing: '0.02em',
            }}
          >
            {statusCfg.label}
          </span>
          <span
            style={{
              marginLeft: 'auto',
              fontSize: '0.65rem',
              color: 'rgba(255,255,255,0.35)',
            }}
          >
            {visibleLogs.length} entries
          </span>
        </div>

        {/* Usage stats row */}
        <div
          style={{
            display: 'grid',
            gridTemplateColumns: '1fr 1fr 1fr',
            gap: '0.5rem',
          }}
        >
          <div
            style={{
              background: 'rgba(96,165,250,0.08)',
              border: '1px solid rgba(96,165,250,0.15)',
              borderRadius: 8,
              padding: '0.4rem 0.6rem',
              textAlign: 'center',
            }}
          >
            <div style={{ fontSize: '0.95rem', fontWeight: 700, color: '#60a5fa' }}>
              {usageStats.totalRequests}
            </div>
            <div style={{ fontSize: '0.6rem', color: 'rgba(255,255,255,0.4)', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
              Requests
            </div>
          </div>
          <div
            style={{
              background: 'rgba(167,139,250,0.08)',
              border: '1px solid rgba(167,139,250,0.15)',
              borderRadius: 8,
              padding: '0.4rem 0.6rem',
              textAlign: 'center',
            }}
          >
            <div style={{ fontSize: '0.95rem', fontWeight: 700, color: '#a78bfa' }}>
              {usageStats.totalTokens.toLocaleString()}
            </div>
            <div style={{ fontSize: '0.6rem', color: 'rgba(255,255,255,0.4)', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
              Tokens
            </div>
          </div>
          <div
            style={{
              background: 'rgba(74,222,128,0.08)',
              border: '1px solid rgba(74,222,128,0.15)',
              borderRadius: 8,
              padding: '0.4rem 0.6rem',
              textAlign: 'center',
            }}
          >
            <div style={{ fontSize: '0.95rem', fontWeight: 700, color: '#4ade80' }}>
              {usageStats.avgLatencyMs ? `${usageStats.avgLatencyMs}ms` : '--'}
            </div>
            <div style={{ fontSize: '0.6rem', color: 'rgba(255,255,255,0.4)', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
              Avg Latency
            </div>
          </div>
        </div>

        {/* Model usage breakdown */}
        {Object.keys(usageStats.modelUsage).length > 0 && (
          <div style={{ marginTop: '0.5rem' }}>
            <div style={{ fontSize: '0.65rem', color: 'rgba(255,255,255,0.35)', marginBottom: '0.3rem', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
              Active Models
            </div>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.3rem' }}>
              {Object.entries(usageStats.modelUsage).map(([model, stats]) => (
                <span
                  key={model}
                  style={{
                    fontSize: '0.62rem',
                    fontWeight: 600,
                    padding: '0.15rem 0.45rem',
                    borderRadius: 99,
                    background: 'rgba(167,139,250,0.12)',
                    color: '#a78bfa',
                    border: '1px solid rgba(167,139,250,0.25)',
                  }}
                >
                  {model} ×{typeof stats === 'object' ? stats.requests : stats}
                </span>
              ))}
            </div>
          </div>
        )}
      </div>

      {/* ── Controls ── */}
      <div
        style={{
          padding: '0.5rem 1rem',
          borderBottom: '1px solid rgba(255,255,255,0.07)',
          display: 'flex',
          alignItems: 'center',
          gap: '0.5rem',
          flexShrink: 0,
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.35rem' }}>
          <Switch
            checked={showHealth}
            onCheckedChange={setShowHealth}
            className="scale-75"
          />
          <Label style={{ fontSize: '0.68rem', color: 'rgba(255,255,255,0.5)' }}>
            Health polls
          </Label>
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: '0.35rem', marginLeft: '0.5rem' }}>
          <Switch
            checked={autoScroll}
            onCheckedChange={setAutoScroll}
            className="scale-75"
          />
          <Label style={{ fontSize: '0.68rem', color: 'rgba(255,255,255,0.5)' }}>
            Auto-scroll
          </Label>
        </div>

        <Button
          variant="ghost"
          size="icon"
          className="h-6 w-6 ml-auto"
          onClick={onClear}
          title="Clear logs"
        >
          <Trash2 className="w-3.5 h-3.5 text-gray-500" />
        </Button>
      </div>

      {/* ── Log entries ── */}
      <div
        ref={scrollRef}
        style={{
          flex: 1,
          overflowY: 'auto',
          fontFamily: "'JetBrains Mono', 'Fira Code', 'Cascadia Code', monospace",
          fontSize: '0.68rem',
          lineHeight: '1.55',
          padding: '0.5rem',
          scrollbarWidth: 'thin',
          scrollbarColor: 'rgba(255,255,255,0.12) transparent',
        }}
      >
        {visibleLogs.length === 0 ? (
          <div
            style={{
              display: 'flex',
              flexDirection: 'column',
              alignItems: 'center',
              justifyContent: 'center',
              height: '100%',
              color: 'rgba(255,255,255,0.25)',
              gap: '0.5rem',
            }}
          >
            <Terminal style={{ width: 24, height: 24 }} />
            <span style={{ fontSize: '0.75rem' }}>
              {serverStatus === 'offline' ? 'Server offline — waiting for connection...' : 'Waiting for logs...'}
            </span>
          </div>
        ) : (
          visibleLogs.map((entry, i) => {
            const Icon = LOG_TYPE_ICONS[entry.type] || Terminal;
            const color = getLogColor(entry);
            const typeLabel = getLogTypeLabel(entry.type);
            const isHealthType = entry.type === 'health';

            return (
              <div
                key={`${entry.timestamp}-${i}`}
                style={{
                  display: 'flex',
                  alignItems: 'flex-start',
                  gap: '0.4rem',
                  padding: '0.15rem 0.3rem',
                  borderRadius: 4,
                  opacity: isHealthType ? 0.4 : 1,
                  transition: 'background 0.15s',
                }}
                onMouseEnter={(e) => {
                  (e.currentTarget as HTMLDivElement).style.background = 'rgba(255,255,255,0.03)';
                }}
                onMouseLeave={(e) => {
                  (e.currentTarget as HTMLDivElement).style.background = 'transparent';
                }}
              >
                {/* Timestamp */}
                <span
                  style={{
                    color: 'rgba(255,255,255,0.3)',
                    flexShrink: 0,
                    minWidth: '4.2rem',
                  }}
                >
                  {formatTimestamp(entry.timestamp)}
                </span>

                {/* Type badge */}
                <span
                  style={{
                    fontSize: '0.55rem',
                    fontWeight: 700,
                    padding: '0.05rem 0.3rem',
                    borderRadius: 3,
                    background: `${color}18`,
                    color: color,
                    border: `1px solid ${color}30`,
                    flexShrink: 0,
                    minWidth: '3.2rem',
                    textAlign: 'center',
                    letterSpacing: '0.04em',
                    textTransform: 'uppercase',
                  }}
                >
                  {typeLabel}
                </span>

                {/* Message */}
                <span
                  style={{
                    color: color,
                    wordBreak: 'break-word',
                    flex: 1,
                    minWidth: 0,
                  }}
                >
                  {entry.message}
                </span>

                {/* Extra: tokens & latency */}
                {entry.extra?.tokens != null && (
                  <span
                    style={{
                      color: 'rgba(167,139,250,0.7)',
                      flexShrink: 0,
                      fontSize: '0.6rem',
                    }}
                  >
                    {entry.extra.tokens}tk
                  </span>
                )}
                {entry.extra?.latency_ms != null && (
                  <span
                    style={{
                      color: 'rgba(74,222,128,0.7)',
                      flexShrink: 0,
                      fontSize: '0.6rem',
                    }}
                  >
                    {entry.extra.latency_ms}ms
                  </span>
                )}
              </div>
            );
          })
        )}
      </div>
    </div>
  );
}
