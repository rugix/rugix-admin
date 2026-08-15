import { ChevronDown } from "lucide-react";
import { useEffect, useState } from "react";
import type { api } from "../../generated";
import { Input } from "../../shared/components/Input";
import { Notice } from "../../shared/components/Notice";
import { classes } from "../../shared/lib/classes";
import { parseU32, parseU64 } from "../../shared/lib/numbers";
import { fieldClass } from "../../shared/styles";

type BundleSource = "file" | "url";

type InstallOptionValues = {
  bundleHash: string;
  rootCert: string;
  skipVerification: boolean;
  allowMissingIndex: boolean;
  skipCompatibilityCheck: boolean;
  reboot: api.SystemInstallOptions["reboot"];
  bootGroup: string;
  keepOverlay: boolean;
  disableRangeQueries: boolean;
  httpMaxRetries: string;
  httpInitialBackoff: string;
  httpMaxBackoff: string;
};

export function useInstallOptions({
  source,
  system,
  dangerouslyInsecure,
  systemRebootEnabled,
}: {
  source: BundleSource;
  system?: boolean;
  dangerouslyInsecure: boolean;
  systemRebootEnabled?: boolean;
}) {
  const [values, setValues] = useState<InstallOptionValues>(() => ({
    bundleHash: "",
    rootCert: "",
    skipVerification: dangerouslyInsecure,
    allowMissingIndex: false,
    skipCompatibilityCheck: false,
    reboot: system && systemRebootEnabled ? "yes" : undefined,
    bootGroup: "",
    keepOverlay: false,
    disableRangeQueries: false,
    httpMaxRetries: "",
    httpInitialBackoff: "",
    httpMaxBackoff: "",
  }));

  useEffect(() => {
    if (dangerouslyInsecure) {
      setValues((current) => ({ ...current, skipVerification: true }));
    }
  }, [dangerouslyInsecure]);

  useEffect(() => {
    if (system && systemRebootEnabled) {
      setValues((current) => ({
        ...current,
        reboot: current.reboot ?? "yes",
      }));
    }
  }, [system, systemRebootEnabled]);

  const http = parseHttpOptions(
    values.httpMaxRetries,
    values.httpInitialBackoff,
    values.httpMaxBackoff,
  );
  const options: api.SystemInstallOptions = {
    bundleHash: dangerouslyInsecure ? nonEmpty(values.bundleHash) : undefined,
    rootCert: dangerouslyInsecure ? nonEmpty(values.rootCert) : undefined,
    insecureSkipBundleVerification: dangerouslyInsecure
      ? values.skipVerification
      : undefined,
    insecureAllowMissingBlockIndex: dangerouslyInsecure
      ? values.allowMissingIndex
      : undefined,
    skipCompatibilityCheck: dangerouslyInsecure
      ? values.skipCompatibilityCheck
      : undefined,
    reboot: system ? values.reboot : undefined,
    bootGroup: system ? nonEmpty(values.bootGroup) : undefined,
    keepOverlay: system ? values.keepOverlay : undefined,
    disableRangeQueries:
      system && source === "url" ? values.disableRangeQueries : undefined,
    ...http.options,
  };

  function update<K extends keyof InstallOptionValues>(
    key: K,
    value: InstallOptionValues[K],
  ) {
    setValues((current) => ({ ...current, [key]: value }));
  }

  return { httpError: http.error, options, update, values };
}

