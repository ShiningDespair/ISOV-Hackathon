"use client";

/** Kök hata sınırı — layout dahi render edilemezse devreye girer. */

export default function GlobalError({
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  return (
    <html lang="tr">
      <body
        style={{
          fontFamily: "Georgia, 'Times New Roman', serif",
          background: "#F7F7F5",
          color: "#121212",
          display: "flex",
          minHeight: "100vh",
          alignItems: "center",
          justifyContent: "center",
          padding: "1.5rem",
          margin: 0,
        }}
      >
        <main style={{ maxWidth: "32rem", textAlign: "center" }}>
          <p
            style={{
              fontSize: "0.6875rem",
              letterSpacing: "0.11em",
              textTransform: "uppercase",
              color: "#8B0000",
              fontWeight: 600,
            }}
          >
            Beklenmeyen Durum
          </p>
          <h1 style={{ fontSize: "1.75rem", margin: "0.5rem 0 0" }}>
            Uygulama şu anda yüklenemiyor
          </h1>
          <p style={{ color: "#5A5A5A", marginTop: "0.75rem" }}>
            Veri kaynağına ulaşılamadı. Lütfen birazdan yeniden deneyin.
          </p>
          <button
            type="button"
            onClick={reset}
            style={{
              marginTop: "1.5rem",
              border: "1px solid #121212",
              background: "transparent",
              padding: "0.5rem 1rem",
              fontSize: "0.6875rem",
              letterSpacing: "0.11em",
              textTransform: "uppercase",
              cursor: "pointer",
            }}
          >
            Yeniden Dene
          </button>
        </main>
      </body>
    </html>
  );
}
