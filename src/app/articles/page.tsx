import { ArticleCard } from "@/components/cards/article-card";
import { SectionHeader } from "@/components/ui/section-header";
import { articles } from "@/lib/data";

export default function ArticlesPage() {
  return (
    <div className="space-y-4">
      <SectionHeader
        title="Community Stories"
        subtitle="Culture pieces, event recaps, and practical reflections from the circle."
      />
      <div className="grid gap-4 md:grid-cols-2">
        {articles.map((article) => (
          <ArticleCard key={article.id} article={article} />
        ))}
      </div>
    </div>
  );
}
