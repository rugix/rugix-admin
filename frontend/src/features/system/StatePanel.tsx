import { Trash2 } from "lucide-react";
import type { api } from "../../generated";
import { Badge } from "../../shared/components/Badge";
import { Notice } from "../../shared/components/Notice";
import { Surface } from "../../shared/components/Surface";
import { classes } from "../../shared/lib/classes";
import { dangerButtonClass } from "../../shared/styles";

export function StatePanel({
  state,
  loading,
  canFactoryReset,
  busy,
  onFactoryReset,
}: {
  state?: api.SystemStateInfo;
  loading?: boolean;
  canFactoryReset: boolean;
  busy: boolean;
  onFactoryReset: () => void;
}) {
  return (
    <Surface
      title="State management"
      action={
        canFactoryReset ? (
          <button
            className={classes(dangerButtonClass, "h-8 px-2.5")}
            disabled={busy}
            onClick={onFactoryReset}
          >
            <Trash2 aria-hidden="true" size={15} />
            Reset
          </button>
        ) : undefined
      }
    >
      {state ? (
        <div className="space-y-3">
          <div className="flex items-center justify-between gap-3">
            <span className="text-sm text-foreground-muted">Status</span>
            <StateBadge state={state} />
          </div>
          <InfoRow
            label="Data partition"
            value={
              state.status === "Active"
                ? (state.dataPartition ?? "none")
                : "not available"
            }
          />
          {state.status === "Error" && (
            <Notice tone="danger">
              {state.message ??
                "Persistent state is unavailable because state management encountered an error."}
            </Notice>
          )}
          {state.status === "Error" && state.ephemeral === true && (
            <Notice tone="warning">
              Rugix is using temporary in-memory state. Changes may not survive
              a reboot.
            </Notice>
          )}
          {state.status === "Disabled" && (
            <p className="text-sm text-foreground-muted">
              Persistent state management is disabled.
            </p>
          )}
        </div>
      ) : (
        <div className="text-sm text-foreground-muted">
          {loading
            ? "System information is loading."
            : "System information is unavailable."}
        </div>
      )}
    </Surface>
  );
}

function StateBadge({ state }: { state: api.SystemStateInfo }) {
  switch (state.status) {
    case "Active":
      return (
        <Badge color="bg-success-surface text-success ring-success/30">
          active
        </Badge>
      );
    case "Disabled":
      return (
        <Badge color="bg-elevation-2 text-foreground-muted ring-divider">
          disabled
        </Badge>
      );
    case "Error":
      return (
        <Badge color="bg-danger-surface text-danger ring-danger/30">
          error
        </Badge>
      );
  }
}

function InfoRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="min-w-0">
      <div className="text-xs font-semibold uppercase tracking-wide text-foreground-subtle">
        {label}
      </div>
      <div className="mt-1 break-all font-mono text-sm">{value}</div>
    </div>
  );
}
