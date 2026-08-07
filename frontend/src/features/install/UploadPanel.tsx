import { ChevronDown, Link, Upload } from "lucide-react";
import { useState, type ReactNode } from "react";
import type { InstallOptions } from "../../api";
import { Input } from "../../shared/components/Input";
import { Notice } from "../../shared/components/Notice";
import { Surface } from "../../shared/components/Surface";
import { classes } from "../../shared/lib/classes";
import { formatBytes } from "../../shared/lib/format";
import { isNonNegativeInteger } from "../../shared/lib/numbers";
import { buttonClass, fieldClass, primaryButtonClass } from "../../shared/styles";

export function UploadPanel({
  title,
  fileLabel,
  icon,
  system,
  allowUrl,
  dangerouslyInsecure,
  systemRebootEnabled,
  onUpload,
  onUrlInstall,
  busy,
}: {
  title: string;
  fileLabel: string;
  icon: ReactNode;
  system?: boolean;
  allowUrl?: boolean;
  dangerouslyInsecure: boolean;
  systemRebootEnabled?: boolean;
  onUpload: (file: File, options: InstallOptions) => void;
  onUrlInstall?: (url: string, options: InstallOptions) => void;
  busy: boolean;
}) {
  const [source, setSource] = useState<"file" | "url">("file");
  const [file, setFile] = useState<File>();
  const [url, setUrl] = useState("");
  const [bundleHash, setBundleHash] = useState("");
  const [rootCert, setRootCert] = useState("");
  const [skipVerification, setSkipVerification] = useState(false);
  const [allowMissingIndex, setAllowMissingIndex] = useState(false);
  const [skipCompatibilityCheck, setSkipCompatibilityCheck] = useState(false);
  const [reboot, setReboot] = useState<InstallOptions["reboot"]>("no");
  const [bootGroup, setBootGroup] = useState("");
  const [keepOverlay, setKeepOverlay] = useState(false);
  const [disableRangeQueries, setDisableRangeQueries] = useState(false);
  const [httpMaxRetries, setHttpMaxRetries] = useState("");
  const [httpInitialBackoff, setHttpInitialBackoff] = useState("");
  const [httpMaxBackoff, setHttpMaxBackoff] = useState("");
  const parsedHttpOptions = parseHttpOptions(
    httpMaxRetries,
    httpInitialBackoff,
    httpMaxBackoff,
  );
  const validUrl = source !== "url" || isHttpUrl(url);
  const options: InstallOptions = {
    bundleHash: dangerouslyInsecure ? nonEmpty(bundleHash) : undefined,
    rootCert: dangerouslyInsecure ? nonEmpty(rootCert) : undefined,
    insecureSkipBundleVerification: dangerouslyInsecure ? skipVerification : undefined,
    insecureAllowMissingBlockIndex: dangerouslyInsecure ? allowMissingIndex : undefined,
    skipCompatibilityCheck: dangerouslyInsecure ? skipCompatibilityCheck : undefined,
    reboot: system ? reboot : undefined,
    bootGroup: system ? nonEmpty(bootGroup) : undefined,
    keepOverlay: system ? keepOverlay : undefined,
    disableRangeQueries: system && source === "url" ? disableRangeQueries : undefined,
    ...parsedHttpOptions.options,
  };
  const canInstall =
    (source === "file" ? !!file : validUrl) && parsedHttpOptions.error === undefined;

  return (
    <Surface title={title} icon={icon}>
      <div className="space-y-4">
        {allowUrl && (
          <div className="grid grid-cols-2 gap-2" role="group" aria-label="Bundle source">
            <button
              type="button"
              className={source === "file" ? primaryButtonClass : buttonClass}
              aria-pressed={source === "file"}
              onClick={() => setSource("file")}
            >
              <Upload size={16} /> File
            </button>
            <button
              type="button"
              className={source === "url" ? primaryButtonClass : buttonClass}
              aria-pressed={source === "url"}
              onClick={() => setSource("url")}
            >
              <Link size={16} /> URL
            </button>
          </div>
        )}

        {source === "file" ? (
          <label className="block">
            <input
              className="sr-only"
              type="file"
              onChange={(event) => setFile(event.target.files?.[0])}
            />
            <span className="flex min-h-24 cursor-pointer items-center justify-between gap-4 rounded-lg border border-dashed border-frame bg-elevation-0 px-4 py-3 transition hover:border-primary hover:bg-primary-muted">
              <span className="min-w-0">
                <span
                  className={classes(
                    "block text-sm font-medium text-foreground",
                    file && "font-mono",
                  )}
                >
                  {file?.name ?? fileLabel}
                </span>
                <span
                  className={classes(
                    "mt-1 block truncate text-xs text-foreground-muted",
                    file && "font-mono",
                  )}
                >
                  {file ? formatBytes(file.size) : "No file selected"}
                </span>
              </span>
              <span className="inline-flex h-9 shrink-0 items-center justify-center gap-2 rounded-md bg-primary px-3 text-sm font-medium text-primary-content">
                <Upload size={16} /> Choose
              </span>
            </span>
          </label>
        ) : (
          <label className="block">
            <span className="mb-1 block text-sm font-medium text-foreground-muted">
              {system ? "Update URL" : "Bundle URL"}
            </span>
            <input
              className={fieldClass}
              type="url"
              value={url}
              aria-invalid={url.trim() !== "" && !validUrl}
              onChange={(event) => setUrl(event.target.value)}
              placeholder="https://example.com/bundle.rugixb"
            />
            {url.trim() !== "" && !validUrl && (
              <span className="mt-1 block text-xs text-danger">Enter an absolute HTTP or HTTPS URL.</span>
            )}
          </label>
        )}

        {(system || dangerouslyInsecure || source === "url") && (
          <details className="group border-t border-divider pt-3">
            <summary className="flex cursor-pointer list-none items-center justify-between text-sm font-medium text-foreground-muted transition hover:text-foreground">
              Advanced
              <ChevronDown size={16} className="transition group-open:rotate-180" />
            </summary>
            <div className="mt-3 grid gap-3 md:grid-cols-2">
              {dangerouslyInsecure && (
                <>
                  <div className="md:col-span-2">
                    <Notice tone="danger">
                      These overrides weaken bundle verification or compatibility enforcement.
                    </Notice>
                  </div>
                  <Input label="Bundle hash" value={bundleHash} onChange={setBundleHash} />
                  <Input label="Root certificate" value={rootCert} onChange={setRootCert} />
                  <CheckOption
                    label="Skip bundle verification"
                    checked={skipVerification}
                    onChange={setSkipVerification}
                  />
                  <CheckOption
                    label="Allow missing block index"
                    checked={allowMissingIndex}
                    onChange={setAllowMissingIndex}
                  />
                  <CheckOption
                    label="Skip compatibility check"
                    checked={skipCompatibilityCheck}
                    onChange={setSkipCompatibilityCheck}
                  />
                </>
              )}
              {system && (
                <>
                  <label className="block">
                    <span className="mb-1 block text-sm font-medium text-foreground-muted">
                      Reboot
                    </span>
                    <select
                      className={fieldClass}
                      value={reboot}
                      onChange={(event) =>
                        setReboot(event.target.value as InstallOptions["reboot"])
                      }
                    >
                      <option value="no">Do not change boot selection</option>
                      <option value="set">Select without rebooting</option>
                      {systemRebootEnabled && <option value="yes">Reboot immediately</option>}
                      {systemRebootEnabled && (
                        <option value="deferred">Select during the next boot</option>
                      )}
                    </select>
                  </label>
                  <Input label="Boot group" value={bootGroup} onChange={setBootGroup} />
                  <CheckOption
                    label="Keep target overlay"
                    checked={keepOverlay}
                    onChange={setKeepOverlay}
                  />
                </>
              )}
              {source === "url" && (
                <>
                  <div className="md:col-span-2 text-xs font-semibold uppercase tracking-wide text-foreground-subtle">
                    HTTP Retries
                  </div>
                  {system && (
                    <CheckOption
                      label="Disable range requests"
                      checked={disableRangeQueries}
                      onChange={setDisableRangeQueries}
                    />
                  )}
                  <Input
                    label="Maximum retries"
                    value={httpMaxRetries}
                    onChange={setHttpMaxRetries}
                    type="number"
                    min="0"
                  />
                  <Input
                    label="Initial backoff (seconds)"
                    value={httpInitialBackoff}
                    onChange={setHttpInitialBackoff}
                    type="number"
                    min="0"
                  />
                  <Input
                    label="Maximum backoff (seconds)"
                    value={httpMaxBackoff}
                    onChange={setHttpMaxBackoff}
                    type="number"
                    min="0"
                  />
                  {parsedHttpOptions.error && (
                    <div className="text-sm text-danger md:col-span-2" role="alert">
                      {parsedHttpOptions.error}
                    </div>
                  )}
                </>
              )}
            </div>
          </details>
        )}

        <div className="flex justify-end">
          <button
            className={primaryButtonClass}
            disabled={!canInstall || busy}
            onClick={() => {
              if (source === "file" && file) {
                onUpload(file, options);
              } else if (source === "url" && validUrl) {
                onUrlInstall?.(url.trim(), options);
              }
            }}
          >
            <Upload size={16} /> {busy ? "Starting…" : "Install"}
          </button>
        </div>
      </div>
    </Surface>
  );
}

