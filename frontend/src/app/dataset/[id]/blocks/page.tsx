'use client';

import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { useParams } from 'next/navigation';

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

type BlocksResponse = {
  total: number;
  items: Block[];
};

const API = process.env.NEXT_PUBLIC_API_URL || 'http://127.0.0.1:8000';
const DEV_USER = 'jose@dev';

export default function BlocksPage() {
  const params = useParams<{ id: string }>();
  const datasetId = params.id;

  const [q, setQ] = useState<string>('');
  const [blocks, setBlocks] = useState<Block[]>([]);
  const [total, setTotal] = useState<number>(0);
  const [limit, setLimit] = useState<number>(25);
  const [offset, setOffset] = useState<number>(0);
  const [loading, setLoading] = useState<boolean>(false);
  const [error, setError] = useState<string>('');
  const [selected, setSelected] = useState<Record<string, boolean>>({}); // question_id -> selected?

  // simple debounce for search input
  const debouncedQ = useMemo(() => {
    const handle = setTimeout(() => {}, 0);
    return q;
  }, [q]);

  useEffect(() => {
    let ignore = false;

    async function run() {
      setLoading(true);
      setError('');
      try {
        // Fetch blocks (paged, optional search)
        const url = new URL(`${API}/questions/blocks`);
        url.searchParams.set('dataset_id', datasetId);
        url.searchParams.set('limit', String(limit));
        url.searchParams.set('offset', String(offset));
        if (q.trim()) url.searchParams.set('search', q.trim());

        // Fetch current selections for this dataset
        const selUrl = `${API}/selections?user_id=${encodeURIComponent(
          DEV_USER
        )}&dataset_id=${encodeURIComponent(datasetId)}`;

        const [resBlocks, resSel] = await Promise.all([
          fetch(url.toString()),
          fetch(selUrl),
        ]);

        if (!resBlocks.ok) throw new Error(`HTTP ${resBlocks.status}`);
        if (!resSel.ok) throw new Error(`Selections HTTP ${resSel.status}`);

        const data: BlocksResponse = await resBlocks.json();
        const sel: { total: number; items: { question_id: string }[] } =
          await resSel.json();

        if (!ignore) {
          setBlocks(data.items);
          setTotal(data.total);
          const map: Record<string, boolean> = {};
          sel.items.forEach((s) => (map[s.question_id] = true));
          setSelected(map);
        }
      } catch (e: any) {
        if (!ignore) setError(e?.message || 'Failed to load');
      } finally {
        if (!ignore) setLoading(false);
      }
    }

    run();
    return () => {
      ignore = true;
    };
  }, [datasetId, limit, offset, debouncedQ]);

  async function addToSelection(questionId: string) {
    await fetch(`${API}/selections`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        user_id: DEV_USER,
        dataset_id: datasetId,
        question_id: questionId,
      }),
    });
    setSelected((s) => ({ ...s, [questionId]: true }));
  }

  async function removeFromSelection(questionId: string) {
    const url = `${API}/selections?user_id=${encodeURIComponent(
      DEV_USER
    )}&dataset_id=${encodeURIComponent(
      datasetId
    )}&question_id=${encodeURIComponent(questionId)}`;
    await fetch(url, { method: 'DELETE' });
    setSelected((s) => {
      const copy = { ...s };
      delete copy[questionId];
      return copy;
    });
  }

  const totalPages = Math.max(1, Math.ceil(total / limit));
  const page = Math.floor(offset / limit) + 1;

  return (
    <div className="max-w-6xl mx-auto p-6 space-y-6">
      <div className="flex items-center justify-between">
        <div className="space-y-1">
          <h1 className="text-2xl font-semibold">Blocks</h1>
          <p className="text-sm text-gray-500">
            Dataset <span className="font-mono">{datasetId}</span>
          </p>
        </div>
        <div className="flex items-center gap-4">
          <Link href="/workspace" className="text-blue-600 hover:underline">
          Open Workspace →
          </Link>

          <Link href="/datasets" className="text-blue-600 hover:underline">
            ← Back to datasets
          </Link>
        </div>
      </div>

      <div className="grid gap-3 sm:grid-cols-2">
        <input
          value={q}
          onChange={(e) => {
            setOffset(0);
            setQ(e.target.value);
          }}
          placeholder="Search QuestionTxt…"
          className="w-full rounded-xl border p-2"
        />
        <div className="flex gap-2 items-center">
          <label className="text-sm">Per page</label>
          <select
            value={limit}
            onChange={(e) => {
              setOffset(0);
              setLimit(parseInt(e.target.value || '25'));
            }}
            className="rounded-xl border p-2"
          >
            <option value={10}>10</option>
            <option value={25}>25</option>
            <option value={50}>50</option>
          </select>
        </div>
      </div>

      {loading && <div className="text-gray-500">Loading…</div>}
      {error && <div className="text-red-600">Error: {error}</div>}

      <div className="text-sm text-gray-600">
        Showing {blocks.length} of {total} results · Page {page} / {totalPages}
      </div>

      <div className="space-y-5">
        {blocks.map((b) => (
          <div key={b.question_id} className="rounded-2xl border shadow-sm p-4">
            <div className="mb-2 flex items-start justify-between gap-3">
              <div>
                <div className="text-lg font-medium">
                  {b.question_text || '(no question text)'}
                </div>
                <div className="text-xs text-gray-500 flex flex-wrap gap-2">
                  {b.metadata.ReleaseDate && <span>📅 {b.metadata.ReleaseDate}</span>}
                  {b.metadata.SurveyOrg && <span>🏛 {b.metadata.SurveyOrg}</span>}
                  {b.metadata.Country && <span>🌐 {b.metadata.Country}</span>}
                  {b.metadata.SampleSize && <span>👥 N={b.metadata.SampleSize}</span>}
                  {b.metadata.SampleDesc && <span>📝 {b.metadata.SampleDesc}</span>}
                  {b.metadata.Link && (
                    <a
                      href={b.metadata.Link}
                      target="_blank"
                      className="text-blue-600 underline"
                    >
                      Source
                    </a>
                  )}
                </div>
              </div>

              {/* Selection toggle */}
              <div className="shrink-0">
                {selected[b.question_id] ? (
                  <button
                    onClick={() => removeFromSelection(b.question_id)}
                    className="text-sm rounded-xl border px-3 py-1"
                    title="Remove from workspace"
                  >
                    ✓ In workspace
                  </button>
                ) : (
                  <button
                    onClick={() => addToSelection(b.question_id)}
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
              QuestionID: {b.question_id}
            </div>
          </div>
        ))}
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
    </div>
  );
}
