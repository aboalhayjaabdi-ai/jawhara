"use client";

import { useRef, useState } from "react";

export function ImageUploadField({
  label,
  value,
  onChange,
  endpoint = "/api/admin/storefront/upload-image",
}: {
  label: string;
  value: string;
  onChange: (url: string) => void;
  endpoint?: string;
}) {
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  async function handleUpload(files: FileList | null) {
    const file = files?.[0];
    if (!file) return;
    setUploading(true);
    setError(null);
    const formData = new FormData();
    formData.append("file", file);
    const res = await fetch(endpoint, { method: "POST", body: formData });
    const data = await res.json();
    if (!res.ok) setError(data.error ?? "Uppladdning misslyckades.");
    else onChange(data.url);
    setUploading(false);
    if (inputRef.current) inputRef.current.value = "";
  }

  return (
    <div>
      <label className="text-xs text-gray-500">{label}</label>
      <div className="mt-1 flex items-center gap-3">
        {value && (
          // eslint-disable-next-line @next/next/no-img-element -- arbitrary external/storage URLs, no next/image domain config needed for this small admin thumbnail
          <img src={value} alt="" className="h-14 w-14 rounded border border-gray-200 object-cover" />
        )}
        <label className="cursor-pointer text-xs font-medium text-gray-700 underline hover:text-gray-900">
          {uploading ? "Laddar upp…" : value ? "Byt bild" : "Ladda upp bild"}
          <input ref={inputRef} type="file" accept="image/*" className="hidden" onChange={(e) => handleUpload(e.target.files)} disabled={uploading} />
        </label>
      </div>
      {error && <div className="mt-1 text-xs text-rose-600">{error}</div>}
    </div>
  );
}
