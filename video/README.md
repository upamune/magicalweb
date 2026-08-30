# マヂカル.fm Magic Clips

エピソードの盛り上がりポイントを切り出して、関西ポップデザインの字幕付きショート動画（1080×1920）を生成する Remotion プロジェクト。

## ワークフロー

### 1. 文字起こし（単語タイムスタンプ付き）

```bash
# 例: mlx-whisper (Apple Silicon)
mlx_whisper episode.mp3 --model mlx-community/whisper-large-v3-turbo \
  --language ja --word-timestamps True --output-format json

# 例: AssemblyAI (クラウド routine が使う。話者分離付きの ep.speakers.json も出る)
ASSEMBLYAI_API_KEY=... bun scripts/transcribe-cloud.mjs assemblyai "<mp3 URL>" ep.json --keyterms "用語,用語"

# 例: faster-whisper (Linux amd64 / CPU・CUDA)。最新話をDLして transcripts/ep-N.json に保存
bun scripts/transcribe-local.mjs            # 要 uv
```

クラウドの routine（月・木 04:00 JST）が最新話のクリップを無人で生成・アップロードする。
`transcripts/ep-N.json` がコミットされていればそれを使い、無ければ AssemblyAI で文字起こしする。

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
- ページに `speaker`（michiru / upamune / guest）を付けるとアバターが表示され、
  喋っている側がハイライトされる。話者は LISTEN (listen.style) の話者分離を
  `scripts/fetch-listen-transcript.mjs` で取得して使う（ラベル0/1と名前の対応は
  文脈かF0ピッチで決める）。相槌が混ざるページは話者の切れ目で分割する
- トップレベルの `"clipTitleLines": ["帝国がクローンを", "やめた理由"]` で
  ショート動画としての見出しを指定する。タイトルカードにエピソード名の代わりに
  表示される（省略時は従来どおりエピソードタイトル）
- ゲスト回はプランのトップレベルに `"guest": { "name": "kita" }` を書くと
  ホスト2人の間にゲストのアバターが並び、`"speaker": "guest"` のページで
  ハイライトされる。画像は `avatar`（public/ 配下のファイル名）で指定でき、
  省略時は 🎤 のプレースホルダになる

### 4. データ生成 & レンダリング

```bash
cd video
bun install
bun scripts/build-clip.mjs plans/ep-263.json /path/to/episode.mp3
bunx remotion render src/index.ts Clip out/clip.mp4

# プレビューしながら調整する場合
bunx remotion studio
```

### 4b. フル尺のビデオポッドキャスト（横1920×1080・15fps）

同じ Remotion プロジェクトで、エピソード全編に字幕を付けた横動画も作れる（`Episode` Composition）。
字幕は人手で校正せず、Ollama Cloud の LLM（既定 `deepseek-v4-flash:cloud`）で誤認識修正と語区切りを行い、
自動でページ化する。ローカルで動かす前提（`ollama` が起動していること）:

```bash
cd video
bun scripts/transcribe-cloud.mjs assemblyai "<mp3 URL>" transcripts/ep-278.json   # 文字起こし（話者分離付き）
bun scripts/build-episode.mjs 278                                                  # 校正→ページ化→ episode.json / episode.mp3
bun scripts/render-episode.mjs 278        # 2000フレームずつ分割レンダリング → out/magicalfm-278-episode.mp4
```

- 校正結果は `transcripts/ep-N.proofread.json` にキャッシュされ、再実行時は未校正分だけ問い合わせる
- LLM 校正だけでは表記が揺れるので、`build-episode.mjs` の `REPLACEMENTS` に固定置換を持つ
  （マジカルFM→マヂカル.fm、うぱむね→うぱみゅん、分振り→文フリ など）。新しい誤認識を見つけたらここに足す
- 1行 22 文字・1ページ 2 行で自動ページ化。セリフ枠は常時表示で、テキストとカラオケ強調だけが動く
- 話者ラベル（A/B）とホストの対応は冒頭の会話から LLM が推定する。間違っていたら
  `--speakers A=michiru,B=upamune` で上書き
- `src/data/episode.json` と `public/episode.mp3` は git 管理外。`--props` で Composition に渡す
- 波形は事前計算した RMS エンベロープを使う（フル尺の音声を Remotion 側でデコードしないため）
- 15fps でも 45分エピソードのレンダリングは M系Mac で 2時間強かかる（約5fps）。
  一発の `remotion render` は数千フレームで Chrome がメモリ不足で落ちる（Target closed）ので、
  `render-episode.mjs` がチャンク分割して ffmpeg で結合する。落ちても同じコマンドで再開できる

### 5. アップロードと配信

レンダリングした動画は Cloudflare R2（`clips.magical.fm`）にアップロードし、
`src/data/clips.json` に自動追記する:

```bash
bun scripts/upload-clip.mjs out/clip.mp4 263 "オチの一言"
```

初回のみ `bunx wrangler login` でCloudflareにログインしておく。
（`R2_ACCESS_KEY_ID` / `R2_SECRET_ACCESS_KEY` を環境変数に置けば wrangler 不要で S3 互換 API を使う）

