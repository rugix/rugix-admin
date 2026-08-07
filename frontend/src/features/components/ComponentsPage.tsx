import { AlertTriangle, CheckCircle2, ChevronDown, CircleSlash, Network, ShieldCheck } from "lucide-react";
import type { ReactNode } from "react";
import type { api } from "../../generated";
import { Badge } from "../../shared/components/Badge";
import { EmptyState } from "../../shared/components/EmptyState";
import { Surface } from "../../shared/components/Surface";
import { classes } from "../../shared/lib/classes";

export function ComponentsPage({ report, loading }: { report?: api.ComponentsCheckResponse; loading?: boolean }) {
  if (!report) {
    return (
      <Surface title="Component Compatibility" icon={<Network size={18} />} bodyClassName="p-0">
        <EmptyState
          label={loading ? "Component information is loading." : "Component information is unavailable."}
        />
      </Surface>
    );
  }
  const components = [...(report?.components ?? [])].sort((left, right) =>
    left.component.id.localeCompare(right.component.id),
  );
  const roots = report?.roots ?? [];
  const problems = report?.problems ?? [];

  return (
    <div className="space-y-5">
      <Surface className="p-0">
        <div className="grid divide-y divide-divider sm:grid-cols-4 sm:divide-x sm:divide-y-0">
          <div className="px-4 py-3">
            <div className="text-xs font-semibold uppercase tracking-wide text-foreground-subtle">Status</div>
            <div className="mt-2">
              <ConsistencyBadge consistent={report?.consistent} />
            </div>
          </div>
          <SummaryCell label="Components" value={String(components.length)} />
          <SummaryCell label="Roots" value={String(roots.length)} />
          <SummaryCell label="Problems" value={String(problems.length)} />
        </div>
      </Surface>

      <div className="grid gap-5 xl:grid-cols-[minmax(0,1fr)_360px]">
        <div className="space-y-5">
          <Surface title="Compatibility Problems" icon={<AlertTriangle size={18} />} bodyClassName="p-0">
            <ProblemList problems={problems} />
          </Surface>

          <Surface title="Loaded Components" icon={<Network size={18} />} bodyClassName="p-0">
            <ComponentList components={components} />
          </Surface>
        </div>

        <Surface title="Scanned Roots" icon={<ShieldCheck size={18} />} bodyClassName="p-0" className="xl:sticky xl:top-24 xl:self-start">
          <RootList roots={roots} />
        </Surface>
      </div>
    </div>
  );
}

function SummaryCell({ label, value }: { label: string; value: string }) {
  return (
    <div className="px-4 py-3">
      <div className="text-xs font-semibold uppercase tracking-wide text-foreground-subtle">{label}</div>
      <div className="mt-1 truncate font-mono text-sm font-medium tabular-nums">{value}</div>
    </div>
  );
}

function CodeText({ children, className = "" }: { children: ReactNode; className?: string }) {
  return (
    <code className={classes("rounded bg-elevation-2 px-1 py-0.5 font-mono text-[0.92em] text-inherit", className)}>
      {children}
    </code>
  );
}

