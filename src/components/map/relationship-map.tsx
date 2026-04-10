"use client";

import {
  Background,
  Controls,
  MiniMap,
  ReactFlow,
  type Edge,
  type Node,
} from "@xyflow/react";
import "@xyflow/react/dist/style.css";
import { useMemo, useState } from "react";
import type { Relationship, RelationshipType, User } from "@/types/models";
import { Avatar } from "@/components/ui/avatar";

const relationColors: Record<RelationshipType, string> = {
  friends: "#66b6a7",
  exes: "#ff8f84",
  collaborators: "#7aa2ff",
  roommates: "#ffbb6f",
  crushes: "#ee82d8",
  mentors: "#9b8cff",
};

interface Props {
  users: User[];
  relationships: Relationship[];
}

export function RelationshipMap({ users, relationships }: Props) {
  const [activeTypes, setActiveTypes] = useState<RelationshipType[]>([
    "friends",
    "exes",
    "collaborators",
    "roommates",
    "crushes",
    "mentors",
  ]);
  const [selectedId, setSelectedId] = useState<string | null>(users[0]?.id ?? null);

  const filteredRelationships = useMemo(
    () => relationships.filter((item) => activeTypes.includes(item.type)),
    [activeTypes, relationships]
  );

  const nodes: Node[] = useMemo(
    () =>
      users.map((user, index) => ({
        id: user.id,
        data: { label: `${user.name}\n@${user.handle}` },
        position: {
          x: 120 + (index % 3) * 250,
          y: 80 + Math.floor(index / 3) * 180,
        },
        style: {
          borderRadius: 20,
          padding: 8,
          border: "1px solid var(--border-soft)",
          background: "var(--card)",
          width: 150,
          whiteSpace: "pre-line",
          fontSize: "12px",
        },
      })),
    [users]
  );

  const edges: Edge[] = useMemo(
    () =>
      filteredRelationships.map((item) => ({
        id: item.id,
        source: item.source,
        target: item.target,
        label: item.type,
        style: {
          stroke: relationColors[item.type],
          strokeWidth: 2,
        },
        labelStyle: {
          fontSize: 10,
          fill: relationColors[item.type],
          textTransform: "uppercase",
        },
      })),
    [filteredRelationships]
  );

  const selectedUser = users.find((user) => user.id === selectedId);
  const selectedConnections = filteredRelationships.filter(
    (item) => item.source === selectedId || item.target === selectedId
  );

  return (
    <div className="grid gap-4 lg:grid-cols-[1.5fr_0.9fr]">
      <section className="paper-card rounded-2xl p-4">
        <div className="mb-3 flex flex-wrap gap-2">
          {(Object.keys(relationColors) as RelationshipType[]).map((type) => {
            const active = activeTypes.includes(type);
            return (
              <button
                type="button"
                key={type}
                onClick={() =>
                  setActiveTypes((prev) =>
                    prev.includes(type) ? prev.filter((item) => item !== type) : [...prev, type]
                  )
                }
                className="rounded-full border px-3 py-1 text-xs font-semibold uppercase tracking-wide transition"
                style={{
                  borderColor: active ? relationColors[type] : "var(--border-soft)",
                  backgroundColor: active ? `${relationColors[type]}20` : "transparent",
                }}
              >
                {type}
              </button>
            );
          })}
        </div>
        <div className="h-[520px] overflow-hidden rounded-2xl border border-[var(--border-soft)] bg-white/40 dark:bg-black/20">
          <ReactFlow
            nodes={nodes}
            edges={edges}
            fitView
            onNodeClick={(_, node) => setSelectedId(node.id)}
            minZoom={0.4}
            maxZoom={1.8}
          >
            <MiniMap pannable zoomable />
            <Controls showInteractive={false} />
            <Background gap={16} size={1} />
          </ReactFlow>
        </div>
      </section>

      <aside className="paper-card rounded-2xl p-5">
        {selectedUser ? (
          <>
            <div className="flex items-center gap-3">
              <Avatar name={selectedUser.name} className="h-14 w-14" />
              <div>
                <h3 className="text-xl font-semibold">{selectedUser.name}</h3>
                <p className="text-sm text-black/65 dark:text-white/75">@{selectedUser.handle}</p>
              </div>
            </div>
            <p className="mt-3 text-sm text-black/80 dark:text-white/85">{selectedUser.bio}</p>
            <p className="mt-2 text-xs text-black/65 dark:text-white/70">
              Status: {selectedUser.relationshipStatus}
            </p>

            <div className="mt-5 space-y-2">
              <h4 className="text-sm font-semibold uppercase tracking-wide">Active connections</h4>
              {selectedConnections.map((item) => {
                const targetId = item.source === selectedUser.id ? item.target : item.source;
                const target = users.find((user) => user.id === targetId);
                return (
                  <div key={item.id} className="rounded-xl border border-[var(--border-soft)] p-3">
                    <p className="font-semibold">{target?.name}</p>
                    <p className="text-xs uppercase tracking-wide text-[var(--accent)]">{item.type}</p>
                    <p className="mt-1 text-xs text-black/65 dark:text-white/75">{item.note}</p>
                  </div>
                );
              })}
            </div>
          </>
        ) : (
          <p className="text-sm">Select a node to preview member details.</p>
        )}
      </aside>
    </div>
  );
}
