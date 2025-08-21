// frontend/src/app/datasets/page.tsx
'use client';

import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';

type Block = {
  dataset_id: string;
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

type BlocksResponse = {
  total: number;
  items: Block[];
};

const API = process.env.NEXT_PUBLIC_API_URL || 'http://127.0.0.1:8000';
const DEV_USER = 'jose@dev';

export default function DatabasePage() {
  const [q, setQ] = useState('');
  const [blocks, setBlocks] = useState<Block[]>([]);
  const [total, setTotal] = useState(0);
  const [limit, setLimit] = useState(25);
  const [offset, setOffset] = useState(0);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [selected, setSelected] = useState<Record<string, boolean>>({}); // key = dataset_id + "::" + question_id
  const [workspaceCount, setWorkspaceCount] = useState(0);

  // debounce (simple)
  const debouncedQ = useMemo(() => q, [q]);

  // Load blocks (GLOBAL — no dataset_id)
  useEffect(() => {
    let ignore = false;
    async function run() {
      setLoading(true);
      setError('');
      try {
        const url = new URL(`${API}/questions/blocks`);
        url.searchParams.set('limit', String(limit));
        url.searchParams.set('offset', String(offset));
        if (debouncedQ.trim()) url.searchParams.set('search', debouncedQ.trim());

        const res = await fetch(url.toString(), { cache: 'no-store' });
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const data: BlocksResponse = await res.json();
        if (!ignore) {
          setBlocks(data.items);
          setTotal(data.total);
        }
      } catch (e: any) {
        if (!ignore) setError(e?.message || 'Failed to load');
      } finally {
        if (!ignore) setLoading(false);
      }
    }
    run();
    return () => { ignore = true; };
  }, [debouncedQ, limit, offset]);

  // Load all selections for this user (across datasets) to hydrate the toggle + count
  useEffect(() => {
    let ignore = false;
    async function loadSelections() {
      try {
        const res = await fetch(`${API}/selections/all?user_id=${encodeURIComponent(DEV_USER)}`, { cache: 'no-store' });
        if (!res.ok) return;
        const data = await res.json() as { items: { dataset_id: string; question_id: string }[] };
        if (ignore) return;
        const map: Record<string, boolean> = {};
        data.items.forEach(it => {
          map[`${it.dataset_id}::${it.question_id}`] = true;
        });
        setSelected(map);
        setWorkspaceCount(data.items.length);
      } catch {
        // ignore
      }
    }
    loadSelections();
    return () => { ignore = true; };
  }, []);

  async function addToSelection(dsId: string, qid: string) {
    await fetch(`${API}/selections`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ user_id: DEV_USER, dataset_id: dsId, question_id: qid }),
    });
    setSelected(s => ({ ...s, [`${dsId}::${qid}`]: true }));
    setWorkspaceCount(c => c + 1);
  }

  async function removeFromSelection(dsId: string, qid: string) {
    const url = `${API}/selections?user_id=${encodeURIComponent(DEV_USER)}&dataset_id=${encodeURIComponent(dsId)}&question_id=${encodeURIComponent(qid)}`;
    await fetch(url, { method: 'DELETE' });
    setSelected(s => {
      const copy = { ...s };
      delete copy[`${dsId}::${qid}`];
      return copy;
    });
    setWorkspaceCount(c => Math.max(0, c - 1));
  }

  const totalPages = Math.max(1, Math.ceil(total / limit));
  const page = Math.floor(offset / limit) + 1;

  return (
    <main style={{ maxWidth: 1100, margin: '40px auto', padding: 16, fontFamily: 'ui-sans-serif, system-ui' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', gap: 12 }}>
        <div>
          <h1 style={{ fontSize: 24, fontWeight: 700 }}>Database</h1>
          <div style={{ color: '#666', fontSize: 12 }}>All questions across all uploads</div>
        </div>
        <Link href="/workspace" className="text-blue-600 underline">
          Open Workspace →
        </Link>
      </div>

      <div className="grid gap-3 sm:grid-cols-2" style={{ marginTop: 12 }}>
        <input
          value={q}
          onChange={(e) => { setOffset(0); setQ(e.target.value); }}
          placeholder="Search QuestionTxt…"
          className="w-full rounded-xl border p-2"
        />
        <div className="flex gap-2 items-center">
          <label className="text-sm">Per page</label>
          <select
            value={limit}
            onChange={(e) => { setOffset(0); setLimit(parseInt(e.target.value || '25')); }}
            className="rounded-xl border p-2"
          >
            <option value={10}>10</option>
            <option value={25}>25</option>
            <option value={50}>50</option>
          </select>
        </div>
      </div>

      {loading && <div style={{ color: '#666', marginTop: 8 }}>Loading…</div>}
      {error && <div style={{ color: 'tomato', marginTop: 8 }}>Error: {error}</div>}

      <div style={{ fontSize: 12, color: '#666', marginTop: 6 }}>
        Showing {blocks.length} of {total} · Page {page} / {totalPages}
      </div>

      <div className="space-y-5" style={{ marginTop: 12 }}>
        {blocks.map((b) => {
          const key = `${b.dataset_id}::${b.question_id}`;
          const inWs = !!selected[key];
          return (
            <div key={key} className="rounded-2xl border shadow-sm p-4">
              <div className="mb-2 flex items-start justify-between gap-3">
                <div>
                  <div className="text-lg font-medium">{b.question_text || '(no question text)'}</div>
                  <div className="text-xs text-gray-500 flex flex-wrap gap-2">
                    <span className="rounded-full border px-2 py-0.5">DS: {b.dataset_id}</span>
                    {b.metadata.ReleaseDate && <span>📅 {b.metadata.ReleaseDate}</span>}
                    {b.metadata.SurveyOrg && <span>🏛 {b.metadata.SurveyOrg}</span>}
                    {b.metadata.Country && <span>🌐 {b.metadata.Country}</span>}
                    {b.metadata.SampleSize && <span>👥 N={b.metadata.SampleSize}</span>}
                    {b.metadata.SampleDesc && <span>📝 {b.metadata.SampleDesc}</span>}
                    {b.metadata.Link && (
                      <a href={b.metadata.Link} target="_blank" className="text-blue-600 underline">
                        Source
                      </a>
                    )}
                  </div>
                </div>

                {/* Selection toggle */}
                <div className="shrink-0">
                  {inWs ? (
                    <button
                      onClick={() => removeFromSelection(b.dataset_id, b.question_id)}
                      className="text-sm rounded-xl border px-3 py-1"
                      title="Remove from workspace"
                    >
                      ✓ In workspace
                    </button>
                  ) : (
                    <button
                      onClick={() => addToSelection(b.dataset_id, b.question_id)}
                      className="text-sm rounded-xl border px-3 py-1"
                      title="Add to workspace"
                    >
                      + Add
                    </button>
                  )}
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
                        <td className="py-1 font-mono">{r.value}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              <div className="mt-2 text-xs text-gray-500">
                DatasetID: {b.dataset_id} · QuestionID: {b.question_id}
              </div>
            </div>
          );
        })}
      </div>

      <div className="flex items-center justify-between py-4">
        <button
          className="rounded-xl border px-3 py-2 disabled:opacity-50"
          onClick={() => setOffset(Math.max(0, offset - limit))}
          disabled={offset === 0 || loading}
        >
          ← Prev
        </button>
        <div className="text-sm text-gray-600">Page {page} of {totalPages}</div>
        <button
          className="rounded-xl border px-3 py-2 disabled:opacity-50"
          onClick={() => setOffset(offset + limit)}
          disabled={offset + limit >= total || loading}
        >
          Next →
        </button>
      </div>
    </main>
  );
}
