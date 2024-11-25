# マヂカル.fm ウェブサイト

マヂカル.fmの公式ウェブサイトのソースコードです。[Astro](https://astro.build)を使用して構築されています。

## 🚀 機能

- 最新エピソードの自動取得（RSS）
- エピソード一覧（無限スクロール）
- エピソード詳細ページ
- ダークモード対応
- グッズ紹介
- お便りフォーム

## 🛠️ 技術スタック

- [Astro](https://astro.build) - 静的サイトジェネレーター
- [React](https://reactjs.org) - UIコンポーネント
- [Tailwind CSS](https://tailwindcss.com) - スタイリング
- [GitHub Actions](https://github.com/features/actions) - 自動デプロイ＆RSS取得

## 📦 開発環境のセットアップ

```bash
# 依存関係のインストール
pnpm install

# 開発サーバーの起動
pnpm dev

# 本番用ビルド
pnpm build

# ビルドのプレビュー
pnpm preview
```

## 🔄 自動更新の仕組み

1. GitHub Actionsが毎週月曜日と木曜日の午前3:30 (JST)に実行されます
2. RSSフィードから最新のエピソード情報を取得
3. エピソードデータをJSONファイルとして保存
4. 自動的にサイトを再ビルド＆デプロイ

## 📜 スクリプト

`scripts/` ディレクトリには以下のスクリプトが含まれています：

### fetch-episodes.js

最新のエピソード情報をRSSフィードから取得し、JSONファイルとして保存するスクリプトです。

```bash
# スクリプトの実行
node scripts/fetch-episodes.js
```

主な機能：
- RSSフィードの取得と解析
- エピソード情報の抽出と整形
- JSONファイルへの保存
- エピソード番号の自動抽出
- 日付のフォーマット（日本語表記）

## 📝 コントリビューション

1. このリポジトリをフォーク
2. 新しいブランチを作成 (`git checkout -b feature/amazing-feature`)
3. 変更をコミット (`git commit -m 'Add some amazing feature'`)
4. ブランチにプッシュ (`git push origin feature/amazing-feature`)
5. プルリクエストを作成

## 📜 ライセンス

このプロジェクトはMITライセンスの下で公開されています。