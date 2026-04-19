import Link from "next/link";
import { listActivities } from "@/lib/services/activity";
import { DeleteButton } from "@/components/activities/DeleteButton";

export const dynamic = "force-dynamic";

export default async function ActivitiesPage() {
  const activities = await listActivities();

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-2xl font-semibold">Actividades</h1>
        <Link
          href="/admin/activities/new"
          className="bg-black text-white px-4 py-2 rounded text-sm"
        >
          Nueva actividad
        </Link>
      </div>

      {activities.length === 0 ? (
        <p className="text-gray-500">No hay actividades cargadas todavía.</p>
      ) : (
        <table className="w-full border-collapse text-sm bg-white border rounded">
          <thead>
            <tr className="text-left border-b bg-gray-50">
              <th className="py-2 px-3">Título</th>
              <th className="py-2 px-3">Fechas</th>
              <th className="py-2 px-3">Precio</th>
              <th className="py-2 px-3">Estado</th>
              <th className="py-2 px-3"></th>
            </tr>
          </thead>
          <tbody>
            {activities.map((a) => (
              <tr key={a.id} className="border-b last:border-b-0">
                <td className="py-2 px-3">{a.title}</td>
                <td className="py-2 px-3 text-gray-600">
                  {new Date(a.startDate).toLocaleDateString("es-AR")} →{" "}
                  {new Date(a.endDate).toLocaleDateString("es-AR")}
                </td>
                <td className="py-2 px-3">
                  ${Number(a.priceArs).toLocaleString("es-AR")}
                </td>
                <td className="py-2 px-3">
                  {a.isActive ? (
                    <span className="text-green-700">Activa</span>
                  ) : (
                    <span className="text-gray-500">Inactiva</span>
                  )}
                </td>
                <td className="py-2 px-3 text-right space-x-3">
                  <Link
                    href={`/admin/activities/${a.id}`}
                    className="text-blue-600 hover:underline"
                  >
                    Editar
                  </Link>
                  <DeleteButton id={a.id} />
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
  );
}
