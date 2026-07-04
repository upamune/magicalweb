# マヂカル.fm Magic Clips

エピソードの盛り上がりポイントを切り出して、関西ポップデザインの字幕付きショート動画（1080×1920）を生成する Remotion プロジェクト。

## ワークフロー

### 1. 文字起こし（単語タイムスタンプ付き）

```bash
# 例: mlx-whisper (Apple Silicon)
mlx_whisper episode.mp3 --model mlx-community/whisper-large-v3-turbo \
  --language ja --word-timestamps True --output-format json
```

### 2. ハイライト検出

```bash
bun scripts/find-highlights.mjs episode.mp3 whisper.json --top 5
```

- 音声の RMS エネルギーで盛り上がり（笑い声）の候補窓をランキングし、文字起こし付きで表示
- 候補の前後を読んで、オチが決まる 20〜40秒 を選ぶ

エピソード番号を渡すだけで全工程を回す場合は Claude Code で `/make-clip` スキルを使う。

### 3. クリッププランの作成（plans/ep-N.json）

字幕は Whisper の生出力をそのまま使わず、**校正してから**手組みでページ化する:

- 誤認識の修正（例: プラ1 → +1、本の → ほんまに）
- 句読点・疑問符の補完、絵文字名の「」括り
- 1ページ 1〜3行・1行 約12文字以内、行頭に助詞・閉じ約物が来ない改行位置
- 短いオチは1語だけの単独ページにする（自動で特大・中央表示になる）
- チャンク単位（1〜7文字）の start/end でカラオケハイライトが流れる

### 4. データ生成 & レンダリング

```bash
cd video
bun install
bun scripts/build-clip.mjs plans/ep-263.json /path/to/episode.mp3
bunx remotion render src/index.ts Clip out/clip.mp4

# プレビューしながら調整する場合
bunx remotion studio
```

## デザイン

`src/tokens.ts` は docs/design-system.md のトークンと同期。背景色はエピソード番号 % 4 のローテーション（OGPと同じ）。
