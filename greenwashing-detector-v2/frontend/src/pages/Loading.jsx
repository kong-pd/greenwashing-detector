// Loading.jsx — full-page loading state used during lazy route loads.
export default function Loading() {
  return (
    <div style={{
      display: "flex", flexDirection: "column",
      alignItems: "center", justifyContent: "center",
      minHeight: "60vh", gap: 16,
      fontFamily: "var(--font-mono)", fontSize: 12,
      color: "var(--c-ink-2)", letterSpacing: ".08em",
    }}>
      <div style={{ display: "flex", gap: 6 }}>
        {[0, 1, 2].map(i => (
          <span key={i} style={{
            width: 8, height: 8, borderRadius: "50%",
            background: "var(--c-accent)",
            animation: "dot-pulse 1.4s infinite ease",
            animationDelay: `${i * 0.2}s`,
            display: "inline-block",
          }} />
        ))}
      </div>
      LOADING
    </div>
  );
}
