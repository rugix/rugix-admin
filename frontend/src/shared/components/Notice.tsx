import type { ReactNode } from "react";
import { classes } from "../lib/classes";

const toneClasses = {
  info: "bg-info-surface text-info",
  warning: "bg-warning-surface text-warning",
  danger: "bg-danger-surface text-danger",
  success: "bg-success-surface text-success",
};

export function Notice({
  title,
  tone,
  children,
}: {
  title?: string;
  tone: keyof typeof toneClasses;
  children: ReactNode;
}) {
  return (
    <div
      className={classes("rounded-md px-3 py-2 text-sm", toneClasses[tone])}
      role={tone === "danger" ? "alert" : "status"}
    >
      {title && <div className="font-semibold">{title}</div>}
      <div className={classes(title && "mt-1")}>{children}</div>
    </div>
  );
}
