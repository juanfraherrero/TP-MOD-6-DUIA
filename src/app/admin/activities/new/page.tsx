import { ActivityForm } from "@/components/activities/ActivityForm";

export default function NewActivityPage() {
  return (
    <div>
      <h1 className="text-2xl font-semibold mb-6">Nueva actividad</h1>
      <ActivityForm />
    </div>
  );
}
