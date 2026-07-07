import Image from "next/image";

export function Logo({ className }: { className?: string }) {
  return (
    <Image
      src="/logo.png"
      alt="StampMate"
      width={480}
      height={144}
      priority
      className={className}
    />
  );
}
