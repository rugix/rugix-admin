import {
  ChevronRight,
  EllipsisVertical,
  Play,
  RotateCcw,
  Square,
  Trash2,
} from "lucide-react";
import { useId, type ReactNode } from "react";
import type { api } from "../../generated";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "../../shared/components/DropdownMenu";
import { EmptyState } from "../../shared/components/EmptyState";
import { classes } from "../../shared/lib/classes";
import { generationLabel } from "../../shared/lib/format";
import {
  buttonClass,
  columnHeaderCellClass,
  columnHeaderClass,
  iconButtonClass,
} from "../../shared/styles";
import { AppStatusBadge } from "./AppStatusBadge";

export function AppInventory({
  apps: appSummaries,
  loaded,
  loading,
  selected,
  lifecycleEnabled,
  busy,
  onSelect,
  onWorkloadAction,
  onApprovalAction,
  onGarbageCollect,
  expandedContent,
}: {
  apps: api.AppSummary[];
  loaded: boolean;
  loading?: boolean;
  selected?: string;
  lifecycleEnabled: boolean;
  busy: boolean;
  onSelect: (app?: string) => void;
  onWorkloadAction: (app: string, action: "start" | "stop") => void;
  onApprovalAction: (
    app: string,
    action: "deactivate" | "rollback" | "remove",
  ) => void;
  onGarbageCollect: (app: string) => void;
  expandedContent?: ReactNode;
}) {
  const inventoryId = useId();
  const gridColumns = lifecycleEnabled
    ? "md:grid-cols-[minmax(0,1.4fr)_96px_96px_8rem]"
    : "md:grid-cols-[minmax(0,1.4fr)_96px_96px]";

  return (
    <div>
      {appSummaries.length > 0 && (
        <div
          className={classes(
            "hidden gap-3 border-b border-divider md:grid",
            columnHeaderClass,
            columnHeaderCellClass,
            gridColumns,
          )}
        >
          <div>App</div>
          <div>Workload</div>
          <div>Generation</div>
          {lifecycleEnabled && <div className="text-right">Actions</div>}
        </div>
      )}
      <div className="divide-y divide-divider">
        {appSummaries.map((app, index) => {
          const expanded = selected === app.name;
          const detailsId = `${inventoryId}-app-${index}`;
          const workloadRunning =
            app.status.state === "running" || app.status.state === "unhealthy";
          const problem = workloadProblem(app.status);
          return (
            <div key={app.name}>
              <div
                className={classes(
                  "grid transition hover:bg-elevation-2",
                  lifecycleEnabled
                    ? "grid-cols-[minmax(0,1fr)_auto]"
                    : "grid-cols-1",
                  "items-stretch gap-3 px-4",
                  gridColumns,
                  expanded && "bg-primary-muted",
                )}
              >
                <button
                  className="min-w-0 py-3 text-left md:col-span-3 md:grid md:grid-cols-subgrid md:items-center md:gap-3"
                  onClick={() => onSelect(expanded ? undefined : app.name)}
                  aria-label={app.name}
                  aria-expanded={expanded}
                  aria-controls={detailsId}
                >
                  <span className="flex min-w-0 items-center gap-3">
                    <ChevronRight
                      size={16}
                      className={classes(
                        "shrink-0 text-foreground-subtle transition",
                        expanded && "rotate-90",
                      )}
                    />
                    <span className="min-w-0">
                      <span className="block truncate font-mono text-sm font-semibold">
                        {app.name}
                      </span>
                      {metadataLabel(app.metadata) && (
                        <span className="mt-1 block truncate text-xs text-foreground-muted">
                          {metadataLabel(app.metadata)}
                        </span>
                      )}
                      {problem && (
                        <span className="mt-1 block truncate text-xs text-danger">
                          {problem}
                        </span>
                      )}
                      <span className="mt-1 flex items-center gap-2 md:hidden">
                        <AppStatusBadge status={app.status} />
                        <span className="font-mono text-xs text-foreground-muted">
                          {generationLabel(app.generation)}
                        </span>
                      </span>
                    </span>
                  </span>
                  <span className="hidden md:block">
                    <AppStatusBadge status={app.status} />
                  </span>
                  <span className="hidden font-mono text-sm font-medium text-foreground-muted md:block">
                    {generationLabel(app.generation)}
                  </span>
                </button>

                {lifecycleEnabled && (
                  <div className="flex items-center justify-end gap-2 py-3">
                    {app.generation !== undefined && (
                      <WorkloadAction
                        app={app.name}
                        label={workloadRunning ? "Stop" : "Start"}
                        disabled={busy}
                        onClick={() =>
                          onWorkloadAction(
                            app.name,
                            workloadRunning ? "stop" : "start",
                          )
                        }
                      />
                    )}
                    <AppActionMenu
                      app={app}
                      disabled={busy}
                      onAction={(action) => onApprovalAction(app.name, action)}
                      onGarbageCollect={() => onGarbageCollect(app.name)}
                      onRemove={() => onApprovalAction(app.name, "remove")}
                    />
                  </div>
                )}
              </div>
              {expanded && expandedContent && (
                <div
                  id={detailsId}
                  role="region"
                  aria-label={`${app.name} details`}
                  className="border-t border-divider bg-elevation-0/40"
                >
                  {expandedContent}
                </div>
              )}
            </div>
          );
        })}
        {appSummaries.length === 0 && (
          <EmptyState
            label={
              loaded
                ? "No apps installed."
                : loading
                  ? "Applications are loading."
                  : "Applications are unavailable."
            }
          />
        )}
      </div>
    </div>
  );
}

