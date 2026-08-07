import { formatMetadata } from "../lib/format";

export function MetadataView({ metadata }: { metadata: unknown }) {
  if (metadata === undefined || metadata === null) return null;

  return (
    <details className="border-t border-divider pt-3">
      <summary className="cursor-pointer text-sm font-medium text-foreground-muted transition hover:text-foreground">
        Metadata
      </summary>
      <pre className="mt-2 max-h-48 overflow-auto rounded-md border border-divider bg-elevation-0 p-3 font-mono text-xs leading-5">
        {formatMetadata(metadata)}
      </pre>
    </details>
  );
}