function ProblemList({ problems }: { problems: api.ComponentProblem[] }) {
  if (problems.length === 0) {
    return <EmptyState label="No compatibility problems." />;
  }

  return (
    <div className="divide-y divide-divider">
      {problems.map((problem, index) => (
        <div key={index} className="space-y-2 px-4 py-3">
          <div className="flex flex-wrap items-center gap-2">
            <Badge color="bg-danger-surface text-danger ring-danger/30">{problemLabel(problem.kind)}</Badge>
            <span className="min-w-0 break-words text-sm font-medium">{problemTitle(problem)}</span>
          </div>
          <div className="break-words text-sm text-foreground-muted">{problemDescription(problem)}</div>
        </div>
      ))}
    </div>
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
            <summary className="grid cursor-pointer gap-3 px-4 py-3 transition hover:bg-elevation-2 md:grid-cols-[minmax(0,1fr)_auto]">
              <div className="min-w-0">
                <div className="flex flex-wrap items-center gap-2">
                  <span className="break-words font-mono text-sm font-semibold text-foreground">{component.id}</span>
                  {component.version && <Badge color="bg-elevation-2 text-foreground-muted ring-divider" className="font-mono">{component.version}</Badge>}
                  <SourceBadge source={source} />
                </div>
                <div className="mt-1 break-all font-mono text-xs text-foreground-muted">{source.path}</div>
              </div>
              <div className="flex flex-wrap items-center gap-2 md:justify-end">
                <CountBadge label="provides" count={component.provides.length} />
                <CountBadge label="claims" count={claims.length} />
                <CountBadge label="requires" count={component.requires.length} />
                <CountBadge label="conflicts" count={component.conflicts.length} />
                <ChevronDown
                  aria-hidden="true"
                  className="text-foreground-subtle transition group-open:rotate-180"
                  size={16}
                />
              </div>
            </summary>
            <div className="grid gap-3 border-t border-divider bg-elevation-0 px-4 py-3 lg:grid-cols-4">
              <CapabilityGroup title="Provides" items={component.provides} empty="No provided capabilities." />
              <CapabilityGroup title="Claims" items={claims} empty="No exclusive claims." />
              <CapabilityGroup title="Requires" items={component.requires} empty="No requirements." />
              <CapabilityGroup title="Conflicts" items={component.conflicts} empty="No conflicts." />
            </div>
          </details>
        );
      })}
    </div>
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
            <Badge color={sourceColor(root.kind)}>{sourceKindLabel(root.kind)}</Badge>
            {root.app && <Badge color="bg-elevation-2 text-foreground-muted ring-divider" className="font-mono">{root.app}</Badge>}
            {root.generation !== undefined && (
              <Badge color="bg-elevation-2 text-foreground-muted ring-divider">generation <CodeText>{String(root.generation)}</CodeText></Badge>
            )}
          </div>
          <div className="break-all font-mono text-xs text-foreground-muted">{root.path}</div>
        </div>
      ))}
    </div>
  );
}

function ConsistencyBadge({ consistent }: { consistent?: boolean }) {
  if (consistent === undefined) {
    return <Badge color="bg-elevation-2 text-foreground-muted ring-divider">unknown</Badge>;
  }
  if (consistent) {
    return (
      <Badge color="bg-success-surface text-success ring-success/30">
        <CheckCircle2 size={13} /> consistent
      </Badge>
    );
  }
  return (
    <Badge color="bg-danger-surface text-danger ring-danger/30">
      <CircleSlash size={13} /> inconsistent
    </Badge>
  );
}

function SourceBadge({ source }: { source: api.ComponentSource }) {
  return <Badge color={sourceColor(source.kind)}>{sourceKindLabel(source.kind)}</Badge>;
}

function CountBadge({ label, count }: { label: string; count: number }) {
  return (
    <Badge color={count > 0 ? "bg-info-surface text-info ring-info/30" : "bg-elevation-2 text-foreground-muted ring-divider"}>
      {count} {label}
    </Badge>
  );
}

function CapabilityGroup({
  title,
  items,
  empty,
}: {
  title: string;
  items: Array<api.Capability | api.CapabilitySelector | api.Claim>;
  empty: string;
}) {
  return (
    <div className="min-w-0">
      <div className="text-xs font-semibold uppercase tracking-wide text-foreground-subtle">{title}</div>
      <div className="mt-2 space-y-1.5">
        {items.length > 0 ? (
          items.map((item, index) => (
            <div key={`${item.id}:${index}`} className="rounded-md border border-divider bg-elevation-1 px-2 py-1.5">
              <div className="break-words font-mono text-xs text-foreground">{item.id}</div>
              {(itemDetail(item).version || itemDetail(item).value) && (
                <div className="mt-1 flex flex-wrap gap-1.5 text-xs text-foreground-muted">
                  {itemDetail(item).version && <span className="rounded bg-elevation-2 px-1.5 py-0.5">version <CodeText>{itemDetail(item).version}</CodeText></span>}
                  {itemDetail(item).value && <span className="rounded bg-elevation-2 px-1.5 py-0.5">value <CodeText>{itemDetail(item).value}</CodeText></span>}
                </div>
              )}
            </div>
          ))
        ) : (
          <div className="text-xs text-foreground-muted">{empty}</div>
        )}
      </div>
    </div>
  );
}

function problemLabel(kind: api.ComponentProblem["kind"]) {
  switch (kind) {
    case "DuplicateComponent":
      return "duplicate";
    case "DuplicateClaim":
      return "claim";
    case "UnsatisfiedRequirement":
      return "missing";
    case "Conflict":
      return "conflict";
  }
}

