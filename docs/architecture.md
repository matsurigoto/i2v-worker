# 架構與部署說明 (Architecture & Deployment)

## 系統概觀

本專案由四個套件組成（npm workspaces monorepo）：

| 套件 | 說明 |
|---|---|
| `packages/web` | React + Vite 前端，故事維護 / 圖片管理 / 影片牆 / 登入頁 |
| `packages/api` | Express + Prisma REST API：故事 CRUD、批次匯入、圖片上傳、觸發影片產生、影片/片段查詢刪除、簡易登入(JWT Cookie) |
| `packages/worker` | 背景工作程式，實際呼叫 PAAS API（`apidocs/openapi3.json`）產生七段影片接龍，long polling 追蹤進度，ffmpeg 抽幀串接下一段 |
| `packages/db` | 共用 Prisma schema／Client，供 api 與 worker 共用同一份資料模型 |
| `packages/shared` | 共用型別、PAAS API client（含 long polling）、Blob 儲存抽象層（本機檔案系統 / Azure Blob） |

API 與 Worker 之間透過資料庫中的 `QueueMessage` 表溝通（本機開發時的簡易佇列），對應到正式環境可換成 Azure Storage Queue（見下方「訊息佇列」）。

## 「影片接龍」機制說明（重要）

依 `apidocs/openapi3.json`，PAAS API 只提供 `image-to-video` 任務類型，**沒有** `video-to-video`。因此本專案的七段影片是以下列方式串接產生：

```
segment 1 = image-to-video(來源圖片, 提示詞[0])
segment 2 = image-to-video(segment 1 影片的最後一幀, 提示詞[1])
segment 3 = image-to-video(segment 2 影片的最後一幀, 提示詞[2])
...
segment 7 = image-to-video(segment 6 影片的最後一幀, 提示詞[6])
```

每一段都是：

1. `POST /api/v3/tasks`（payload = `image-to-video`）取得 `taskId`
2. Long polling `GET /api/v3/tasks/{taskId}`，直到 `status` 為 `completed` / `failed` / `canceled` / `timeout`
3. `completed` 時下載 `results.data.video.url` 的影片並存入 Blob 儲存
4. 用 ffmpeg 擷取該影片的最後一幀，作為下一段的 `image` 輸入

若某一段失敗，整條鏈會停止：

- 第 1 段失敗 → 該 VideoJob 標記為 `failed`
- 第 2~7 段中任一段失敗 → 該 VideoJob 標記為 `partial`（已完成的段落仍可觀看）

實作位置：`packages/worker/src/segmentProcessor.ts`（串接邏輯）、`packages/worker/src/frameExtractor.ts`（ffmpeg 抽幀，含容錯重試機制以處理極短片段）。

## 資料模型

見 `packages/db/prisma/schema.prisma`：

- `Story` 1:N `Prompt`（固定 7 筆，seq 1~7）
- `Story` 1:N `VideoJob`（每次「觸發產生影片」為一筆，對應影片牆的「一列」）
- `VideoJob` 1:N `VideoSegment`（最多 7 筆，seq 1~7；缺少的 seq 代表前端顯示空白格）
- `ImageAsset`：上傳的圖片，`VideoJob.sourceImageId` 可為 null（刪除圖片後歷史影片仍保留）
- `QueueMessage`：簡易佇列表，本機/測試環境的佇列實作

> Prisma schema 預設 `provider = "sqlite"`，可在零外部依賴下建置、測試、遷移。正式環境使用 PostgreSQL 時，需將 `datasource db` 的 `provider` 改為 `"postgresql"`，並重新執行 `npm run prisma:migrate --workspace=packages/db`。

## 儲存與佇列抽象層

`packages/shared/src/storage.ts` 定義 `BlobStorage` 介面，兩種實作：

- `LocalFsStorage`：本機檔案系統（開發/測試預設）
- `AzureBlobStorage`：Azure Blob Storage（正式環境）

透過環境變數 `STORAGE_DRIVER=local|azure-blob` 由 `createStorageFromEnv()`（`packages/shared/src/storageFactory.ts`）選擇，api 與 worker 皆共用同一份邏輯。

佇列部分，本機/測試以資料庫 `QueueMessage` 表模擬（`packages/worker/src/queue.ts`），正式環境建議之後改接 Azure Storage Queue／Service Bus（保留一致的「建立訊息 → worker 認領 → 標記已處理」介面，可平行擴充）。

