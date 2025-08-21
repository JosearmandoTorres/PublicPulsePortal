'use client';

import { useEffect, useState } from 'react';

const DEV_USER = 'jose@dev';
const API = process.env.NEXT_PUBLIC_API_URL || 'http://127.0.0.1:8000';

type DatasetItem = { id: string; filename: string; uploaded_at: string };
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
  const [dataset, setDataset] = useState<DatasetItem | null>(null);
  const [selections, setSelections] = useState<SelItem[]>([]);
  const [blocks, setBlocks] = useState<Block[]>([]);
  const [loading, setLoading] = useState<boolean>(false);
  const [err, setErr] = useState<string>('');

  // Remove API + state update
  async function removeFromWorkspace(datasetId: string, questionId: string) {
    const url = `${API}/selections?user_id=${encodeURIComponent(
      DEV_USER
    )}&dataset_id=${encodeURIComponent(datasetId)}&question_id=${encodeURIComponent(
      questionId
    )}`;
    await fetch(url, { method: 'DELETE' });
    setBlocks((prev) => prev.filter((b) => b.question_id !== questionId));
    setSelections((prev) => prev.filter((s) => s.question_id !== questionId));
  }

  function confirmAndRemove(datasetId: string, questionId: string) {
    if (!window.confirm('Remove this question from your workspace?')) return;
    void removeFromWorkspace(datasetId, questionId);
  }

  useEffect(() => {
    let ignore = false;
    async function run() {
      setLoading(true);
      setErr('');
      try {
        // 1) Pick the single/most-recent dataset
        const dsRes = await fetch(`${API}/datasets?limit=200&offset=0`, { cache: 'no-store' });
        if (!dsRes.ok) throw new Error(`Datasets HTTP ${dsRes.status}`);
        const dsData = (await dsRes.json()) as { items: DatasetItem[] };

        if (!dsData.items || dsData.items.length === 0) {
          throw new Error('No dataset found. Upload one first at /upload.');
        }

        const pick = [...dsData.items].sort((a, b) =>
          (b.uploaded_at || '').localeCompare(a.uploaded_at || '')
        )[0];

        if (ignore) return;
        setDataset(pick);

        // 2) Get selections for this user on that dataset
        const selRes = await fetch(
          `${API}/selections?user_id=${encodeURIComponent(DEV_USER)}&dataset_id=${encodeURIComponent(
            pick.id
          )}`
        );
        if (!selRes.ok) throw new Error(`Selections HTTP ${selRes.status}`);
        const sel = (await selRes.json()) as { items: SelItem[] };
        if (ignore) return;
        setSelections(sel.items);

        // 3) Fetch blocks for that dataset and filter to selected ids
        const blocksRes = await fetch(
          `${API}/questions/blocks?dataset_id=${encodeURIComponent(pick.id)}&limit=2000&offset=0`
        );
        if (!blocksRes.ok) throw new Error(`Blocks HTTP ${blocksRes.status}`);
        const all = (await blocksRes.json()) as { items: Block[] };
        const selectedIds = new Set(sel.items.map((s) => s.question_id));
        if (ignore) return;
        setBlocks(all.items.filter((b) => selectedIds.has(b.question_id)));
      } catch (e: any) {
        if (!ignore) setErr(e?.message || 'Failed to load workspace');
      } finally {
        if (!ignore) setLoading(false);
      }
    }
    void run();
    return () => {
      ignore = true;
    };
  }, []);

  return (
  <main
    style={{
      maxWidth: 1000,
      margin: '40px auto',
      padding: 16,
      fontFamily: 'ui-sans-serif, system-ui',
    }}
  >
    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline' }}>
      <h1 style={{ fontSize: 24, fontWeight: 700 }}>Workspace</h1>
      <a href="/datasets" style={{ color: '#2563eb', textDecoration: 'underline' }}>
  ← Back to Database
</a>
    </div>

    {dataset && (
      <div style={{ margin: '8px 0 16px', color: '#666' }}>
        Dataset: <code>{dataset.id}</code> · File: <b>{dataset.filename}</b> · Selected:{' '}
        <b>{selections.length}</b>
      </div>
    )}

    {err && <div style={{ color: 'tomato', marginBottom: 12 }}>Error: {err}</div>}
    {loading && <div>Loading…</div>}

    {!loading && !err && blocks.length === 0 && (
      <div style={{ color: '#666' }}>
        No selections yet. Go back to the Database and click “+ Add” on a block.
      </div>
    )}

      {blocks.map((b) => (
<div
  key={b.question_id}
  style={{
    border: '1px solid #e5e7eb',
    borderRadius: 14,
    padding: 12,
    marginBottom: 12,
  }}
>
  {/* Title + metadata */}
  <div>
    <div style={{ fontWeight: 600 }}>{b.question_text || '(no question text)'}</div>
    <div style={{ fontSize: 12, color: '#6b7280', marginTop: 2 }}>
      {b.metadata.ReleaseDate && <>📅 {b.metadata.ReleaseDate} · </>}
      {b.metadata.SurveyOrg && <>🏛 {b.metadata.SurveyOrg} · </>}
      {b.metadata.Country && <>🌐 {b.metadata.Country} · </>}
      {b.metadata.SampleSize && <>👥 N={b.metadata.SampleSize}</>}
    </div>
  </div>

  {/* Responses table */}
  <div style={{ marginTop: 6, overflow: 'auto' }}>
    <table style={{ minWidth: 480, width: '100%' }}>
      <thead>
        <tr>
          <th align="left">Response</th>
          <th align="left">Value</th>
        </tr>
      </thead>
      <tbody>
        {b.responses.map((r, i) => (
          <tr key={i}>
            <td>{r.RespTxt}</td>
            <td style={{ fontFamily: 'monospace' }}>{r.value}</td>
          </tr>
        ))}
      </tbody>
    </table>
  </div>

  {/* Question ID */}
  <div style={{ marginTop: 6, fontSize: 12, color: '#6b7280' }}>
    QuestionID: {b.question_id}
  </div>

  {/* Bottom Remove button */}
  <div style={{ marginTop: 10, display: 'flex', justifyContent: 'flex-end' }}>
    <button
      onClick={() => dataset && confirmAndRemove(dataset.id, b.question_id)}
      style={{
        backgroundColor: '#ef4444', // red
        color: '#ffffff',
        border: 'none',
        borderRadius: 8,
        padding: '6px 10px',
        fontSize: 12,
        cursor: 'pointer',
      }}
      title="Remove from workspace"
    >
      Remove
    </button>
  </div>

  </div>
))}
    </main>
  );
}