function problemTitle(problem: api.ComponentProblem) {
  switch (problem.kind) {
    case "DuplicateComponent":
      return <>Duplicate component <CodeText>{problem.id}</CodeText></>;
    case "DuplicateClaim":
      return <>Duplicate claim <CodeText>{problem.id}</CodeText></>;
    case "UnsatisfiedRequirement":
      return <><CodeText>{problem.component.id}</CodeText> requires <CodeText>{selectorText(problem.selector)}</CodeText></>;
    case "Conflict":
      return <><CodeText>{problem.component.id}</CodeText> conflicts with <CodeText>{problem.provider.id}</CodeText></>;
  }
}

function problemDescription(problem: api.ComponentProblem) {
  switch (problem.kind) {
    case "DuplicateComponent":
      return <>Declared by {joinNodes(problem.sources.map((source, index) => <SourceSummary key={`${source.kind}:${source.path}:${index}`} source={source} />))}.</>;
    case "DuplicateClaim":
      return <>Claimed by {joinNodes(problem.components.map((component, index) => <ComponentRefSummary key={`${component.id}:${index}`} component={component} />))}.</>;
    case "UnsatisfiedRequirement":
      return <>No loaded component provides <CodeText>{selectorText(problem.selector)}</CodeText>.</>;
    case "Conflict":
      return <><CodeText>{problem.provider.id}</CodeText> provides <CodeText>{capabilityText(problem.capability)}</CodeText>, matching <CodeText>{selectorText(problem.selector)}</CodeText>.</>;
  }
}

function joinNodes(nodes: ReactNode[]) {
  return nodes.flatMap((node, index) => (index === 0 ? [node] : [", ", node]));
}

function ComponentRefSummary({ component }: { component: api.ComponentRef }) {
  if (!component.source) {
    return <CodeText>{component.id}</CodeText>;
  }
  if (component.source.kind === "App") {
    return (
      <>
        <CodeText>{component.id}</CodeText>
        {component.source.generation !== undefined && (
          <>
            {" "}(generation <CodeText>{String(component.source.generation)}</CodeText>)
          </>
        )}
      </>
    );
  }
  return (
    <>
      <CodeText>{component.id}</CodeText> (<SourceSummary source={component.source} />)
    </>
  );
}

function SourceSummary({ source }: { source: api.ComponentSource }) {
  if (source.kind === "App" && source.app) {
    return (
      <>
        app <CodeText>{source.app}</CodeText>
        {source.generation !== undefined && (
          <>
            , generation <CodeText>{String(source.generation)}</CodeText>
          </>
        )}
      </>
    );
  }
  if (source.app || source.generation !== undefined) {
    return (
      <>
        {sourceKindLabel(source.kind)}
        {source.app && (
          <>
            {" "}app <CodeText>{source.app}</CodeText>
          </>
        )}
        {source.generation !== undefined && (
          <>
            , generation <CodeText>{String(source.generation)}</CodeText>
          </>
        )}
      </>
    );
  }
  return (
    <>
      {sourceKindLabel(source.kind)} component
    </>
  );
}

function capabilityText(capability: api.Capability) {
  return selectorText(capability);
}

function selectorText(selector: api.Capability | api.CapabilitySelector) {
  const version = selector.version ? ` ${selector.version}` : "";
  const value = selector.value ? ` = ${selector.value}` : "";
  return `${selector.id}${version}${value}`;
}

function itemDetail(item: api.Capability | api.CapabilitySelector | api.Claim) {
  return {
    version: "version" in item ? item.version : undefined,
    value: "value" in item ? item.value : undefined,
  };
}

function sourceKindLabel(kind: api.ComponentSourceKind) {
  switch (kind) {
    case "System":
      return "system";
    case "Local":
      return "local";
    case "Runtime":
      return "runtime";
    case "App":
      return "app";
    case "Bundle":
      return "bundle";
    case "Synthetic":
      return "synthetic";
  }
}

function sourceColor(kind: api.ComponentSourceKind) {
  switch (kind) {
    case "System":
      return "bg-primary-muted text-primary ring-primary/30";
    case "Local":
      return "bg-warning-surface text-warning ring-warning/30";
    case "Runtime":
      return "bg-info-surface text-info ring-info/30";
    case "App":
      return "bg-success-surface text-success ring-success/30";
    case "Bundle":
      return "bg-elevation-2 text-foreground-muted ring-divider";
    case "Synthetic":
      return "bg-elevation-2 text-foreground-muted ring-divider";
  }
}