## 認證

簡易登入：單一固定帳號密碼（`AUTH_USERNAME` / `AUTH_PASSWORD_HASH`，密碼以 bcrypt hash 存放於環境變數）。登入成功後核發 JWT，存放於 httpOnly Cookie，所有 `/api/*`（除 `/api/auth/*`）皆需驗證。

## Azure 架構建議

```
GitHub (repo + Actions) ─┐
                         ├─ push/PR → CI (build/lint/test)
                         └─ workflow_dispatch → Deploy (OIDC 登入 Azure)
                                │
                                ▼
                    ┌────────────────────────┐
                    │ Azure Static Web Apps   │  ← packages/web (Vite build)
                    └────────────┬────────────┘
                                 │ /api, /media (CORS)
                    ┌────────────▼────────────┐
                    │ App Service (Linux, B1)  │  ← packages/api
                    └───────┬─────────┬────────┘
                            │         │
              ┌─────────────▼───┐   ┌─▼──────────────────────┐
              │ PostgreSQL       │   │ Storage Account        │
              │ Flexible Server  │   │ (Blob: media容器,      │
              │ (Burstable B1ms) │   │  Queue: video-jobs)    │
              └─────────────┬───┘   └─┬──────────────────────┘
                            │         │
                    ┌───────▼─────────▼───────┐
                    │ Container Apps (worker)   │  ← packages/worker
                    │ scale 0~2, consumption     │     呼叫 PAAS API
                    └────────────────────────────┘
```

對應 IaC：`infra/bicep/main.bicep`（Storage/Queue、PostgreSQL Flexible Server、App Service Plan+API App、Container Apps Environment+Worker App、Static Web App）。部署範例參數檔：`infra/bicep/main.bicepparam`。

CI/CD：
- `.github/workflows/ci.yml`：每次 push/PR 執行 build + lint + test
- `.github/workflows/deploy.yml`：手動觸發（`workflow_dispatch`），透過 GitHub OIDC 登入 Azure（無需長效憑證），部署 Bicep、建置並推送 worker Docker image 到 GHCR、部署 API 到 App Service、部署前端到 Static Web Apps

## 成本評估（概估，低流量小型內部工具，USD/月）

| 服務 | 建議 SKU | 月費估算 |
|---|---|---|
| Static Web App | Free/Standard | $0～$9 |
| App Service (API) | B1 Linux | ~$13 |
| Container Apps (Worker) | Consumption，依執行秒數 | $5～$20（視影片產生頻率） |
| Storage Queue | 標準 | <$1 |
| Blob Storage | Hot，依儲存量（如 50GB） | $1～$3 + 流出流量費 |
| PostgreSQL Flexible (B1ms) | Burstable | $12～$15 |
| GitHub Actions | 私有 repo 免費額度 2000 分鐘/月 | $0（超額約 $0.008/分鐘） |
| **總計（低流量）** | | 約 **$30～$60/月** |

若影片生成量大，成本會轉移到：Blob 儲存/流出流量、Container Apps 執行時間，以及 PAAS API 本身的計費（不在 Azure 範圍內，需另外估）。建議先用 Free/最低 SKU 上線驗證流量後再依需要調整（例如 Blob 用 Cool Tier 存放已完成的舊影片以省成本）。

## 本機開發

```bash
cp .env.example packages/api/.env    # 依需要調整
npm install --workspaces --include-workspace-root

# 產生 Prisma Client + 建立本機 SQLite 資料庫
npm run build --workspace=packages/shared
npm run build --workspace=packages/db
DATABASE_URL="file:./data/dev.db" npx prisma db push --schema packages/db/prisma/schema.prisma

npm run dev:api      # http://localhost:4000
npm run dev:worker   # 背景輪詢佇列
npm run dev:web      # http://localhost:5173（Vite 會 proxy /api, /media 到 API）
```

也可使用 `docker compose up --build` 啟動 Postgres + API + Worker（需先將 Prisma schema 的 provider 切換為 `postgresql` 並執行遷移，詳見 `docker-compose.yml` 內註解）。

## 測試

```bash
npm run build   # 依序建置 shared → db → api → worker → web
npm run lint    # tsc --noEmit，各套件
npm run test    # shared / api / worker 的 vitest 測試（共 30 項）
```
