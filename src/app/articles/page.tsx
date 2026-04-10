import { ArticleCard } from "@/components/cards/article-card";
import { SectionHeader } from "@/components/ui/section-header";
import { getAllArticles, getAllUsers } from "@/lib/prisma-queries";

export const dynamic = "force-dynamic";

export default async function ArticlesPage() {
  const [articles, users] = await Promise.all([getAllArticles(), getAllUsers()]);
  const userById = new Map(users.map((user) => [user.id, user]));

  return (
    <div className="space-y-4">
      <SectionHeader
        title="Community Stories"
        subtitle="Culture pieces, event recaps, and practical reflections from the circle."
      />
      <div className="grid gap-4 md:grid-cols-2">
        {articles.map((article) => {
          const author = userById.get(article.authorId);

          return <ArticleCard key={article.id} article={article} authorName={author?.name} />;
        })}
      </div>
    </div>
  );
}
