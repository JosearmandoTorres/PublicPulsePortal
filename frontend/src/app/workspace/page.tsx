"use client";

import { useEffect, useMemo, useState } from "react";

const API = process.env.NEXT_PUBLIC_API_URL || "http://127.0.0.1:8000";
const DEV_USER = process.env.NEXT_PUBLIC_DEV_USER || "jose@dev";

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
  // Enumerate datasets
  const dsRes = await fetch(`${API}/datasets?limit=1000&offset=0`, { cache: "no-store" });
  if (!dsRes.ok) return [];
  const dsJson = await dsRes.json();
  const datasets: Array<{ id: string }> = Array.isArray(dsJson)
    ? dsJson
    : (Array.isArray(dsJson?.items) ? dsJson.items : []);

  const all: Selection[] = [];
  for (const ds of datasets) {
    if (!ds?.id) continue;
    const url = `${API}/selections?user_id=${encodeURIComponent(DEV_USER)}&dataset_id=${encodeURIComponent(ds.id)}`;
    const r = await fetch(url, { cache: "no-store" });
    if (!r.ok) continue;

    const jr = await r.json();
    const arr: Array<{ question_id?: string; created_at?: string }> =
      Array.isArray(jr) ? jr : (Array.isArray(jr?.items) ? jr.items : []);

    for (const it of arr) {
      const qid = it?.question_id ?? (it as any)?.questionId;
      if (!qid) continue;
      all.push({
        user_id: DEV_USER,
        dataset_id: ds.id,               // inject dataset_id here
        question_id: qid,
        created_at: it?.created_at ?? (it as any)?.createdAt ?? "",
      });
    }
    // let the UI breathe in dev
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

  // Normalize types (avoid number/string mismatch like 31119218.00000)
  const uid = String(DEV_USER).trim();
  const ds  = String(dataset_id).trim();
  const qid = String(question_id).trim();

  const params = new URLSearchParams({ user_id: uid, dataset_id: ds, question_id: qid });

  let status = 0, text = "";
  try {
    const res = await fetch(`${API}/selections?${params.toString()}`, { method: "DELETE" });
    status = res.status;
    text = (await res.text()) || "";
    if (!(res.ok || status === 204)) {
      alert(`Failed to remove (${status}). ${text}`);
      return;
    }
  } catch (e: any) {
    alert(`Network error removing selection: ${e?.message || e}`);
    return;
  }

  // Optimistic local updates
  setSelections(prev =>
    prev.filter(s => !(String(s.dataset_id) === ds && String(s.question_id) === qid))
  );

  setBlocksByDataset(prev => {
    const copy = { ...prev };
    const list = (copy[ds] || []).filter(b => String(b.question_id) !== qid);
    if (list.length > 0) copy[ds] = list;
    else delete copy[ds]; // drop empty section
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
  <div className="space-y-5">
    {items.map((b) => (
      <div
        key={`${b.dataset_id}:${b.question_id}`}
        className="rounded-2xl border shadow-sm p-4"
      >
        <div className="mb-2 flex items-start justify-between gap-3">
          <div>
            <div className="text-lg font-medium">{b.question_text || "(no question text)"}</div>
            <div className="text-xs text-gray-500 flex flex-wrap gap-2">
              <span className="rounded-full border px-2 py-0.5">DS: {b.dataset_id}</span>
            </div>
          </div>

          <div className="shrink-0">
            <button
              onClick={() => removeSelection(String(b.dataset_id), String(b.question_id))}
              className="text-sm rounded-xl border px-3 py-1"
              title="Remove from workspace"
            >
              Remove
            </button>
          </div>
        </div>

        <div className="overflow-auto">
          <table className="min-w-[480px] w-full text-sm">
            <thead>
              <tr className="border-b">
                <th className="text-left py-2 pr-4">Response</th>
                <th className="text-left py-2">Value</th>
              </tr>
            </thead>
            <tbody>
              {b.responses.map((r, i) => (
                <tr key={i} className="border-b last:border-0">
                  <td className="py-1 pr-4">{r.RespTxt}</td>
                  <td className="py-1 font-mono">{r.RespPct ?? r.value ?? ""}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        <div className="mt-2 text-xs text-gray-500">
          DatasetID: {b.dataset_id} · QuestionID: {b.question_id}
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
