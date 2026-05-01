// Bins cualitativos AGNÓSTICOS al tipo de actividad. Las etiquetas que
// derivamos acá NO mencionan "trekking", "bodega", "museo" — usan vocabulario
// genérico ("alta montaña", "recorrido suave") porque la dificultad/altitud
// aplica a cualquier formato. La intención es enriquecer el embedding RAG con
// señales que el LLM de audience_tags no siempre infiere a partir solo de
// altitudM/elevationGainM crudos.
//
// Se usa en createActivity / updateActivity, mergeado con los tags del LLM.
// Ver docs/INFORME_TP.md §5.1 (ingest pipeline) y §4.13 (audience tags).

export function deriveDifficultyTags(input: {
  altitudeM?: number | null;
  elevationGainM?: number | null;
}): string[] {
  const tags: string[] = [];

  if (input.altitudeM != null) {
    if (input.altitudeM >= 4000) {
      tags.push("alta montaña", "muy alta altitud");
    } else if (input.altitudeM >= 2500) {
      tags.push("alta altitud");
    } else if (input.altitudeM >= 1000) {
      tags.push("media altitud");
    }
  }

  if (input.elevationGainM != null) {
    if (input.elevationGainM >= 1500) {
      tags.push("muy exigente", "desnivel muy pronunciado");
    } else if (input.elevationGainM >= 800) {
      tags.push("exigente", "desnivel pronunciado");
    } else if (input.elevationGainM >= 300) {
      tags.push("desnivel moderado");
    } else {
      tags.push("recorrido suave");
    }
  }

  return tags;
}

// Dedupe case-insensitive preservando el orden de aparición (primera ocurrencia
// gana en capitalización). Compartido entre audience-tags (LLM) y este módulo
// (heurístico) para que ambos pipelines produzcan strings estables.
export function dedupeTagsCaseInsensitive(tags: string[]): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const tag of tags) {
    const trimmed = tag.trim();
    if (!trimmed) continue;
    const key = trimmed.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(trimmed);
  }
  return out;
}
