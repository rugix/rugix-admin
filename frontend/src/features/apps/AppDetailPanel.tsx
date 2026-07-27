import { Boxes, Play, RotateCcw, Square, Trash2 } from "lucide-react";
import type { api } from "../../generated";
import { ActionGroup } from "../../shared/components/ActionGroup";
import { EmptyState } from "../../shared/components/EmptyState";
import { MiniMetric } from "../../shared/components/MiniMetric";
import { Surface } from "../../shared/components/Surface";
import { confirmAction } from "../../shared/lib/confirm";
import { generationLabel } from "../../shared/lib/format";
import { AppStatusBadge } from "../../shared/status/AppStatusBadge";
import { buttonClass, dangerButtonClass } from "../../shared/styles";

export function AppDetailPanel({
  app,
  info,
  activeGeneration,
  lifecycleEnabled,
  onAction,
}: {
  app?: api.AppSummary;
  info?: api.AppInfoResponse;
  activeGeneration?: api.AppGeneration;
  lifecycleEnabled: boolean;
  onAction: (action: string, query?: Record<string, string | number | undefined>) => void;
}) {
  const isWorkloadRunning = info?.status.state === "running" || info?.status.state === "unhealthy";

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
            <MiniMetric label="Active Generation" value={generationLabel(activeGeneration?.number ?? app?.generation)} valueClassName="font-mono" />
            <MiniMetric label="Generations" value={String(info.generations.length)} valueClassName="font-mono tabular-nums" />
          </div>

          {lifecycleEnabled && (
            <>
              <ActionGroup title="Workload">
                {isWorkloadRunning ? (
                  <button className={buttonClass} onClick={() => onAction("stop")}>
                    <Square size={16} /> Stop
                  </button>
                ) : (
                  <button className={buttonClass} onClick={() => onAction("start")}>
                    <Play size={16} /> Start
                  </button>
                )}
              </ActionGroup>

              <ActionGroup title="Generation">
                <button className={buttonClass} onClick={() => onAction("rollback")}>
                  <RotateCcw size={16} /> Rollback
                </button>
                <button className={buttonClass} onClick={() => onAction("gc", { keep: 1 })}>
                  <Trash2 size={16} /> GC
                </button>
                <button
                  className={dangerButtonClass}
                  onClick={() => confirmAction(`Remove ${info.name}?`) && onAction("remove")}
                >
                  <Trash2 size={16} /> Remove
                </button>
              </ActionGroup>
            </>
          )}
        </div>
      ) : (
        <EmptyState label="Select an app." />
      )}
    </Surface>
  );
}
