"use client";

import { useMemo, useState } from "react";
import { Spinner } from "@/components/ui/Spinner";

export type Term = { id: string; name: string; slug: string };

type Props = {
  label: string;
  options: Term[];
  values: string[];
  onChange: (ids: string[]) => void;
  allowCreate?: (name: string) => Promise<Term>;
  placeholder?: string;
};

function normalize(s: string): string {
  return s
    .normalize("NFD")
    .replace(/\p{Diacritic}/gu, "")
    .toLowerCase()
    .trim();
}

export function MultiSelectChips({
  label,
  options,
  values,
  onChange,
  allowCreate,
  placeholder = "Buscar…",
}: Props) {
  const [query, setQuery] = useState("");
  const [creating, setCreating] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const selected = useMemo(
    () => options.filter((o) => values.includes(o.id)),
    [options, values],
  );

  const filtered = useMemo(() => {
    const nq = normalize(query);
    if (!nq) return options.filter((o) => !values.includes(o.id));
    return options.filter(
      (o) => !values.includes(o.id) && normalize(o.name).includes(nq),
    );
  }, [options, values, query]);

  const exactMatch = useMemo(() => {
    if (!query.trim()) return null;
    const nq = normalize(query);
    return options.find((o) => normalize(o.name) === nq) ?? null;
  }, [options, query]);

  function add(id: string) {
    if (values.includes(id)) return;
    onChange([...values, id]);
    setQuery("");
  }

  function remove(id: string) {
    onChange(values.filter((v) => v !== id));
  }

  async function handleCreate() {
    if (!allowCreate) return;
    const name = query.trim();
    if (!name) return;
    setCreating(true);
    setError(null);
    try {
      const created = await allowCreate(name);
      onChange([...values, created.id]);
      setQuery("");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Error creando");
    } finally {
      setCreating(false);
    }
  }

  const showCreate =
    Boolean(allowCreate) &&
    query.trim().length > 0 &&
    !exactMatch;

  return (
    <div>
      <label className="block text-h4 text-text-primary mb-2">{label}</label>

      {selected.length > 0 && (
        <ul className="mb-3 flex flex-wrap gap-2">
          {selected.map((t) => (
            <li
              key={t.id}
              className="inline-flex items-center gap-1.5 h-7 pl-3 pr-2 rounded-full bg-brand-primary/10 text-brand-primary border border-brand-primary/20 text-code-sm font-medium"
            >
              <span>{t.name}</span>
              <button
                type="button"
                onClick={() => remove(t.id)}
                aria-label={`Quitar ${t.name}`}
                className="ml-0.5 leading-none rounded-full w-4 h-4 inline-flex items-center justify-center text-brand-primary/70 hover:text-brand-primary hover:bg-brand-primary/15 transition-colors"
              >
                ×
              </button>
            </li>
          ))}
        </ul>
      )}

      <input
        type="text"
        value={query}
        onChange={(e) => {
          setQuery(e.target.value);
          setError(null);
        }}
        placeholder={placeholder}
        className="input"
      />

      {(query.trim() || filtered.length > 0) && (
        <div className="mt-2 rounded-lg border border-soft bg-surface-secondary max-h-56 overflow-y-auto">
          {filtered.length > 0 && (
            <ul className="py-1">
              {filtered.slice(0, 50).map((o) => (
                <li key={o.id}>
                  <button
                    type="button"
                    onClick={() => add(o.id)}
                    className="w-full text-left px-3 py-2 text-body text-text-primary hover:bg-surface-soft transition-colors"
                  >
                    {o.name}
                  </button>
                </li>
              ))}
            </ul>
          )}

          {filtered.length === 0 && !showCreate && (
            <div className="px-3 py-2 text-btn text-text-tertiary">
              Sin coincidencias
            </div>
          )}

          {showCreate && (
            <div className="border-t border-soft px-3 py-2">
              <button
                type="button"
                onClick={handleCreate}
                disabled={creating}
                className="inline-flex items-center gap-2 text-btn text-brand-primary hover:text-brand-accent transition-colors disabled:opacity-50"
              >
                {creating ? (
                  <Spinner size={12} />
                ) : (
                  <span aria-hidden="true">+</span>
                )}
                <span>
                  Crear «<strong className="font-semibold">{query.trim()}</strong>»
                </span>
              </button>
            </div>
          )}
        </div>
      )}

      {error && (
        <p className="mt-2 text-btn text-warning">{error}</p>
      )}
    </div>
  );
}
