export function ImagePlaceholder({
  label,
  className = "",
  aspect = "aspect-[4/5]",
}: {
  label?: string;
  className?: string;
  aspect?: string;
}) {
  return (
    <div
      className={`relative overflow-hidden rounded-2xl ${aspect} ${className}`}
      style={{
        background:
          "linear-gradient(135deg, #F7C6D9 0%, #fce4ec 50%, #E88AB0 100%)",
      }}
    >
      <div className="absolute inset-0 flex items-center justify-center">
        <svg viewBox="0 0 64 64" className="h-16 w-16 text-white/70" fill="none" stroke="currentColor" strokeWidth="1.2">
          <path d="M32 8c-2 6-1 12 2 16-4 2-9 6-10 14-1 6 2 12 8 16" />
          <circle cx="32" cy="10" r="3" />
        </svg>
      </div>
      {label && (
        <span className="absolute bottom-3 left-3 text-[10px] uppercase tracking-widest text-white/90 bg-black/20 backdrop-blur px-2 py-1 rounded">
          {label}
        </span>
      )}
    </div>
  );
}