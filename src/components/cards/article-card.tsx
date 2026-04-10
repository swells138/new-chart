import { userById } from "@/lib/data";
import type { Article } from "@/types/models";

export function ArticleCard({
  article,
  compact = false,
}: {
  article: Article;
  compact?: boolean;
}) {
  const author = userById.get(article.authorId);
  return (
    <article className="paper-card rounded-2xl p-5 transition hover:-translate-y-0.5">
      <p className="text-xs font-semibold tracking-[0.14em] uppercase text-[var(--accent)]">
        {article.category}
      </p>
      <h3 className="mt-2 text-xl font-semibold leading-tight">{article.title}</h3>
      {!compact ? (
        <p className="mt-2 text-sm text-black/75 dark:text-white/80">{article.excerpt}</p>
      ) : null}
      <p className="mt-3 text-xs text-black/60 dark:text-white/70">
        {article.publishedAt} · {article.readTime} · by {author?.name ?? "Community"}
      </p>
    </article>
  );
}
