import { Activity, Zap, Cpu, Database, ChevronRight } from "lucide-react";
import { Checkbox } from "./ui/checkbox";

export type Model = {
  id: string;
  name: string;
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

const speedMeta: Record<Model["speed"], { color: string }> = {
  fast: { color: "#4ade80" },
  medium: { color: "#facc15" },
  slow: { color: "#fb923c" },
};

type Props = {
  models: Model[];
  selectedModels: string[];
  onToggleModel: (modelId: string) => void;
  onSelectModel: (modelId: string) => void;
  activeModel: string | null;
  ollamaOnline?: boolean;
};

export function ModelSidebar({
  models,
  selectedModels,
  onToggleModel,
  onSelectModel,
  activeModel,
  ollamaOnline = false,
}: Props) {
  const loadedCount = models.filter((m) => m.status === "loaded").length;

  return (
    <div
      style={{
        width: "17rem",
        minWidth: "17rem",
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
            marginBottom: "0.35rem",
          }}
        >
          <div
            style={{
              width: 28,
              height: 28,
              borderRadius: 8,
              background: "linear-gradient(135deg,#6366f1,#8b5cf6)",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
            }}
          >
            <Cpu size={15} color="#fff" />
          </div>
          <span
            style={{
              color: "#fff",
              fontWeight: 600,
              fontSize: "0.9rem",
              letterSpacing: "0.01em",
            }}
          >
            Model Control Panel
          </span>
        </div>

        {/* loaded bar */}
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
                width: `${(loadedCount / models.length) * 100}%`,
                borderRadius: 99,
                background: "linear-gradient(90deg,#6366f1,#8b5cf6)",
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
            {loadedCount} / {models.length} loaded
          </span>
        </div>

        {/* Ollama connection status */}
        <div style={{
          display: "flex", alignItems: "center", gap: "0.35rem",
          marginTop: "0.45rem",
        }}>
          <span style={{
            width: 6, height: 6, borderRadius: "50%",
            background: ollamaOnline ? "#4ade80" : "#ef4444",
            boxShadow: ollamaOnline ? "0 0 6px #4ade80" : "0 0 6px #ef4444",
            display: "inline-block",
          }} />
          <span style={{
            fontSize: "0.68rem",
            color: ollamaOnline ? "#4ade80" : "#ef4444",
            fontWeight: 500,
          }}>
            {ollamaOnline ? "Ollama connected" : "Ollama offline"}
          </span>
        </div>
      </div>

      {/* ── Scrollable list ── */}
      <div
        style={{
          flex: 1,
          overflowY: "auto",
          padding: "0.75rem 0.75rem",
          display: "flex",
          flexDirection: "column",
          gap: "0.5rem",
          /* custom scrollbar */
          scrollbarWidth: "thin",
          scrollbarColor: "rgba(255,255,255,0.12) transparent",
        }}
      >
        {models.map((model) => {
          const isActive = activeModel === model.id;
          const isSelected = selectedModels.includes(model.id);
          const cat = categoryMeta[model.category];
          const spd = speedMeta[model.speed];

          return (
            <div
              key={model.id}
              onClick={() => onSelectModel(model.id)}
              style={{
                padding: "0.65rem 0.75rem",
                borderRadius: 10,
                border: `1px solid ${isActive ? "rgba(99,102,241,0.55)" : "rgba(255,255,255,0.07)"}`,
                background: isActive
                  ? "linear-gradient(135deg,rgba(99,102,241,0.18),rgba(139,92,246,0.12))"
                  : "rgba(255,255,255,0.03)",
                cursor: "pointer",
                transition: "all 0.18s ease",
                position: "relative",
              }}
              onMouseEnter={(e) => {
                if (!isActive)
                  (e.currentTarget as HTMLDivElement).style.background =
                    "rgba(255,255,255,0.06)";
              }}
              onMouseLeave={(e) => {
                if (!isActive)
                  (e.currentTarget as HTMLDivElement).style.background =
                    "rgba(255,255,255,0.03)";
              }}
            >
              {/* top row: checkbox + name + active arrow */}
              <div
                style={{
                  display: "flex",
                  alignItems: "flex-start",
                  gap: "0.5rem",
                }}
              >
                <div
                  onClick={(e) => {
                    e.stopPropagation();
                    onToggleModel(model.id);
                  }}
                  style={{ marginTop: 2, flexShrink: 0 }}
                >
                  <Checkbox
                    checked={isSelected}
                    onCheckedChange={() => onToggleModel(model.id)}
                  />
                </div>

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
                      color: "rgba(255,255,255,0.45)",
                      fontSize: "0.72rem",
                      marginTop: 1,
                      whiteSpace: "nowrap",
                      overflow: "hidden",
                      textOverflow: "ellipsis",
                    }}
                  >
                    {model.description}
                  </div>
                </div>

                {isActive && (
                  <ChevronRight
                    size={13}
                    color="#a78bfa"
                    style={{ flexShrink: 0, marginTop: 3 }}
                  />
                )}
              </div>

              {/* bottom row: badges */}
              <div
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: "0.4rem",
                  marginTop: "0.5rem",
                  marginLeft: "1.5rem",
                  flexWrap: "wrap",
                }}
              >
                {/* category pill */}
                <span
                  style={{
                    fontSize: "0.65rem",
                    fontWeight: 600,
                    padding: "0.15rem 0.45rem",
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

                {/* status */}
                {model.status === "loaded" ? (
                  <span
                    style={{
                      display: "flex",
                      alignItems: "center",
                      gap: 3,
                      fontSize: "0.65rem",
                      color: "#4ade80",
                      fontWeight: 500,
                    }}
                  >
                    <span
                      style={{
                        width: 5,
                        height: 5,
                        borderRadius: "50%",
                        background: "#4ade80",
                        boxShadow: "0 0 4px #4ade80",
                        display: "inline-block",
                      }}
                    />
                    Loaded
                  </span>
                ) : (
                  <span
                    style={{
                      display: "flex",
                      alignItems: "center",
                      gap: 3,
                      fontSize: "0.65rem",
                      color: "rgba(255,255,255,0.3)",
                      fontWeight: 500,
                    }}
                  >
                    <span
                      style={{
                        width: 5,
                        height: 5,
                        borderRadius: "50%",
                        background: "rgba(255,255,255,0.2)",
                        display: "inline-block",
                      }}
                    />
                    Unloaded
                  </span>
                )}

                {/* vram */}
                <span
                  style={{
                    display: "flex",
                    alignItems: "center",
                    gap: 2,
                    fontSize: "0.65rem",
                    color: "rgba(255,255,255,0.35)",
                  }}
                >
                  <Database size={9} />
                  {model.vram}GB
                </span>

                {/* speed */}
                <span
                  style={{
                    display: "flex",
                    alignItems: "center",
                    gap: 2,
                    fontSize: "0.65rem",
                    color: spd.color,
                    fontWeight: 500,
                  }}
                >
                  <Zap size={9} />
                  {model.speed}
                </span>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
