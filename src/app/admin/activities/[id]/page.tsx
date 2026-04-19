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
    <div>
      <h1 className="text-2xl font-semibold mb-6">Editar actividad</h1>
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
        }}
      />
    </div>
  );
}
