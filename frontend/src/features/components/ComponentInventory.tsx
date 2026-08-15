import { ChevronDown } from "lucide-react";
import type { api } from "../../generated";
import { Badge } from "../../shared/components/Badge";
import { EmptyState } from "../../shared/components/EmptyState";
import { Surface } from "../../shared/components/Surface";
import { CodeText, sourceColor, sourceKindLabel } from "./presentation";

export function ComponentInventory({
  components,
}: {
  components: api.LoadedComponent[];
}) {
  return (
    <Surface bodyClassName="p-0">
      <div className="hidden grid-cols-[minmax(0,1fr)_auto] gap-3 bg-elevation-2/70 px-4 py-2 text-xs font-semibold uppercase tracking-wide text-foreground-subtle md:grid">
        <span>Component</span>
        <span className="pr-7">Capabilities</span>
      </div>
      <ComponentList components={components} />
    </Surface>
  );
}

function ComponentList({ components }: { components: api.LoadedComponent[] }) {
  if (components.length === 0) {
    return <EmptyState label="No components were found." />;
  }

  return (
    <div className="divide-y divide-divider">
      {components.map(({ component, source }) => {
        const claims = component.claims ?? [];
        return (
          <details key={`${source.path}:${component.id}`} className="group">
            <summary className="grid cursor-pointer list-none gap-3 px-4 py-3 transition hover:bg-elevation-2 md:grid-cols-[minmax(0,1fr)_auto]">
              <div className="min-w-0">
                <div className="flex flex-wrap items-center gap-2">
                  <span className="break-words font-mono text-sm font-semibold text-foreground">
                    {component.id}
                  </span>
                  {component.version && (
                    <Badge
                      color="bg-elevation-2 text-foreground-muted ring-divider"
                      className="font-mono"
                    >
                      {component.version}
                    </Badge>
                  )}
                  <Badge color={sourceColor(source.kind)}>
                    {sourceKindLabel(source.kind)}
                  </Badge>
                </div>
                <div className="mt-1 break-all font-mono text-xs text-foreground-muted">
                  {source.path}
                </div>
              </div>
              <div className="flex flex-wrap items-center gap-2 md:justify-end">
                <CapabilityCounts component={component} claims={claims} />
                <ChevronDown
                  aria-hidden="true"
                  className="text-foreground-subtle transition group-open:rotate-180"
                  size={16}
                />
              </div>
            </summary>
            <CapabilityDetails component={component} claims={claims} />
          </details>
        );
      })}
    </div>
  );
}

function CapabilityCounts({
  component,
  claims,
}: {
  component: api.Component;
  claims: api.Claim[];
}) {
  const counts = [
    { label: "provides", count: component.provides.length },
    { label: "claims", count: claims.length },
    { label: "requires", count: component.requires.length },
    { label: "conflicts", count: component.conflicts.length },
  ].filter((item) => item.count > 0);

  return (
    <div className="flex flex-wrap justify-end gap-x-3 gap-y-1 font-mono text-xs tabular-nums text-foreground-muted">
      {counts.map(({ label, count }) => (
        <span
          key={label}
          className={label === "conflicts" ? "text-danger" : undefined}
        >
          {count} {label}
        </span>
      ))}
    </div>
  );
}

function CapabilityDetails({
  component,
  claims,
}: {
  component: api.Component;
  claims: api.Claim[];
}) {
  const groups = [
    { title: "Provides", items: component.provides },
    { title: "Claims", items: claims },
    { title: "Requires", items: component.requires },
    { title: "Conflicts", items: component.conflicts },
  ];

  return (
    <div className="grid gap-4 border-t border-divider bg-elevation-0/40 px-4 py-3 sm:grid-cols-2 xl:grid-cols-4">
      {groups.map((group) => (
        <CapabilityGroup
          key={group.title}
          title={group.title}
          items={group.items}
        />
      ))}
    </div>
  );
}

function CapabilityGroup({
  title,
  items,
}: {
  title: string;
  items: Array<api.Capability | api.CapabilitySelector | api.Claim>;
}) {
  return (
    <div className="min-w-0">
      <div className="text-xs font-semibold uppercase tracking-wide text-foreground-subtle">
        {title}
      </div>
      <div className="mt-2 space-y-1.5">
        {items.length > 0 ? (
          items.map((item, index) => {
            const detail = itemDetail(item);
            return (
              <div
                key={`${item.id}:${index}`}
                className="rounded-md border border-divider bg-elevation-1 px-2 py-1.5"
              >
                <div className="break-words font-mono text-xs text-foreground">
                  {item.id}
                </div>
                {(detail.version || detail.value) && (
                  <div className="mt-1 flex flex-wrap gap-1.5 text-xs text-foreground-muted">
                    {detail.version && (
                      <span className="rounded bg-elevation-2 px-1.5 py-0.5">
                        version <CodeText>{detail.version}</CodeText>
                      </span>
                    )}
                    {detail.value && (
                      <span className="rounded bg-elevation-2 px-1.5 py-0.5">
                        value <CodeText>{detail.value}</CodeText>
                      </span>
                    )}
                  </div>
                )}
              </div>
            );
          })
        ) : (
          <div className="rounded-md border border-dashed border-divider bg-elevation-1/50 px-2 py-2 text-xs text-foreground-muted">
            None declared.
          </div>
        )}
      </div>
    </div>
  );
}

function itemDetail(item: api.Capability | api.CapabilitySelector | api.Claim) {
  return {
    version: "version" in item ? item.version : undefined,
    value: "value" in item ? item.value : undefined,
  };
}
