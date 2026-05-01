import Link from "next/link";
import { ActivityForm } from "@/components/activities/ActivityForm";

export default function NewActivityPage() {
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
          Catálogo · Crear
        </span>
        <h1 className="mt-2 text-display-2 text-text-primary">Nueva actividad</h1>
        <p className="mt-2 text-body-span text-text-secondary max-w-xl">
          Completá los datos para publicar una nueva experiencia turística.
          Podés aumentar los campos con IA después de cargar el título.
        </p>
      </header>
      <ActivityForm />
    </div>
  );
}
