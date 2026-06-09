import logoAsset from "@/assets/logo.png.asset.json";

export function Logo({ className = "h-10 w-10" }: { className?: string }) {
  return (
    <img
      src={logoAsset.url}
      alt="Discovery Outpost Performing Arts Dance logo"
      className={className}
      loading="eager"
    />
  );
}