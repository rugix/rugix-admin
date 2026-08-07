import { Boxes, CircleOff, Play, RotateCcw, Square, Trash2 } from "lucide-react";
import { useState } from "react";
import type { AppActionOptions } from "../../api";
import type { api } from "../../generated";
import { ActionGroup } from "../../shared/components/ActionGroup";
import { EmptyState } from "../../shared/components/EmptyState";
import { MetadataView } from "../../shared/components/MetadataView";
import { MiniMetric } from "../../shared/components/MiniMetric";
import { Notice } from "../../shared/components/Notice";
import { Surface } from "../../shared/components/Surface";
import { confirmAction } from "../../shared/lib/confirm";
import { generationLabel } from "../../shared/lib/format";
import { isNonNegativeInteger } from "../../shared/lib/numbers";
import { AppStatusBadge } from "../../shared/status/AppStatusBadge";
import { buttonClass, dangerButtonClass, fieldClass } from "../../shared/styles";

export function AppDetailPanel({
  app,
  info,
  activeGeneration,
  lifecycleEnabled,
  dangerouslyInsecure,
  skipCompatibilityCheck,
  onSkipCompatibilityCheckChange,
  loading,
  busy,
  onAction,
}: {
  app?: api.AppSummary;
  info?: api.AppInfoResponse;
  activeGeneration?: api.AppGeneration;
  lifecycleEnabled: boolean;
  dangerouslyInsecure: boolean;
  skipCompatibilityCheck: boolean;
  onSkipCompatibilityCheckChange: (enabled: boolean) => void;
  loading?: boolean;
  busy: boolean;
  onAction: (action: api.AppAction, query?: AppActionOptions) => void;
}) {
  const [keepGenerations, setKeepGenerations] = useState("1");
  const isWorkloadRunning = info?.status.state === "running" || info?.status.state === "unhealthy";
  const hasActiveGeneration = info?.state.state === "active";
  const canRollback = info?.generations.some(
    (generation) => !generation.active && generation.lastActivated !== undefined,
  );
  const compatibilityOptions = {
    skipCompatibilityCheck: skipCompatibilityCheck || undefined,
  };

  return (
    <Surface
      title={app ? <span className="font-mono">{app.name}</span> : "App"}
      icon={<Boxes size={18} />}
      action={info && <AppStatusBadge status={info.status} />}
    >
      {info ? (
        <div className="space-y-4">
          <div className="grid grid-cols-2 gap-3">
            <MiniMetric label="Workload" value={info.status.state} valueClassName="font-mono" />
            <MiniMetric label="State" value={info.state.state} valueClassName="font-mono" />
            <MiniMetric
              label="Active Generation"
              value={generationLabel(activeGeneration?.number ?? app?.generation)}
              valueClassName="font-mono"
            />
            <MiniMetric
              label="Generations"
              value={String(info.generations.length)}
              valueClassName="font-mono tabular-nums"
            />
          </div>

          <AppStatusNotice status={info.status} />
          <AppStateNotice state={info.state} />
          <MetadataView metadata={activeGeneration?.metadata ?? app?.metadata} />

          {lifecycleEnabled && (
            <>
              {hasActiveGeneration && (
                <ActionGroup title="Workload">
                  {isWorkloadRunning ? (
                    <button className={buttonClass} disabled={busy} onClick={() => onAction("stop")}>
                      <Square size={16} /> Stop
                    </button>
                  ) : (
                    <button className={buttonClass} disabled={busy} onClick={() => onAction("start")}>
                      <Play size={16} /> Start
                    </button>
                  )}
                  <button
                    className={buttonClass}
                    disabled={busy}
                    onClick={() => onAction("deactivate", compatibilityOptions)}
                  >
                    <CircleOff size={16} /> Deactivate
                  </button>
                </ActionGroup>
              )}

              <ActionGroup title="Generation">
                <button
                  className={buttonClass}
                  disabled={!canRollback || busy}
                  onClick={() => onAction("rollback", compatibilityOptions)}
                >
                  <RotateCcw size={16} /> Rollback
                </button>
                <div className="flex items-end gap-2">
                  <label className="w-24 shrink-0">
                    <span className="mb-1 block text-xs font-medium text-foreground-muted">
                      Keep previous
                    </span>
                    <input
                      aria-label="Generations to keep"
                      className={fieldClass}
                      type="number"
                      min="0"
                      step="1"
                      value={keepGenerations}
                      onChange={(event) => setKeepGenerations(event.target.value)}
                    />
                  </label>
                  <button
                    className={buttonClass}
                    disabled={!isNonNegativeInteger(keepGenerations) || busy}
                    onClick={() => onAction("gc", { keep: Number(keepGenerations) })}
                  >
                    <Trash2 size={16} /> GC
                  </button>
                </div>
                <button
                  className={dangerButtonClass}
                  disabled={busy}
                  onClick={() =>
                    confirmAction(`Remove ${info.name} and all of its generations?`) &&
                    onAction("remove", compatibilityOptions)
                  }
                >
                  <Trash2 size={16} /> Remove
                </button>
              </ActionGroup>

              {dangerouslyInsecure && (
                <label className="flex items-start gap-2 rounded-md bg-danger-surface px-3 py-2 text-sm text-danger">
                  <input
                    className="mt-0.5 size-4 accent-primary"
                    type="checkbox"
                    checked={skipCompatibilityCheck}
                    onChange={(event) => onSkipCompatibilityCheckChange(event.target.checked)}
                  />
                  Skip compatibility checks for generation actions
                </label>
              )}
            </>
          )}
        </div>
      ) : (
        <EmptyState
          label={
            app
              ? loading
                ? "Application details are loading."
                : "Application details are unavailable."
              : "Select an app."
          }
        />
      )}
    </Surface>
  );
}

function AppStatusNotice({ status }: { status: api.AppInfoResponse["status"] }) {
  if (status.state !== "failed" && status.state !== "unhealthy") return null;
  return (
    <Notice title={status.state === "failed" ? "Workload failed" : "Workload unhealthy"} tone="danger">
      {status.message}
    </Notice>
  );
}

function AppStateNotice({ state }: { state: api.AppInfoResponse["state"] }) {
  switch (state.state) {
    case "inactive":
    case "active":
      return null;
    case "starting":
      return <Notice tone="info">Starting generation {generationLabel(state.generation)}.</Notice>;
    case "stopping":
      return <Notice tone="info">Stopping generation {generationLabel(state.generation)}.</Notice>;
    case "switching":
      return (
        <Notice tone="info" title={state.recovery ? "Recovering application" : "Switching generation"}>
          From {generationLabel(state.from)} to {generationLabel(state.to)}.
        </Notice>
      );
    case "error":
      return (
        <Notice tone="danger" title="Generation transition failed">
          {state.message} Attempted {generationLabel(state.from)} to {generationLabel(state.to)}.
        </Notice>
      );
  }
}
