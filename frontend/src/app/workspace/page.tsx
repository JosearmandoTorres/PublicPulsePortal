"use client";

import { useEffect, useMemo, useState } from "react";

const API = process.env.NEXT_PUBLIC_API_URL || "http://127.0.0.1:8000";
const USER_ID = "jose@dev"; // dev-mode user

type Selection = { user_id: string; dataset_id: string; question_id: string; created_at: string };
type Block = {
  dataset_id: string;
  question_id: string;
  question_text: string;
  metadata?: Record<string, any>;
  responses: Array<{ RespTxt: string; RespPct: string }>;
};
type BlocksResponse = { total: number; items: Block[] };

export default function WorkspacePage() {
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [selections, setSelections] = useState<Selection[]>([]);
  const [blocksByDataset, setBlocksByDataset] = useState<Record<string, Block[]>>({});

  // Fetch all selections across datasets
  useEffect(() => {
  let cancelled = false;

  async function fetchAllSelectionsOrFallback(): Promise<Selection[]> {
  // Try the fast path first
  const selRes = await fetch(`${API}/selections/all?user_id=${encodeURIComponent(USER_ID)}`, { cache: "no-store" });
  if (selRes.ok) return selRes.json();

  // Fallback: enumerate datasets, then fetch per-dataset selections
  const dsRes = await fetch(`${API}/datasets?limit=1000&offset=0`, { cache: "no-store" });
  if (!dsRes.ok) throw new Error(`datasets failed: ${dsRes.status}`);

  const dsJson = await dsRes.json();
  // Handle both shapes: array OR { items: [...] }
  const datasets: Array<{ id: string }> = Array.isArray(dsJson)
    ? dsJson
    : (Array.isArray(dsJson?.items) ? dsJson.items : []);

  if (!datasets.length) return [];

  const all: Selection[] = [];
  for (const ds of datasets) {
    if (!ds?.id) continue;
    const url = `${API}/selections?user_id=${encodeURIComponent(USER_ID)}&dataset_id=${encodeURIComponent(ds.id)}`;
    const r = await fetch(url, { cache: "no-store" });
    if (!r.ok) continue; // skip datasets without selections
    const part: Selection[] = await r.json();
    if (Array.isArray(part) && part.length) all.push(...part);
    // yield for responsiveness
    await new Promise((res) => setTimeout(res, 0));
  }
  return all;
}

  async function run() {
    setLoading(true);
    setError(null);
    try {
      const sel = await fetchAllSelectionsOrFallback();
      if (cancelled) return;
      setSelections(sel);

      // Group selected question_ids by dataset_id
      const byDataset = sel.reduce<Record<string, Set<string>>>((acc, s) => {
        if (!acc[s.dataset_id]) acc[s.dataset_id] = new Set();
        acc[s.dataset_id].add(s.question_id);
        return acc;
      }, {});

      // For each dataset, fetch blocks and filter to selected question_ids
      const out: Record<string, Block[]> = {};
      for (const [dataset_id, qidSet] of Object.entries(byDataset)) {
        const need = new Set(qidSet);
        const found: Record<string, Block> = {};
        let offset = 0;
        const limit = 500;
        let total = Infinity;

        while (offset < total && need.size > 0) {
          const url = `${API}/questions/blocks?dataset_id=${encodeURIComponent(dataset_id)}&limit=${limit}&offset=${offset}`;
          const r = await fetch(url, { cache: "no-store" });
          if (!r.ok) throw new Error(`blocks fetch failed (${dataset_id}): ${r.status}`);
          const data: BlocksResponse = await r.json();
          total = data.total ?? 0;

          for (const b of data.items) {
            if (need.has(b.question_id)) {
              found[b.question_id] = b;
              need.delete(b.question_id);
            }
          }
          offset += limit;
          await new Promise((res) => setTimeout(res, 0));
        }

        out[dataset_id] = Object.values(found).sort((a, b) => a.question_id.localeCompare(b.question_id));
      }

      if (!cancelled) setBlocksByDataset(out);
    } catch (e: any) {
      if (!cancelled) setError(e?.message || String(e));
    } finally {
      if (!cancelled) setLoading(false);
    }
  }

  run();
  return () => { cancelled = true; };
}, []);

  const totalSelected = selections.length;
  const datasetOrder = useMemo(
    () => Object.keys(blocksByDataset).sort(),
    [blocksByDataset]
  );

  async function removeSelection(dataset_id: string, question_id: string) {
    if (!confirm("Remove this block from your workspace?")) return;
    const params = new URLSearchParams({
      user_id: USER_ID,
      dataset_id,
      question_id,
    }).toString();
    const r = await fetch(`${API}/selections?${params}`, { method: "DELETE" });
    if (!r.ok) {
      alert(`Failed to remove: ${r.status}`);
      return;
    }
    // Optimistic update: drop from state
    setSelections((prev) => prev.filter(s => !(s.dataset_id === dataset_id && s.question_id === question_id)));
    setBlocksByDataset((prev) => {
      const copy = { ...prev };
      copy[dataset_id] = (copy[dataset_id] || []).filter(b => b.question_id !== question_id);
      return copy;
    });
  }

  return (
    <div className="p-6 space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-semibold">Workspace</h1>
        <a href="/datasets" className="underline">Back to Database</a>
      </div>

      {loading && <div>Loading your selections…</div>}
      {error && <div className="text-red-600">Error: {error}</div>}

      {!loading && !error && (
        <>
          <div className="text-sm text-gray-600">
            {totalSelected === 0 ? "No selections yet." : `${totalSelected} item(s) selected across ${datasetOrder.length} dataset(s).`}
          </div>

          {datasetOrder.length === 0 && totalSelected > 0 && (
            <div className="text-amber-700">
              Selections exist but their blocks weren’t found. Try refreshing or increasing the page limit.
            </div>
          )}

          <div className="space-y-10">
            {datasetOrder.map((dsid) => {
              const items = blocksByDataset[dsid] || [];
              return (
                <section key={dsid} className="space-y-3">
                  <div className="flex items-center gap-3">
                    <div className="text-lg font-medium">Dataset</div>
                    <code className="px-2 py-1 rounded bg-gray-100 text-gray-800 text-xs">{dsid}</code>
                    <span className="text-sm text-gray-600">· {items.length} item(s)</span>
                  </div>

                  {items.length === 0 ? (
                    <div className="text-sm text-gray-500">No blocks resolved for this dataset (yet).</div>
                  ) : (
                    <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
                      {items.map((b) => (
                        <div key={`${b.dataset_id}:${b.question_id}`} className="rounded-2xl shadow p-4 border border-gray-200 flex flex-col">
                          <div className="mb-2 text-xs text-gray-500">
                            <span className="font-mono">QID:</span> {b.question_id}
                          </div>
                          <div className="font-semibold mb-2">{b.question_text || "(no question text)"}</div>
                          <div className="flex-1">
                            <ul className="text-sm list-disc pl-5 space-y-1">
                              {b.responses.slice(0, 6).map((r, i) => (
                                <li key={i}>
                                  {r.RespTxt} — {r.RespPct}
                                </li>
                              ))}
                              {b.responses.length > 6 && (
                                <li className="text-gray-500">…{b.responses.length - 6} more</li>
                              )}
                            </ul>
                          </div>
                          <div className="mt-4 flex justify-end">
                            <button
                              onClick={() => removeSelection(b.dataset_id, b.question_id)}
                              className="px-3 py-1.5 text-sm rounded-xl bg-red-600 text-white hover:bg-red-700"
                            >
                              Remove
                            </button>
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </section>
              );
            })}
          </div>
        </>
      )}
    </div>
  );
}
