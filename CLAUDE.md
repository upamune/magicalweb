# CLAUDE.md

雑談Podcast「マヂカル.fm」の公式サイト（Astro製・静的生成）。リポジトリ全体の構成ガイドは [AGENTS.md](AGENTS.md)、デザインの規則は [docs/design-system.md](docs/design-system.md) を参照。

## コマンド

```bash
bun install                 # 依存関係のインストール
bun dev                     # 開発サーバー (http://localhost:4321)
bun run build               # 本番ビルド（PR前に必ず通すこと）
bun x biome check --write . # Lint & Format（tabインデント・ダブルクォート）

bun scripts/fetch-episodes.js              # RSSから episodes.json を更新
bun scripts/generate-og.jsx --latest 5     # 新着エピソードのOGP生成
bun scripts/generate-og.jsx --site         # サイト全体用 public/ogp.png を生成
bun scripts/generate-og.jsx --force        # 全話再生成（OGPデザイン変更時のみ）
```

## アーキテクチャの要点

- **データフロー**: GitHub Actions が `scripts/fetch-episodes.js` で RSS → `src/data/episodes.json` を更新 → 全ページ静的生成。エピソードURLは `src/data/custom-paths.json` の `customPath` が優先され、なければ話数
- **`src/utils/rss.ts`** がエピソード取得の唯一の入口。表示用タイトルは `getEpisodeDisplayTitle()`（先頭の `#263:` を除去。話数は別途チップで表示するため）、一覧用の軽量データは `toEpisodeListItem()` を使う
- **React island は4つだけ**（Header / EpisodeList / PlayButton / AudioPlayer）。静的にできるUIは Astro コンポーネントにする
- **AudioPlayer は Layout.astro 内で `transition:persist`** しており、ページ遷移しても再生が途切れない。再生状態は `src/store/audioStore.ts`（zustand + localStorage）で共有され、EpisodeList / PlayButton は同じストアを見て再生中表示を同期する
- **ダークモード**は `<html>` の `dark` クラス + localStorage。View Transitions 後の復元は Layout.astro の `astro:after-swap` リスナーが担う（消さないこと）

## デザイン（関西ポップ）

規則の全文は [docs/design-system.md](docs/design-system.md)。特に間違えやすい点:

- 色・影・角丸・アウトラインは必ずトークンから使う（`tailwind.config.mjs` + `Layout.astro` のCSS変数）。色コード直書き禁止
- **鮮やかな色面の上のテキストは固定ネイビー `text-[rgb(29,26,46)]`**（`text-ink` はダークモードで白くなり読めなくなる）
- 押せる要素には `.btn-pop` を付ける。UIモーションは 300ms 以下・`ease-out-quart`・transform/opacity のみ
- OGP（`scripts/generate-og.jsx`）は日本語組版エンジン（BudouX改行・幅ベースのサイズ決定・孤立行防止・約物詰め）を持つ。デザイントークンは同ファイルの `C` オブジェクトを design-system.md と同期させる

## 規約

- コミットメッセージは日本語・短い命令形。UI変更のPRにはスクリーンショットを添付
- すべてのファイルは最終行に改行を入れる（editorconfig 相当のルール）
