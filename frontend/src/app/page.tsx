// src/app/page.tsx
export const dynamic = "force-dynamic"; // ensure no static cache during dev

async function getHealth() {
  const api = process.env.NEXT_PUBLIC_API_URL || "http://127.0.0.1:8000";
  try {
    const r = await fetch(`${api}/health`, { cache: "no-store" });
    if (!r.ok) return { ok: false, error: `HTTP ${r.status}` };
    const json = await r.json();
    return { ok: true, json };
  } catch (e: any) {
    return { ok: false, error: e?.message || String(e) };
  }
}

export default async function Home() {
  const res = await getHealth();
  return (
    <main style={{ padding: 24, fontFamily: "ui-sans-serif, system-ui" }}>
      <h1 style={{ fontSize: 24, fontWeight: 700, marginBottom: 12 }}>
        PublicPulsePortal — Frontend
      </h1>
      <p style={{ marginBottom: 16 }}>
        Backend URL: <code>{process.env.NEXT_PUBLIC_API_URL}</code>
      </p>
      <div style={{ padding: 16, border: "1px solid #ddd", borderRadius: 8 }}>
        <h2 style={{ fontSize: 18, marginBottom: 8 }}>Backend Health</h2>
        {res.ok ? (
          <pre style={{ whiteSpace: "pre-wrap" }}>{JSON.stringify(res.json, null, 2)}</pre>
        ) : (
          <p style={{ color: "crimson" }}>Error: {res.error}</p>
        )}
      </div>
      <p style={{ marginTop: 12, color: "#666" }}>
        Tip: if you change the backend, refresh this page to see updates.
      </p>
    </main>
  );
}
