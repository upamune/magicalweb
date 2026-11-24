---
name: make-episode-video
description: エピソード全編に字幕を付けた横動画（1920×1080・24fps）のビデオポッドキャストをローカルで生成するパイプライン。ユーザーが「#N のビデオポッドキャスト作って」「フル尺の動画作って」「横動画にして」「エピソード動画をレンダリングして」「収録したから編集して」と言ったとき、mready の収録フォルダ（話者ごとの wav）を渡されたときに使う。収録データからの音声づくり（無音カット・OP・ラウドネス）→文字起こし→LLM 校正→自動ページ化→分割レンダリング→LISTEN 下書きまでを行う。ショート切り抜きは make-clip、SNS 投稿は post-clip。
---

# make-episode-video: フル尺ビデオポッドキャストの生成

`video/` の Remotion プロジェクトの `Episode` Composition で、エピソード全編に
カラオケ字幕を付けた横動画を作る。字幕は人手で校正せず、Ollama Cloud の LLM で校正して
自動ページ化する。ローカル実行前提（クラウド routine では回さない）。
設計と仕様は `video/README.md` の「4b. フル尺のビデオポッドキャスト」を参照。

## 前提

- `ollama` が起動していて `deepseek-v4.1-flash:cloud` が使えること（`ollama list` で確認）
- `video/.env` に `ELEVENLABS_API_KEY`（Speech to Text 権限付きのキー）
- `ffmpeg` / `ffprobe` / `uv`

「オーディオオンリー」は「カメラ映像なしの音声収録」の意味で、この字幕付き動画は作る
（#303 で音声だけ上げて「動画なくね??」と言われた）。

## 手順

素材は2通りある。

- **収録データ**（`magicalfm/magicutils/mready/output/epN_*/` に話者ごとの `<名前>_normalized.wav`）: 手順 0 から
- **公開済みの回**（LISTEN の音声）: 手順 1 から

### 0. 収録データから音声を作る（Logic Pro の手順の再現）

ユーザーが Logic でやっていた「トラックごとに無音・雑音カット → ミックス → 無音カットして連結 → 先頭に OP →
書き出し → mp3」を `scripts/tracks.py` で行う。無音の設定は Logic と同じ -28dB / 1.2秒 / 前後0.2秒
（ゼロクロスの代わりに切れ目へ 5ms のフェード）。作業フォルダは scratchpad に置く:

```bash
T=.agents/skills/make-episode-video/scripts/tracks.py
uv run $T mix <mready の epN_* フォルダ> <work>                 # ゲート→ミックス→無音カット。<work>/head.mp3（冒頭1分）も書く
# head.mp3 を ElevenLabs で文字起こしし、「マヂカル.fm は関西人の〜」の名乗りの直前の秒数を決める。
# 名乗り前の音量チェックや言い直しは切る。名乗り自体の噛み・言い直しは面白いので残す
uv run $T master <work> video/transcripts/ep-N.mp3 --trim <秒>  # 冒頭カット→OP（op_env.py、声は8秒目から）→ -17 LUFS の mp3
```

続けて全体を ElevenLabs に送り、話者は**トラックの音量で決め直す**（ミックス上の diarize はほぼ1人に寄って使えない）:

```bash
cd video && set -a && . ./.env && set +a
curl -sS -X POST https://api.elevenlabs.io/v1/speech-to-text -H "xi-api-key: $ELEVENLABS_API_KEY" \
  -F model_id=scribe_v2 -F file=@transcripts/ep-N.mp3 -F language_code=ja -F diarize=true -F num_speakers=2 \
  -F timestamps_granularity=word -F tag_audio_events=true -F keyterms=うぱみゅん -F keyterms=みちるだ \
  -o transcripts/ep-N.raw.json     # keyterms は1語ずつ -F で渡す（JSON 配列で渡すと 400 invalid_keyword）
uv run ../$T speakers <work> transcripts/ep-N.raw.json transcripts/ep-N.raw.json   # speaker_id がトラック名になる
bun scripts/transcribe-cloud.mjs elevenlabs transcripts/ep-N.mp3 transcripts/ep-N.json --from-raw transcripts/ep-N.raw.json
```

この音声はもう無音を削ってあるので、手順 2 では `--keep-silence` と `--speakers michiru_da=michiru,upamune=upamune`
（トラック名=話者）を付け、`episodes.json` に無い回は `--episode-meta`（`{"number":N,"title":"…","pubDate":""}`）で渡す。
タイトルは文字起こしを読んで案を出し、ユーザーに決めてもらう。

### 1. 文字起こし（話者分離付き）

`video/transcripts/ep-N.json` があれば飛ばす。無ければ `src/data/episodes.json` の
`audioUrl` を ElevenLabs Scribe v2 に渡す（44分で約1分）:

```bash
cd video
bun scripts/transcribe-cloud.mjs elevenlabs "<audioUrl>" transcripts/ep-N.json --keyterms "説明文の / 区切りトピック"
curl -sL "<audioUrl>" -o transcripts/ep-N.mp3   # 文字起こしと同じタイミングで音声も保存する（LISTEN は後日音声を差し替えることがある）
```

### 2. 校正とデータ生成

```bash
bun scripts/build-episode.mjs N
```

- LLM 校正は `transcripts/ep-N.proofread.json` にキャッシュされる。やり直すときはこのファイルを消す
- 出力の `speakers: {"A":"michiru","B":"upamune"}` を見て、冒頭の「関西人のプロダクトマネージャー
  みちるだと〜」を話している側が michiru になっているか確認。逆なら `--speakers A=upamune,B=michiru`
