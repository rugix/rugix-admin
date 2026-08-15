import type { ReactNode } from "react";
import type { api } from "../../generated";
import { classes } from "../../shared/lib/classes";

export function CodeText({
  children,
  className,
}: {
  children: ReactNode;
  className?: string;
}) {
  return (
    <code
      className={classes(
        "rounded bg-elevation-2 px-1 py-0.5 font-mono text-[0.92em] text-inherit",
        className,
      )}
    >
      {children}
    </code>
  );
}

export function sourceKindLabel(kind: api.ComponentSourceKind) {
  switch (kind) {
    case "System":
      return "system";
    case "Local":
      return "local";
    case "Runtime":
      return "runtime";
    case "App":
      return "app";
    case "Bundle":
      return "bundle";
    case "Synthetic":
      return "synthetic";
  }
}

export function sourceColor(kind: api.ComponentSourceKind) {
  switch (kind) {
    case "System":
      return "bg-primary-muted text-primary ring-primary/30";
    case "Local":
      return "bg-warning-surface text-warning ring-warning/30";
    case "Runtime":
      return "bg-info-surface text-info ring-info/30";
    case "App":
      return "bg-success-surface text-success ring-success/30";
    case "Bundle":
    case "Synthetic":
      return "bg-elevation-2 text-foreground-muted ring-divider";
  }
}
