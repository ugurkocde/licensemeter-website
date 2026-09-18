"use client";

/** Last-resort error boundary, minimal because globals.css may not be loaded. */
export default function GlobalError({
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  return (
    <html lang="en">
      <body
        style={{
          fontFamily: "ui-sans-serif, system-ui, sans-serif",
          background: "#f7f8fa",
          color: "#171b23",
          display: "flex",
          minHeight: "100vh",
          alignItems: "center",
          justifyContent: "center",
          margin: 0,
        }}
      >
        <div
          style={{
            textAlign: "left",
            padding: 28,
            maxWidth: 520,
            background: "#ffffff",
            border: "1px solid #d0d9d6",
            borderRadius: 16,
            boxShadow: "0 18px 50px rgba(12, 26, 23, 0.08)",
          }}
        >
          <div style={{ fontSize: 22 }}>
            License<span style={{ color: "#115e59" }}>Meter</span>
          </div>
          <h1 style={{ fontSize: 28, fontWeight: "normal", marginTop: 24 }}>
            Something went wrong on our side.
          </h1>
          <p
            style={{
              fontSize: 14,
              color: "#555e69",
              lineHeight: 1.6,
            }}
          >
            The error has been reported. Your data is unaffected.
          </p>
          <button
            onClick={() => reset()}
            style={{
              marginTop: 16,
              background: "#115e59",
              color: "#ffffff",
              border: "none",
              padding: "12px 20px",
              fontSize: 14,
              fontWeight: 600,
              borderRadius: 10,
              cursor: "pointer",
            }}
          >
            Try again
          </button>
        </div>
      </body>
    </html>
  );
}
