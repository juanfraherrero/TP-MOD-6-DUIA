import { ActivityForm } from "@/components/activities/ActivityForm";

export default function NewActivityPage() {
  return (
    <div>
      <div className="mb-8">
        <h1 className="text-h3 text-text-primary">Nueva actividad</h1>
        <p className="mt-1 text-body text-text-tertiary">
          Completá los datos para publicar una nueva actividad.
        </p>
      </div>
      <ActivityForm />
    </div>
  );
}
