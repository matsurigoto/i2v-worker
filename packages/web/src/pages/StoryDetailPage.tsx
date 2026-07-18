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
  const [selectedImageId, setSelectedImageId] = useState<string>("");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [triggering, setTriggering] = useState(false);
  const [fullscreen, setFullscreen] = useState<{ job: VideoJob; seq: number } | null>(null);
  const [previewError, setPreviewError] = useState(false);
  const [editingSeriesId, setEditingSeriesId] = useState<string | null | undefined>(undefined);
  const [seriesUpdateError, setSeriesUpdateError] = useState<string | null>(null);
  const [editingPrompts, setEditingPrompts] = useState<string[] | null>(null);
  const [promptsUpdateError, setPromptsUpdateError] = useState<string | null>(null);
  const selectedImage = images.find((img) => img.id === selectedImageId) ?? null;

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
    api.listImages(1, 100).then((res) => setImages(res.items));
    api.listSeries().then((res) => setSeriesList(res.items));
    // eslint-disable-next-line react-hooks/exhaustive-deps
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
    setPreviewError(false);
  }, [selectedImageId]);

  async function handleTrigger() {
    if (!id || !selectedImageId) return;
    setTriggering(true);
    setError(null);
    try {
      await api.triggerVideoJob(id, selectedImageId);
      refresh();
    } catch {
      setError("觸發影片產生失敗");
    } finally {
      setTriggering(false);
    }
  }

  async function handleDeleteJob(jobId: string) {
    if (!confirm("確定要刪除這批影片（七段）嗎？")) return;
    await api.deleteVideoJob(jobId);
    refresh();
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

  return (
    <div>
      <h2>{story.name}</h2>
      <p style={{ color: "#666" }}>{story.description}</p>
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
            <button
              className="btn"
              style={{ fontSize: "0.8rem", padding: "0.1rem 0.5rem" }}
              onClick={() => setEditingPrompts([...story.prompts])}
            >
              編輯提示詞
            </button>
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
        <div style={{ display: "flex", alignItems: "center", gap: "0.75rem" }}>
          <select value={selectedImageId} onChange={(e) => setSelectedImageId(e.target.value)}>
            <option value="">選擇來源圖片…</option>
            {images.map((img) => (
              <option key={img.id} value={img.id}>
                {img.name}
              </option>
            ))}
          </select>
          {selectedImage && !previewError && (
            <img
              className="image-select-preview"
              src={selectedImage.url}
              alt={selectedImage.name}
              title={selectedImage.name}
              onError={() => setPreviewError(true)}
            />
          )}
          <button
            className="btn primary"
            disabled={!selectedImageId || triggering}
            onClick={handleTrigger}
          >
            {triggering ? "觸發中…" : "開始產生七段影片"}
          </button>
        </div>
        {error && <p className="error-text">{error}</p>}
      </div>

      <div className="card">
        <h3>影片牆</h3>
        {jobs.length === 0 && <p>尚未產生任何影片。</p>}
        {jobs.map((job) => (
          <div className="segment-row" key={job.id}>
            <div style={{ minWidth: 140, flexShrink: 0 }}>
              <div>{new Date(job.triggeredAt).toLocaleString()}</div>
              <span className={`badge ${job.status}`}>{job.status}</span>
              <div>
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
    </div>
  );
}

function SegmentCell({
  seq,
  segment,
  onOpen,
}: {
  seq: number;
  segment: VideoSegment | undefined;
  onOpen: () => void;
}) {
  if (!segment || (!segment.videoUrl && segment.status !== "processing")) {
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
        #{seq} 失敗
      </div>
    );
  }
  return (
    <div className="segment-cell" onClick={onOpen}>
      {segment.thumbnailUrl ? <img src={segment.thumbnailUrl} alt={`segment ${seq}`} /> : `#${seq}`}
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
