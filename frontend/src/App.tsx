import { useEffect, useMemo, useRef, useState } from "react";
import {
  AdminApi,
  installAppBundleFromUrl,
  installSystemUpdateFromUrl,
  subscribeJob,
  uploadAppBundle,
  uploadSystemUpdate,
} from "./api";
import { AppsPage } from "./features/apps/AppsPage";
import { ComponentsPage } from "./features/components/ComponentsPage";
import { ActiveOperation } from "./features/jobs/ActiveOperation";
import { applyEvent, isTerminal, updateBrowserProgress } from "./features/jobs/jobEvents";
import { JobsPage } from "./features/jobs/JobsPage";
import type { JobLog } from "./features/jobs/types";
import { InsecureDaemonWarning } from "./features/shell/InsecureDaemonWarning";
import { PageTitle } from "./features/shell/PageTitle";
import { TopNav } from "./features/shell/TopNav";
import { SystemPage } from "./features/system/SystemPage";
import type { api, jobs } from "./generated";
import { ErrorBanner } from "./shared/components/ErrorBanner";
import { errorMessage } from "./shared/lib/errors";
import { createJobId } from "./shared/lib/ids";
import { initialTheme, storeTheme } from "./shared/lib/theme";
import type { Tab, Theme } from "./types";

export function App() {
  const [tab, setTab] = useState<Tab>("system");
  const [daemonInfo, setDaemonInfo] = useState<api.DaemonInfoResponse>();
  const [system, setSystem] = useState<api.SystemInfoResponse>();
  const [components, setComponents] = useState<api.ComponentsCheckResponse>();
  const [appsList, setAppsList] = useState<api.AppSummary[]>();
  const [selectedApp, setSelectedApp] = useState<string>();
  const [appInfo, setAppInfo] = useState<api.AppInfoResponse>();
  const [jobsList, setJobsList] = useState<jobs.Job[]>();
  const [logs, setLogs] = useState<Record<string, JobLog>>({});
  const [activeJobId, setActiveJobId] = useState<string>();
  const [refreshErrors, setRefreshErrors] = useState<string[]>([]);
  const [appInfoError, setAppInfoError] = useState<string>();
  const [operationError, setOperationError] = useState<string>();
  const [refreshing, setRefreshing] = useState(false);
  const [appInfoLoading, setAppInfoLoading] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [theme, setTheme] = useState<Theme>(() => initialTheme());
  const refreshSequence = useRef(0);
  const appInfoSequence = useRef(0);
  const jobSources = useRef(new Map<string, EventSource>());
  const selectedAppRef = useRef(selectedApp);
  selectedAppRef.current = selectedApp;

  const activeLog = activeJobId ? logs[activeJobId] : undefined;
  const activeJob = activeLog?.job ?? jobsList?.find((job) => job.id === activeJobId);
  const pendingJobs = (jobsList ?? []).filter(
    (job) => job.status.status === "queued" || job.status.status === "running",
  );
  const selectedSummary = useMemo(
    () => appsList?.find((app) => app.name === selectedApp),
    [appsList, selectedApp],
  );

  async function refresh() {
    const sequence = ++refreshSequence.current;
    setRefreshing(true);
    setRefreshErrors([]);
    const [daemonPolicy, systemInfo, componentReport, appList, jobList] = await Promise.allSettled([
      AdminApi.daemonInfo(),
      AdminApi.systemInfo(),
      AdminApi.components(),
      AdminApi.apps(),
      AdminApi.jobs(),
    ]);
    if (sequence !== refreshSequence.current) return;

    setDaemonInfo(daemonPolicy.status === "fulfilled" ? daemonPolicy.value : undefined);
    setSystem(systemInfo.status === "fulfilled" ? systemInfo.value : undefined);
    setComponents(componentReport.status === "fulfilled" ? componentReport.value : undefined);
    setAppsList(appList.status === "fulfilled" ? appList.value.apps : undefined);
    if (appList.status === "rejected") {
      setSelectedApp(undefined);
      setAppInfo(undefined);
      setAppInfoError(undefined);
      setAppInfoLoading(false);
    }
    setJobsList(jobList.status === "fulfilled" ? jobList.value.jobs : undefined);
    const settledResources: Array<[string, PromiseSettledResult<unknown>]> = [
        ["daemon policy", daemonPolicy],
        ["system information", systemInfo],
        ["component information", componentReport],
        ["applications", appList],
        ["job history", jobList],
      ];
    setRefreshErrors(
      settledResources.flatMap(([label, result]) =>
        result.status === "rejected"
          ? [`Failed to load ${label}: ${errorMessage(result.reason)}`]
          : [],
      ),
    );
    setRefreshing(false);
  }

  async function refreshApp(app = selectedApp) {
    const sequence = ++appInfoSequence.current;
    if (!app) {
      setAppInfo(undefined);
      setAppInfoError(undefined);
      setAppInfoLoading(false);
      return;
    }
    setAppInfo(undefined);
    setAppInfoError(undefined);
    setAppInfoLoading(true);
    try {
      const info = await AdminApi.app(app);
      if (sequence === appInfoSequence.current) setAppInfo(info);
    } catch (error) {
      if (sequence === appInfoSequence.current) {
        setAppInfoError(`Failed to load ${app}: ${errorMessage(error)}`);
      }
    } finally {
      if (sequence === appInfoSequence.current) setAppInfoLoading(false);
    }
  }

  useEffect(() => {
    void refresh();
  }, []);

  useEffect(() => {
    if (appsList === undefined) return;
    if (appsList.length === 0) {
      setSelectedApp(undefined);
      return;
    }
    if (!selectedApp || !appsList.some((app) => app.name === selectedApp)) {
      setSelectedApp(appsList[0].name);
    }
  }, [appsList, selectedApp]);

  useEffect(() => {
    void refreshApp();
  }, [selectedApp]);

  useEffect(() => {
    document.documentElement.classList.toggle("dark", theme === "dark");
    storeTheme(theme);
  }, [theme]);

  useEffect(
    () => () => {
      for (const source of jobSources.current.values()) source.close();
      jobSources.current.clear();
    },
    [],
  );

  function watchJob(jobId: string) {
    setActiveJobId(jobId);
    if (jobSources.current.has(jobId)) return;
    const source = subscribeJob(jobId, (event) => {
      setLogs((current) => applyEvent(current, event));
      if (event.type === "job-changed") {
        setJobsList((current) => upsertJob(current ?? [], event.job));
      }
      if (event.type === "job-changed" && isTerminal(event.job.status)) {
        void refresh();
        void refreshApp(selectedAppRef.current);
        source.close();
        jobSources.current.delete(jobId);
      }
    }, (error) => {
      setOperationError(errorMessage(error));
    });
    jobSources.current.set(jobId, source);
  }

  function openJob(jobId: string) {
    watchJob(jobId);
  }

  function trackJob(job: jobs.Job) {
    setJobsList((current) => upsertJob(current ?? [], job));
    setLogs((current) => ({
      ...current,
      [job.id]: { ...(current[job.id] ?? { lines: [] }), job },
    }));
    watchJob(job.id);
  }

  async function runSystemAction(action: api.SystemAction, query?: api.SystemActionOptions) {
    if (submitting) return;
    setSubmitting(true);
    setOperationError(undefined);
    try {
      const response = await AdminApi.systemAction(action, query);
      trackJob(response.job);
    } catch (error) {
      setOperationError(errorMessage(error));
    } finally {
      setSubmitting(false);
    }
  }

  async function runAppAction(action: api.AppAction, query?: api.AppActionOptions) {
    if (!selectedApp) return;
    if (submitting) return;
    setSubmitting(true);
    setOperationError(undefined);
    try {
      const response = await AdminApi.appAction(selectedApp, action, query);
      trackJob(response.job);
    } catch (error) {
      setOperationError(errorMessage(error));
    } finally {
      setSubmitting(false);
    }
  }

  async function garbageCollectApps(keep: NonNullable<api.AppGarbageCollectionOptions["keep"]>) {
    if (submitting) return;
    setSubmitting(true);
    setOperationError(undefined);
    try {
      const response = await AdminApi.garbageCollectApps({ keep });
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
    const jobId = createJobId();
    if (submitting) return;
    setSubmitting(true);
    setOperationError(undefined);
    setLogs((current) => ({ ...current, [jobId]: { lines: [] } }));
    setActiveJobId(jobId);
    try {
      const job =
        kind === "system"
          ? await uploadSystemUpdate(jobId, file, options, (sent, total) =>
              setLogs((current) => updateBrowserProgress(current, jobId, sent, total)),
            )
          : await uploadAppBundle(jobId, file, options, (sent, total) =>
              setLogs((current) => updateBrowserProgress(current, jobId, sent, total)),
            );
      trackJob(job);
    } catch (error) {
      setOperationError(errorMessage(error));
      setActiveJobId(undefined);
      setLogs((current) => removeLog(current, jobId));
    } finally {
      setSubmitting(false);
    }
  }

  async function installUrl(
    kind: "system" | "app",
    url: string,
    options: api.SystemInstallOptions,
  ) {
    const jobId = createJobId();
    if (submitting) return;
    setSubmitting(true);
    setOperationError(undefined);
    setLogs((current) => ({ ...current, [jobId]: { lines: [] } }));
    setActiveJobId(jobId);
    try {
      const job = await (kind === "system"
        ? installSystemUpdateFromUrl(jobId, url, options)
        : installAppBundleFromUrl(jobId, url, options));
      trackJob(job);
    } catch (error) {
      setOperationError(errorMessage(error));
      setActiveJobId(undefined);
      setLogs((current) => removeLog(current, jobId));
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
        onTabChange={setTab}
        onThemeChange={setTheme}
        refreshing={refreshing}
        onRefresh={() => {
          setOperationError(undefined);
          void refresh();
        }}
      />

      <main
        className="mx-auto max-w-[1520px] space-y-5 px-4 py-5 sm:px-6 lg:px-8"
        aria-busy={refreshing || submitting}
      >
        {daemonInfo?.dangerouslyInsecure && <InsecureDaemonWarning />}
        <PageTitle tab={tab} />
        {refreshErrors.length > 0 && (
          <ErrorBanner message={refreshErrors.join("\n")} onDismiss={() => setRefreshErrors([])} />
        )}
        {operationError && (
          <ErrorBanner message={operationError} onDismiss={() => setOperationError(undefined)} />
        )}
        {tab === "apps" && appInfoError && (
          <ErrorBanner message={appInfoError} onDismiss={() => setAppInfoError(undefined)} />
        )}
        {activeJobId && (
          <ActiveOperation
            jobId={activeJobId}
            job={activeJob}
            log={activeLog}
            onOpen={() => {
              setTab("jobs");
              openJob(activeJobId);
            }}
          />
        )}

        {tab === "system" && (
          <SystemPage
            system={system}
            dangerouslyInsecure={daemonInfo?.dangerouslyInsecure ?? false}
            features={daemonInfo?.features}
            loading={refreshing}
            busy={submitting}
            onAction={(action, query) => void runSystemAction(action, query)}
            onUpload={(file, options) => void upload("system", file, options)}
            onUrlInstall={(url, options) => void installUrl("system", url, options)}
          />
        )}
        {tab === "components" && <ComponentsPage report={components} loading={refreshing} />}
        {tab === "apps" && (
          <AppsPage
            apps={appsList}
            loading={refreshing}
            infoLoading={appInfoLoading}
            busy={submitting}
            dangerouslyInsecure={daemonInfo?.dangerouslyInsecure ?? false}
            appLifecycleEnabled={daemonInfo?.features.appLifecycle ?? false}
            selected={selectedSummary}
            info={appInfo}
            onSelect={setSelectedApp}
            onUpload={(file, options) => void upload("app", file, options)}
            onUrlInstall={(url, options) => void installUrl("app", url, options)}
            onAction={(action, query) => void runAppAction(action, query)}
            onGarbageCollect={(keep) => void garbageCollectApps(keep)}
          />
        )}
        {tab === "jobs" && (
          <JobsPage
            jobs={jobsList}
            loading={refreshing}
            selected={activeJobId}
            log={activeLog}
            selectedJob={activeJob}
            onSelect={openJob}
          />
        )}
      </main>
    </div>
  );
}

function upsertJob(current: jobs.Job[], job: jobs.Job) {
  return [job, ...current.filter((candidate) => candidate.id !== job.id)];
}

function removeLog(current: Record<string, JobLog>, jobId: string) {
  const next = { ...current };
  delete next[jobId];
  return next;
}
