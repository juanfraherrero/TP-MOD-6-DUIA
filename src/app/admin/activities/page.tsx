import Link from "next/link";
import { listActivities } from "@/lib/services/activity";
import { DeleteButton } from "@/components/activities/DeleteButton";
import { Pagination } from "@/components/activities/Pagination";

export const dynamic = "force-dynamic";

const PAGE_SIZE = 20;

type PageProps = {
  // Next.js 15: searchParams es Promise.
  searchParams: Promise<{ page?: string }>;
};

export default async function ActivitiesPage({ searchParams }: PageProps) {
  const sp = await searchParams;
  const parsedPage = Number(sp?.page);
  const page = Number.isFinite(parsedPage) && parsedPage > 0 ? parsedPage : 1;

  const result = await listActivities({ page, pageSize: PAGE_SIZE });
  const activities = result.items;

  return (
    <div className="space-y-8">
      <header className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <span className="text-eyebrow uppercase text-text-tertiary">
            Catálogo · La Rioja
          </span>
          <h1 className="mt-2 text-display-2 text-text-primary">Actividades</h1>
          <p className="mt-2 text-body-span text-text-secondary max-w-xl">
            Gestioná las experiencias turísticas que el Agente recomienda a los
            visitantes.
          </p>
        </div>
        <Link href="/admin/activities/new" className="btn-primary-cta self-start sm:self-auto">
          + Nueva actividad
        </Link>
      </header>

      {activities.length === 0 ? (
        <EmptyState />
      ) : (
        <>
          <div className="overflow-hidden rounded-2xl border border-soft bg-surface-secondary shadow-sm">
          <div className="hidden md:grid grid-cols-[2fr_1.4fr_1.4fr_4rem_7rem_6rem_8rem] gap-4 px-6 py-3.5 text-eyebrow uppercase text-text-tertiary border-b border-soft bg-surface-tertiary/40">
            <div>Título</div>
            <div>Departamentos</div>
            <div>Clasificaciones</div>
            <div className="text-right">Fotos</div>
            <div className="text-right">Precio</div>
            <div className="text-center">Estado</div>
            <div className="text-right">Acciones</div>
          </div>
          <ul>
            {activities.map((a) => {
              const galleryCount = Array.isArray(a.gallery)
                ? a.gallery.length
                : 0;
              return (
                <li
                  key={a.id}
                  className="grid grid-cols-1 md:grid-cols-[2fr_1.4fr_1.4fr_4rem_7rem_6rem_8rem] gap-3 md:gap-4 items-center px-6 py-5 border-b border-soft last:border-b-0 hover:bg-surface-soft transition-colors"
                >
                  <div className="min-w-0">
                    <div className="text-body-span text-text-primary font-medium truncate">
                      {a.title}
                    </div>
                    <div className="text-btn text-text-tertiary mt-0.5">
                      {new Date(a.startDate).toLocaleDateString("es-AR")}
                      <span className="text-text-tertiary"> → </span>
                      {new Date(a.endDate).toLocaleDateString("es-AR")}
                    </div>
                  </div>
                  <TaxonomyChips
                    items={(a.departments ?? []).map((d) => d.name)}
                    variant="brand"
                  />
                  <TaxonomyChips
                    items={(a.classifications ?? []).map((c) => c.name)}
                    variant="neutral"
                  />
                  <div className="flex md:justify-end">
                    <PhotoCount count={galleryCount} />
                  </div>
                  <div className="text-body text-text-primary tabular-nums md:text-right">
                    ${Number(a.priceArs).toLocaleString("es-AR")}
                  </div>
                  <div className="flex md:justify-center">
                    {a.isActive ? (
                      <span className="inline-flex items-center gap-1.5 h-6 px-2.5 rounded-full bg-brand-primary/10 text-brand-primary border border-brand-primary/20 text-code-sm font-medium">
                        <span className="w-1.5 h-1.5 rounded-full bg-brand-primary" />
                        Activa
                      </span>
                    ) : (
                      <span className="inline-flex items-center gap-1.5 h-6 px-2.5 rounded-full bg-surface-tertiary text-text-tertiary border border-soft text-code-sm">
                        <span className="w-1.5 h-1.5 rounded-full bg-text-tertiary" />
                        Inactiva
                      </span>
                    )}
                  </div>
                  <div className="flex items-center justify-end gap-1">
                    <Link
                      href={`/admin/activities/${a.id}`}
                      className="h-8 px-3 inline-flex items-center rounded-full text-btn font-medium text-text-secondary hover:text-text-primary hover:bg-surface-soft transition-colors"
                    >
                      Editar
                    </Link>
                    <DeleteButton id={a.id} />
                  </div>
                </li>
              );
            })}
          </ul>
          </div>
          <Pagination
            currentPage={result.page}
            totalPages={result.totalPages}
            total={result.total}
            basePath="/admin/activities"
          />
        </>
      )}
    </div>
  );
}

function TaxonomyChips({
  items,
  variant,
}: {
  items: string[];
  variant: "brand" | "neutral";
}) {
  if (items.length === 0) {
    return <span className="text-btn text-text-tertiary">—</span>;
  }
  const visible = items.slice(0, 2);
  const overflow = items.length - visible.length;
  const chipClass =
    variant === "brand"
      ? "inline-flex items-center h-6 px-2.5 rounded-full bg-brand-primary/10 text-brand-primary border border-brand-primary/20 text-code-sm font-medium"
      : "inline-flex items-center h-6 px-2.5 rounded-full bg-surface-tertiary text-text-secondary border border-soft text-code-sm";
  return (
    <ul
      className="flex flex-wrap gap-1.5"
      title={items.join(", ")}
    >
      {visible.map((label) => (
        <li key={label} className={chipClass}>
          {label}
        </li>
      ))}
      {overflow > 0 && (
        <li className="inline-flex items-center h-6 px-2.5 rounded-full bg-surface-tertiary text-text-tertiary border border-soft text-code-sm">
          +{overflow}
        </li>
      )}
    </ul>
  );
}

function PhotoCount({ count }: { count: number }) {
  const muted = count === 0;
  return (
    <span
      className={`inline-flex items-center gap-1.5 text-btn tabular-nums ${
        muted ? "text-text-tertiary" : "text-text-secondary"
      }`}
      aria-label={`${count} foto${count === 1 ? "" : "s"}`}
    >
      <CameraIcon className="size-3.5" />
      {count}
    </span>
  );
}

function CameraIcon({ className = "" }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.75"
      strokeLinecap="round"
      strokeLinejoin="round"
      className={className}
      aria-hidden="true"
    >
      <path d="M14.5 4 16 6h3a2 2 0 0 1 2 2v10a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h3l1.5-2h5Z" />
      <circle cx="12" cy="13" r="3.5" />
    </svg>
  );
}

function EmptyState() {
  return (
    <div className="relative overflow-hidden rounded-2xl border border-soft bg-surface-secondary px-8 py-16 text-center">
      <div className="absolute inset-0 -z-10 opacity-60">
        <div className="absolute -top-20 left-1/2 -translate-x-1/2 h-80 w-80 rounded-full bg-brand-primary/[0.10] blur-[120px]" />
      </div>
      <h2 className="text-h3 text-text-primary">Todavía no hay actividades</h2>
      <p className="mt-2 mx-auto max-w-md text-body text-text-secondary">
        Cargá la primera experiencia y empezá a poblar el catálogo del Agente
        de Turismo.
      </p>
      <Link
        href="/admin/activities/new"
        className="btn-primary-cta mt-6 inline-flex"
      >
        + Crear actividad
      </Link>
    </div>
  );
}
