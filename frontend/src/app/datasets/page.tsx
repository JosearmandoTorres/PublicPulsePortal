"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";

const API = process.env.NEXT_PUBLIC_API_URL || "http://127.0.0.1:8000";
const DEV_USER = "jose@dev"; // dev-mode user

type Selection = {
  user_id: string;
  dataset_id: string;
  question_id: string;
  created_at?: string;
};

type Block = {
  dataset_id: string;
  question_id: string;
  question_text: string;
  metadata?: Record<string, any>;
  responses: Array<{ RespTxt: string; RespPct?: string; value?: string }>;
};
type BlocksResponse = { total: number; items: Block[] };

export default function WorkspacePage() {
  const router = useRouter();

  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [selections, setSelections] = useState<Selection[]>([]);
  const [blocksByDataset, setBlocksByDataset] = useState<Record<string, Block[]>>({});

  // ---- CORE LOADER ----
  useEffect(() => {
    let cancelled = false;

    async function fetchAllSelectionsOrFallback(): Promise<Selection[]> {
      // Try fast path: /selections/all
      const selRes = await fetch(
        `${API}/selections/all?user_id=${encodeURIComponent(DEV_USER)}`,
        { cache: "no-store" }
      );

      if (selRes.ok) {
        const j = await selRes.json();
        const arr: Array<any> = Array.isArray(j) ? j : (Array.isArray(j?.items) ? j.items : []);
        return arr
          .filter(Boolean)
          .map((it: any) => ({
            user_id: DEV_USER,
            dataset_id: it.dataset_id ?? it.datasetId ?? "",
            question_id: it.question_id ?? it.questionId ?? "",
            created_at: it.created_at ?? it.createdAt ?? "",
          }))
          .filter((s: Selection) => s.dataset_id && s.question_id);
      }

      // Fallback: enumerate datasets, then fetch per-dataset selections
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
            dataset_id: ds.id, // inject dataset_id here
            question_id: qid,
            created_at: it?.created_at ?? (it as any)?.createdAt ?? "",
          });
        }
        await new Promise((res) => setTimeout(res, 0)); // yield
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

        // Fetch blocks per dataset, filter to selected qids
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
            await new Promise((res) => setTimeout(res, 0)); // yield
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
  // ---- END CORE LOADER ----

  const totalSelected = selections.length;
  const datasetOrder = useMemo(
    () => Object.keys(blocksByDataset).sort(),
    [blocksByDataset]
  );

  async function removeSelection(dataset_id: string, question_id: string) {
    if (!confirm("Remove this block from your workspace?")) return;
    const params = new URLSearchParams({
      user_id: DEV_USER,
      dataset_id,
      question_id,
    }).toString();
    const r = await fetch(`${API}/selections?${params}`, { method: "DELETE" });
    if (!r.ok) {
      alert(`Failed to remove: ${r.status}`);
      return;
    }
    // Optimistic update
    setSelections((prev) => prev.filter(s => !(s.dataset_id === dataset_id && s.question_id === question_id)));
    setBlocksByDataset((prev) => {
      const copy = { ...prev };
      copy[dataset_id] = (copy[dataset_id] || []).filter(b => b.question_id !== question_id);
      return copy;
    });
  }

  return (
    <main style={{ maxWidth: 1100, margin: "40px auto", padding: 16, fontFamily: "ui-sans-serif, system-ui" }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", gap: 12 }}>
        <div>
          <h1 style={{ fontSize: 24, fontWeight: 700 }}>Workspace</h1>
          <div style={{ color: "#666", fontSize: 12 }}>Your selected blocks across all uploads</div>
        </div>

        {/* Force navigation via router; also include a plain Link fallback */}
        <div className="flex items-center gap-3">
          <button
            type="button"
            onClick={(e) => {
              e.preventDefault();
              e.stopPropagation();
              router.push("/datasets");
            }}
            className="text-blue-600 underline"
            title="Back to Database"
          >
            Back to Database →
          </button>
          <Link href="/datasets" className="sr-only">/datasets</Link>
        </div>
      </div>

      {loading && <div style={{ color: "#666", marginTop: 8 }}>Loading your selections…</div>}
      {error && <div style={{ color: "tomato", marginTop: 8 }}>Error: {error}</div>}

      <div style={{ fontSize: 12, color: "#666", marginTop: 6 }}>
        {totalSelected === 0
          ? "No selections yet."
          : `${totalSelected} item(s) selected across ${datasetOrder.length} dataset(s)`}
      </div>

      {/* STACKED layout (like Database page), not a grid */}
      <div className="space-y-10" style={{ marginTop: 12 }}>
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
                    <div key={`${b.dataset_id}:${b.question_id}`} className="rounded-2xl border shadow-sm p-4">
                      <div className="mb-2 flex items-start justify-between gap-3">
                        <div>
                          <div className="text-lg font-medium">{b.question_text || "(no question text)"}</div>
                          <div className="text-xs text-gray-500 flex flex-wrap gap-2">
                            <span className="rounded-full border px-2 py-0.5">DS: {b.dataset_id}</span>
                          </div>
                        </div>

                        {/* Remove button */}
                        <div className="shrink-0">
                          <button
                            onClick={() => removeSelection(b.dataset_id, b.question_id)}
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
    </main>
  );
}
