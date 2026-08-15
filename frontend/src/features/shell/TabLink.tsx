import type { ReactNode } from "react";
import { classes } from "../../shared/lib/classes";
import { tabHref } from "./tabRouter";
import type { Tab } from "./types";

export function TabLink({
  active,
  icon,
  label,
  tab,
}: {
  active: boolean;
  icon: ReactNode;
  label: string;
  tab: Tab;
}) {
  return (
    <a
      className={classes(
        "flex h-8 min-w-0 flex-auto items-center justify-center gap-1.5 rounded-md px-1.5 text-sm font-medium transition sm:flex-none sm:gap-2 sm:px-3",
        active
          ? "bg-primary text-primary-content shadow-elevation-plus-1"
          : "text-foreground-muted hover:bg-elevation-3 hover:text-foreground",
      )}
      href={tabHref(tab)}
      aria-current={active ? "page" : undefined}
    >
      <span className="hidden shrink-0 sm:inline-flex" aria-hidden="true">
        {icon}
      </span>
      <span className="truncate">{label}</span>
    </a>
  );
}
