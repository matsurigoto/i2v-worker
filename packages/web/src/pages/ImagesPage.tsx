import { ChangeEvent, useEffect, useRef, useState } from "react";
import { api } from "../api/client";
import { ImageAsset } from "../types";

export default function ImagesPage() {
  const [images, setImages] = useState<ImageAsset[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [pageSize] = useState(24);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [preview, setPreview] = useState<ImageAsset | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  async function refresh() {
    setLoading(true);
    setError(null);
    try {
      const res = await api.listImages(page, pageSize);
      setImages(res.items);
      setTotal(res.total);
    } catch {
      setError("載入圖片清單失敗");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    refresh();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [page]);

  async function handleUpload(e: ChangeEvent<HTMLInputElement>) {
    if (!e.target.files || e.target.files.length === 0) return;
    try {
      await api.uploadImages(e.target.files);
      if (fileInputRef.current) fileInputRef.current.value = "";
      setPage(1);
      refresh();
    } catch {
      setError("上傳圖片失敗");
    }
  }

  async function handleDelete(image: ImageAsset) {
    if (!confirm(`確定要刪除圖片「${image.name}」嗎？`)) return;
    const result = await api.deleteImage(image.id);
    if (result.wasUsedByVideoJobs) {
      alert("此圖片曾被用於產生影片，已產生的影片不受影響，圖片已刪除。");
    }
    setPreview(null);
    refresh();
  }

  const totalPages = Math.max(1, Math.ceil(total / pageSize));

  return (
    <div>
      <h2>圖片維護系統</h2>

      <div className="card">
        <label className="btn primary" style={{ display: "inline-block" }}>
          上傳圖片（可多選）
          <input
            ref={fileInputRef}
            type="file"
            accept="image/*"
            multiple
            onChange={handleUpload}
            style={{ display: "none" }}
          />
        </label>
      </div>

      {loading && <p>載入中…</p>}
      {error && <p className="error-text">{error}</p>}

      <div className="grid cols-4">
        {images.map((img) => (
          <div className="image-tile" key={img.id} onClick={() => setPreview(img)}>
            <img src={img.url} alt={img.name} />
            <div className="caption">
              <span title={img.name}>{img.name}</span>
            </div>
          </div>
        ))}
        {!loading && images.length === 0 && <p>目前沒有圖片，請上傳。</p>}
      </div>

      <div className="pagination">
        <button className="btn" disabled={page <= 1} onClick={() => setPage((p) => p - 1)}>
          上一頁
        </button>
        <span>
          第 {page} / {totalPages} 頁（共 {total} 張）
        </span>
        <button
          className="btn"
          disabled={page >= totalPages}
          onClick={() => setPage((p) => p + 1)}
        >
          下一頁
        </button>
      </div>

      {preview && (
        <div className="lightbox-backdrop" onClick={() => setPreview(null)}>
          <div onClick={(e) => e.stopPropagation()} style={{ textAlign: "center" }}>
            <img src={preview.url} alt={preview.name} />
            <div style={{ color: "#fff", marginTop: "0.5rem" }}>
              <span>{preview.name}</span>{" "}
              <button className="btn danger" onClick={() => handleDelete(preview)}>
                刪除
              </button>{" "}
              <button className="btn" onClick={() => setPreview(null)}>
                關閉
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
