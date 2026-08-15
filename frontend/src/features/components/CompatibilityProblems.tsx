import type { ReactNode } from "react";
import type { api } from "../../generated";
import { Badge } from "../../shared/components/Badge";
import { Surface } from "../../shared/components/Surface";
import { CodeText, sourceKindLabel } from "./presentation";

export function CompatibilityProblems({
  problems,
}: {
  problems: api.ComponentProblem[];
}) {
  if (problems.length === 0) return null;

  return (
    <Surface
      title="Compatibility problems"
      action={
        <Badge color="bg-danger-surface text-danger ring-danger/30">
          {problems.length}
        </Badge>
      }
      bodyClassName="p-0"
    >
      <div className="divide-y divide-divider">
        {problems.map((problem, index) => (
          <div key={index} className="space-y-2 px-4 py-3">
            <div className="flex flex-wrap items-center gap-2">
              <Badge color="bg-danger-surface text-danger ring-danger/30">
                {problemLabel(problem.kind)}
              </Badge>
              <span className="min-w-0 break-words text-sm font-medium">
                {problemTitle(problem)}
              </span>
            </div>
            <div className="break-words text-sm text-foreground-muted">
              {problemDescription(problem)}
            </div>
          </div>
        ))}
      </div>
    </Surface>
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
      return (
        <>
          Duplicate component <CodeText>{problem.id}</CodeText>
        </>
      );
    case "DuplicateClaim":
      return (
        <>
          Duplicate claim <CodeText>{problem.id}</CodeText>
        </>
      );
    case "UnsatisfiedRequirement":
      return (
        <>
          <CodeText>{problem.component.id}</CodeText> requires{" "}
          <CodeText>{selectorText(problem.selector)}</CodeText>
        </>
      );
    case "Conflict":
      return (
        <>
          <CodeText>{problem.component.id}</CodeText> conflicts with{" "}
          <CodeText>{problem.provider.id}</CodeText>
        </>
      );
  }
}

function problemDescription(problem: api.ComponentProblem) {
  switch (problem.kind) {
    case "DuplicateComponent":
      return (
        <>
          Declared by{" "}
          {joinNodes(
            problem.sources.map((source, index) => (
              <SourceSummary
                key={`${source.kind}:${source.path}:${index}`}
                source={source}
              />
            )),
          )}
          .
        </>
      );
    case "DuplicateClaim":
      return (
        <>
          Claimed by{" "}
          {joinNodes(
            problem.components.map((component, index) => (
              <ComponentRefSummary
                key={`${component.id}:${index}`}
                component={component}
              />
            )),
          )}
          .
        </>
      );
    case "UnsatisfiedRequirement":
      return (
        <>
          No loaded component provides{" "}
          <CodeText>{selectorText(problem.selector)}</CodeText>.
        </>
      );
    case "Conflict":
      return (
        <>
          <CodeText>{problem.provider.id}</CodeText> provides{" "}
          <CodeText>{selectorText(problem.capability)}</CodeText>, matching{" "}
          <CodeText>{selectorText(problem.selector)}</CodeText>.
        </>
      );
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
            {" "}
            (generation{" "}
            <CodeText>{String(component.source.generation)}</CodeText>)
          </>
        )}
      </>
    );
  }
  return (
    <>
      <CodeText>{component.id}</CodeText> (
      <SourceSummary source={component.source} />)
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
            {" "}
            app <CodeText>{source.app}</CodeText>
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
  return <>{sourceKindLabel(source.kind)} component</>;
}

function selectorText(selector: api.Capability | api.CapabilitySelector) {
  const version = selector.version ? ` ${selector.version}` : "";
  const value = selector.value ? ` = ${selector.value}` : "";
  return `${selector.id}${version}${value}`;
}
