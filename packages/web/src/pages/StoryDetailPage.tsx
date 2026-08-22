import { useEffect, useState } from "react";
import { useParams } from "react-router-dom";
import { api } from "../api/client";
import { ImageAsset, SEGMENT_COUNT, Series, Story, VideoJob, VideoSegment } from "../types";

const VIDEO_CHAIN_EXPLANATION =
  "PAAS API 僅提供 image-to-video，沒有 video-to-video。第 2~7 段影片，是由前一段影片擷取最後一幀畫面(ffmpeg)做為新的 image 輸入，" +
  "搭配該段的提示詞再次呼叫 image-to-video 產生，形成七段影片接龍。";

export default function StoryDetailPage() {
  const { id } = useParams<{ id: string }>();
  const [story, setStory] = useState<Story | null>(null);
  const [jobs, setJobs] = useState<VideoJob[]>([]);
  const [images, setImages] = useState<ImageAsset[]>([]);
  const [seriesList, setSeriesList] = useState<Series[]>([]);
  const [selectedImageIds, setSelectedImageIds] = useState<string[]>([]);
  const [showImagePicker, setShowImagePicker] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [triggering, setTriggering] = useState(false);
  const [fullscreen, setFullscreen] = useState<{ job: VideoJob; seq: number } | null>(null);
  const [previewError, setPreviewError] = useState<Record<string, boolean>>({});
  const [editingSeriesId, setEditingSeriesId] = useState<string | null | undefined>(undefined);
  const [seriesUpdateError, setSeriesUpdateError] = useState<string | null>(null);
  const [editingPrompts, setEditingPrompts] = useState<string[] | null>(null);
  const [promptsUpdateError, setPromptsUpdateError] = useState<string | null>(null);
  const [promptsCopied, setPromptsCopied] = useState(false);
  const [editingName, setEditingName] = useState<string | null>(null);
  const [nameUpdateError, setNameUpdateError] = useState<string | null>(null);
  const [editingDescription, setEditingDescription] = useState<string | null>(null);
  const [descUpdateError, setDescUpdateError] = useState<string | null>(null);
  const [mergingJobId, setMergingJobId] = useState<string | null>(null);
  const [regenTarget, setRegenTarget] = useState<{ jobId: string; seq: number; prompt: string } | null>(null);
  const [regenLoading, setRegenLoading] = useState(false);
  const [regenError, setRegenError] = useState<string | null>(null);
  async function refresh() {
    if (!id) return;
    try {
      const [storyRes, jobsRes] = await Promise.all([api.getStory(id), api.listVideoJobs(id)]);
      setStory(storyRes);
      setJobs(jobsRes.items);
    } catch {
      setError("載入故事詳情失敗");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    refresh();
    let cancelled = false;
    (async () => {
      try {
        const pageSize = 100;
        const first = await api.listImages(1, pageSize);
        if (cancelled) return;
        const allItems = [...first.items];
        const totalPages = Math.ceil(first.total / pageSize);
        for (let p = 2; p <= totalPages; p++) {
          const next = await api.listImages(p, pageSize);
          if (cancelled) return;
          allItems.push(...next.items);
        }
        setImages(allItems);
      } catch {
        // image list loading failure is non-critical; picker will show empty
      }
    })();
    api.listSeries().then((res) => setSeriesList(res.items));
    // eslint-disable-next-line react-hooks/exhaustive-deps
    return () => { cancelled = true; };
  }, [id]);

  // Poll while any job is still running so segment progress updates live.
  useEffect(() => {
    const hasRunning = jobs.some((j) => j.status === "running");
    if (!hasRunning) return;
    const timer = setInterval(refresh, 4000);
    return () => clearInterval(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [jobs]);

  useEffect(() => {
    setPreviewError({});
  }, [selectedImageIds]);

  async function handleTrigger() {
    if (!id || selectedImageIds.length === 0) return;
    setTriggering(true);
    setError(null);
    const failed: string[] = [];
    try {
      for (const imageId of selectedImageIds) {
        try {
          await api.triggerVideoJob(id, imageId);
        } catch {
          failed.push(imageId);
        }
      }
      const succeeded = selectedImageIds.filter((imgId) => !failed.includes(imgId));
      if (succeeded.length > 0) {
        setSelectedImageIds(failed);
        refresh();
      }
      if (failed.length > 0) {
        setError(`${failed.length} 張圖片觸發失敗，其餘已成功排入佇列`);
      }
    } finally {
      setTriggering(false);
    }
  }

  async function handleDeleteJob(jobId: string) {
    if (!confirm("確定要刪除這批影片（七段）嗎？")) return;
    await api.deleteVideoJob(jobId);
    refresh();
  }

  async function handleMerge(jobId: string) {
    setMergingJobId(jobId);
    setError(null);
    try {
      await api.mergeVideoJob(jobId);
      alert("合併任務已排入佇列，請至「合併影片」頁面查看進度。");
    } catch {
      setError("觸發合併失敗");
    } finally {
      setMergingJobId(null);
    }
  }

  function openRegenModal(jobId: string, seq: number) {
    const currentPrompt = story?.prompts[seq - 1] ?? "";
    setRegenTarget({ jobId, seq, prompt: currentPrompt });
    setRegenError(null);
  }

  async function handleRegenConfirm() {
    if (!regenTarget) return;
    setRegenLoading(true);
    setRegenError(null);
    try {
      await api.regenerateSegment(regenTarget.jobId, regenTarget.seq, regenTarget.prompt);
      setRegenTarget(null);
      refresh();
    } catch {
      setRegenError("重新產生失敗，請稍後再試");
    } finally {
      setRegenLoading(false);
    }
  }

  if (loading) return <p>載入中…</p>;
  if (!story) return <p className="error-text">找不到故事</p>;

  const currentSeriesName = story.seriesId
    ? (seriesList.find((s) => s.id === story.seriesId)?.name ?? "未知系列")
    : "預設";

  async function handleSeriesSave() {
    if (!id) return;
    setSeriesUpdateError(null);
    try {
      await api.updateStory(id, { seriesId: editingSeriesId ?? null });
      setEditingSeriesId(undefined);
      refresh();
    } catch {
      setSeriesUpdateError("更新系列失敗");
    }
  }

  async function handlePromptsSave() {
    if (!id || !editingPrompts) return;
    setPromptsUpdateError(null);
    if (editingPrompts.some((p) => !p.trim())) {
      setPromptsUpdateError(`必須填寫全部 ${SEGMENT_COUNT} 個提示詞`);
      return;
    }
    try {
      await api.updateStory(id, { prompts: editingPrompts });
      setEditingPrompts(null);
      refresh();
    } catch {
      setPromptsUpdateError("更新提示詞失敗");
    }
  }

  async function handleNameSave() {
    if (!id || editingName === null) return;
    setNameUpdateError(null);
    if (!editingName.trim()) {
      setNameUpdateError("名稱不可為空");
      return;
    }
    try {
      await api.updateStory(id, { name: editingName.trim() });
      setEditingName(null);
      refresh();
    } catch {
      setNameUpdateError("更新名稱失敗");
    }
  }

  async function handleDescriptionSave() {
    if (!id || editingDescription === null) return;
    setDescUpdateError(null);
    try {
      await api.updateStory(id, { description: editingDescription });
      setEditingDescription(null);
      refresh();
    } catch {
      setDescUpdateError("更新描述失敗");
    }
  }

  return (
    <div>
      {editingName === null ? (
        <h2>
          {story.name}{" "}
          <button
            className="btn"
            style={{ fontSize: "0.8rem", padding: "0.1rem 0.5rem", verticalAlign: "middle" }}
            onClick={() => setEditingName(story.name)}
          >
            編輯
          </button>
        </h2>
      ) : (
        <div style={{ marginBottom: "0.5rem" }}>
          <input
            type="text"
            value={editingName}
            onChange={(e) => setEditingName(e.target.value)}
            style={{ fontSize: "1.3rem", fontWeight: "bold" }}
          />{" "}
          <button
            className="btn primary"
            style={{ fontSize: "0.8rem", padding: "0.1rem 0.5rem" }}
            onClick={handleNameSave}
          >
            儲存
          </button>{" "}
          <button
            className="btn"
            style={{ fontSize: "0.8rem", padding: "0.1rem 0.5rem" }}
            onClick={() => { setEditingName(null); setNameUpdateError(null); }}
          >
            取消
          </button>
          {nameUpdateError && <span className="error-text"> {nameUpdateError}</span>}
        </div>
      )}
      {editingDescription === null ? (
        <p style={{ color: "#666" }}>
          {story.description || "（無描述）"}{" "}
          <button
            className="btn"
            style={{ fontSize: "0.8rem", padding: "0.1rem 0.5rem" }}
            onClick={() => setEditingDescription(story.description)}
          >
            編輯
          </button>
        </p>
      ) : (
        <div style={{ marginBottom: "0.5rem" }}>
          <textarea
            value={editingDescription}
            onChange={(e) => setEditingDescription(e.target.value)}
            rows={3}
            style={{ width: "100%" }}
          />{" "}
          <button
            className="btn primary"
            style={{ fontSize: "0.8rem", padding: "0.1rem 0.5rem" }}
            onClick={handleDescriptionSave}
          >
            儲存
          </button>{" "}
          <button
            className="btn"
            style={{ fontSize: "0.8rem", padding: "0.1rem 0.5rem" }}
            onClick={() => { setEditingDescription(null); setDescUpdateError(null); }}
          >
            取消
          </button>
          {descUpdateError && <span className="error-text"> {descUpdateError}</span>}
        </div>
      )}
      <p style={{ fontSize: "0.85rem", color: "#888" }}>
        系列：{currentSeriesName}{" "}
        {editingSeriesId === undefined ? (
          <button
            className="btn"
            style={{ fontSize: "0.8rem", padding: "0.1rem 0.5rem" }}
            onClick={() => setEditingSeriesId(story.seriesId)}
          >
            變更
          </button>
        ) : (
          <>
            <select
              value={editingSeriesId ?? ""}
              onChange={(e) => setEditingSeriesId(e.target.value || null)}
              style={{ fontSize: "0.85rem" }}
            >
              <option value="">預設（無系列）</option>
              {seriesList.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.name}
                </option>
              ))}
            </select>{" "}
            <button
              className="btn primary"
              style={{ fontSize: "0.8rem", padding: "0.1rem 0.5rem" }}
              onClick={handleSeriesSave}
            >
              儲存
            </button>{" "}
            <button
              className="btn"
              style={{ fontSize: "0.8rem", padding: "0.1rem 0.5rem" }}
              onClick={() => { setEditingSeriesId(undefined); setSeriesUpdateError(null); }}
            >
              取消
            </button>
            {seriesUpdateError && <span className="error-text"> {seriesUpdateError}</span>}
          </>
        )}
      </p>

      <div className="card">
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
          <h3 style={{ margin: 0 }}>七段提示詞</h3>
          {editingPrompts === null && (
            <div style={{ display: "flex", gap: "0.5rem" }}>
              <button
                className="btn"
                style={{ fontSize: "0.8rem", padding: "0.1rem 0.5rem" }}
                onClick={() => setEditingPrompts([...story.prompts])}
              >
                編輯提示詞
              </button>
              <button
                className="btn"
                style={{ fontSize: "0.8rem", padding: "0.1rem 0.5rem" }}
                onClick={() => {
                  navigator.clipboard.writeText(JSON.stringify(story.prompts, null, 2)).then(() => {
                    setPromptsCopied(true);
                    setTimeout(() => setPromptsCopied(false), 1500);
                  });
                }}
              >
                {promptsCopied ? "已複製！" : "複製 JSON"}
              </button>
            </div>
          )}
        </div>
        {editingPrompts === null ? (
          <ol>
            {story.prompts.map((p, i) => (
              <li key={i}>{p}</li>
            ))}
          </ol>
        ) : (
          <div style={{ marginTop: "0.5rem" }}>
            {editingPrompts.map((p, i) => (
              <div style={{ marginBottom: "0.5rem" }} key={i}>
                <label>提示詞 {i + 1}</label>
                <input
                  type="text"
                  value={p}
                  onChange={(e) => {
                    const prompts = [...editingPrompts];
                    prompts[i] = e.target.value;
                    setEditingPrompts(prompts);
                  }}
                />
              </div>
            ))}
            {promptsUpdateError && <p className="error-text">{promptsUpdateError}</p>}
            <div style={{ display: "flex", gap: "0.5rem" }}>
              <button className="btn primary" onClick={handlePromptsSave}>
                儲存提示詞
              </button>
              <button
                className="btn"
                onClick={() => { setEditingPrompts(null); setPromptsUpdateError(null); }}
              >
                取消
              </button>
            </div>
          </div>
        )}
      </div>

      <div className="card">
        <h3>產生影片</h3>
        <p style={{ fontSize: "0.85rem", color: "#555" }}>{VIDEO_CHAIN_EXPLANATION}</p>
        <div style={{ display: "flex", alignItems: "flex-start", gap: "0.75rem", flexWrap: "wrap" }}>
          <button className="btn" onClick={() => setShowImagePicker(true)}>
            選擇圖片…
          </button>
          <button
            className="btn primary"
            disabled={selectedImageIds.length === 0 || triggering}
            onClick={handleTrigger}
          >
            {triggering
              ? "觸發中…"
              : selectedImageIds.length > 0
              ? `開始產生七段影片（${selectedImageIds.length} 張）`
              : "開始產生七段影片"}
          </button>
        </div>
        {selectedImageIds.length > 0 && (
          <div style={{ display: "flex", gap: "0.5rem", flexWrap: "wrap", marginTop: "0.75rem" }}>
            {selectedImageIds.map((imgId) => {
              const img = images.find((i) => i.id === imgId);
              if (!img) return null;
              return (
                <div key={imgId} style={{ position: "relative" }}>
                  {!previewError[imgId] ? (
                    <img
                      className="image-select-preview"
                      src={img.url}
                      alt={img.name}
                      title={img.name}
                      onError={() => setPreviewError((prev) => ({ ...prev, [imgId]: true }))}
                    />
                  ) : (
                    <div
                      className="image-select-preview"
                      style={{ display: "flex", alignItems: "center", justifyContent: "center", background: "#f0f1f4", fontSize: "0.7rem", color: "#999" }}
                      title={img.name}
                    >
                      無縮圖
                    </div>
                  )}
                  <button
                    onClick={() => setSelectedImageIds((prev) => prev.filter((i) => i !== imgId))}
                    style={{
                      position: "absolute",
                      top: -6,
                      right: -6,
                      width: 18,
                      height: 18,
                      borderRadius: "50%",
                      border: "none",
                      background: "#dc2626",
                      color: "#fff",
                      fontSize: "0.65rem",
                      cursor: "pointer",
                      lineHeight: 1,
                      padding: 0,
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "center",
                    }}
                    title={`移除 ${img.name}`}
                  >
                    ✕
                  </button>
                </div>
              );
            })}
          </div>
        )}
        {error && <p className="error-text">{error}</p>}
        {showImagePicker && (
          <ImagePickerModal
            images={images}
            selected={selectedImageIds}
            onConfirm={(ids) => { setSelectedImageIds(ids); setShowImagePicker(false); }}
            onCancel={() => setShowImagePicker(false)}
          />
        )}
      </div>

      <div className="card">
        <h3>影片牆</h3>
        {jobs.length === 0 && <p>尚未產生任何影片。</p>}
        {jobs.map((job) => (
          <div className="segment-row" key={job.id}>
            <div style={{ minWidth: 140, flexShrink: 0 }}>
              <div>{new Date(job.triggeredAt).toLocaleString()}</div>
              <span className={`badge ${job.status}`}>{job.status}</span>
              <div style={{ display: "flex", gap: "0.25rem", flexWrap: "wrap" }}>
                {job.status === "completed" && (
                  <button
                    className="btn primary"
                    disabled={mergingJobId === job.id}
                    onClick={() => handleMerge(job.id)}
                  >
                    {mergingJobId === job.id ? "排入中…" : "合併影片"}
                  </button>
                )}
                <button className="btn danger" onClick={() => handleDeleteJob(job.id)}>
                  刪除
                </button>
              </div>
            </div>
            {Array.from({ length: SEGMENT_COUNT }, (_, i) => i + 1).map((seq) => {
              const segment = job.segments.find((s) => s.seq === seq);
              return (
                <SegmentCell
                  key={seq}
                  seq={seq}
                  segment={segment}
                  onOpen={() => setFullscreen({ job, seq })}
                  onRegen={() => openRegenModal(job.id, seq)}
                />
              );
            })}
          </div>
        ))}
      </div>

      {fullscreen && (
        <FullscreenPlayer
          job={fullscreen.job}
          seq={fullscreen.seq}
          onClose={() => setFullscreen(null)}
          onChangeSeq={(seq) => setFullscreen({ job: fullscreen.job, seq })}
        />
      )}

      {regenTarget && (
        <div className="lightbox-backdrop" onClick={() => !regenLoading && setRegenTarget(null)}>
          <div
            onClick={(e) => e.stopPropagation()}
            style={{
              background: "#fff",
              borderRadius: "0.5rem",
              padding: "1.5rem",
              maxWidth: 480,
              width: "90%",
            }}
          >
            <h3 style={{ marginTop: 0 }}>重新產生第 {regenTarget.seq} 段影片</h3>
            <p style={{ fontSize: "0.85rem", color: "#555", marginTop: 0 }}>
              {regenTarget.seq === 1
                ? "使用原始來源圖片作為輸入。"
                : `使用第 ${regenTarget.seq - 1} 段影片的最後一幀作為輸入。`}
            </p>
            <label style={{ display: "block", marginBottom: "0.4rem", fontWeight: "bold" }}>
              提示詞
            </label>
            <textarea
              rows={4}
              style={{ width: "100%", boxSizing: "border-box" }}
              value={regenTarget.prompt}
              onChange={(e) => setRegenTarget({ ...regenTarget, prompt: e.target.value })}
              disabled={regenLoading}
            />
            {regenError && <p className="error-text">{regenError}</p>}
            <div style={{ display: "flex", gap: "0.5rem", marginTop: "1rem" }}>
              <button
                className="btn primary"
                disabled={regenLoading || !regenTarget.prompt.trim()}
                onClick={handleRegenConfirm}
              >
                {regenLoading ? "排入中…" : "確認重新產生"}
              </button>
              <button
                className="btn"
                disabled={regenLoading}
                onClick={() => setRegenTarget(null)}
              >
                取消
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function SegmentCell({
  seq,
  segment,
  onOpen,
  onRegen,
}: {
  seq: number;
  segment: VideoSegment | undefined;
  onOpen: () => void;
  onRegen: () => void;
}) {
  if (!segment || (!segment.videoUrl && segment.status !== "processing" && segment.status !== "failed")) {
    return <div className="segment-cell empty">#{seq} 無影像</div>;
  }
  if (segment.status === "processing" || segment.status === "pending") {
    return (
      <div className="segment-cell">
        #{seq}
        <br />
        產生中…
      </div>
    );
  }
  if (segment.status === "failed") {
    return (
      <div className="segment-cell" title={segment.errorMessage ?? ""}>
        <div>#{seq} 失敗</div>
        <button
          className="btn"
          style={{ fontSize: "0.75rem", padding: "0.1rem 0.4rem", marginTop: "0.3rem" }}
          onClick={(e) => { e.stopPropagation(); onRegen(); }}
        >
          重新產生
        </button>
      </div>
    );
  }
  return (
    <div className="segment-cell" onClick={onOpen}>
      {segment.thumbnailUrl ? <img src={segment.thumbnailUrl} alt={`segment ${seq}`} /> : `#${seq}`}
      <button
        className="btn"
        style={{ fontSize: "0.75rem", padding: "0.1rem 0.4rem", marginTop: "0.3rem" }}
        onClick={(e) => { e.stopPropagation(); onRegen(); }}
      >
        重新產生
      </button>
    </div>
  );
}

function FullscreenPlayer({
  job,
  seq,
  onClose,
  onChangeSeq,
}: {
  job: VideoJob;
  seq: number;
  onClose: () => void;
  onChangeSeq: (seq: number) => void;
}) {
  const segment = job.segments.find((s) => s.seq === seq);
  return (
    <div className="lightbox-backdrop" onClick={onClose}>
      <div onClick={(e) => e.stopPropagation()} style={{ textAlign: "center" }}>
        {segment?.videoUrl ? (
          <video src={segment.videoUrl} controls autoPlay />
        ) : (
          <p style={{ color: "#fff" }}>此段尚無影像</p>
        )}
        <div style={{ marginTop: "0.5rem" }}>
          <button className="btn" disabled={seq <= 1} onClick={() => onChangeSeq(seq - 1)}>
            上一段
          </button>{" "}
          <span style={{ color: "#fff" }}>第 {seq} 段 / 7</span>{" "}
          <button className="btn" disabled={seq >= 7} onClick={() => onChangeSeq(seq + 1)}>
            下一段
          </button>{" "}
          <button className="btn" onClick={onClose}>
            關閉
          </button>
        </div>
      </div>
    </div>
  );
}

function ImagePickerModal({
  images,
  selected,
  onConfirm,
  onCancel,
}: {
  images: ImageAsset[];
  selected: string[];
  onConfirm: (ids: string[]) => void;
  onCancel: () => void;
}) {
  const [search, setSearch] = useState("");
  const [category, setCategory] = useState("");
  const [draft, setDraft] = useState<string[]>(selected);
  const [imgErrors, setImgErrors] = useState<Record<string, boolean>>({});

  const categories = [...new Set(images.map((img) => img.category))].sort();
  const filtered = images.filter((img) => {
    const matchCat = !category || img.category === category;
    const matchSearch = !search || img.name.toLowerCase().includes(search.toLowerCase());
    return matchCat && matchSearch;
  });

  function toggle(id: string) {
    setDraft((prev) => (prev.includes(id) ? prev.filter((i) => i !== id) : [...prev, id]));
  }

  return (
    <div className="lightbox-backdrop" onClick={onCancel}>
      <div className="image-picker-modal" onClick={(e) => e.stopPropagation()}>
        <div className="image-picker-header">
          <h3 style={{ margin: 0 }}>選擇來源圖片</h3>
          <div style={{ display: "flex", gap: "0.5rem", flexWrap: "wrap" }}>
            <input
              type="text"
              placeholder="搜尋圖片名稱…"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              style={{ width: 180 }}
            />
            <select value={category} onChange={(e) => setCategory(e.target.value)}>
              <option value="">全部類型</option>
              {categories.map((cat) => (
                <option key={cat} value={cat}>{cat}</option>
              ))}
            </select>
          </div>
        </div>
        <div className="image-picker-body">
          {filtered.length === 0 ? (
            <p style={{ color: "#888" }}>沒有符合條件的圖片</p>
          ) : (
            <div className="grid cols-4">
              {filtered.map((img) => {
                const isSelected = draft.includes(img.id);
                return (
                  <div
                    key={img.id}
                    className={`image-tile${isSelected ? " selected" : ""}`}
                    onClick={() => toggle(img.id)}
                  >
                    <img
                      src={img.url}
                      alt={img.name}
                      onError={() => setImgErrors((prev) => ({ ...prev, [img.id]: true }))}
                      style={imgErrors[img.id] ? { display: "none" } : undefined}
                    />
                    {imgErrors[img.id] && (
                      <div style={{ width: "100%", height: 200, display: "flex", alignItems: "center", justifyContent: "center", background: "#f0f1f4", color: "#aaa", fontSize: "0.8rem" }}>
                        無法載入
                      </div>
                    )}
                    {isSelected && <span className="image-tile-check">✓</span>}
                    <div className="caption">
                      <span style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                        {img.name}
                      </span>
                      <span style={{ color: "#aaa", flexShrink: 0 }}>{img.category}</span>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
        <div className="image-picker-footer">
          <span style={{ fontSize: "0.9rem", color: "#555" }}>已選 {draft.length} 張</span>
          <div style={{ display: "flex", gap: "0.5rem" }}>
            <button className="btn" onClick={onCancel}>取消</button>
            <button className="btn primary" disabled={draft.length === 0} onClick={() => onConfirm(draft)}>
              確認
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