function WorkloadAction({
  app,
  label,
  disabled,
  onClick,
}: {
  app: string;
  label: "Start" | "Stop";
  disabled: boolean;
  onClick: () => void;
}) {
  return (
    <button
      className={classes(buttonClass, "w-20 px-2")}
      aria-label={`${label} ${app}`}
      disabled={disabled}
      onClick={onClick}
    >
      {label === "Stop" ? <Square size={16} /> : <Play size={16} />}
      {label}
    </button>
  );
}

function AppActionMenu({
  app,
  disabled,
  onAction,
  onGarbageCollect,
  onRemove,
}: {
  app: api.AppSummary;
  disabled: boolean;
  onAction: (action: "deactivate" | "rollback") => void;
  onGarbageCollect: () => void;
  onRemove: () => void;
}) {
  return (
    <DropdownMenu>
      <DropdownMenuTrigger
        render={
          <button
            className={iconButtonClass}
            aria-label={`More actions for ${app.name}`}
            title="More actions"
            disabled={disabled}
          />
        }
      >
        <EllipsisVertical size={17} />
      </DropdownMenuTrigger>
      <DropdownMenuContent>
        {app.generation !== undefined && (
          <>
            <DropdownMenuItem onSelect={() => onAction("deactivate")}>
              Deactivate
            </DropdownMenuItem>
            <DropdownMenuItem
              icon={<RotateCcw size={16} />}
              onSelect={() => onAction("rollback")}
            >
              Rollback
            </DropdownMenuItem>
          </>
        )}
        <DropdownMenuItem onSelect={onGarbageCollect}>
          Garbage collect
        </DropdownMenuItem>
        <DropdownMenuSeparator />
        <DropdownMenuItem
          className="text-danger data-[highlighted]:bg-danger-surface"
          icon={<Trash2 size={16} />}
          onSelect={onRemove}
        >
          Remove
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

function metadataLabel(metadata: unknown) {
  if (!metadata || typeof metadata !== "object" || !("label" in metadata))
    return undefined;
  return typeof metadata.label === "string" ? metadata.label : undefined;
}

function workloadProblem(status: api.AppSummary["status"]) {
  switch (status.state) {
    case "failed":
      return `Workload failed: ${status.message}`;
    case "unhealthy":
      return `Workload unhealthy: ${status.message}`;
    default:
      return undefined;
  }
}
