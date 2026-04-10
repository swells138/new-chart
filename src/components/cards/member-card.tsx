import { Avatar } from "@/components/ui/avatar";
import type { User } from "@/types/models";

export function MemberCard({ user }: { user: User }) {
  return (
    <article className="paper-card rounded-2xl p-4 transition hover:-translate-y-1">
      <div className="flex items-center gap-3">
        <Avatar name={user.name} />
        <div>
          <p className="font-semibold">{user.name}</p>
          <p className="text-sm text-black/65 dark:text-white/70">@{user.handle}</p>
        </div>
      </div>
      <p className="mt-3 text-sm text-black/75 dark:text-white/80">{user.bio}</p>
      <div className="mt-3 flex flex-wrap gap-2 text-xs">
        {user.interests.map((interest) => (
          <span key={interest} className="rounded-full border border-[var(--border-soft)] px-2 py-1">
            {interest}
          </span>
        ))}
      </div>
    </article>
  );
}
