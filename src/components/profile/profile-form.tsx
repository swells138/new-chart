"use client";

import { useState } from "react";

export interface ProfileFormData {
  name: string;
  handle: string;
  pronouns: string;
  bio: string;
  location: string;
  relationshipStatus: string;
  interests: string[];
  links: {
    website?: string;
    social?: string;
  };
}

export function ProfileForm({ initialProfile }: { initialProfile: ProfileFormData }) {
  const [formData, setFormData] = useState<ProfileFormData>(initialProfile);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function onSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSaving(true);
    setMessage(null);
    setError(null);

    try {
      const response = await fetch("/api/profile", {
        method: "PATCH",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify(formData),
      });

      const body = (await response.json()) as { error?: string; profile?: ProfileFormData };

      if (!response.ok) {
        setError(body.error ?? "Could not save your profile.");
        return;
      }

      if (body.profile) {
        setFormData(body.profile);
      }

      setMessage("Profile updated.");
    } catch (requestError) {
      console.error(requestError);
      setError("Could not save your profile.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <form onSubmit={onSubmit} className="paper-card rounded-2xl p-5">
      <h3 className="text-xl font-semibold">Edit Profile</h3>

      <div className="mt-4 grid gap-3 md:grid-cols-2">
        <label className="space-y-1">
          <span className="text-xs font-semibold uppercase tracking-wide text-black/65 dark:text-white/70">
            Name
          </span>
          <input
            value={formData.name}
            onChange={(event) => setFormData((prev) => ({ ...prev, name: event.target.value }))}
            className="w-full rounded-xl border border-[var(--border-soft)] bg-white/80 px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-[var(--accent)] dark:bg-black/20"
          />
        </label>

        <label className="space-y-1">
          <span className="text-xs font-semibold uppercase tracking-wide text-black/65 dark:text-white/70">
            Handle
          </span>
          <input
            value={formData.handle}
            onChange={(event) => setFormData((prev) => ({ ...prev, handle: event.target.value }))}
            placeholder="your.handle"
            className="w-full rounded-xl border border-[var(--border-soft)] bg-white/80 px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-[var(--accent)] dark:bg-black/20"
          />
        </label>

        <label className="space-y-1">
          <span className="text-xs font-semibold uppercase tracking-wide text-black/65 dark:text-white/70">
            Pronouns
          </span>
          <input
            value={formData.pronouns}
            onChange={(event) => setFormData((prev) => ({ ...prev, pronouns: event.target.value }))}
            className="w-full rounded-xl border border-[var(--border-soft)] bg-white/80 px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-[var(--accent)] dark:bg-black/20"
          />
        </label>

        <label className="space-y-1">
          <span className="text-xs font-semibold uppercase tracking-wide text-black/65 dark:text-white/70">
            Location
          </span>
          <input
            value={formData.location}
            onChange={(event) => setFormData((prev) => ({ ...prev, location: event.target.value }))}
            className="w-full rounded-xl border border-[var(--border-soft)] bg-white/80 px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-[var(--accent)] dark:bg-black/20"
          />
        </label>

        <label className="space-y-1 md:col-span-2">
          <span className="text-xs font-semibold uppercase tracking-wide text-black/65 dark:text-white/70">
            Relationship status
          </span>
          <input
            value={formData.relationshipStatus}
            onChange={(event) =>
              setFormData((prev) => ({ ...prev, relationshipStatus: event.target.value }))
            }
            className="w-full rounded-xl border border-[var(--border-soft)] bg-white/80 px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-[var(--accent)] dark:bg-black/20"
          />
        </label>

        <label className="space-y-1 md:col-span-2">
          <span className="text-xs font-semibold uppercase tracking-wide text-black/65 dark:text-white/70">
            Bio
          </span>
          <textarea
            value={formData.bio}
            onChange={(event) => setFormData((prev) => ({ ...prev, bio: event.target.value }))}
            rows={4}
            className="w-full rounded-xl border border-[var(--border-soft)] bg-white/80 px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-[var(--accent)] dark:bg-black/20"
          />
        </label>

        <label className="space-y-1 md:col-span-2">
          <span className="text-xs font-semibold uppercase tracking-wide text-black/65 dark:text-white/70">
            Interests (comma separated)
          </span>
          <input
            value={formData.interests.join(", ")}
            onChange={(event) =>
              setFormData((prev) => ({
                ...prev,
                interests: event.target.value
                  .split(",")
                  .map((item) => item.trim())
                  .filter(Boolean),
              }))
            }
            className="w-full rounded-xl border border-[var(--border-soft)] bg-white/80 px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-[var(--accent)] dark:bg-black/20"
          />
        </label>

        <label className="space-y-1">
          <span className="text-xs font-semibold uppercase tracking-wide text-black/65 dark:text-white/70">
            Website
          </span>
          <input
            value={formData.links.website ?? ""}
            onChange={(event) =>
              setFormData((prev) => ({
                ...prev,
                links: { ...prev.links, website: event.target.value },
              }))
            }
            className="w-full rounded-xl border border-[var(--border-soft)] bg-white/80 px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-[var(--accent)] dark:bg-black/20"
          />
        </label>

        <label className="space-y-1">
          <span className="text-xs font-semibold uppercase tracking-wide text-black/65 dark:text-white/70">
            Social
          </span>
          <input
            value={formData.links.social ?? ""}
            onChange={(event) =>
              setFormData((prev) => ({
                ...prev,
                links: { ...prev.links, social: event.target.value },
              }))
            }
            className="w-full rounded-xl border border-[var(--border-soft)] bg-white/80 px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-[var(--accent)] dark:bg-black/20"
          />
        </label>
      </div>

      <div className="mt-4 flex flex-wrap items-center gap-3">
        <button
          type="submit"
          disabled={saving}
          className="rounded-full bg-[var(--accent)] px-5 py-2 text-sm font-semibold text-white transition hover:brightness-95 disabled:cursor-not-allowed disabled:opacity-70"
        >
          {saving ? "Saving..." : "Save profile"}
        </button>
        {message ? <p className="text-sm text-green-700 dark:text-green-400">{message}</p> : null}
        {error ? <p className="text-sm text-red-700 dark:text-red-400">{error}</p> : null}
      </div>
    </form>
  );
}
