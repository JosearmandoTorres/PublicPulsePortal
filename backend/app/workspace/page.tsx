'use client';

import { useEffect, useState } from "react";

// Keep this the same value you used on the Blocks page
const DEV_USER = "jose@dev";
const API = process.env.NEXT_PUBLIC_API_URL || "http://127.0.0.1:8000";

type SelItem = { question_id: string; created_at: string };
type Block = {
  question_id: string;
  question_text: string;
  metadata: {
    ReleaseDate?: string;
    SurveyOrg?: string;
    SurveySponsor?: string;
    Country?: string;
    SampleSize?: string;
    SampleDesc?: string;
    Link?: string;
  };
  responses: { RespTxt: string; value: string }[];
};

export default function WorkspacePage() {
  const [datasetId, setDatasetId] = useState<string>("");
  const [items, setItems] = useState<SelItem[]>([]);
  const [blocks, setBlocks] = useState<Block[]>([]);
  const [loading, setLoading] = useState<boolean>(false);
  const [err, setErr] = useState<string>("");

  useEffect(() => {
    const url = new URL(window.location.href);
    const d = url.searchParams.get("dataset_id") || "";
    setDatasetId(d);
  }, []);

  useEffect(() => {
    if (!datasetId) return;
    let ignore = false;

    async function run() {
      setLoading(true); setErr("");
      try {
        // 1) Get the current selections for this user+dataset
        const selRes = await fetch(
          `${API}/selections?user_id=${encodeURIComponent(DEV_USER)}&dataset_id=${encodeURIComponent(datasetId)}`
        );
        if (!selRes.ok) throw new Error(`Selections HTTP ${selRes.status}`);
        const sel = (await selRes.json()) as { items: SelItem[] };
        if (ignore) return;
        setItems(sel.items);

        // 2) Fetch a page of blocks and filter client-side to the selected IDs.
        // (Simple approach; we can optimize later by adding a by-ids endpoint.)
        const blocksRes = await fetch(
          `${API}/questions/blocks?dataset_id=${encodeURIComponent(datasetId)}&limit=200&offset=0`
        );
        if (!blocksRes.ok) throw new Error(`Blocks HTTP ${blocksRes.status}`);
        const all = (await blocksRes.json()) as { items: Block[] };
        const pick = new Set(sel.items.map(s => s.question_id));
        if (ignore) return;
        setBlocks(all.items.filter(b => pick.has(b.question_id)));
      } catch (e: any) {
        if (!ignore) setErr(e?.message || "Failed to load workspace");
      } finally {
        if (!ignore) setLoading(false);
      }
    }

    run();
    return () => { ignore = true; };
  }, [datasetId]);

  return (
    <main style={{ maxWidth: 900, margin: "40px auto", padding: 16, fontFamily: "ui-sans-serif, system-ui" }}>
      <div style={{ display: "flex", justifyContent: "space-between", gap: 12, alignItems: "baseline" }}>
        <h1 style={{ fontSize: 24, fontWeight: 700, marginBottom: 16 }}>Workspace</h1>
        <a href="/datasets" style={{ color: "#2563eb", textDecoration: "underline" }}>← Back to datasets</a>
      </div>

      <div style={{ marginBottom: 12, color: "#666" }}>
        Dataset: <code>{datasetId || "(none)"}</code> · Selected: <b>{items.length}</b>
      </div>

      {loading && <div>Loading…</div>}
      {err && <div style={{ color: "tomato" }}>Error: {err}</div>}

      {blocks.map(b => (
        <div key={b.question_id} style={{ border: "1px solid #e5e7eb", borderRadius: 14, padding: 12, marginBottom: 12 }}>
          <div style={{ fontWeight: 600 }}>{b.question_text || "(no question text)"}</div>
          <div style={{ fontSize: 12, color: "#6b7280", marginTop: 2 }}>
            {b.metadata.ReleaseDate && <>📅 {b.metadata.ReleaseDate} · </>}
            {b.metadata.SurveyOrg && <>🏛 {b.metadata.SurveyOrg} · </>}
            {b.metadata.Country && <>🌐 {b.metadata.Country} · </>}
            {b.metadata.SampleSize && <>👥 N={b.metadata.SampleSize}</>}
          </div>
          <div style={{ marginTop: 6, overflow: "auto" }}>
            <table style={{ minWidth: 480, width: "100%" }}>
              <thead><tr><th align="left">Response</th><th align="left">Value</th></tr></thead>
              <tbody>
                {b.responses.map((r, i) => (
                  <tr key={i}><td>{r.RespTxt}</td><td style={{ fontFamily: "monospace" }}>{r.value}</td></tr>
                ))}
              </tbody>
            </table>
          </div>
          <div style={{ marginTop: 6, fontSize: 12, color: "#6b7280" }}>QuestionID: {b.question_id}</div>
        </div>
      ))}

      {!loading && blocks.length === 0 && (
        <div style={{ color: "#666" }}>
          No selections yet. Go to a dataset’s Blocks page and click “+ Add”.
        </div>
      )}
    </main>
  );
}
