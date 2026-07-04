# i2v-worker — 故事 → 圖片 → 影片 產製平台

一個將「故事（7 段提示詞）」與「圖片」透過 PAAS API（`apidocs/openapi3.json`）自動化產生七段接龍影片的網頁與背景工作程式。

## 功能

- **故事維護**：故事（名稱、簡述、7 個固定順序提示詞）CRUD、清單（分頁/搜尋）、JSON 批次匯入
- **圖片維護**：多檔上傳、分頁清單、點圖放大檢視（燈箱）、刪除
- **故事製作影片**：選擇故事 + 圖片後觸發，背景 worker 以 `image-to-video` API 產生七段「影片接龍」（見 [`docs/architecture.md`](docs/architecture.md) 說明為何沒有 video-to-video 也能串接七段）
- **影片管理**：依故事瀏覽多次觸發批次（每列一批，含觸發時間），七格縮圖／全螢幕播放／刪除，缺影片段顯示空白格
- **簡易登入**：固定帳號密碼 + JWT Cookie

## Monorepo 結構

```
packages/
  shared/  共用型別、PAAS API client、Blob 儲存抽象層
  db/      Prisma schema + Client（api、worker 共用）
  api/     Express REST API
  worker/  背景工作程式（PAAS 呼叫、long polling、ffmpeg 抽幀、七段接龍）
  web/     React + Vite 前端
infra/bicep/   Azure IaC (Bicep)
.github/workflows/  CI（build/lint/test）與 deploy（手動觸發，OIDC 部署到 Azure）
docs/architecture.md  完整架構、成本評估、部署說明
```

## 快速開始

```bash
npm install --workspaces --include-workspace-root
npm run build --workspace=packages/shared
npm run build --workspace=packages/db
DATABASE_URL="file:./data/dev.db" npx prisma db push --schema packages/db/prisma/schema.prisma

npm run dev:api     # http://localhost:4000  (預設帳密 admin/admin，見 .env.example)
npm run dev:worker
npm run dev:web      # http://localhost:5173
```

## 建置 / 檢查 / 測試

```bash
npm run build
npm run lint
npm run test
```

詳細架構、Azure 資源建議與成本評估，請見 [`docs/architecture.md`](docs/architecture.md)。
