"use client";

import { useRef, useState } from "react";
import { Spinner } from "@/components/ui/Spinner";

export type GalleryImage = {
  full: string | null;
  thumb: string | null;
  caption: string | null;
};

type Props = {
  value: GalleryImage[];
  onChange: (next: GalleryImage[]) => void;
};

export function GalleryUploader({ value, onChange }: Props) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleFiles(files: FileList | null) {
    if (!files || files.length === 0) return;
    setUploading(true);
    setError(null);

    const next: GalleryImage[] = [...value];
    try {
      for (const file of Array.from(files)) {
        const fd = new FormData();
        fd.append("file", file);
        const res = await fetch("/api/uploads", { method: "POST", body: fd });
        if (!res.ok) {
          const data = await res.json().catch(() => ({}));
          throw new Error(data.error ?? "Error subiendo imagen");
        }
        const { url } = (await res.json()) as { url: string };
        next.push({ full: url, thumb: url, caption: "" });
      }
      onChange(next);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Error subiendo imagen");
    } finally {
      setUploading(false);
      if (inputRef.current) inputRef.current.value = "";
    }
  }

  function updateCaption(idx: number, caption: string) {
    const next = value.map((img, i) =>
      i === idx ? { ...img, caption } : img,
    );
    onChange(next);
  }

  function remove(idx: number) {
    onChange(value.filter((_, i) => i !== idx));
  }

  return (
    <div className="bg-surface-secondary border border-soft rounded-lg p-4 space-y-4">
      <div className="flex items-center gap-3 flex-wrap">
        <button
          type="button"
          onClick={() => inputRef.current?.click()}
          disabled={uploading}
          className="btn-primary"
        >
          {uploading ? "Subiendo…" : "+ Agregar foto"}
        </button>
        <input
          ref={inputRef}
          type="file"
          accept="image/*"
          multiple
          onChange={(e) => handleFiles(e.target.files)}
          className="sr-only"
        />
        <span className="text-btn text-text-tertiary">
          JPG, PNG, WebP, GIF · hasta 5MB c/u
        </span>
        {uploading && (
          <span className="inline-flex items-center gap-2 text-btn text-text-tertiary">
            <Spinner size={14} />
            Procesando…
          </span>
        )}
      </div>

      {error && (
        <p className="text-btn text-warning">{error}</p>
      )}

      {value.length === 0 ? (
        <p className="text-btn text-text-tertiary">
          Todavía no hay fotos en la galería.
        </p>
      ) : (
        <ul className="space-y-3">
          {value.map((img, idx) => (
            <li
              key={idx}
              className="flex gap-3 items-start bg-surface-primary border border-soft rounded-md p-3"
            >
              {img.thumb || img.full ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  src={img.thumb ?? img.full ?? ""}
                  alt={img.caption ?? ""}
                  className="h-20 w-20 rounded-md object-cover border border-soft shrink-0"
                />
              ) : (
                <div className="h-20 w-20 rounded-md bg-surface-tertiary shrink-0" />
              )}
              <div className="flex-1 min-w-0">
                <input
                  type="text"
                  value={img.caption ?? ""}
                  onChange={(e) => updateCaption(idx, e.target.value)}
                  placeholder="Descripción / caption (opcional)"
                  className="input"
                />
              </div>
              <button
                type="button"
                onClick={() => remove(idx)}
                aria-label={`Quitar foto ${idx + 1}`}
                className="text-text-tertiary hover:text-warning transition-colors text-xl leading-none px-2 py-1"
              >
                ×
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
