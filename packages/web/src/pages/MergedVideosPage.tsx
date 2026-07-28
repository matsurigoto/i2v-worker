import { useEffect, useState } from "react";
import { api } from "../api/client";
import type { MergedVideo } from "../types";

export default function MergedVideosPage() {
  const [items, setItems] = useState<MergedVideo[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const pageSize = 24;
  const [searchQuery, setSearchQuery] = useState("");
  const [activeQuery, setActiveQuery] = useState("");
  const [preview, setPreview] = useState<MergedVideo | null>(null);
  const [loading, setLoading] = useState(true);

  async function refresh() {
    setLoading(true);
    try {
      const res = await api.listMergedVideos(page, pageSize, activeQuery || undefined);
      setItems(res.items);
      setTotal(res.total);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    refresh();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [page, activeQuery]);

  function handleSearch() {
    setPage(1);
    setActiveQuery(searchQuery.trim());
  }

  async function handleDelete(item: MergedVideo) {
    if (!confirm(`確定要刪除合併影片「${item.name}」嗎？`)) return;
    await api.deleteMergedVideo(item.id);
    refresh();
  }

  const totalPages = Math.max(1, Math.ceil(total / pageSize));

  return (
    <div>
      <h2>合併影片管理</h2>

      <div className="card" style={{ display: "flex", gap: "0.5rem", alignItems: "center" }}>
        <input
          type="text"
          placeholder="依故事名稱搜尋…"
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
          onKeyDown={(e) => { if (e.key === "Enter") handleSearch(); }}
          style={{ flex: 1 }}
        />
        <button className="btn primary" onClick={handleSearch}>搜尋</button>
        {activeQuery && (
          <button className="btn" onClick={() => { setSearchQuery(""); setActiveQuery(""); setPage(1); }}>
            清除
          </button>
        )}
      </div>

      {loading && <p>載入中…</p>}

      <div className="grid cols-4">
        {items.map((item) => (
          <div className="card image-tile" key={item.id}>
            {item.thumbnailUrl ? (
              <img
                src={item.thumbnailUrl}
                alt={item.name}
                style={{ width: "100%", height: 200, objectFit: "cover", cursor: "pointer", borderRadius: "6px" }}
                onClick={() => setPreview(item)}
              />
            ) : (
              <div
                style={{
                  width: "100%",
                  height: 200,
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  background: "#e5e7eb",
                  borderRadius: "6px",
                  color: "#888",
                }}
              >
                {item.status === "processing" ? "合併中…" : "無縮圖"}
              </div>
            )}
            <div style={{ padding: "0.5rem 0", fontSize: "0.85rem" }}>
              <div style={{ fontWeight: 600, wordBreak: "break-all" }}>{item.name}</div>
              <div style={{ color: "#888", fontSize: "0.8rem" }}>
                {new Date(item.createdAt).toLocaleString()}
              </div>
              {item.status === "processing" && (
                <span className="badge running" style={{ marginTop: "0.25rem" }}>合併中</span>
              )}
              {item.status === "failed" && (
                <span className="badge failed" style={{ marginTop: "0.25rem" }}>失敗</span>
              )}
            </div>
            <button
              className="btn danger"
              style={{ fontSize: "0.8rem", padding: "0.15rem 0.5rem" }}
              onClick={() => handleDelete(item)}
            >
              刪除
            </button>
          </div>
        ))}
      </div>

      {!loading && items.length === 0 && (
        <p style={{ color: "#888" }}>
          {activeQuery ? `找不到符合「${activeQuery}」的合併影片。` : "尚無合併影片。"}
        </p>
      )}

      <div style={{ marginTop: "1rem", display: "flex", gap: "0.5rem", alignItems: "center" }}>
        <button className="btn" disabled={page <= 1} onClick={() => setPage(page - 1)}>
          上一頁
        </button>
        <span>第 {page} / {totalPages} 頁（共 {total} 筆）</span>
        <button className="btn" disabled={page >= totalPages} onClick={() => setPage(page + 1)}>
          下一頁
        </button>
      </div>

      {preview && (
        <div className="lightbox-backdrop" onClick={() => setPreview(null)}>
          <div onClick={(e) => e.stopPropagation()} style={{ textAlign: "center" }}>
            {preview.videoUrl ? (
              <video
                src={preview.videoUrl}
                controls
                autoPlay
                style={{ maxWidth: "90vw", maxHeight: "80vh" }}
              />
            ) : (
              <p style={{ color: "#fff" }}>影片尚未就緒</p>
            )}
            <div style={{ color: "#fff", marginTop: "0.5rem" }}>
              <span>{preview.name}</span>{" "}
              <button className="btn" onClick={() => setPreview(null)}>關閉</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
