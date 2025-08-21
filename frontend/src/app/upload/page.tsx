// src/app/upload/page.tsx
"use client";

import { useState } from "react";

export default function UploadPage() {
  const [file, setFile] = useState<File | null>(null);
  const [status, setStatus] = useState<string>("idle");
  const [result, setResult] = useState<any>(null);

  // backend URL comes from .env.local (NEXT_PUBLIC_API_URL)
  const API = process.env.NEXT_PUBLIC_API_URL || "http://127.0.0.1:8000";

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!file) {
      alert("Choose a CSV or XLSX file first.");
      return;
    }
    setStatus("uploading");
    setResult(null);

    try {
      const fd = new FormData();
      fd.append("file", file);

      const r = await fetch(`${API}/datasets/upload`, {
        method: "POST",
        body: fd,
      });

      if (!r.ok) {
        const t = await r.text().catch(() => `HTTP ${r.status}`);
        throw new Error(t);
      }

      const json = await r.json();
      setResult(json);
      setStatus("done");
    } catch (err: any) {
      setStatus(`error: ${err?.message || String(err)}`);
    }
  }

  return (
    <main style={{ maxWidth: 640, margin: "40px auto", padding: 16, fontFamily: "ui-sans-serif, system-ui" }}>
      <h1 style={{ fontSize: 24, fontWeight: 700, marginBottom: 16 }}>
        Upload dataset
      </h1>

      <form onSubmit={onSubmit} style={{ display: "grid", gap: 12 }}>
        <input
          type="file"
          accept=".csv,.xlsx,.xlsm,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet,text/csv"
          onChange={(e) => setFile(e.target.files?.[0] || null)}
        />
        <button
          type="submit"
          style={{
            background: "#111827",
            color: "white",
            padding: "10px 14px",
            borderRadius: 8,
            border: "none",
            cursor: "pointer",
            fontWeight: 600,
          }}
        >
          Upload
        </button>
      </form>

      <div style={{ marginTop: 16 }}>
        <div>Backend URL: <code>{API}</code></div>
        <div>Status: <code>{status}</code></div>
      </div>

      {result && (
        <pre style={{ marginTop: 16, padding: 12, background: "#f7f7f7", borderRadius: 8, overflowX: "auto" }}>
{JSON.stringify(result, null, 2)}
        </pre>
      )}
    </main>
  );
}
