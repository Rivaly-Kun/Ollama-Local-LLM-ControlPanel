import { Power, Cpu, Database, Zap, Server } from "lucide-react";
import { Switch } from "./ui/switch";

export type Model = {
  id: string;
  name: string;
  modelTag?: string;
  category: "chat" | "reasoning" | "coding" | "fast" | "embedding";
  status: "loaded" | "unloaded";
  vram: number;
  speed: "fast" | "medium" | "slow";
  description: string;
  supportsVision: boolean;
};

const categoryMeta: Record<
  Model["category"],
  { label: string; color: string; bg: string }
> = {
  chat: { label: "Chat", color: "#60a5fa", bg: "rgba(96,165,250,0.12)" },
  reasoning: {
    label: "Reasoning",
    color: "#a78bfa",
    bg: "rgba(167,139,250,0.12)",
  },
  coding: { label: "Coding", color: "#fb923c", bg: "rgba(251,146,60,0.12)" },
  fast: { label: "Fast", color: "#4ade80", bg: "rgba(74,222,128,0.12)" },
  embedding: { label: "Embed", color: "#22d3ee", bg: "rgba(34,211,238,0.12)" },
};

const speedMeta: Record<Model["speed"], { color: string; icon: string }> = {
  fast: { color: "#4ade80", icon: "⚡" },
  medium: { color: "#facc15", icon: "⚡" },
  slow: { color: "#fb923c", icon: "⚡" },
};

type Props = {
  models: Model[];
  enabledModels: Set<string>;
  onToggleModel: (modelId: string) => void;
  backendOnline?: boolean;
};

