import type { api } from "../../generated";
import { Badge } from "../../shared/components/Badge";
import { EmptyState } from "../../shared/components/EmptyState";
import { ModalDialog } from "../../shared/components/ModalDialog";
import { CodeText, sourceColor, sourceKindLabel } from "./presentation";

export function ScannedRootsDialog({
  roots,
  onClose,
}: {
  roots: api.ComponentRoot[];
  onClose: () => void;
}) {
  return (
    <ModalDialog title="Scanned roots" className="max-w-3xl" onClose={onClose}>
      <div className="overflow-hidden rounded-lg border border-divider">
        <RootList roots={roots} />
      </div>
    </ModalDialog>
  );
}

function RootList({ roots }: { roots: api.ComponentRoot[] }) {
  if (roots.length === 0) {
    return <EmptyState label="No component roots were scanned." />;
  }

  return (
    <div className="divide-y divide-divider">
      {roots.map((root) => (
        <div key={`${root.kind}:${root.path}`} className="space-y-2 px-4 py-3">
          <div className="flex flex-wrap items-center gap-2">
            <Badge color={sourceColor(root.kind)}>
              {sourceKindLabel(root.kind)}
            </Badge>
            {root.app && (
              <Badge
                color="bg-elevation-2 text-foreground-muted ring-divider"
                className="font-mono"
              >
                {root.app}
              </Badge>
            )}
            {root.generation !== undefined && (
              <Badge color="bg-elevation-2 text-foreground-muted ring-divider">
                generation <CodeText>{String(root.generation)}</CodeText>
              </Badge>
            )}
          </div>
          <div className="break-all font-mono text-xs text-foreground-muted">
            {root.path}
          </div>
        </div>
      ))}
    </div>
  );
}
