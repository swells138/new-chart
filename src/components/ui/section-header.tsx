export function SectionHeader({
  title,
  subtitle,
}: {
  title: string;
  subtitle?: string;
}) {
  return (
    <div className="mb-2">
      <h2 className="text-2xl font-semibold">{title}</h2>
      {subtitle ? <p className="text-sm text-black/70 dark:text-white/75">{subtitle}</p> : null}
    </div>
  );
}
