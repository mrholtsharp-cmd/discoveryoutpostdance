import logoAsset from "@/assets/logo.png.asset.json";

export function Logo({ className = "h-10 w-10", priority = false }: { className?: string; priority?: boolean }) {
  return (
    <img
      src={logoAsset.url}
      alt="Discovery Outpost Performing Arts Dance logo"
      className={className}
      loading="eager"
      fetchPriority={priority ? "high" : undefined}
      width={priority ? 680 : undefined}
      height={priority ? 680 : undefined}
    />
  );
}