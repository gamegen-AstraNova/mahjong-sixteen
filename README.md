# AstraNova 麻將十六張

以 GameGen `noskin` 架構製作的台灣十六張麻將遊戲。技術基線為 React 19、TypeScript、Vite 與 Three.js；首頁採流動式佈局，牌局在窄螢幕上會提示轉為橫向操作。

- [線上試玩](https://gamegen-astranova.github.io/mahjong-sixteen/)
- [原始碼](https://github.com/gamegen-AstraNova/mahjong-sixteen)

## 開發指令

```bash
npm install
npm run dev
npm test
npm run build
```

`npm run dev` 會在背景啟動固定於 `127.0.0.1:4173` 的開發服務，並在 Vite 意外退出時自動重啟。可用 `npm run dev:status` 查看狀態；需要前景除錯時使用 `npm run dev:foreground`。

## GameGen 結構

- 圖片：`public/common/textures/`
- 音樂與音效：`public/common/audio/`
- 語系：`public/config/language/`
- 平台設定：`public/config/generalConfiguration.json`
- 發布合併規則：`gamegen.publish.json`

資源載入器會針對每個資源個別依序嘗試：URL 的 `style`、`generalConfiguration.json` 的 `commonPath`、本地 `public/common/`、本地 `public/`。任一資源失敗不會中止其他資源載入；GitHub Pages 使用相對路徑，GameGen 發布時則由 `gamegen.publish.json` 注入平台資源根目錄。

## 目前內容

- 首頁角色立繪、呼吸效果、可拖曳縮放的隱藏 UI 模式與角色對話
- 英文、繁體中文、簡體中文、日文；預設英文
- 3 名角色、每名 19 套主題造型，以及 19 款背景、牌背與桌面
- 轉蛋機率、十抽保底、重複補償、每日免費十抽與 50/100 抽自選里程碑
- 初始金幣、每日獎勵與本地持久化
- 含版本號與校驗碼的引繼文字，以及匯入前二次確認
- Three.js 模擬 3D 正方牌桌、四家手牌／牌牆／牌河／副露／花牌布局
- 台灣十六張摸打流程、花牌補牌、吃碰槓、聽牌、自摸／放槍與自動操作
- 動作貼圖、勝者特寫、台數與桌分結算、牌局金幣換算
- 牌局表情連發、自動代打與規則／台數說明
- Colyseus `mahjong-sixteen` 連線大廳：暱稱、公開房間、建立／加入、四人座位與房主開始

單機牌局可直接遊玩；連線牌局仍需部署並填入相容的 Colyseus WebSocket 端點。

## 多人伺服器

部署後可將 WebSocket 端點填入 `public/config/generalConfiguration.json` 的 `serverUrl`。本機測試亦可用 `?server=ws://127.0.0.1:2567` 暫時覆寫，不會把本機網址寫入正式產物。

## GitHub Pages

`main` 分支推送後，`.github/workflows/deploy-pages.yml` 會執行型別檢查與正式建置，再把 `dist/` 發布至 GitHub Pages。
