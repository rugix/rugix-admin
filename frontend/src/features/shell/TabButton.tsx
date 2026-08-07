import type { ReactNode } from "react";
import { classes } from "../../shared/lib/classes";

export function TabButton({ active, icon, label, onClick }: { active: boolean; icon: ReactNode; label: string; onClick: () => void }) {
  return (
    <button
      className={classes(
        "flex h-8 flex-1 items-center justify-center gap-2 rounded-md px-3 text-sm font-medium transition sm:flex-none",
        active ? "bg-primary text-primary-content shadow-elevation-plus-1" : "text-foreground-muted hover:bg-elevation-3 hover:text-foreground",
      )}
      onClick={onClick}
      aria-current={active ? "page" : undefined}
    >
      {icon}
      {label}
    </button>
  );
}
