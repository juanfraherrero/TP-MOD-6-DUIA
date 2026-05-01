import Link from "next/link";
import { notFound } from "next/navigation";
import { getActivity } from "@/lib/services/activity";
import { ActivityForm } from "@/components/activities/ActivityForm";

export default async function EditActivityPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const activity = await getActivity(id);
  if (!activity) notFound();

  return (
    <div className="space-y-8">
      <header>
        <Link
          href="/admin/activities"
          className="inline-flex items-center gap-1.5 text-link text-text-secondary hover:text-brand-primary transition-colors"
        >
          <span aria-hidden="true">←</span> Actividades
        </Link>
        <span className="mt-4 block text-eyebrow uppercase text-text-tertiary">
          Catálogo · Editar
        </span>
        <h1 className="mt-2 text-display-2 text-text-primary">
          {activity.title}
        </h1>
        <p className="mt-2 text-body-span text-text-secondary max-w-xl">
          Modificá los datos de la actividad. Los cambios se reflejan
          inmediatamente en las búsquedas del Agente.
        </p>
      </header>
      <ActivityForm
        initial={{
          id: activity.id,
          title: activity.title,
          description: activity.description,
          imageUrl: activity.imageUrl,
          startDate: activity.startDate,
          endDate: activity.endDate,
          requirements: activity.requirements,
          physicalPrep: activity.physicalPrep,
          altitudeM: activity.altitudeM,
          elevationGainM: activity.elevationGainM,
          priceArs: activity.priceArs,
          isActive: activity.isActive,
          recurrence: activity.recurrence,
          lat: activity.lat,
          lng: activity.lng,
          gallery: activity.gallery ?? [],
          departments:
            activity.departments?.map((d) => ({
              id: d.id,
              name: d.name,
              slug: d.slug,
            })) ?? [],
          classifications:
            activity.classifications?.map((c) => ({
              id: c.id,
              name: c.name,
              slug: c.slug,
            })) ?? [],
        }}
      />
    </div>
  );
}
