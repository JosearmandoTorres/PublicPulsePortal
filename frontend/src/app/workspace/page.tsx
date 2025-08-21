"use client";
import type React from "react";
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

  // BEGIN multi-select state
const [selectedIds, setSelectedIds] = useState<string[]>([]);

const toggleSelected = (qid: string) => {
  setSelectedIds(prev =>
    prev.includes(qid) ? prev.filter(id => id !== qid) : [...prev, qid]
  );
};
// END multi-select state

// BEGIN drag-and-drop (local reordering)
const [dragSrc, setDragSrc] = useState<{ dsid: string | null; qid: string | null }>({ dsid: null, qid: null });
const [dragOverQid, setDragOverQid] = useState<string | null>(null);
const [dragPosition, setDragPosition] = useState<"above" | "below" | null>(null);


function onDragStartCard(dsid: string, qid: string) {
  setDragSrc({ dsid, qid });
}

function onDragOverCard(e: React.DragEvent<HTMLDivElement>, qid?: string) {
  e.preventDefault();
  if (!qid) return;

  const rect = (e.currentTarget as HTMLDivElement).getBoundingClientRect();
  const midpoint = rect.top + rect.height / 2;
  const cursorY = e.clientY;

  const nextPos: "above" | "below" = cursorY < midpoint ? "above" : "below";

  // only update when something changes to avoid re-render jitter
  if (dragOverQid !== qid) setDragOverQid(qid);
  if (dragPosition !== nextPos) setDragPosition(nextPos);
}



function onDropCard(dsid: string, targetQid: string) {
  if (!dragSrc.dsid || !dragSrc.qid) return;
  if (dragSrc.dsid !== dsid) return; // only within same dataset

  setBlocksByDataset(prev => {
  const list = prev[dsid] ? [...prev[dsid]] : [];
  const fromIdx = list.findIndex(b => String(b.question_id) === String(dragSrc.qid));
  const toIdx   = list.findIndex(b => String(b.question_id) === String(targetQid));
  if (fromIdx < 0 || toIdx < 0) return prev;

  const moved = list[fromIdx];
  list.splice(fromIdx, 1);

  const targetAfter = fromIdx < toIdx ? toIdx - 1 : toIdx;
  const insertIdx   = dragPosition === "below" ? targetAfter + 1 : targetAfter;
  const idx         = Math.max(0, Math.min(list.length, insertIdx));
  list.splice(idx, 0, moved);

  const next = { ...prev, [dsid]: list };

  // save order for this dataset (persist across refresh)
  try {
    const order = list.map(b => String(b.question_id));
    localStorage.setItem(`ppp_order_${dsid}`, JSON.stringify(order));
  } catch (_) {
    /* ignore storage errors in dev */
  }

  return next;
});


  // reset drag state
  setDragSrc({ dsid: null, qid: null });
  setDragOverQid(null);
  setDragPosition(null);
}

function onDragLeaveCard(e: React.DragEvent<HTMLDivElement>, qid?: string) {
  // Only clear if we’re leaving the currently hovered card
  if (!qid) return;
  if (dragOverQid === qid) {
    setDragOverQid(null);
    setDragPosition(null);
  }
}
// END drag-and-drop (local reordering)


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

// Map question_id -> dataset_id using the selections we loaded
function datasetForQid(qid: string): string | null {
  const hit = selections.find(s => String(s.question_id) === String(qid));
  return hit ? String(hit.dataset_id) : null;
}

async function removeSelected() {
  if (selectedIds.length === 0) return;
  if (!confirm(`Remove ${selectedIds.length} selected item(s) from your workspace?`)) return;

  // Build requests in parallel
  const jobs = selectedIds.map(qid => {
    const ds = datasetForQid(qid);
    if (!ds) return Promise.resolve({ qid, ok: false, status: 0, text: "dataset_id not found" });

    const params = new URLSearchParams({
      user_id: String(DEV_USER).trim(),
      dataset_id: ds,
      question_id: String(qid).trim(),
    });

    return fetch(`${API}/selections?${params.toString()}`, { method: "DELETE" })
      .then(async (res) => ({
        qid,
        ok: res.ok || res.status === 204,
        status: res.status,
        text: (await res.text()) || "",
        ds,
      }))
      .catch(err => ({ qid, ok: false, status: 0, text: String(err), ds }));
  });

  const results = await Promise.all(jobs);
  const failures = results.filter(r => !r.ok);

  // Optimistic local state updates for all successful removals
  const removedQids = new Set(results.filter(r => r.ok).map(r => String(r.qid)));

  if (removedQids.size > 0) {
    // 1) selections
    setSelections(prev => prev.filter(s => !removedQids.has(String(s.question_id))));

    // 2) blocksByDataset
    setBlocksByDataset(prev => {
      const copy = { ...prev };
      for (const ds of Object.keys(copy)) {
        const filtered = (copy[ds] || []).filter(b => !removedQids.has(String(b.question_id)));
        if (filtered.length > 0) copy[ds] = filtered;
        else delete copy[ds];
      }
      return copy;
    });

    // 3) clear those checkboxes
    setSelectedIds(prev => prev.filter(qid => !removedQids.has(String(qid))));
  }

  if (failures.length > 0) {
    const first = failures[0];
    alert(`Some items failed to remove (${failures.length}). Example: qid=${first.qid}, status=${first.status}, msg=${first.text}`);
  }
}

