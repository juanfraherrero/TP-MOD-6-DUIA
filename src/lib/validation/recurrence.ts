import { z } from "zod";

// Days of week — lowercase short strings (locale-independent key).
export const weekDaySchema = z.enum([
  "mon",
  "tue",
  "wed",
  "thu",
  "fri",
  "sat",
  "sun",
]);
export type WeekDay = z.infer<typeof weekDaySchema>;

// "HH:MM" string — 00:00 a 23:59. Se interpreta en hora Argentina.
const timeRegex = /^([01]\d|2[0-3]):([0-5]\d)$/;
export const timeOfDaySchema = z
  .string()
  .regex(timeRegex, "Formato de hora inválido — usá HH:MM");

// ISO calendar date "YYYY-MM-DD".
const isoDateRegex = /^\d{4}-\d{2}-\d{2}$/;
export const isoDateSchema = z
  .string()
  .regex(isoDateRegex, "Fecha ISO inválida — usá YYYY-MM-DD");

// Discriminated union over `kind`. Gemini-friendly: ≤2 niveles, pocos optionals.
export const recurrenceSchema = z.discriminatedUnion("kind", [
  z.object({
    kind: z.literal("weekly"),
    days: z.array(weekDaySchema).min(1, "Al menos un día"),
    startTime: timeOfDaySchema,
    endTime: timeOfDaySchema,
  }),
  z.object({
    kind: z.literal("dates"),
    dates: z.array(isoDateSchema).min(1, "Al menos una fecha"),
    startTime: timeOfDaySchema,
    endTime: timeOfDaySchema,
  }),
]);

export type Recurrence = z.infer<typeof recurrenceSchema>;
