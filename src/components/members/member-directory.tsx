"use client";

import { useMemo, useState } from "react";
import type { Post, Relationship, User } from "@/types/models";
import { Avatar } from "@/components/ui/avatar";

interface Props {
  users: User[];
  posts: Post[];
  relationships: Relationship[];
}

export function MemberDirectory({ users, posts, relationships }: Props) {
  const [query, setQuery] = useState("");
  const [statusFilter, setStatusFilter] = useState("all");
  const [selectedId, setSelectedId] = useState(users[0]?.id ?? "");

  const statuses = useMemo(
    () => Array.from(new Set(users.map((user) => user.relationshipStatus))),
    [users],
  );

  const filtered = useMemo(() => {
    return users.filter((user) => {
      const matchQuery =
        user.name.toLowerCase().includes(query.toLowerCase()) ||
        user.handle.toLowerCase().includes(query.toLowerCase()) ||
        user.interests.some((interest) =>
          interest.toLowerCase().includes(query.toLowerCase()),
        );

      const matchStatus =
        statusFilter === "all" ||
        user.relationshipStatus.toLowerCase() === statusFilter.toLowerCase();

      return matchQuery && matchStatus;
    });
  }, [query, statusFilter, users]);

  const selected =
    filtered.find((user) => user.id === selectedId) ?? filtered[0] ?? users[0];

  const recentPosts = posts
    .filter((post) => post.userId === selected?.id)
    .slice(0, 3);

  const connections = relationships
    .filter(
      (item) => item.source === selected?.id || item.target === selected?.id,
    )
    .map((item) => {
      const connectionId =
        item.source === selected?.id ? item.target : item.source;
      return {
        relation: item.type,
        note: item.note,
        user: users.find((user) => user.id === connectionId),
      };
    })
    .filter((item) => item.user);

  return (
    <div className="grid gap-4 lg:grid-cols-[0.9fr_1.4fr]">
      <section className="paper-card rounded-2xl p-4">
        <div className="space-y-3">
          <input
            type="search"
            placeholder="Search members, handles, interests"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            className="w-full rounded-xl border border-[var(--border-soft)] bg-white/80 px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-[var(--accent)] dark:bg-black/20"
          />
          <select
            value={statusFilter}
            onChange={(event) => setStatusFilter(event.target.value)}
            className="w-full rounded-xl border border-[var(--border-soft)] bg-white/80 px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-[var(--accent)] dark:bg-black/20"
          >
            <option value="all">All statuses</option>
            {statuses.map((status) => (
              <option key={status} value={status}>
                {status}
              </option>
            ))}
          </select>
        </div>

        <div className="mt-4 space-y-2">
          {filtered.map((user) => {
            const displayName =
              user.firstName || user.lastName
                ? `${user.firstName ?? ""} ${user.lastName ?? ""}`.trim()
                : user.name;

            return (
              <button
                type="button"
                key={user.id}
                onClick={() => setSelectedId(user.id)}
                className={`w-full rounded-xl border p-3 text-left transition ${
                  selected?.id === user.id
                    ? "border-[var(--accent)] bg-[var(--accent)]/10"
                    : "border-[var(--border-soft)] hover:bg-white/80 dark:hover:bg-black/20"
                }`}
              >
                <div className="flex items-center gap-3">
                  <Avatar
                    name={displayName}
                    src={user.profileImage ?? undefined}
                    className="h-10 w-10 text-xs"
                  />
                  <div>
                    <p className="font-semibold">{displayName}</p>
                    <p className="text-xs text-black/65 dark:text-white/70">
                      @{user.handle}
                    </p>
                  </div>
                </div>
              </button>
            );
          })}
        </div>
      </section>

      {selected ? (
        <section className="paper-card rounded-2xl p-5">
          <header className="flex flex-wrap items-start justify-between gap-4 border-b border-[var(--border-soft)] pb-4">
            <div className="flex items-center gap-4">
              <Avatar
                name={
                  selected.firstName || selected.lastName
                    ? `${selected.firstName ?? ""} ${selected.lastName ?? ""}`.trim()
                    : selected.name
                }
                src={selected.profileImage ?? undefined}
                className="h-16 w-16 text-base"
              />
              <div>
                <h3 className="text-2xl font-semibold">
                  {selected.firstName || selected.lastName
                    ? `${selected.firstName ?? ""} ${selected.lastName ?? ""}`.trim()
                    : selected.name}
                </h3>
                <p className="text-sm text-black/70 dark:text-white/75">
                  @{selected.handle} · {selected.pronouns}
                </p>
                <p className="text-sm text-black/70 dark:text-white/75">
                  {selected.location}
                </p>
              </div>
            </div>
            <div className="text-xs">
              <p className="rounded-full bg-black/5 px-3 py-1 dark:bg-white/10">
                Status: {selected.relationshipStatus}
              </p>
            </div>
          </header>

          <p className="mt-4 text-sm text-black/80 dark:text-white/85">
            {selected.bio}
          </p>
          <div className="mt-3 flex flex-wrap gap-2 text-xs">
            {selected.interests.map((interest) => (
              <span
                key={interest}
                className="rounded-full border border-[var(--border-soft)] px-2 py-1"
              >
                {interest}
              </span>
            ))}
          </div>
          <div className="mt-3 text-sm text-black/70 dark:text-white/75">
            <p>Website: {selected.links.website}</p>
            <p>Social: {selected.links.social}</p>
          </div>

          <div className="mt-6 grid gap-4 md:grid-cols-2">
            <div>
              <h4 className="text-base font-semibold">Recent Posts</h4>
              <div className="mt-2 space-y-2">
                {recentPosts.map((post) => (
                  <div
                    key={post.id}
                    className="rounded-xl border border-[var(--border-soft)] p-3 text-sm"
                  >
                    <p>{post.content}</p>
                    <p className="mt-2 text-xs text-black/60 dark:text-white/70">
                      {post.timestamp}
                    </p>
                  </div>
                ))}
              </div>
            </div>
            <div>
              <h4 className="text-base font-semibold">Connections</h4>
              <div className="mt-2 space-y-2">
                {connections.map((connection) => (
                  <div
                    key={`${connection.user?.id}-${connection.relation}`}
                    className="rounded-xl border border-[var(--border-soft)] p-3 text-sm"
                  >
                    <p className="font-semibold">{connection.user?.name}</p>
                    <p className="text-xs uppercase tracking-wide text-[var(--accent)]">
                      {connection.relation}
                    </p>
                    <p className="mt-1 text-xs text-black/65 dark:text-white/75">
                      {connection.note}
                    </p>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </section>
      ) : null}
    </div>
  );
}
