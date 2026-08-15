import { Link, Upload } from "lucide-react";
import { useState } from "react";
import type { api } from "../../generated";
import { classes } from "../../shared/lib/classes";
import { formatBytes } from "../../shared/lib/format";
import {
  buttonClass,
  fieldClass,
  primaryButtonClass,
} from "../../shared/styles";
import {
  InstallAdvancedOptions,
  useInstallOptions,
} from "./InstallAdvancedOptions";

export function UploadPanel({
  fileLabel,
  system,
  allowUrl,
  dangerouslyInsecure,
  systemRebootEnabled,
  onStarted,
  onUpload,
  onUrlInstall,
  busy,
}: {
  fileLabel: string;
  system?: boolean;
  allowUrl?: boolean;
  dangerouslyInsecure: boolean;
  systemRebootEnabled?: boolean;
  onStarted?: () => void;
  onUpload: (file: File, options: api.SystemInstallOptions) => void;
  onUrlInstall?: (url: string, options: api.SystemInstallOptions) => void;
  busy: boolean;
}) {
  const [source, setSource] = useState<"file" | "url">("file");
  const [file, setFile] = useState<File>();
  const [url, setUrl] = useState("");
  const optionControls = useInstallOptions({
    source,
    system,
    dangerouslyInsecure,
    systemRebootEnabled,
  });
  const validUrl = source !== "url" || isHttpUrl(url);
  const canInstall =
    (source === "file" ? !!file : validUrl) &&
    optionControls.httpError === undefined;

  return (
    <div className="space-y-4">
      {allowUrl && (
        <div
          className="grid grid-cols-2 gap-2"
          role="group"
          aria-label="Bundle source"
        >
          <button
            type="button"
            className={source === "file" ? primaryButtonClass : buttonClass}
            aria-pressed={source === "file"}
            onClick={() => setSource("file")}
          >
            <Upload aria-hidden="true" size={16} /> File
          </button>
          <button
            type="button"
            className={source === "url" ? primaryButtonClass : buttonClass}
            aria-pressed={source === "url"}
            onClick={() => setSource("url")}
          >
            <Link aria-hidden="true" size={16} /> URL
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
              <Upload aria-hidden="true" size={16} /> Choose
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
            <span className="mt-1 block text-xs text-danger">
              Enter an absolute HTTP or HTTPS URL.
            </span>
          )}
        </label>
      )}

      {(system || dangerouslyInsecure || source === "url") && (
        <InstallAdvancedOptions
          source={source}
          system={system}
          dangerouslyInsecure={dangerouslyInsecure}
          systemRebootEnabled={systemRebootEnabled}
          controls={optionControls}
        />
      )}

      <div className="flex justify-end">
        <button
          className={primaryButtonClass}
          disabled={!canInstall || busy}
          onClick={() => {
            if (source === "file" && file) {
              onUpload(file, optionControls.options);
              onStarted?.();
            } else if (source === "url" && validUrl && onUrlInstall) {
              onUrlInstall(url.trim(), optionControls.options);
              onStarted?.();
            }
          }}
        >
          {busy ? "Starting…" : "Install"}
        </button>
      </div>
    </div>
  );
}

function isHttpUrl(value: string) {
  try {
    const url = new URL(value.trim());
    return url.protocol === "http:" || url.protocol === "https:";
  } catch {
    return false;
  }
}
