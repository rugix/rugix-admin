import type { events, jobs } from "../../generated";

export type JobLog = {
  job?: jobs.Job;
  lines: string[];
  notices?: JobNotice[];
  uploadedBytes?: events.UploadProgressEvent["bytes"];
  installProgress?: events.InstallProgressEvent["progress"];
  browserUpload?: { sent: number; total: number };
};

export type JobNotice = {
  tone: "info" | "warning" | "danger" | "success";
  title: string;
  message: string;
};
