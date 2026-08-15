import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useMemo, useState } from "react";
import {
  AppsApi,
  installAppBundleFromUrl,
  uploadAppBundle,
} from "./features/apps/api";
import { AppsPage } from "./features/apps/AppsPage";
import { appQuery, appsQuery } from "./features/apps/queries";
import { ComponentsPage } from "./features/components/ComponentsPage";
import { componentsQuery } from "./features/components/queries";
import { ActiveOperation } from "./features/jobs/ActiveOperation";
import { JobsPage } from "./features/jobs/JobsPage";
import { jobsQuery } from "./features/jobs/queries";
import { useJobTracking } from "./features/jobs/useJobTracking";
import { InsecureDaemonWarning } from "./features/shell/InsecureDaemonWarning";
import { TopNav } from "./features/shell/TopNav";
import { subscribeServerEvents } from "./features/shell/api";
import { daemonInfoQuery } from "./features/shell/queries";
import { useTabRouter } from "./features/shell/tabRouter";
import { initialTheme, storeTheme } from "./features/shell/theme";
import type { Theme } from "./features/shell/types";
import { SystemPage } from "./features/system/SystemPage";
import {
  installSystemUpdateFromUrl,
  SystemApi,
  uploadSystemUpdate,
} from "./features/system/api";
import { systemInfoQuery } from "./features/system/queries";
import type { api } from "./generated";
import { ErrorBanner } from "./shared/components/ErrorBanner";
import { errorMessage } from "./shared/lib/errors";