function CheckOption({
  label,
  checked,
  onChange,
}: {
  label: string;
  checked: boolean;
  onChange: (checked: boolean) => void;
}) {
  return (
    <label className="inline-flex items-center gap-2 text-sm text-foreground-muted">
      <input
        className="size-4 accent-primary"
        type="checkbox"
        checked={checked}
        onChange={(event) => onChange(event.target.checked)}
      />
      {label}
    </label>
  );
}

function parseHttpOptions(maxRetries: string, initialBackoff: string, maxBackoff: string) {
  const values = [maxRetries, initialBackoff, maxBackoff];
  if (values.some((value) => value !== "" && !isNonNegativeInteger(value))) {
    return { options: {}, error: "HTTP retry values must be non-negative integers." };
  }
  const initial = initialBackoff === "" ? 1 : Number(initialBackoff);
  const maximum = maxBackoff === "" ? 30 : Number(maxBackoff);
  if (initial > maximum) {
    return { options: {}, error: "Initial retry backoff must not exceed the maximum." };
  }
  return {
    options: {
      httpMaxRetries: maxRetries === "" ? undefined : Number(maxRetries),
      httpRetryInitialBackoff: initialBackoff === "" ? undefined : initial,
      httpRetryMaxBackoff: maxBackoff === "" ? undefined : maximum,
    },
  };
}

function isHttpUrl(value: string) {
  try {
    const url = new URL(value.trim());
    return url.protocol === "http:" || url.protocol === "https:";
  } catch {
    return false;
  }
}

function nonEmpty(value: string) {
  return value.trim() || undefined;
}
