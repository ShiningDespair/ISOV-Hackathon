"use client";

/**
 * Arama kutusu. Form gönderimi router.push ile URL'e yazılır,
 * böylece sunucu bileşenleri filtreyi backend'e iletir.
 */

import { useRouter, useSearchParams } from "next/navigation";
import { useEffect, useState } from "react";

export function SearchBox({ className = "" }: { className?: string }) {
  const router = useRouter();
  const params = useSearchParams();
  const [value, setValue] = useState("");

  // URL değiştiğinde kutuyu senkronla.
  useEffect(() => {
    setValue(params.get("q") ?? "");
  }, [params]);

  function submit(e: React.FormEvent) {
    e.preventDefault();
    const sp = new URLSearchParams(params.toString());
    const term = value.trim();
    if (term) sp.set("q", term);
    else sp.delete("q");
    sp.delete("page");
    const qs = sp.toString();
    router.push(qs ? `/?${qs}` : "/");
  }

  return (
    <form
      role="search"
      onSubmit={submit}
      className={`flex items-stretch border border-ink ${className}`}
    >
      <label htmlFor="bulten-arama" className="sr-only-custom">
        Bültende ara
      </label>
      <input
        id="bulten-arama"
        type="search"
        name="q"
        value={value}
        onChange={(e) => setValue(e.target.value)}
        placeholder="Bültende ara…"
        className="u-body min-w-0 flex-1 bg-surface px-3 py-1.5 text-[0.95rem] outline-none placeholder:text-ink-faint"
      />
      <button
        type="submit"
        className="u-kicker border-l border-ink bg-ink px-3 py-1.5 text-paper"
      >
        Ara
      </button>
    </form>
  );
}
