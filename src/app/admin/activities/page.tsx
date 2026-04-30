import Link from "next/link";
import { listActivities } from "@/lib/services/activity";
import { DeleteButton } from "@/components/activities/DeleteButton";

export const dynamic = "force-dynamic";

export default async function ActivitiesPage() {
  const activities = await listActivities();

  return (
    <div>
      <div className="flex items-center justify-between mb-8">
        <h1 className="text-h3 text-text-primary">Actividades</h1>
        <Link
          href="/admin/activities/new"
          className="h-8 px-3 inline-flex items-center rounded-full bg-cta-bg text-text-on-cta text-btn font-medium shadow-l2 hover:bg-cta-bg-hover transition-colors"
        >
          Nueva actividad
        </Link>
      </div>

      {activities.length === 0 ? (
        <p className="text-body text-text-tertiary">
          No hay actividades cargadas todavía.
        </p>
      ) : (
        <div className="card-dark overflow-hidden">
          <div className="hidden md:grid grid-cols-[2fr_2fr_1fr_1fr_auto] gap-6 px-6 py-3 text-link text-text-tertiary border-b border-soft">
            <div>Título</div>
            <div>Fechas</div>
            <div>Precio</div>
            <div>Estado</div>
            <div className="w-32" />
          </div>
          <ul>
            {activities.map((a) => (
              <li
                key={a.id}
                className="grid grid-cols-1 md:grid-cols-[2fr_2fr_1fr_1fr_auto] gap-3 md:gap-6 items-center px-6 py-5 border-b border-soft last:border-b-0 hover:bg-surface-soft transition-colors"
              >
                <div className="text-body-span text-text-primary font-medium">
                  {a.title}
                </div>
                <div className="text-body text-text-tertiary">
                  {new Date(a.startDate).toLocaleDateString("es-AR")} →{" "}
                  {new Date(a.endDate).toLocaleDateString("es-AR")}
                </div>
                <div className="text-body text-text-primary">
                  ${Number(a.priceArs).toLocaleString("es-AR")}
                </div>
                <div>
                  {a.isActive ? (
                    <span className="inline-flex items-center gap-1.5 h-6 px-2.5 rounded-full bg-brand-primary/15 text-brand-accent text-[12.25px] leading-[15.925px]">
                      <span className="w-1.5 h-1.5 rounded-full bg-brand-accent" />
                      Activa
                    </span>
                  ) : (
                    <span className="inline-flex items-center gap-1.5 h-6 px-2.5 rounded-full bg-surface-soft text-text-tertiary text-[12.25px] leading-[15.925px]">
                      <span className="w-1.5 h-1.5 rounded-full bg-text-tertiary" />
                      Inactiva
                    </span>
                  )}
                </div>
                <div className="flex items-center justify-end gap-2 md:w-32">
                  <Link
                    href={`/admin/activities/${a.id}`}
                    className="h-8 px-3 inline-flex items-center rounded-full text-btn font-normal text-text-tertiary hover:text-text-muted transition-colors"
                  >
                    Editar
                  </Link>
                  <DeleteButton id={a.id} />
                </div>
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}
