import { FormEvent, useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { api } from "../api/client";
import { SEGMENT_COUNT, Story, StoryImportResult } from "../types";

const emptyPrompts = () => new Array(SEGMENT_COUNT).fill("");

export default function StoriesPage() {
  const [stories, setStories] = useState<Story[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [pageSize] = useState(10);
  const [search, setSearch] = useState("");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState({ name: "", description: "", prompts: emptyPrompts() });
  const [formError, setFormError] = useState<string | null>(null);

  const [importText, setImportText] = useState("");
  const [importResult, setImportResult] = useState<StoryImportResult | null>(null);
  const [showImport, setShowImport] = useState(false);

  async function refresh() {
    setLoading(true);
    setError(null);
    try {
      const res = await api.listStories(page, pageSize, search || undefined);
      setStories(res.items);
      setTotal(res.total);
    } catch {
      setError("載入故事清單失敗");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    refresh();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [page, search]);

  async function handleCreate(e: FormEvent) {
    e.preventDefault();
    setFormError(null);
    if (form.prompts.some((p) => !p.trim())) {
      setFormError(`必須填寫全部 ${SEGMENT_COUNT} 個提示詞`);
      return;
    }
    try {
      await api.createStory(form);
      setForm({ name: "", description: "", prompts: emptyPrompts() });
      setShowForm(false);
      refresh();
    } catch {
      setFormError("建立故事失敗");
    }
  }

  async function handleDelete(id: string) {
    if (!confirm("確定要刪除這個故事嗎？已產生的影片仍會保留，但無法再從故事清單找到它們的來源故事名稱。")) {
      return;
    }
    await api.deleteStory(id);
    refresh();
  }

  async function handleImport(e: FormEvent) {
    e.preventDefault();
    setImportResult(null);
    try {
      const parsed = JSON.parse(importText);
      const result = await api.importStories(parsed);
      setImportResult(result);
      refresh();
    } catch (err) {
      setImportResult({
        createdCount: 0,
        created: [],
        errors: [{ index: -1, errors: [err instanceof Error ? err.message : "JSON 格式錯誤"] }],
      });
    }
  }

  const totalPages = Math.max(1, Math.ceil(total / pageSize));

  return (
    <div>
      <h2>故事維護</h2>

      <div className="card">
        <div style={{ display: "flex", gap: "0.5rem", marginBottom: "0.75rem" }}>
          <input
            type="text"
            placeholder="搜尋故事名稱"
            value={search}
            onChange={(e) => {
              setPage(1);
              setSearch(e.target.value);
            }}
          />
          <button className="btn primary" onClick={() => setShowForm((v) => !v)}>
            {showForm ? "取消新增" : "＋ 新增故事"}
          </button>
          <button className="btn" onClick={() => setShowImport((v) => !v)}>
            {showImport ? "取消匯入" : "批次匯入 JSON"}
          </button>
        </div>

        {showForm && (
          <form onSubmit={handleCreate} style={{ marginTop: "1rem" }}>
            <div style={{ marginBottom: "0.5rem" }}>
              <label>故事名稱</label>
              <input
                type="text"
                value={form.name}
                onChange={(e) => setForm({ ...form, name: e.target.value })}
                required
              />
            </div>
            <div style={{ marginBottom: "0.5rem" }}>
              <label>故事簡述</label>
              <textarea
                value={form.description}
                onChange={(e) => setForm({ ...form, description: e.target.value })}
                rows={2}
              />
            </div>
            {form.prompts.map((p, i) => (
              <div style={{ marginBottom: "0.5rem" }} key={i}>
                <label>提示詞 {i + 1}</label>
                <input
                  type="text"
                  value={p}
                  onChange={(e) => {
                    const prompts = [...form.prompts];
                    prompts[i] = e.target.value;
                    setForm({ ...form, prompts });
                  }}
                  required
                />
              </div>
            ))}
            {formError && <p className="error-text">{formError}</p>}
            <button className="btn primary" type="submit">
              建立故事
            </button>
          </form>
        )}

        {showImport && (
          <form onSubmit={handleImport} style={{ marginTop: "1rem" }}>
            <p style={{ fontSize: "0.85rem", color: "#555" }}>
              貼上 JSON 陣列，每筆物件需包含 name、description（選填）、prompts（長度為 7 的字串陣列）。
            </p>
            <textarea
              rows={8}
              value={importText}
              onChange={(e) => setImportText(e.target.value)}
              placeholder='[{"name":"story A","description":"...","prompts":["p1","p2","p3","p4","p5","p6","p7"]}]'
            />
            <button className="btn primary" type="submit" style={{ marginTop: "0.5rem" }}>
              匯入
            </button>
            {importResult && (
              <div style={{ marginTop: "0.5rem" }}>
                <p>成功建立 {importResult.createdCount} 筆</p>
                {importResult.errors.length > 0 && (
                  <ul className="error-text">
                    {importResult.errors.map((err, i) => (
                      <li key={i}>
                        第 {err.index + 1} 筆 ({err.name ?? "未命名"})：{err.errors.join("; ")}
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            )}
          </form>
        )}
      </div>

      {loading && <p>載入中…</p>}
      {error && <p className="error-text">{error}</p>}

      <div className="grid" style={{ gridTemplateColumns: "1fr" }}>
        {stories.map((s) => (
          <div className="card" key={s.id}>
            <div style={{ display: "flex", justifyContent: "space-between" }}>
              <div>
                <h3 style={{ margin: 0 }}>
                  <Link to={`/stories/${s.id}`}>{s.name}</Link>
                </h3>
                <p style={{ color: "#666", margin: "0.25rem 0" }}>{s.description}</p>
              </div>
              <div>
                <button className="btn danger" onClick={() => handleDelete(s.id)}>
                  刪除
                </button>
              </div>
            </div>
          </div>
        ))}
        {!loading && stories.length === 0 && <p>目前沒有故事，請新增或匯入。</p>}
      </div>

      <div className="pagination">
        <button className="btn" disabled={page <= 1} onClick={() => setPage((p) => p - 1)}>
          上一頁
        </button>
        <span>
          第 {page} / {totalPages} 頁
        </span>
        <button
          className="btn"
          disabled={page >= totalPages}
          onClick={() => setPage((p) => p + 1)}
        >
          下一頁
        </button>
      </div>
    </div>
  );
}
