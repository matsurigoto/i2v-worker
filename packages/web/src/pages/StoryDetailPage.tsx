import { useEffect, useState } from "react";
import { useParams } from "react-router-dom";
import { api } from "../api/client";
import { ImageAsset, SEGMENT_COUNT, Story, VideoJob, VideoSegment } from "../types";

const VIDEO_CHAIN_EXPLANATION =
  "PAAS API 僅提供 image-to-video，沒有 video-to-video。第 2~7 段影片，是由前一段影片擷取最後一幀畫面(ffmpeg)做為新的 image 輸入，" +
  "搭配該段的提示詞再次呼叫 image-to-video 產生，形成七段影片接龍。";

export default function StoryDetailPage() {
  const { id } = useParams<{ id: string }>();
  const [story, setStory] = useState<Story | null>(null);
  const [jobs, setJobs] = useState<VideoJob[]>([]);
  const [images, setImages] = useState<ImageAsset[]>([]);
  const [selectedImageId, setSelectedImageId] = useState<string>("");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [triggering, setTriggering] = useState(false);
  const [fullscreen, setFullscreen] = useState<{ job: VideoJob; seq: number } | null>(null);

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

  return (
    <div>
      <h2>{story.name}</h2>
      <p style={{ color: "#666" }}>{story.description}</p>

      <div className="card">
        <h3>七段提示詞</h3>
        <ol>
          {story.prompts.map((p, i) => (
            <li key={i}>{p}</li>
          ))}
        </ol>
      </div>

      <div className="card">
        <h3>產生影片</h3>
        <p style={{ fontSize: "0.85rem", color: "#555" }}>{VIDEO_CHAIN_EXPLANATION}</p>
        <select value={selectedImageId} onChange={(e) => setSelectedImageId(e.target.value)}>
          <option value="">選擇來源圖片…</option>
          {images.map((img) => (
            <option key={img.id} value={img.id}>
              {img.name}
            </option>
          ))}
        </select>{" "}
        <button
          className="btn primary"
          disabled={!selectedImageId || triggering}
          onClick={handleTrigger}
        >
          {triggering ? "觸發中…" : "開始產生七段影片"}
        </button>
        {error && <p className="error-text">{error}</p>}
      </div>

      <div className="card">
        <h3>影片牆</h3>
        {jobs.length === 0 && <p>尚未產生任何影片。</p>}
        {jobs.map((job) => (
          <div className="segment-row" key={job.id}>
            <div style={{ width: 160 }}>
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
