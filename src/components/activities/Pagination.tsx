import Link from "next/link";

type Props = {
  currentPage: number;
  totalPages: number;
  total: number;
  basePath: string;
};

// Paginador minimalista: contador a la izquierda, prev/next a la derecha.
// Comparte la línea base de los CTA del design system (h-10 px-4 rounded-xl)
// para alinear con el resto del admin. Si totalPages ≤ 1, no se renderiza.
export function Pagination({ currentPage, totalPages, total, basePath }: Props) {
  if (totalPages <= 1) return null;

  const isFirst = currentPage <= 1;
  const isLast = currentPage >= totalPages;

  const prevHref = `${basePath}?page=${Math.max(1, currentPage - 1)}`;
  const nextHref = `${basePath}?page=${Math.min(totalPages, currentPage + 1)}`;

  return (
    <nav
      className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between rounded-2xl border border-soft bg-surface-secondary px-6 py-4"
      aria-label="Paginación de actividades"
    >
      <p className="text-body text-text-secondary tabular-nums">
        Página <span className="text-text-primary font-medium">{currentPage}</span>{" "}
        de{" "}
        <span className="text-text-primary font-medium">{totalPages}</span>
        <span className="mx-2 text-text-tertiary">·</span>
        <span className="text-text-primary font-medium">{total}</span>{" "}
        actividades
      </p>
      <div className="flex items-center gap-2">
        {isFirst ? (
          <span
            aria-disabled="true"
            className="btn-secondary opacity-40 cursor-not-allowed select-none"
          >
            ← Anterior
          </span>
        ) : (
          <Link href={prevHref} className="btn-secondary">
            ← Anterior
          </Link>
        )}
        {isLast ? (
          <span
            aria-disabled="true"
            className="btn-secondary opacity-40 cursor-not-allowed select-none"
          >
            Siguiente →
          </span>
        ) : (
          <Link href={nextHref} className="btn-secondary">
            Siguiente →
          </Link>
        )}
      </div>
    </nav>
  );
}
