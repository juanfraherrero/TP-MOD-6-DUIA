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
      className="text-red-600 hover:underline text-sm disabled:opacity-50"
    >
      {pending ? "Eliminando..." : "Eliminar"}
    </button>
  );
}
