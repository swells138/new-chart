import { Heart, MessageCircle } from "lucide-react";
import type { Post, User } from "@/types/models";
import { Avatar } from "@/components/ui/avatar";

export function PostCard({ post, author }: { post: Post; author: Pick<User, "name" | "handle"> }) {

  return (
    <article className="paper-card rounded-2xl p-5 transition hover:-translate-y-0.5">
      <header className="flex items-start justify-between gap-4">
        <div className="flex items-center gap-3">
          <Avatar name={author.name} className="h-10 w-10 text-xs" />
          <div>
            <p className="font-semibold">{author.name}</p>
            <p className="text-xs text-black/60 dark:text-white/70">
              @{author.handle} · {post.timestamp}
            </p>
          </div>
        </div>
      </header>
      <p className="mt-3 text-sm leading-relaxed text-black/80 dark:text-white/85">{post.content}</p>
      <div className="mt-3 flex flex-wrap gap-2 text-xs">
        {post.tags.map((tag) => (
          <span key={tag} className="rounded-full bg-black/5 px-2 py-1 dark:bg-white/10">
            #{tag}
          </span>
        ))}
      </div>
      <footer className="mt-4 flex items-center gap-4 text-sm text-black/65 dark:text-white/75">
        <span className="inline-flex items-center gap-1">
          <Heart size={14} /> {post.likes}
        </span>
        <span className="inline-flex items-center gap-1">
          <MessageCircle size={14} /> {post.comments}
        </span>
      </footer>
    </article>
  );
}
