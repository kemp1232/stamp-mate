import {
  CheckCircle2,
  Circle,
  Clock,
  Gift,
  XCircle,
  type LucideIcon,
} from "lucide-react";
import { cn } from "@/lib/utils";
import type { LoyaltyCardStatus } from "@/generated/prisma/enums";

const STATUS_CONFIG: Record<
  LoyaltyCardStatus,
  { label: string; icon: LucideIcon; className: string }
> = {
  ACTIVE: {
    label: "Active",
    icon: Clock,
    className: "bg-primary/10 text-primary",
  },
  COMPLETED: {
    label: "Ready for reward",
    icon: Gift,
    // Solid fill (unlike the other, quieter statuses) — this is the one
    // state that means "do something," so it's the one worth it standing out.
    className: "bg-primary text-primary-foreground",
  },
  REDEEMED: {
    label: "Redeemed",
    icon: CheckCircle2,
    className: "bg-muted text-muted-foreground",
  },
  CANCELLED: {
    label: "Cancelled",
    icon: XCircle,
    className: "bg-muted text-muted-foreground",
  },
};
const NO_CARD_CONFIG = {
  label: "No card yet",
  icon: Circle,
  className: "bg-muted text-muted-foreground",
};

export function LoyaltyStatusBadge({
  status,
  className,
}: {
  status: LoyaltyCardStatus | null;
  className?: string;
}) {
  const { label, icon: Icon, className: statusClassName } = status
    ? STATUS_CONFIG[status]
    : NO_CARD_CONFIG;
  return (
    <span
      className={cn(
        "inline-flex shrink-0 items-center gap-1 rounded-full px-2 py-0.5 text-xs font-medium",
        statusClassName,
        className,
      )}
    >
      <Icon className="size-3" aria-hidden="true" />
      {label}
    </span>
  );
}
