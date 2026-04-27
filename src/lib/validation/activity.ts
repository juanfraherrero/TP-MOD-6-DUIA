import { z } from "zod";
import { recurrenceSchema } from "./recurrence";

export const activityInputSchema = z
  .object({
    title: z.string().min(1, "Requerido").max(200),
    description: z.string().min(1, "Requerido"),
    imageUrl: z.string().min(1).nullable().optional(),
    startDate: z.coerce.date(),
    endDate: z.coerce.date(),
    requirements: z.string().min(1, "Requerido"),
    physicalPrep: z.string().min(1, "Requerido"),
    altitudeM: z.coerce.number().int().nonnegative().nullable().optional(),
    elevationGainM: z.coerce.number().int().nonnegative().nullable().optional(),
    priceArs: z.coerce.number().nonnegative(),
    isActive: z.coerce.boolean().default(true),
    // null (o ausente) = actividad one-time. Ver docs/INFORME_TP.md §4.13.
    recurrence: recurrenceSchema.nullable().optional(),
    // Tags de público ideal — opcional en input. Si vienen vacíos o ausentes,
    // el service genera tags vía LLM (data augmentation). Si el admin manda
    // un array, se respeta tal cual y se skipea la generación.
    audienceTags: z.array(z.string().min(1).max(80)).optional(),
  })
  .refine((d) => d.endDate >= d.startDate, {
    message: "endDate debe ser >= startDate",
    path: ["endDate"],
  });

export type ActivityInput = z.infer<typeof activityInputSchema>;
