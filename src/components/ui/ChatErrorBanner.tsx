// Banner de error genérico para chats / flujos agentic.
// Muestra mensaje user-friendly + botón "Reintentar". El error técnico real se
// loguea a consola desde el caller — nunca lo mostramos al usuario porque
// los mensajes nativos de fetch ("NetworkError when attempting to fetch
// resource", stack traces, etc.) no aportan valor y rompen el tono del producto.

type Props = {
  onRetry?: () => void;
  /** Override del mensaje. Si no se pasa, usa el genérico. */
  message?: string;
  /** Texto del botón. Default "Reintentar". */
  retryLabel?: string;
};

const DEFAULT_MESSAGE =
  "Algo no salió bien procesando tu pedido. Reintentá en unos segundos.";

export function ChatErrorBanner({
  onRetry,
  message = DEFAULT_MESSAGE,
  retryLabel = "Reintentar",
}: Props) {
  return (
    <div
      role="alert"
      className="
        bg-warning-bg/40 border border-warning-border/40
        text-warning rounded-md p-4
        flex items-start gap-3
        animate-fade-in
      "
    >
      <AlertIcon />
      <div className="flex-1 space-y-3 min-w-0">
        <p className="text-body">{message}</p>
        {onRetry && (
          <button
            type="button"
            onClick={onRetry}
            className="
              h-8 px-3 rounded-full
              bg-transparent border border-warning-border/60
              text-warning text-btn font-medium
              hover:bg-warning-bg/60
              transition-colors
            "
          >
            {retryLabel}
          </button>
        )}
      </div>
    </div>
  );
}

function AlertIcon() {
  return (
    <svg
      width="18"
      height="18"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      className="shrink-0 mt-0.5"
      aria-hidden="true"
    >
      <path d="M10.29 3.86 1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0Z" />
      <line x1="12" y1="9" x2="12" y2="13" />
      <line x1="12" y1="17" x2="12.01" y2="17" />
    </svg>
  );
}