async function clearAll() {
  if (selections.length === 0) return;
  if (!confirm(`Clear ALL ${selections.length} item(s) from your workspace? This will remove every item.`)) return;

  const uid = String(DEV_USER).trim();

  // Build a unique list of (dataset_id, question_id) pairs from current selections
  const pairs = selections.map(s => ({
    ds: String(s.dataset_id).trim(),
    qid: String(s.question_id).trim(),
  }));

  // Fire DELETEs in parallel
  const jobs = pairs.map(({ ds, qid }) => {
    const params = new URLSearchParams({ user_id: uid, dataset_id: ds, question_id: qid });
    return fetch(`${API}/selections?${params.toString()}`, { method: "DELETE" })
      .then(async (res) => ({
        ds, qid, ok: res.ok || res.status === 204, status: res.status, text: (await res.text()) || "",
      }))
      .catch(err => ({ ds, qid, ok: false, status: 0, text: String(err) }));
  });

  const results = await Promise.all(jobs);
  const failures = results.filter(r => !r.ok);

  // Optimistic local state: nuke all if most succeeded; otherwise remove only successes
  const succeeded = new Set(results.filter(r => r.ok).map(r => `${r.ds}:${r.qid}`));

  if (succeeded.size > 0) {
    setSelections(prev => prev.filter(s => !succeeded.has(`${String(s.dataset_id)}:${String(s.question_id)}`)));

    setBlocksByDataset(prev => {
      const copy = { ...prev };
      for (const ds of Object.keys(copy)) {
        const filtered = (copy[ds] || []).filter(b => !succeeded.has(`${String(ds)}:${String(b.question_id)}`));
        if (filtered.length > 0) copy[ds] = filtered;
        else delete copy[ds];
      }
      return copy;
    });

    setSelectedIds([]); // clear any checked boxes
  }

  if (failures.length > 0) {
    const first = failures[0];
    alert(`Some items failed to remove (${failures.length}). Example: ds=${first.ds}, qid=${first.qid}, status=${first.status}, msg=${first.text}`);
  }
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
              {/* Bulk actions toolbar */}
    <div className="mt-3 flex items-center gap-3">
  <button
    onClick={removeSelected}
    disabled={selectedIds.length === 0}
    className={`text-sm rounded-xl border px-3 py-1 ${
      selectedIds.length === 0 ? "opacity-50 cursor-not-allowed" : ""
    }`}
    title={selectedIds.length === 0 ? "Select items to enable" : `Remove ${selectedIds.length} selected`}
  >
    Remove Selected
  </button>

  <button
    onClick={clearAll}
    disabled={totalSelected === 0}
    className={`text-sm rounded-xl border px-3 py-1 ${
      totalSelected === 0 ? "opacity-50 cursor-not-allowed" : ""
    }`}
    title={totalSelected === 0 ? "No items to clear" : `Clear all (${totalSelected})`}
  >
    Clear All
  </button>

  {selectedIds.length > 0 && (
    <span className="text-xs text-gray-600">
      {selectedIds.length} selected
    </span>
  )}
</div>


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
    {items.map((b) => {
      const qidStr = String(b.question_id);
      const dsStr  = String(b.dataset_id);

      return (
        <div key={`${dsStr}:${qidStr}`} className="space-y-2">
          {/* insertion line ABOVE */}
          {dragOverQid === qidStr && dragPosition === "above" && (
            <div className="h-0.5 bg-blue-500 rounded-full pointer-events-none" />
          )}

          {/* CARD */}
          <div
            className="rounded-2xl border shadow-sm p-4"
            draggable
            onDragStart={() => onDragStartCard(dsStr, qidStr)}
            onDragOver={(e) => onDragOverCard(e, qidStr)}
            onDragEnter={(e) => onDragOverCard(e, qidStr)}
            onDragLeave={(e) => onDragLeaveCard(e, qidStr)}
            onDrop={() => onDropCard(dsStr, qidStr)}
            title="Drag to reorder within this dataset"
          >
            <div className="mb-2 flex items-start justify-between gap-3">
              {/* LEFT: checkbox + title */}
              <div className="flex items-start gap-2">
                <input
                  type="checkbox"
                  className="mt-1"
                  checked={selectedIds.includes(qidStr)}
                  onChange={() => toggleSelected(qidStr)}
                  aria-label={`Select ${qidStr}`}
                />
                <div>
                  <div className="text-lg font-medium">{b.question_text || "(no question text)"}</div>
                  <div className="text-xs text-gray-500 flex flex-wrap gap-2">
                    <span className="rounded-full border px-2 py-0.5">DS: {dsStr}</span>
                  </div>
                </div>
              </div>

              {/* RIGHT: remove button */}
              <div className="shrink-0">
                <button
                  onClick={() => removeSelection(dsStr, qidStr)}
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
                      <td className="py-1 font-mono">{(r as any).RespPct ?? (r as any).value ?? ""}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            <div className="mt-2 text-xs text-gray-500">
              DatasetID: {dsStr} · QuestionID: {qidStr}
            </div>
          </div>

          {/* insertion line BELOW */}
          {dragOverQid === qidStr && dragPosition === "below" && (
            <div className="h-0.5 bg-blue-500 rounded-full pointer-events-none" />
          )}
        </div>
      );
    })}
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
