import { FormEvent, useEffect, useState } from "react";
import { api } from "../api/client";
import { Series } from "../types";

export default function SeriesPage() {
  const [seriesList, setSeriesList] = useState<Series[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState({ name: "", description: "" });
  const [formError, setFormError] = useState<string | null>(null);

  const [editingId, setEditingId] = useState<string | null>(null);
  const [editForm, setEditForm] = useState({ name: "", description: "" });
  const [editError, setEditError] = useState<string | null>(null);

  async function refresh() {
    setLoading(true);
    setError(null);
    try {
      const res = await api.listSeries();
      setSeriesList(res.items);
    } catch {
      setError("載入系列清單失敗");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    refresh();
  }, []);

  async function handleCreate(e: FormEvent) {
    e.preventDefault();
    setFormError(null);
    try {
      await api.createSeries(form);
      setForm({ name: "", description: "" });
      setShowForm(false);
      refresh();
    } catch {
      setFormError("建立系列失敗");
    }
  }

  function startEdit(s: Series) {
    setEditingId(s.id);
    setEditForm({ name: s.name, description: s.description });
    setEditError(null);
  }

  async function handleUpdate(e: FormEvent, id: string) {
    e.preventDefault();
    setEditError(null);
    try {
      await api.updateSeries(id, editForm);
      setEditingId(null);
      refresh();
    } catch {
      setEditError("更新系列失敗");
    }
  }

  async function handleDelete(id: string, name: string) {
    if (!confirm(`確定要刪除系列「${name}」嗎？屬於此系列的故事將改為「預設」系列。`)) {
      return;
    }
    await api.deleteSeries(id);
    refresh();
  }

  return (
    <div>
      <h2>系列管理</h2>

      <div className="card">
        <div style={{ marginBottom: "0.75rem" }}>
          <button className="btn primary" onClick={() => setShowForm((v) => !v)}>
            {showForm ? "取消新增" : "＋ 新增系列"}
          </button>
        </div>

        {showForm && (
          <form onSubmit={handleCreate} style={{ marginTop: "0.5rem" }}>
            <div style={{ marginBottom: "0.5rem" }}>
              <label>系列名稱</label>
              <input
                type="text"
                value={form.name}
                onChange={(e) => setForm({ ...form, name: e.target.value })}
                required
              />
            </div>
            <div style={{ marginBottom: "0.5rem" }}>
              <label>系列簡述</label>
              <textarea
                value={form.description}
                onChange={(e) => setForm({ ...form, description: e.target.value })}
                rows={2}
              />
            </div>
            {formError && <p className="error-text">{formError}</p>}
            <button className="btn primary" type="submit">
              建立系列
            </button>
          </form>
        )}
      </div>

      {loading && <p>載入中…</p>}
      {error && <p className="error-text">{error}</p>}

      <div className="grid" style={{ gridTemplateColumns: "1fr" }}>
        {seriesList.map((s) =>
          editingId === s.id ? (
            <div className="card" key={s.id}>
              <form onSubmit={(e) => handleUpdate(e, s.id)}>
                <div style={{ marginBottom: "0.5rem" }}>
                  <label>系列名稱</label>
                  <input
                    type="text"
                    value={editForm.name}
                    onChange={(e) => setEditForm({ ...editForm, name: e.target.value })}
                    required
                  />
                </div>
                <div style={{ marginBottom: "0.5rem" }}>
                  <label>系列簡述</label>
                  <textarea
                    value={editForm.description}
                    onChange={(e) => setEditForm({ ...editForm, description: e.target.value })}
                    rows={2}
                  />
                </div>
                {editError && <p className="error-text">{editError}</p>}
                <div style={{ display: "flex", gap: "0.5rem" }}>
                  <button className="btn primary" type="submit">
                    儲存
                  </button>
                  <button className="btn" type="button" onClick={() => setEditingId(null)}>
                    取消
                  </button>
                </div>
              </form>
            </div>
          ) : (
            <div className="card" key={s.id}>
              <div style={{ display: "flex", justifyContent: "space-between" }}>
                <div>
                  <h3 style={{ margin: 0 }}>{s.name}</h3>
                  <p style={{ color: "#666", margin: "0.25rem 0" }}>{s.description}</p>
                </div>
                <div style={{ display: "flex", gap: "0.5rem" }}>
                  <button className="btn" onClick={() => startEdit(s)}>
                    編輯
                  </button>
                  <button className="btn danger" onClick={() => handleDelete(s.id, s.name)}>
                    刪除
                  </button>
                </div>
              </div>
            </div>
          ),
        )}
        {!loading && seriesList.length === 0 && <p>目前沒有系列，請新增。</p>}
      </div>
    </div>
  );
}
