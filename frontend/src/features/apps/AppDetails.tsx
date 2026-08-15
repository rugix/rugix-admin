import type { api } from "../../generated";
import { EmptyState } from "../../shared/components/EmptyState";
import { Notice } from "../../shared/components/Notice";
import { generationLabel } from "../../shared/lib/format";
import { GenerationTable } from "./GenerationTable";

export function AppDetails({
  app,
  info,
  lifecycleEnabled,
  loading,
  busy,
  onActivate,
}: {
  app: api.AppSummary;
  info?: api.AppInfoResponse;
  lifecycleEnabled: boolean;
  loading?: boolean;
  busy: boolean;
  onActivate: (generation: api.AppGeneration["number"]) => void;
}) {
  if (!info) {
    return (
      <EmptyState
        label={
          loading
            ? `Application details for ${app.name} are loading.`
            : `Application details for ${app.name} are unavailable.`
        }
      />
    );
  }

  const orderedGenerations = [...info.generations].sort(
    (left, right) => Number(right.number) - Number(left.number),
  );

  return (
    <>
      <div className="space-y-3 border-b border-divider px-4 py-3 empty:hidden">
        <AppStateNotice state={info.state} />
      </div>
      <GenerationTable
        generations={orderedGenerations}
        actionsDisabled={busy}
        onActivate={lifecycleEnabled ? onActivate : undefined}
      />
    </>
  );
}

function AppStateNotice({ state }: { state: api.AppInfoResponse["state"] }) {
  switch (state.state) {
    case "inactive":
    case "active":
      return null;
    case "starting":
      return (
        <Notice tone="info">
          Starting generation {generationLabel(state.generation)}.
        </Notice>
      );
    case "stopping":
      return (
        <Notice tone="info">
          Stopping generation {generationLabel(state.generation)}.
        </Notice>
      );
    case "switching":
      return (
        <Notice
          tone="info"
          title={
            state.recovery ? "Recovering application" : "Switching generation"
          }
        >
          From {generationLabel(state.from)} to {generationLabel(state.to)}.
        </Notice>
      );
    case "error":
      return (
        <Notice tone="danger" title="Generation transition failed">
          {state.message} Attempted {generationLabel(state.from)} to{" "}
          {generationLabel(state.to)}.
        </Notice>
      );
  }
}
