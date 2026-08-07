export function ErrorBanner({ message, onDismiss }: { message: string; onDismiss?: () => void }) {
  return (
    <div
      className="flex items-start justify-between gap-4 whitespace-pre-line rounded-lg border border-danger/30 bg-danger-surface px-4 py-3 text-sm text-danger"
      role="alert"
    >
      <span>{message}</span>
      {onDismiss && (
        <button className="shrink-0 font-medium underline underline-offset-4" onClick={onDismiss}>
          Dismiss
        </button>
      )}
    </div>
  );
}
