import Image from "next/image";
import { cn } from "@/lib/utils";

// logo.png's wordmark had "Stamp" baked in as near-black pixels — invisible
// against a dark nav bar (no raster asset can follow prefers-color-scheme).
// Only the icon glyph is a static image now; the wordmark is real text in
// theme-aware tokens, so it flips to a light color in dark mode like
// everything else on the page.
const SIZES = {
  sm: { icon: "h-7", text: "text-lg" },
  md: { icon: "h-10", text: "text-2xl" },
  lg: { icon: "h-10 sm:h-12", text: "text-2xl sm:text-3xl" },
} as const;

export function Logo({
  size = "sm",
  className,
}: {
  size?: keyof typeof SIZES;
  className?: string;
}) {
  const { icon, text } = SIZES[size];

  return (
    <span className={cn("flex items-center gap-1.5", className)}>
      <Image
        src="/logo-icon.png"
        alt=""
        width={175}
        height={144}
        priority
        className={cn(icon, "w-auto")}
      />
      <span className={cn(text, "font-bold tracking-tight whitespace-nowrap")}>
        <span className="text-foreground">Stamp</span>
        <span className="text-primary">Mate</span>
      </span>
    </span>
  );
}
