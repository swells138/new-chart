"use client";

import { useState } from "react";

const PRONOUN_OPTIONS = [
  "She/Her",
  "He/Him",
  "They/Them",
  "She/They",
  "He/They",
  "Any/All",
  "Prefer not to say",
];

const LOCATION_OPTIONS = {
  states: [
    "Alabama",
    "Alaska",
    "Arizona",
    "Arkansas",
    "California",
    "Colorado",
    "Connecticut",
    "Delaware",
    "Florida",
    "Georgia",
    "Hawaii",
    "Idaho",
    "Illinois",
    "Indiana",
    "Iowa",
    "Kansas",
    "Kentucky",
    "Louisiana",
    "Maine",
    "Maryland",
    "Massachusetts",
    "Michigan",
    "Minnesota",
    "Mississippi",
    "Missouri",
    "Montana",
    "Nebraska",
    "Nevada",
    "New Hampshire",
    "New Jersey",
    "New Mexico",
    "New York",
    "North Carolina",
    "North Dakota",
    "Ohio",
    "Oklahoma",
    "Oregon",
    "Pennsylvania",
    "Rhode Island",
    "South Carolina",
    "South Dakota",
    "Tennessee",
    "Texas",
    "Utah",
    "Vermont",
    "Virginia",
    "Washington",
    "West Virginia",
    "Wisconsin",
    "Wyoming",
  ],
  cities: [
    "Austin, TX",
    "Chicago, IL",
    "Los Angeles, CA",
    "Miami, FL",
    "New York City, NY",
    "San Francisco, CA",
    "Seattle, WA",
  ],
};

function withCurrentOption(options: string[], currentValue: string) {
  if (!currentValue || options.includes(currentValue)) {
    return options;
  }

  return [currentValue, ...options];
}

export interface ProfileFormData {
  name: string;
  handle: string;
  pronouns: string;
  bio: string;
  location: string;
  relationshipStatus: string;
  interests: string[];
}

export function ProfileForm({ initialProfile }: { initialProfile: ProfileFormData }) {
  const [formData, setFormData] = useState<ProfileFormData>(initialProfile);
  const [interestsInput, setInterestsInput] = useState(initialProfile.interests.join(", "));
  const [handleLocked, setHandleLocked] = useState(Boolean(initialProfile.handle));
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const usernameRequired = !handleLocked;

  const pronounOptions = withCurrentOption(PRONOUN_OPTIONS, formData.pronouns);
  const locationOptions = withCurrentOption(
    [...LOCATION_OPTIONS.states, ...LOCATION_OPTIONS.cities],
    formData.location
  );

  async function onSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (usernameRequired && !formData.handle.trim()) {
      setMessage(null);
      setError("Create a username to continue.");
      return;
    }

    setSaving(true);
    setMessage(null);
    setError(null);

    try {
      const response = await fetch("/api/profile", {
        method: "PATCH",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          ...formData,
          handle: handleLocked ? undefined : formData.handle.trim(),
        }),
      });

      const body = (await response.json()) as { error?: string; profile?: ProfileFormData };

      if (!response.ok) {
        setError(body.error ?? "Could not save your profile.");
        return;
      }

      if (body.profile) {
        setFormData(body.profile);
        setInterestsInput(body.profile.interests.join(", "));
        if (body.profile.handle) {
          setHandleLocked(true);
        }
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
      <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <h3 className="text-xl font-semibold">
            {usernameRequired ? "Create your username" : "Edit Profile"}
          </h3>
          {usernameRequired ? (
            <p className="mt-1 text-sm text-black/65 dark:text-white/70">
              Choose a username before continuing. This locks after you save.
            </p>
          ) : null}
        </div>
        {usernameRequired ? (
          <span className="w-fit rounded-full border border-[var(--accent)]/30 bg-[var(--accent)]/10 px-3 py-1 text-xs font-bold text-[var(--accent)]">
            Required
          </span>
        ) : null}
      </div>

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
            Username
          </span>
          <input
            value={formData.handle}
            placeholder="your.handle"
            onChange={(event) => setFormData((prev) => ({ ...prev, handle: event.target.value }))}
            readOnly={handleLocked}
            required={usernameRequired}
            minLength={3}
            maxLength={30}
            pattern="[a-zA-Z0-9._-]{3,30}"
            title={handleLocked ? "Username cannot be changed" : "Set your username"}
            className={`w-full rounded-xl border border-[var(--border-soft)] px-3 py-2 text-sm outline-none dark:bg-black/20 ${
              handleLocked
                ? "cursor-not-allowed bg-white/60"
                : "bg-white/80 focus:ring-2 focus:ring-[var(--accent)]"
            }`}
          />
          {!handleLocked ? (
            <span className="block text-xs text-black/55 dark:text-white/55">
              3-30 letters, numbers, dots, underscores, or dashes.
            </span>
          ) : null}
        </label>

        <label className="space-y-1">
          <span className="text-xs font-semibold uppercase tracking-wide text-black/65 dark:text-white/70">
            Pronouns
          </span>
          <select
            value={formData.pronouns}
            onChange={(event) => setFormData((prev) => ({ ...prev, pronouns: event.target.value }))}
            className="w-full rounded-xl border border-[var(--border-soft)] bg-white/80 px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-[var(--accent)] dark:bg-black/20"
          >
            <option value="">Select pronouns</option>
            {pronounOptions.map((option) => (
              <option key={option} value={option}>
                {option}
              </option>
            ))}
          </select>
        </label>

        <label className="space-y-1">
          <span className="text-xs font-semibold uppercase tracking-wide text-black/65 dark:text-white/70">
            Location
          </span>
          <select
            value={formData.location}
            onChange={(event) => setFormData((prev) => ({ ...prev, location: event.target.value }))}
            className="w-full rounded-xl border border-[var(--border-soft)] bg-white/80 px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-[var(--accent)] dark:bg-black/20"
          >
            <option value="">Select location</option>
            {locationOptions
              .filter((option) => !LOCATION_OPTIONS.states.includes(option) && !LOCATION_OPTIONS.cities.includes(option))
              .map((option) => (
                <option key={option} value={option}>
                  {option}
                </option>
              ))}
            <optgroup label="States">
              {LOCATION_OPTIONS.states.map((option) => (
                <option key={option} value={option}>
                  {option}
                </option>
              ))}
            </optgroup>
            <optgroup label="Cities">
              {LOCATION_OPTIONS.cities.map((option) => (
                <option key={option} value={option}>
                  {option}
                </option>
              ))}
            </optgroup>
          </select>
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
            value={interestsInput}
            onChange={(event) => {
              const raw = event.target.value;
              setInterestsInput(raw);
              setFormData((prev) => ({
                ...prev,
                interests: raw
                  .split(",")
                  .map((item) => item.trim())
                  .filter(Boolean),
              }));
            }}
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
