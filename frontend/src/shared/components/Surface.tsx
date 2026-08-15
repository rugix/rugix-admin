import type { ReactNode } from "react";
import { classes } from "../lib/classes";

export function Surface({
  title,
  icon,
  action,
  children,
  className,
  bodyClassName,
}: {
  title?: ReactNode;
  icon?: ReactNode;
  action?: ReactNode;
  children: ReactNode;
  className?: string;
  bodyClassName?: string;
}) {
  return (
    <section className={classes("overflow-hidden rounded-lg border border-divider bg-elevation-1/90 shadow-elevation-plus-1 backdrop-blur-xl", className)}>
      {(title || action) && (
        <div className="flex min-h-13 items-center justify-between gap-3 border-b border-divider px-4 py-3">
          <div className="flex min-w-0 items-center gap-2">
            {icon && (
              <span className="text-primary" aria-hidden="true">
                {icon}
              </span>
            )}
            {title && <h2 className="truncate text-sm font-semibold text-foreground">{title}</h2>}
          </div>
          {action}
        </div>
      )}
      <div className={bodyClassName ?? (title || action ? "p-4" : "")}>{children}</div>
    </section>
  );
}
