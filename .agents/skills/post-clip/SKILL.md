---
name: post-clip
description: R2 公開済みの切り抜きクリップを YouTube Shorts と Instagram Reels に投稿し、投稿記録をコミットする。ユーザーが「クリップ上げて」「未投稿のクリップ投稿して」「#N を Shorts/Reels に上げて」「SNS に投稿して」などと言ったとき、または make-clip の直後に投稿を頼まれたときに使う。クリップの生成はしない（それは make-clip）。
---

# post-clip: 切り抜きクリップの SNS 投稿

`video/scripts/publish-social.mjs` で YouTube Shorts（限定公開）と Instagram Reels（即公開）に投稿し、
`video/social-posts.json` / `video/POSTS.md` に記録して main に push する。
前提: クリップは `upload-clip.mjs` で R2 に上がっていて `src/data/clips.json` に載っていること。

## 手順

### 1. 対象を決める

| 依頼 | コマンド |
|---|---|
| 「未投稿を1本」「何か上げて」 | `--pending 1`（新しい順。「古いのから」なら `--oldest`） |
| 「#279 上げて」 | `out/magicalfm-279-clip.mp4 279`（2本目は `-clip-2`） |
| make-clip 直後 | 今レンダリングした `out/magicalfm-N-clip*.mp4` |

手元に mp4 が無いときは `--pending` が R2 から自動 DL する。エピソード指定で無いときは
`clips.json` の URL を `curl -sL <url> -o out/<base>.mp4` で取ってから渡す。

### 2. 連投チェック（重要）

`video/POSTS.md` を見て**今日すでに投稿した本数**を数える。Shorts は初動テストの表示枠を
自分の動画同士で奪い合うので **1日2本まで**。3本目になるならユーザーに一言確認する
（`--pending 3` 以上はスクリプトも警告を出す）。

### 3. 文面を見せる

```bash
cd video
bun scripts/publish-social.mjs --pending 1 --dry-run
```

出力の YouTube タイトル（`【#N】見出し #ポッドキャスト #shorts`）と Instagram キャプションを
ユーザーに提示する。見出しはプランの `clipTitleLines` から自動生成されるので、
おかしければ `--title` / `--caption` で上書きする。**make-clip 直後で文面をすでに見せている場合は省略してよい。**

### 4. 投稿

```bash
bun scripts/publish-social.mjs --pending 1
```

- 二重投稿はスクリプトが弾く（再投稿は `--force`）
- YouTube は **必ず限定公開**で上がる。公開はユーザーが Studio で手で行う（監査未通過の
  API プロジェクトから public 指定すると非公開ロックされるため。`--privacy public` は使わない）
- Instagram は投稿＝即公開。処理待ちで数十秒かかる
- Instagram の長期トークンは投稿のたびに自動延長され `.env` に書き戻される

### 5. 記録をコミット

```bash
cd .. && git add video/social-posts.json video/POSTS.md
git commit -m "#N の切り抜きクリップを Shorts / Reels に投稿"
git pull --rebase origin main && git push origin main
```

`video/public/clip.mp3` / `video/src/data/clip.json` はビルド生成物なので含めない。

## 報告に含めること

- YouTube / Instagram の URL（`POSTS.md` の行をそのまま）
- 「YouTube は限定公開なので Studio で公開してください」の一言
- 今日の投稿本数と、残りの未投稿本数（`--pending 99 --dry-run | head -1` で分かる）

## トラブル

| 症状 | 対処 |
|---|---|
| `[Instagram] ... failed: 400 ... Session has expired` | トークン失効。Meta App「Instagramログインによる API設定」→ magical_fm →「トークンを生成」して `.env` の `IG_ACCESS_TOKEN` を差し替え |
| `[YouTube] 警告: 公開設定が private` | 監査未通過で非公開ロック。`--privacy public` を使わない |
| `[Instagram] skip: 公開URLが見つかりません` | `upload-clip.mjs` を先に実行するか `--url` を渡す |
| 2本目のタイトルが1本目と同じ | ファイル名が `magicalfm-N-clip-2.mp4` になっているか確認（プランは `plans/ep-N-2.json`） |

セットアップ（Meta App / YouTube OAuth / `.env` の項目）は `video/README.md` の「YouTube Shorts / Instagram Reels への投稿」節と `video/.env.example` を参照。
