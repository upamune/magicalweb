---
name: make-episode-video
description: エピソード全編に字幕を付けた横動画（1920×1080・24fps）のビデオポッドキャストをローカルで生成するパイプライン。ユーザーが「#N のビデオポッドキャスト作って」「フル尺の動画作って」「横動画にして」「エピソード動画をレンダリングして」などと言ったときに使う。文字起こし→LLM 校正→自動ページ化→分割レンダリングまでを行う。ショート切り抜きは make-clip、SNS 投稿は post-clip。
---

# make-episode-video: フル尺ビデオポッドキャストの生成

`video/` の Remotion プロジェクトの `Episode` Composition で、エピソード全編に
カラオケ字幕を付けた横動画を作る。字幕は人手で校正せず、Ollama Cloud の LLM で校正して
自動ページ化する。ローカル実行前提（クラウド routine では回さない）。
設計と仕様は `video/README.md` の「4b. フル尺のビデオポッドキャスト」を参照。

## 前提

- `ollama` が起動していて `deepseek-v4-flash:cloud` が使えること（`ollama list` で確認）
- `video/.env` に `ASSEMBLYAI_API_KEY`
- `ffmpeg` / `ffprobe`

## 手順

### 1. 文字起こし（話者分離付き）

`video/transcripts/ep-N.json` があれば飛ばす。無ければ `src/data/episodes.json` の
`audioUrl` を AssemblyAI に渡す（44分で約80秒）:

```bash
cd video
bun scripts/transcribe-cloud.mjs assemblyai "<audioUrl>" transcripts/ep-N.json --keyterms "説明文の / 区切りトピック"
```

### 2. 校正とデータ生成

```bash
bun scripts/build-episode.mjs N
```

- LLM 校正は `transcripts/ep-N.proofread.json` にキャッシュされる。やり直すときはこのファイルを消す
- 出力の `speakers: {"A":"michiru","B":"upamune"}` を見て、冒頭の「関西人のプロダクトマネージャー
  みちるだと〜」を話している側が michiru になっているか確認。逆なら `--speakers A=upamune,B=michiru`
- 生成物 `src/data/episode.json` / `public/episode.mp3` は git 管理外

### 3. 表記チェック（重要）

LLM 校正は固有名詞に弱い。全文を出して番組固有の表記ゆれを探す:

```bash
jq -r '[.data.pages[].lines[][].text] | join("")' src/data/episode.json > /tmp/ep.txt
```

見つけた誤認識は `build-episode.mjs` の `REPLACEMENTS` テーブルに追加して手順 2 を再実行する
（キャッシュが効くので数秒）。既存の置換: マヂカル.fm / 関西人(?) / うぱみゅん / 2026 Summer / 文フリ。
ユーザーから表記の指摘があったら**必ずこのテーブルに足す**（次回以降も効かせるため）。

### 4. 冒頭 1 分でレイアウト確認

フル尺は 1 時間強かかるので、先に冒頭だけ見せる:

```bash
bunx remotion render src/index.ts Episode out/epN-1min.mp4 --props=src/data/episode.json --frames=0-1439 --concurrency 4
pkill -9 -f chrome-headless-shell
open out/epN-1min.mp4
```

OK が出てから次へ。デザイン変更の要望はここで `src/Episode.tsx` に反映する。

### 5. フル尺レンダリング（バックグラウンド）

```bash
nohup bun scripts/render-episode.mjs N > /tmp/render-N.log 2>&1 &
```

- 2000 フレームずつ `out/episode-N-chunks/` に書き、最後に ffmpeg で `out/magicalfm-N-episode.mp4` に結合
- 落ちても同じコマンドで続きから再開できる。デザインを変えたときは `out/episode-N-chunks/` を消してから
- 進捗はチャンクファイルの数（44分の回なら 32 個で完了）で見る。完了後は `ffprobe` で長さが音声と一致するか確認し、
  後半のフレーム（`ffmpeg -ss 2000 -i out/magicalfm-N-episode.mp4 -frames:v 1 check.png`）で崩れがないか見る

### 6. 完成報告とコミット

- 完成ファイルは 30MB を超えるので添付できない。`open` で開いてユーザーに見てもらう
- コミット対象: `transcripts/ep-N.json` / `ep-N.speakers.json` / `ep-N.proofread.json` と、
  `REPLACEMENTS` や `Episode.tsx` を変えていればそれら。`ep-N.raw.json` / `ep-N.mp3` / `out/` は含めない
- YouTube への投稿は未対応（`publish-social.mjs` は Shorts 前提）。ユーザーが手動でアップロードする

## トラブル

| 症状 | 対処 |
|---|---|
| `Target closed` で落ちる | 一発の `remotion render` を使っている。必ず `render-episode.mjs` を使う。残った `chrome-headless-shell` を `pkill -9` |
| 校正が遅い・思考トークンが多い | `build-episode.mjs` は `think: false` を送っている。モデルを変えたなら対応しているか確認 |
| 話者が逆 | `--speakers A=upamune,B=michiru` で再実行 |
| ブランド行など下段が折り返す | 経過時間が 2 桁分になる 10:00 以降のフレームで確認。`whiteSpace: nowrap` を付ける |
| `episode.json is for #M` | 別エピソードのデータが残っている。手順 2 を対象話数で実行 |