### 6. YouTube Shorts / Instagram Reels への投稿

R2 にアップロード済み（＝ `clips.json` に載っている）クリップを両プラットフォームに投稿する:

```bash
cd video
bun scripts/publish-social.mjs out/magicalfm-278-clip.mp4 278 --dry-run  # 文面だけ確認
bun scripts/publish-social.mjs out/magicalfm-278-clip.mp4 278
bun scripts/publish-social.mjs out/magicalfm-278-clip.mp4 278 --to instagram

bun scripts/publish-social.mjs --pending 1        # 未投稿の新しい順から1本（動画はR2から自動DL）
bun scripts/publish-social.mjs --pending 1 --oldest  # 古い順
```

`--pending` は `clips.json` と `social-posts.json` の差分から未投稿クリップを拾う。
**短時間に連投すると Shorts の初動テストの表示枠を自分の動画同士で奪い合う**ので、
1日1〜2本で回すこと（3本以上を指定すると警告が出る）。溜まった過去クリップは
cron や launchd で `--pending 1` を1日1回叩いて消化するのがよい。

- タイトル・説明・キャプションは `plans/ep-N.json` の `clipTitleLines`、`clips.json` の `label`、
  `episodes.json` のタイトルから自動生成する（`--title` / `--caption` で上書き）
- Instagram は公開URLからしか投稿できないので、**先に `upload-clip.mjs` を実行しておく**
- 投稿結果は `video/social-posts.json` に記録され、同じクリップの二重投稿を防ぐ（再投稿は `--force`）。
  記録には動画・本編ページ・YouTube・Instagram のURLが揃う。
  人が見る一覧は同時に生成される [POSTS.md](POSTS.md)（JSON を直したら
  `bun scripts/social-posts.mjs` で作り直す）
- YouTube は **既定で限定公開（unlisted）**。内容を確認してから YouTube Studio で手動公開する。
  監査を通した API プロジェクトを使う場合のみ `--privacy public` が意味を持つ
- YouTube のタイトルは `【#278】見出し #ポッドキャスト #shorts`、説明は
  「エピソードタイトル」より → 本編リンク → 番組紹介 → `#マヂカルfm` の順（magicalshorts と同じ流儀）
- 縦1080×1920・3分以内なので、YouTube 側は自動的に Shorts として扱われる

#### 初回セットアップ: YouTube

OAuth クライアントは `magicalshorts` リポジトリと共用している（同じ Google アカウントの
別チャンネル向けに作ったもの）。`~/ghq/github.com/upamune/magicalshorts/.env` の
`YT_CLIENT_ID` / `YT_CLIENT_SECRET` を `YOUTUBE_CLIENT_ID` / `YOUTUBE_CLIENT_SECRET` として
`video/.env` に置けば、Google Cloud 側の作業は不要。

refresh token だけはチャンネルごとに要るので、投稿先のチャンネル（@magicalfm_）で取り直す:

```bash
bun scripts/youtube-auth.mjs   # ブラウザが開く。承認画面で @magicalfm_ を選ぶ
```

`.env` に `YOUTUBE_REFRESH_TOKEN` が自動で書き込まれる。
新しくクライアントを作る場合は Google Cloud で YouTube Data API v3 を有効化し、
「デスクトップアプリ」の OAuth クライアントを発行する。

**重要**: 2020年7月28日以降に作られた未監査の API プロジェクトから `videos.insert` で
アップロードした動画は「非公開にロック」され、YouTube Studio からも公開に変更できない。
公開投稿するには <https://support.google.com/youtube/contact/yt_api_form> から
コンプライアンス監査を申請して通す必要がある（用途の説明と OAuth フローのデモ動画が要る）。
そのため既定は限定公開で上げて、公開は Studio から手動で行う運用にしている。

#### 初回セットアップ: Instagram

1. Instagram アカウントをプロアカウント（クリエイター or ビジネス）に切り替える
2. <https://developers.facebook.com> でアプリを作り、「Instagram」プロダクトを追加する
3. 「API setup with Instagram login」で対象アカウントを連携し、
   `instagram_business_basic` / `instagram_business_content_publish` を付けて
   アクセストークンを生成する（開発モードのままでも自分のアカウントには投稿できる）
4. `video/.env` に `IG_ACCESS_TOKEN` と、同じ画面に出る `IG_USER_ID` を書く

トークンは60日で切れるが、**期限内に延長すればまた60日伸びる**。`publish-social.mjs` は
Instagram へ投稿するたびに自動で延長して `.env` に書き戻すので、通常は何もしなくてよい。
2か月以上投稿しないときだけ手で延長する:

```bash
bun scripts/instagram-auth.mjs refresh
```

失効させた場合は Meta App の「Instagramログインによる API設定」からトークンを再生成する。

Facebook ページ経由（Facebook Login）のトークンを使う場合は `IG_API_HOST=graph.facebook.com` を足す。

## デザイン

`src/tokens.ts` は docs/design-system.md のトークンと同期。背景色はエピソード番号 % 4 のローテーション（OGPと同じ）。