export function ModelSidebar({
  models,
  enabledModels,
  onToggleModel,
  backendOnline = false,
}: Props) {
  const activeCount = enabledModels.size;
  const totalVram = models
    .filter((m) => enabledModels.has(m.id))
    .reduce((sum, m) => sum + m.vram, 0);

  return (
    <div
      style={{
        width: "18rem",
        minWidth: "18rem",
        background: "linear-gradient(180deg, #0f1117 0%, #12141c 100%)",
        borderRight: "1px solid rgba(255,255,255,0.07)",
        display: "flex",
        flexDirection: "column",
        height: "100%",
        overflow: "hidden",
      }}
    >
      {/* ── Header ── */}
      <div
        style={{
          padding: "1.1rem 1rem 0.9rem",
          borderBottom: "1px solid rgba(255,255,255,0.07)",
          flexShrink: 0,
        }}
      >
        <div
          style={{
            display: "flex",
            alignItems: "center",
            gap: "0.5rem",
            marginBottom: "0.5rem",
          }}
        >
          <div
            style={{
              width: 30,
              height: 30,
              borderRadius: 8,
              background: "linear-gradient(135deg,#6366f1,#8b5cf6)",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
            }}
          >
            <Power size={15} color="#fff" />
          </div>
          <div>
            <span
              style={{
                color: "#fff",
                fontWeight: 700,
                fontSize: "0.88rem",
                letterSpacing: "0.01em",
                display: "block",
              }}
            >
              LLM Activation
            </span>
            <span
              style={{
                color: "rgba(255,255,255,0.4)",
                fontSize: "0.65rem",
                display: "block",
              }}
            >
              Toggle models on/off
            </span>
          </div>
        </div>

        {/* Active count bar */}
        <div style={{ display: "flex", alignItems: "center", gap: "0.5rem" }}>
          <div
            style={{
              flex: 1,
              height: 4,
              borderRadius: 99,
              background: "rgba(255,255,255,0.08)",
              overflow: "hidden",
            }}
          >
            <div
              style={{
                height: "100%",
                width: `${(activeCount / Math.max(models.length, 1)) * 100}%`,
                borderRadius: 99,
                background:
                  activeCount > 0
                    ? "linear-gradient(90deg,#4ade80,#22d3ee)"
                    : "transparent",
                transition: "width 0.4s ease",
              }}
            />
          </div>
          <span
            style={{
              color: "rgba(255,255,255,0.45)",
              fontSize: "0.72rem",
              whiteSpace: "nowrap",
            }}
          >
            {activeCount} / {models.length} active
          </span>
        </div>

        {/* Backend status */}
        <div
          style={{
            display: "flex",
            alignItems: "center",
            gap: "0.35rem",
            marginTop: "0.45rem",
          }}
        >
          <span
            style={{
              width: 6,
              height: 6,
              borderRadius: "50%",
              background: backendOnline ? "#4ade80" : "#ef4444",
              boxShadow: backendOnline ? "0 0 6px #4ade80" : "0 0 6px #ef4444",
              display: "inline-block",
            }}
          />
          <span
            style={{
              fontSize: "0.68rem",
              color: backendOnline ? "#4ade80" : "#ef4444",
              fontWeight: 500,
            }}
          >
            {backendOnline ? "Backend connected" : "Backend offline"}
          </span>
        </div>
      </div>

      {/* ── Model list ── */}
      <div
        style={{
          flex: 1,
          overflowY: "auto",
          padding: "0.75rem 0.75rem",
          display: "flex",
          flexDirection: "column",
          gap: "0.5rem",
          scrollbarWidth: "thin",
          scrollbarColor: "rgba(255,255,255,0.12) transparent",
        }}
      >
        {models.map((model) => {
          const isEnabled = enabledModels.has(model.id);
          const cat = categoryMeta[model.category];
          const spd = speedMeta[model.speed];

          return (
            <div
              key={model.id}
              style={{
                padding: "0.7rem 0.75rem",
                borderRadius: 10,
                border: `1px solid ${
                  isEnabled
                    ? "rgba(74,222,128,0.35)"
                    : "rgba(255,255,255,0.07)"
                }`,
                background: isEnabled
                  ? "linear-gradient(135deg,rgba(74,222,128,0.08),rgba(34,211,238,0.05))"
                  : "rgba(255,255,255,0.02)",
                transition: "all 0.25s ease",
                opacity: isEnabled ? 1 : 0.6,
              }}
            >
              {/* Top row: name + switch */}
              <div
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: "0.5rem",
                }}
              >
                {/* Status indicator */}
                <div
                  style={{
                    width: 8,
                    height: 8,
                    borderRadius: "50%",
                    background: isEnabled ? "#4ade80" : "rgba(255,255,255,0.15)",
                    boxShadow: isEnabled ? "0 0 8px #4ade80" : "none",
                    transition: "all 0.3s ease",
                    flexShrink: 0,
                  }}
                />

                <div style={{ flex: 1, minWidth: 0 }}>
                  <div
                    style={{
                      color: "#fff",
                      fontWeight: 600,
                      fontSize: "0.82rem",
                      whiteSpace: "nowrap",
                      overflow: "hidden",
                      textOverflow: "ellipsis",
                    }}
                  >
                    {model.name}
                  </div>
                  <div
                    style={{
                      color: "rgba(255,255,255,0.4)",
                      fontSize: "0.68rem",
                      marginTop: 1,
                    }}
                  >
                    {model.description}
                  </div>
                </div>

                {/* ON/OFF Switch */}
                <Switch
                  checked={isEnabled}
                  onCheckedChange={() => onToggleModel(model.id)}
                />
              </div>

              {/* Bottom row: badges */}
              <div
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: "0.4rem",
                  marginTop: "0.45rem",
                  marginLeft: "1.2rem",
                  flexWrap: "wrap",
                }}
              >
                {/* category pill */}
                <span
                  style={{
                    fontSize: "0.6rem",
                    fontWeight: 600,
                    padding: "0.12rem 0.4rem",
                    borderRadius: 99,
                    background: cat.bg,
                    color: cat.color,
                    border: `1px solid ${cat.color}30`,
                    letterSpacing: "0.03em",
                    textTransform: "uppercase",
                  }}
                >
                  {cat.label}
                </span>

                {/* download status */}
                <span
                  style={{
                    display: "flex",
                    alignItems: "center",
                    gap: 3,
                    fontSize: "0.6rem",
                    color:
                      model.status === "loaded"
                        ? "#4ade80"
                        : "rgba(255,255,255,0.3)",
                    fontWeight: 500,
                  }}
                >
                  <span
                    style={{
                      width: 4,
                      height: 4,
                      borderRadius: "50%",
                      background:
                        model.status === "loaded"
                          ? "#4ade80"
                          : "rgba(255,255,255,0.2)",
                      display: "inline-block",
                    }}
                  />
                  {model.status === "loaded" ? "Downloaded" : "Not downloaded"}
                </span>

                {/* vram */}
                <span
                  style={{
                    display: "flex",
                    alignItems: "center",
                    gap: 2,
                    fontSize: "0.6rem",
                    color: "rgba(255,255,255,0.35)",
                  }}
                >
                  <Database size={8} />
                  {model.vram}GB
                </span>

                {/* speed */}
                <span
                  style={{
                    display: "flex",
                    alignItems: "center",
                    gap: 2,
                    fontSize: "0.6rem",
                    color: spd.color,
                    fontWeight: 500,
                  }}
                >
                  <Zap size={8} />
                  {model.speed}
                </span>
              </div>
            </div>
          );
        })}
      </div>

      {/* ── Footer summary ── */}
      <div
        style={{
          padding: "0.75rem 1rem",
          borderTop: "1px solid rgba(255,255,255,0.07)",
          flexShrink: 0,
        }}
      >
        <div
          style={{
            display: "flex",
            justifyContent: "space-between",
            alignItems: "center",
          }}
        >
          <div>
            <div
              style={{
                fontSize: "0.65rem",
                color: "rgba(255,255,255,0.35)",
                textTransform: "uppercase",
                letterSpacing: "0.05em",
              }}
            >
              Total VRAM (active)
            </div>
            <div
              style={{
                fontSize: "1rem",
                fontWeight: 700,
                color: totalVram > 0 ? "#22d3ee" : "rgba(255,255,255,0.3)",
              }}
            >
              {totalVram.toFixed(1)} GB
            </div>
          </div>
          <div style={{ textAlign: "right" }}>
            <div
              style={{
                fontSize: "0.65rem",
                color: "rgba(255,255,255,0.35)",
                textTransform: "uppercase",
                letterSpacing: "0.05em",
              }}
            >
              Active Models
            </div>
            <div
              style={{
                fontSize: "1rem",
                fontWeight: 700,
                color: activeCount > 0 ? "#4ade80" : "rgba(255,255,255,0.3)",
              }}
            >
              {activeCount}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
