import { PackagePlus } from "lucide-react";
import type { InstallOptions } from "../../api";
import type { api } from "../../generated";
import { Badge } from "../../shared/components/Badge";
import { EmptyState } from "../../shared/components/EmptyState";
import { Surface } from "../../shared/components/Surface";
import { UploadPanel } from "../install/UploadPanel";
import { AppDetailPanel } from "./AppDetailPanel";
import { AppInventory } from "./AppInventory";
import { GenerationTable } from "./GenerationTable";

export function AppsPage({
  apps: appSummaries,
  dangerouslyInsecure,
  appLifecycleEnabled,
  selected,
  info,
  onSelect,
  onUpload,
  onAction,
}: {
  apps: api.AppSummary[];
  dangerouslyInsecure: boolean;
  appLifecycleEnabled: boolean;
  selected?: api.AppSummary;
  info?: api.AppInfoResponse;
  onSelect: (app: string) => void;
  onUpload: (file: File, options: InstallOptions) => void;
  onAction: (action: string, query?: Record<string, string | number | undefined>) => void;
}) {
  const orderedGenerations = [...(info?.generations ?? [])].sort(
    (left, right) => Number(right.number) - Number(left.number),
  );
  const activeGeneration = orderedGenerations.find((generation) => generation.active);

  return (
    <div className="grid gap-5 xl:grid-cols-[minmax(0,1fr)_380px]">
      <div className="space-y-5">
        <Surface title="Installed Apps" bodyClassName="p-0">
          <AppInventory apps={appSummaries} selected={selected?.name} onSelect={onSelect} />
        </Surface>

        <Surface
          title={selected ? <>Generations for <span className="font-mono">{selected.name}</span></> : "Generations"}
          action={info && <Badge color="bg-elevation-2 text-foreground-muted ring-divider" className="font-mono tabular-nums">{info.generations.length} total</Badge>}
          bodyClassName="p-0"
        >
          {info ? (
            <GenerationTable
              generations={orderedGenerations}
              onActivate={
                appLifecycleEnabled
                  ? (generation) => onAction("activate", { generation })
                  : undefined
              }
            />
          ) : (
            <EmptyState label="Select an app." />
          )}
        </Surface>
      </div>

      <div className="space-y-5 xl:sticky xl:top-24 xl:self-start">
        <AppDetailPanel
          app={selected}
          info={info}
          activeGeneration={activeGeneration}
          lifecycleEnabled={appLifecycleEnabled}
          onAction={onAction}
        />
        <UploadPanel title="Install App Bundle" fileLabel="App bundle" icon={<PackagePlus size={18} />} dangerouslyInsecure={dangerouslyInsecure} onUpload={onUpload} />
      </div>
    </div>
  );
}
