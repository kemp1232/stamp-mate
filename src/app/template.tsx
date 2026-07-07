import type { ReactNode } from "react";

// Unlike layout.tsx, a template re-mounts on every navigation, so this
// fade-in animation replays on each route change instead of only once.
export default function Template({ children }: { children: ReactNode }) {
  return (
    <div className="flex flex-1 flex-col animate-in fade-in duration-150">
      {children}
    </div>
  );
}