- 無音区間は既定で削除される（Logic Pro と同じ -28dB・1.2秒以上・前後0.2秒を残す。`--silence-db/--silence-min/--silence-pad` で調整、`--keep-silence` で無効）。音声を切ったぶん字幕時刻も詰めるので、完成動画は元の mp3 より短くなる（LISTEN の音声とは長さが合わない）
- みちるだの代わりにゲストが出た回は `--guest 黄身子:guest-kimiko.png --speakers kimiko=guest,upamune=upamune`
  （アバターは `public/guest-*.png`）。左のアバターと字幕色がゲストになり、`build-vtt.mjs` の話者名もゲスト名になる。
  ゲストが「みちるさん」と呼ぶのは本人の呼び方なので直さない（`build-episode.mjs` がうぱの発話だけ「みちるださん」にする）
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

- 2000 フレームずつ `out/episode-N-chunks/` に書き、最後に ffmpeg で `out/magicalfm-N-episode.mp4` に結合し、
  Spotify / YouTube のアップロードで要求される 16:9 サムネイル `out/magicalfm-N-thumbnail.png` も書き出す
  （OGP と同じ組版エンジン。単体で作り直すなら リポジトリルートで `bun scripts/generate-og.jsx --thumbnail N`）
- 落ちても同じコマンドで続きから再開できる。デザインを変えたときは `out/episode-N-chunks/` を消してから
- チャンクは `out/episode-N-chunks/<ハッシュ>/` に書かれる。進捗はログの `Rendered` 行で見る
- **完了 = `render-episode.mjs` のプロセスが終わり、かつ `ffprobe` の長さが音声と一致**。ファイルの出現で判定しない
  （#301 で結合途中の MP4 を LISTEN に上げた）。全編デコード（`ffmpeg -v error -i … -f null -`）でエラーが無いことと、
  後半のフレーム（`ffmpeg -ss 2000 -i out/magicalfm-N-episode.mp4 -frames:v 1 check.png`）で崩れがないかも見る
- `episodes.json` に無い回は最後のサムネイル書き出しだけ `#N が episodes.json にありません` で落ちる（MP4 はできている）。
  サムネイルはリポジトリルートで
  `bun -e 'import {generateEpisodeThumbnail} from "./scripts/generate-og.jsx"; await generateEpisodeThumbnail({number:N,title:"…",pubDate:""}, "video/out/magicalfm-N-thumbnail.png")'`
- レンダリング中に `episode.json` を作り直さない。直すなら止めて（`pkill -f "render-episode.mjs N"` と古い `chrome-headless-shell`）、
  チャンクを消してからやり直す

### 6. 完成報告とコミット

- 完成ファイルは 30MB を超えるので添付できない。`open` で開いてユーザーに見てもらう
- LISTEN へは下書きを作る。外部への送信なので、ユーザーに頼まれてから実行する。先に `--dry-run` で話数と配信日を見せる。
  トークンはリポジトリ直下 `.envrc` の `LISTEN_API_TOKEN`、`LISTEN_PODCAST_ID=01hjdw98tcjs33kxbv6wgm02jy`（マヂカル.fm）:

  ```bash
  bun scripts/build-vtt.mjs out/ep-N.vtt     # episode.json から話者付き VTT
  bun scripts/listen-draft.mjs out/magicalfm-N-episode.mp4 --thumbnail out/magicalfm-N-thumbnail.png \
    --vtt out/ep-N.vtt --number N --title "…" --description "$(cat description.html)"
  ```

  - タイトルに「#N:」は付けない。説明は既存回（API で GET）と同じ HTML の定型で埋める:
    `<p>今回は「…」について話しました。</p><p>トピック / トピック … <br /><br /><strong>▼ 告知</strong>…</p>` に
    番組紹介・お便りの定型ブロック。告知（イベント・技術書典など）は直近の回からそのときのものを引き継ぐ
  - 下書きは配信日を持てない仕様（https://listen.style/api-docs/episodes ）。日付はダッシュボードで入れてもらう。
    `--schedule` は予約（自動公開）になるので、頼まれたときだけ
  - 作成後の差し替えは `--update`（動画・サムネイル・タイトル・説明）。状態は `out/listen-draft-<ファイル名>.json` に
    ファイル名ごとに残るので、mp3 で作った回を mp4 にするときは `episodeId` などをコピーした状態ファイルを先に作る
- Spotify へは Spotify for Creators の「エピソード」→ 三点メニュー →「動画をアップロード」で手で上げる
  （公開 API が無くブラウザ操作のみ。RSS は LISTEN のままでよく、動画は Spotify 内だけで再生される）。
  このときサムネイルを求められるので `out/magicalfm-N-thumbnail.png` を渡す
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
| `REPLACEMENTS` が効かない | 置換は字幕の区切り（セグメント）をまたげない。区切りの片側だけで一致する文字列にする |
| ゲスト回で話者がほぼ1人になる | ミックス上の diarize の限界。手順 0 の `tracks.py speakers` でトラックから決め直す |
| 動画の音声と字幕が後半ほどずれる | 無音カットを `aselect` で切るとフレーム単位（約23ms）にしか切れず累積する。`atrim` で切る（`build-episode.mjs` / `tracks.py` は対応済み） |
