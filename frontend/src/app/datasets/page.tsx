// src/app/datasets/page.tsx
export const dynamic = "force-dynamic";

async function fetchDatasets() {
  const api = process.env.NEXT_PUBLIC_API_URL || "http://127.0.0.1:8000";
  const r = await fetch(`${api}/datasets`, { cache: "no-store" });
  if (!r.ok) return { total: 0, items: [] as any[] };
  return r.json();
}

export default async function DatasetsPage() {
  const data = await fetchDatasets();
  return (
    <main style={{ maxWidth: 900, margin: "40px auto", padding: 16, fontFamily: "ui-sans-serif, system-ui" }}>
      <h1 style={{ fontSize: 24, fontWeight: 700, marginBottom: 16 }}>Datasets</h1>
      <p style={{ marginBottom: 12 }}>
        Backend: <code>{process.env.NEXT_PUBLIC_API_URL}</code>
      </p>

      <div style={{ fontSize: 14, marginBottom: 8 }}>Total: {data.total}</div>

      <table style={{ width: "100%", borderCollapse: "collapse" }}>
        <thead>
          <tr>
            <th style={{ textAlign: "left", borderBottom: "1px solid #ddd", padding: 8 }}>Uploaded</th>
            <th style={{ textAlign: "left", borderBottom: "1px solid #ddd", padding: 8 }}>Filename</th>
            <th style={{ textAlign: "left", borderBottom: "1px solid #ddd", padding: 8 }}>Dataset ID</th>
          </tr>
        </thead>
        <tbody>
          {data.items?.map((d: any) => (
            <tr key={d.id}>
              <td style={{ borderBottom: "1px solid #eee", padding: 8 }}>{d.uploaded_at}</td>
              <td style={{ borderBottom: "1px solid #eee", padding: 8 }}>{d.filename}</td>
              <td style={{ borderBottom: "1px solid #eee", padding: 8, fontFamily: "monospace" }}>{d.id}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </main>
  );
}
