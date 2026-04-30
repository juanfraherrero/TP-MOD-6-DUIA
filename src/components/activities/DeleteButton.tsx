"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

export function DeleteButton({ id }: { id: string }) {
  const router = useRouter();
  const [pending, setPending] = useState(false);

  async function onClick() {
    if (!confirm("¿Eliminar esta actividad?")) return;
    setPending(true);
    try {
      const res = await fetch(`/api/activities/${id}`, { method: "DELETE" });
      if (!res.ok) throw new Error("Error eliminando");
      router.refresh();
    } catch (err) {
      alert(err instanceof Error ? err.message : "Error");
    } finally {
      setPending(false);
    }
  }

  return (
    <button
      onClick={onClick}
      disabled={pending}
      className="h-8 px-3 inline-flex items-center rounded-full bg-transparent text-btn font-normal text-danger hover:text-danger-hover hover:bg-danger-bg transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
    >
      {pending ? "Eliminando..." : "Eliminar"}
    </button>
  );
}
