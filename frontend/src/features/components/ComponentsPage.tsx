import { useState } from "react";
import type { api } from "../../generated";
import { Badge } from "../../shared/components/Badge";
import { EmptyState } from "../../shared/components/EmptyState";
import { Surface } from "../../shared/components/Surface";
import { buttonClass } from "../../shared/styles";
import { CompatibilityProblems } from "./CompatibilityProblems";
import { ComponentInventory } from "./ComponentInventory";
import { ScannedRootsDialog } from "./ScannedRootsDialog";

export function ComponentsPage({
  report,
  loading,
}: {
  report?: api.ComponentsCheckResponse;
  loading?: boolean;
}) {
  const [rootsDialogOpen, setRootsDialogOpen] = useState(false);

  if (!report) {
    return (
      <div className="space-y-3">
        <h1 className="font-display text-2xl font-semibold text-foreground">
          Components
        </h1>
        <Surface bodyClassName="p-0">
          <EmptyState
            label={
              loading
                ? "Component information is loading."
                : "Component information is unavailable."
            }
          />
        </Surface>
      </div>
    );
  }

  const components = [...report.components].sort((left, right) =>
    left.component.id.localeCompare(right.component.id),
  );

  return (
    <div className="space-y-3">
      <div className="flex min-h-9 items-center justify-between gap-3">
        <div className="flex min-w-0 items-center gap-2">
          <h1 className="truncate font-display text-2xl font-semibold text-foreground">
            Components
          </h1>
          <Badge
            color="bg-elevation-2 text-foreground-muted ring-divider"
            className="hidden font-mono tabular-nums sm:inline-flex"
          >
            {components.length} loaded
          </Badge>
          <ConsistencyBadge
            consistent={report.consistent}
            className="max-sm:hidden"
          />
        </div>
        <button
          className={buttonClass}
          onClick={() => setRootsDialogOpen(true)}
        >
          <span className="sm:hidden">Roots</span>
          <span className="hidden sm:inline">Scanned roots</span>
          <Badge
            color="bg-elevation-2 text-foreground-muted ring-divider"
            className="font-mono tabular-nums"
          >
            {report.roots.length}
          </Badge>
        </button>
      </div>

      <CompatibilityProblems problems={report.problems} />
      <ComponentInventory components={components} />

      {rootsDialogOpen && (
        <ScannedRootsDialog
          roots={report.roots}
          onClose={() => setRootsDialogOpen(false)}
        />
      )}
    </div>
  );
}

function ConsistencyBadge({
  consistent,
  className,
}: {
  consistent?: boolean;
  className?: string;
}) {
  if (consistent === undefined) {
    return (
      <Badge
        color="bg-elevation-2 text-foreground-muted ring-divider"
        className={className}
      >
        unknown
      </Badge>
    );
  }
  if (consistent) {
    return (
      <Badge
        color="bg-success-surface text-success ring-success/30"
        className={className}
      >
        consistent
      </Badge>
    );
  }
  return (
    <Badge
      color="bg-danger-surface text-danger ring-danger/30"
      className={className}
    >
      inconsistent
    </Badge>
  );
}