export function InstallAdvancedOptions({
  source,
  system,
  dangerouslyInsecure,
  systemRebootEnabled,
  controls,
}: {
  source: BundleSource;
  system?: boolean;
  dangerouslyInsecure: boolean;
  systemRebootEnabled?: boolean;
  controls: ReturnType<typeof useInstallOptions>;
}) {
  const { httpError, update, values } = controls;

  return (
    <details className="group border-t border-divider pt-3">
      <summary className="flex cursor-pointer list-none items-center justify-between text-sm font-medium text-foreground-muted transition hover:text-foreground">
        Advanced
        <ChevronDown
          aria-hidden="true"
          size={16}
          className="transition group-open:rotate-180"
        />
      </summary>
      <div className="mt-4 space-y-4">
        {dangerouslyInsecure && (
          <section className="space-y-3">
            <h3 className="text-xs font-semibold uppercase tracking-wide text-foreground-subtle">
              Security overrides
            </h3>
            <Notice tone="danger">
              These overrides weaken bundle verification or compatibility
              enforcement.
            </Notice>
            <div className="grid gap-3 md:grid-cols-2">
              <Input
                label="Bundle hash"
                value={values.bundleHash}
                onChange={(value) => update("bundleHash", value)}
              />
              <Input
                label="Root certificate"
                value={values.rootCert}
                onChange={(value) => update("rootCert", value)}
              />
            </div>
            <div className="grid gap-3 md:grid-cols-3">
              <CheckOption
                label="Skip bundle verification"
                checked={values.skipVerification}
                onChange={(value) => update("skipVerification", value)}
              />
              <CheckOption
                label="Allow missing block index"
                checked={values.allowMissingIndex}
                onChange={(value) => update("allowMissingIndex", value)}
              />
              <CheckOption
                label="Skip compatibility check"
                checked={values.skipCompatibilityCheck}
                onChange={(value) => update("skipCompatibilityCheck", value)}
              />
            </div>
          </section>
        )}
        {system && (
          <section
            className={classes(
              "space-y-3",
              dangerouslyInsecure && "border-t border-divider pt-4",
            )}
          >
            <h3 className="text-xs font-semibold uppercase tracking-wide text-foreground-subtle">
              System update
            </h3>
            <div className="grid gap-3 md:grid-cols-2">
              <label className="block">
                <span className="mb-1 block text-sm font-medium text-foreground-muted">
                  After installation
                </span>
                <select
                  className={fieldClass}
                  value={values.reboot ?? ""}
                  onChange={(event) =>
                    update(
                      "reboot",
                      event.target.value === ""
                        ? undefined
                        : (event.target
                            .value as api.SystemInstallOptions["reboot"]),
                    )
                  }
                >
                  {!systemRebootEnabled && (
                    <option value="">Use bundle default</option>
                  )}
                  {systemRebootEnabled && (
                    <option value="yes">Reboot immediately</option>
                  )}
                  <option value="set">Switch on next reboot</option>
                  {systemRebootEnabled && (
                    <option value="deferred">Schedule for the next boot</option>
                  )}
                  <option value="no">Install without switching</option>
                </select>
              </label>
              <Input
                label="Boot group"
                value={values.bootGroup}
                onChange={(value) => update("bootGroup", value)}
              />
              <div className="md:col-span-2">
                <CheckOption
                  label="Keep target overlay"
                  checked={values.keepOverlay}
                  onChange={(value) => update("keepOverlay", value)}
                />
              </div>
            </div>
          </section>
        )}
        {source === "url" && (
          <section
            className={classes(
              "space-y-3",
              (dangerouslyInsecure || system) &&
                "border-t border-divider pt-4",
            )}
          >
            <h3 className="text-xs font-semibold uppercase tracking-wide text-foreground-subtle">
              HTTP download
            </h3>
            {system && (
              <CheckOption
                label="Disable range requests"
                checked={values.disableRangeQueries}
                onChange={(value) => update("disableRangeQueries", value)}
              />
            )}
            <div className="grid gap-3 md:grid-cols-3">
              <Input
                label="Maximum retries"
                value={values.httpMaxRetries}
                onChange={(value) => update("httpMaxRetries", value)}
                type="number"
                min="0"
              />
              <Input
                label="Initial backoff (seconds)"
                value={values.httpInitialBackoff}
                onChange={(value) => update("httpInitialBackoff", value)}
                type="number"
                min="0"
              />
              <Input
                label="Maximum backoff (seconds)"
                value={values.httpMaxBackoff}
                onChange={(value) => update("httpMaxBackoff", value)}
                type="number"
                min="0"
              />
            </div>
            {httpError && (
              <div className="text-sm text-danger" role="alert">
                {httpError}
              </div>
            )}
          </section>
        )}
      </div>
    </details>
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

function parseHttpOptions(
  maxRetries: string,
  initialBackoff: string,
  maxBackoff: string,
) {
  const retries = maxRetries === "" ? undefined : parseU32(maxRetries);
  const initialValue =
    initialBackoff === "" ? undefined : parseU64(initialBackoff);
  const maximumValue = maxBackoff === "" ? undefined : parseU64(maxBackoff);
  if (
    (maxRetries !== "" && retries === undefined) ||
    (initialBackoff !== "" && initialValue === undefined) ||
    (maxBackoff !== "" && maximumValue === undefined)
  ) {
    return {
      options: {},
      error:
        "HTTP retry values must be non-negative integers within their supported ranges.",
    };
  }
  const initial = initialBackoff === "" ? 1 : Number(initialBackoff);
  const maximum = maxBackoff === "" ? 30 : Number(maxBackoff);
  if (initial > maximum) {
    return {
      options: {},
      error: "Initial retry backoff must not exceed the maximum.",
    };
  }
  return {
    options: {
      httpMaxRetries: retries,
      httpRetryInitialBackoff: initialValue,
      httpRetryMaxBackoff: maximumValue,
    },
    error: undefined,
  };
}

function nonEmpty(value: string) {
  return value.trim() || undefined;
}