export function App() {
  const queryClient = useQueryClient();
  const { tab, navigate: navigateToTab } = useTabRouter();
  const [selectedApp, setSelectedApp] = useState<string>();
  const [dismissedResourceError, setDismissedResourceError] = useState(0);
  const [dismissedAppInfoError, setDismissedAppInfoError] = useState(0);
  const [serverEventError, setServerEventError] = useState<string>();
  const [operationError, setOperationError] = useState<string>();
  const [manuallyRefreshing, setManuallyRefreshing] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [theme, setTheme] = useState<Theme>(() => initialTheme());

  const daemonResult = useQuery(daemonInfoQuery);
  const systemResult = useQuery(systemInfoQuery);
  const componentsResult = useQuery(componentsQuery);
  const appsResult = useQuery(appsQuery);
  const appInfoResult = useQuery(appQuery(selectedApp));
  const jobsResult = useQuery(jobsQuery);
  const daemonInfo = daemonResult.data;
  const system = systemResult.data;
  const components = componentsResult.data;
  const appsList = appsResult.data?.apps;
  const appInfo = appInfoResult.data;
  const jobsList = jobsResult.data?.jobs;
  const {
    createPendingJob,
    discardPendingJob,
    latestJob,
    latestJobId,
    latestLog,
    openJob,
    pendingJobs,
    selectedJob,
    selectedJobId,
    selectedLog,
    trackJob,
    updatePendingUpload,
  } = useJobTracking(jobsList, setOperationError);

  const resourceFailures = [
    ["daemon policy", daemonResult.error, daemonResult.errorUpdatedAt],
    ["system information", systemResult.error, systemResult.errorUpdatedAt],
    [
      "component information",
      componentsResult.error,
      componentsResult.errorUpdatedAt,
    ],
    ["applications", appsResult.error, appsResult.errorUpdatedAt],
    ["job history", jobsResult.error, jobsResult.errorUpdatedAt],
  ] as const;
  const failedResources = resourceFailures.filter(([, error]) => error);
  const resourceError = failedResources
    .map(([label, error]) => `Failed to load ${label}: ${errorMessage(error)}`)
    .join("\n");
  const resourceErrorVersion = Math.max(
    0,
    ...failedResources.map(([, , updatedAt]) => updatedAt),
  );
  const appInfoError = appInfoResult.error
    ? `Failed to load ${selectedApp}: ${errorMessage(appInfoResult.error)}`
    : undefined;

  const selectedSummary = useMemo(
    () => appsList?.find((app) => app.name === selectedApp),
    [appsList, selectedApp],
  );
  const pageLabel = `${tab[0].toUpperCase()}${tab.slice(1)}`;

  async function refresh() {
    setManuallyRefreshing(true);
    setDismissedResourceError(0);
    try {
      await queryClient.invalidateQueries();
    } finally {
      setManuallyRefreshing(false);
    }
  }

  useEffect(() => {
    if (appsList === undefined) return;
    if (selectedApp && !appsList.some((app) => app.name === selectedApp)) {
      setSelectedApp(undefined);
    }
  }, [appsList, selectedApp]);

  useEffect(() => {
    document.documentElement.classList.toggle("dark", theme === "dark");
    storeTheme(theme);
  }, [theme]);

  useEffect(() => {
    const source = subscribeServerEvents(
      () => {
        void queryClient.invalidateQueries();
      },
      (error) => setServerEventError(error ? errorMessage(error) : undefined),
    );
    return () => source.close();
  }, [queryClient]);

  async function runSystemAction(
    action: api.SystemAction,
    query?: api.SystemActionOptions,
  ) {
    if (submitting) return;
    setSubmitting(true);
    setOperationError(undefined);
    try {
      const response = await SystemApi.action(action, query);
      trackJob(response.job);
    } catch (error) {
      setOperationError(errorMessage(error));
    } finally {
      setSubmitting(false);
    }
  }

  async function runAppAction(
    app: string,
    action: api.AppAction,
    query?: api.AppActionOptions,
  ) {
    if (submitting) return;
    setSubmitting(true);
    setOperationError(undefined);
    try {
      const response = await AppsApi.action(app, action, query);
      trackJob(response.job);
    } catch (error) {
      setOperationError(errorMessage(error));
    } finally {
      setSubmitting(false);
    }
  }

  async function garbageCollectApps(
    keep: NonNullable<api.AppGarbageCollectionOptions["keep"]>,
  ) {
    if (submitting) return;
    setSubmitting(true);
    setOperationError(undefined);
    try {
      const response = await AppsApi.garbageCollect({ keep });
      trackJob(response.job);
    } catch (error) {
      setOperationError(errorMessage(error));
    } finally {
      setSubmitting(false);
    }
  }

  async function upload(
    kind: "system" | "app",
    file: File,
    options: api.SystemInstallOptions,
  ) {
    if (submitting) return;
    setSubmitting(true);
    setOperationError(undefined);
    let jobId: string | undefined;
    try {
      const pendingJobId = createPendingJob();
      jobId = pendingJobId;
      const job =
        kind === "system"
          ? await uploadSystemUpdate(pendingJobId, file, options, (sent, total) =>
              updatePendingUpload(pendingJobId, sent, total),
            )
          : await uploadAppBundle(pendingJobId, file, options, (sent, total) =>
              updatePendingUpload(pendingJobId, sent, total),
            );
      trackJob(job);
    } catch (error) {
      setOperationError(errorMessage(error));
      if (jobId) discardPendingJob(jobId);
    } finally {
      setSubmitting(false);
    }
  }

  async function installUrl(
    kind: "system" | "app",
    url: string,
    options: api.SystemInstallOptions,
  ) {
    if (submitting) return;
    setSubmitting(true);
    setOperationError(undefined);
    let jobId: string | undefined;
    try {
      const pendingJobId = createPendingJob();
      jobId = pendingJobId;
      const job = await (kind === "system"
        ? installSystemUpdateFromUrl(pendingJobId, url, options)
        : installAppBundleFromUrl(pendingJobId, url, options));
      trackJob(job);
    } catch (error) {
      setOperationError(errorMessage(error));
      if (jobId) discardPendingJob(jobId);
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="mesh-gradient min-h-screen bg-elevation-0 text-foreground">
      <TopNav
        tab={tab}
        theme={theme}
        pendingJobs={pendingJobs}
        onThemeChange={setTheme}
        refreshing={manuallyRefreshing}
        onRefresh={() => {
          setOperationError(undefined);
          void refresh();
        }}
      />

      <main
        className="mx-auto max-w-[1520px] space-y-5 px-4 py-5 sm:px-6 lg:px-8"
        aria-label={pageLabel}
        aria-busy={manuallyRefreshing || submitting}
      >
        {tab === "jobs" && <h1 className="sr-only">{pageLabel}</h1>}
        {daemonInfo?.dangerouslyInsecure && <InsecureDaemonWarning />}
        {resourceError && resourceErrorVersion !== dismissedResourceError && (
          <ErrorBanner
            message={resourceError}
            onDismiss={() => setDismissedResourceError(resourceErrorVersion)}
          />
        )}
        {serverEventError && (
          <ErrorBanner
            message={serverEventError}
            onDismiss={() => setServerEventError(undefined)}
          />
        )}
        {operationError && (
          <ErrorBanner
            message={operationError}
            onDismiss={() => setOperationError(undefined)}
          />
        )}
        {tab === "apps" &&
          appInfoError &&
          appInfoResult.errorUpdatedAt !== dismissedAppInfoError && (
            <ErrorBanner
              message={appInfoError}
              onDismiss={() =>
                setDismissedAppInfoError(appInfoResult.errorUpdatedAt)
              }
            />
          )}
        {latestJobId && (
          <ActiveOperation
            jobId={latestJobId}
            job={latestJob}
            log={latestLog}
            onOpen={() => {
              navigateToTab("jobs");
              openJob(latestJobId);
            }}
          />
        )}

        {tab === "system" && (
          <SystemPage
            system={system}
            dangerouslyInsecure={daemonInfo?.dangerouslyInsecure ?? false}
            features={daemonInfo?.features}
            loading={systemResult.isPending}
            busy={submitting}
            onAction={(action, query) => void runSystemAction(action, query)}
            onUpload={(file, options) => void upload("system", file, options)}
            onUrlInstall={(url, options) =>
              void installUrl("system", url, options)
            }
          />
        )}
        {tab === "components" && (
          <ComponentsPage
            report={components}
            loading={componentsResult.isPending}
          />
        )}
        {tab === "apps" && (
          <AppsPage
            apps={appsList}
            loading={appsResult.isPending}
            infoLoading={appInfoResult.isFetching}
            busy={submitting}
            dangerouslyInsecure={daemonInfo?.dangerouslyInsecure ?? false}
            appLifecycleEnabled={daemonInfo?.features.appLifecycle ?? false}
            selected={selectedSummary}
            info={appInfo}
            onSelect={setSelectedApp}
            onUpload={(file, options) => void upload("app", file, options)}
            onUrlInstall={(url, options) =>
              void installUrl("app", url, options)
            }
            onAction={(app, action, query) =>
              void runAppAction(app, action, query)
            }
            onGarbageCollect={(keep) => void garbageCollectApps(keep)}
          />
        )}
        {tab === "jobs" && (
          <JobsPage
            jobs={jobsList}
            loading={jobsResult.isPending}
            selected={selectedJobId}
            log={selectedLog}
            selectedJob={selectedJob}
            onSelect={openJob}
          />
        )}
      </main>
    </div>
  );
}
