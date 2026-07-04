---
name: make-clip
description: エピソード番号またはLISTENのプレビューURLから「盛り上がり切り抜きショート動画」を生成するフルパイプライン。ユーザーが「#N のクリップ作って」「切り抜き動画を作って」「Magic Clips」「このプレビューリンクから作って」などと言ったときに使う。音声DL→文字起こし→ハイライト検出→字幕校正→Remotionレンダリングまでを一気通貫で行う。
---

# make-clip: マヂカル.fm Magic Clips パイプライン

エピソード番号を受け取り、盛り上がり部分の縦型ショート動画（1080×1920、字幕付き）を生成する。
デザインとデータ仕様の詳細は `video/README.md` と `docs/design-system.md` を参照。

## 前提ツール

- `ffmpeg`（必須）
- 文字起こし: mlx-whisper。スクラッチパッドに venv を作って使う:

```bash
python3 -m venv $SCRATCHPAD/venv && $SCRATCHPAD/venv/bin/pip install -q mlx-whisper
```

## 手順

### 1. エピソード情報の取得と音声ダウンロード

`src/data/episodes.json` から対象話数の `number` / `title` / `pubDate` / `audioUrl` を取得し、
mp3 をスクラッチパッドにダウンロードする。

**予約投稿（未公開エピソード）の場合**: RSSにまだ載っていないので episodes.json は使えない。

**LISTENのプレビュー共有URL**（`https://listen.style/p/magicalfm/<slug>/<共有トークン>` の
4セグメント形式）をユーザーからもらえれば、**ログイン不要の curl 1発で全情報が取れる**:

```bash
curl -sL "<プレビューURL>" -o $SCRATCHPAD/preview.html
grep -o '<title>[^<]*</title>' preview.html                 # 「N: タイトル - マヂカル.fm - LISTEN」→ number/title
grep -oE 'https://[^"]*\.mp3' preview.html | head -1         # 音声のCDN URL（これをDLする）
grep -oE '202[0-9]-[0-9]{2}-[0-9]{2}' preview.html | sort -u # 配信予定日
bun scripts/fetch-listen-transcript.mjs $SCRATCHPAD/preview.html listen.json  # 話者分離もこのHTMLから取れる
```

プレビューURLが無い場合のフォールバック:

- 音源はユーザーからローカルのファイルパス（またはURL）で受け取り、
  `number` / `title` / 配信予定日はユーザーに確認してプランに手で書く
- 話者分離は (a) ユーザーがログイン済みブラウザで LISTEN ダッシュボードの該当エピソードを開き
  HTML保存したファイルを `fetch-listen-transcript.mjs` に渡す、
  (b) それが無理なら F0 ピッチのフォールバックで割り当てて文脈検証を厚めにする

いずれの場合も、公開前なので**動画の内容がネタバレにならないか**ユーザーに一言確認する
（ハイライト候補の提示と兼ねると1回で済む）。

### 2. 文字起こし（単語タイムスタンプ付き）

```bash
$SCRATCHPAD/venv/bin/mlx_whisper ep.mp3 \
  --model mlx-community/whisper-large-v3-turbo \
  --language ja --word-timestamps True \
  --output-dir $SCRATCHPAD --output-format json --verbose False
```

19分エピソードで数分かかるので **バックグラウンド実行** し、待ち時間に他の準備を進める。

### 3. ハイライト候補の検出

```bash
cd video && bun scripts/find-highlights.mjs <ep.mp3> <whisper.json> --top 5
```

RMSエネルギー上位の窓が文字起こし付きで出る。**スコアはあくまで候補**。
各候補の前後の文脈を transcript で読み、以下の基準で1つ選ぶ:

- **オチで終わる**（言い切りの一言・ツッコミで締まる）
- **タイトルを回収する**内容だとベスト
- 外部文脈（画面共有・直前の話題）に依存せず単体で通じる
- 20〜40秒。開始は質問や話題の切り出しから

冒頭30秒はオープニング定型なので通常は避ける。

### 4. 字幕プランの作成（最重要・品質の核）

選んだ窓の単語タイムスタンプを whisper JSON から抽出し、
`video/plans/ep-N.json` を**手組み**する（既存の `ep-263.json` が見本）。

**校正（必須）**: Whisper の生出力は誤認識があるため、文脈から必ず直す:

- 固有名詞（マヂカル.fm / michiru_da / upamune / Slack用語 など）
- 数字・記号の表記（例: プラ1 → +1）
- 話者の方言（関西弁「ほんまに」等）を尊重
- 句読点・疑問符を補完、絵文字名や引用は「」で括る

**組版ルール**:

- 1ページ 1〜3行、1行 約12文字以内（全角換算）
- 行頭に助詞・閉じ約物（」』）、。）が来ない改行位置を選ぶ
- チャンク（カラオケハイライトの単位）は 1〜7文字の自然な語区切り
- 短いオチ（8文字以下）は **1語だけの単独ページ** にする → 自動で特大・中央表示
- ページはセリフの間（ポーズ）で切る
- `bg` はエピソード番号 % 4 → 0:lilac / 1:lime / 2:sky / 3:candy（OGPと同じ）
- `clipEnd` は最後の単語の約2.2秒後（CTA表示ぶん）

**話者の割り当て（必須）**: 各ページに `"speaker": "michiru" | "upamune" | "guest"` を
付けると、動画にアバターが表示され発話中の側がハイライトされる。

**ゲスト回**: プランのトップレベルに `"guest": { "name": "kita" }` を書くと、
ホスト2人の間にゲストのアバター（画像未指定なら 🎤 プレースホルダ）が並ぶ。
ゲストが喋るページには `"speaker": "guest"` を付ける。`name` は短く（表示幅の都合上
7文字以下推奨）。画像を使う場合は `"avatar": "<public/配下のファイル名>"` を追加。

割り当ては **LISTEN (listen.style) の話者分離を第一ソース**にする。ホスティング側で
発話セグメント単位の diarization が済んでおり、ページ単位のF0推定より正確:

```bash
# エピソード説明文の「LISTENで開く」リンクのURLを渡す
bun scripts/fetch-listen-transcript.mjs https://listen.style/p/magicalfm/<slug> listen.json
```

- 出力は `[{start, end, speaker(0|1), text}]`。**0/1 が誰かはエピソードごとに任意**なので、
  会話の文脈（誰が質問しているか・名前の呼びかけ）か F0（michiru ≈ 167Hz / upamune ≈ 115Hz、
  librosa の yin で確認）でそのエピソードのラベル対応を決める
- **話者が変わるところでページを割る**。1ページ内に相槌が混ざる場合は分割する
- LISTEN のテキストは Whisper と独立した第二のASRなので、**校正の突き合わせにも使う**
  （両者が食い違う箇所は要注意ポイント）
- LISTEN の時刻は秒単位で丸いので、カラオケ用の単語タイムスタンプは引き続き Whisper を使う
- 笑いながらの発話はF0が上がり誤判定しやすい。ツッコミの話者は特にLISTEN側を信頼する

### 5. ビルドとレンダリング

```bash
cd video
bun scripts/build-clip.mjs plans/ep-N.json <ep.mp3>
bunx remotion still src/index.ts Clip out/check.png --frame=<確認したいフレーム>
bunx remotion render src/index.ts Clip out/magicalfm-N-clip.mp4
```

### 6. 検証（スキップ禁止）

- `ffmpeg -ss <秒> -i out.mp4 -frames:v 1 check.png` で **3フレーム以上** 抽出して確認:
  - 字幕のハイライトが発話タイミングと合っているか（wordのstart/endと照合）
  - 行がカードからはみ出していないか
  - オチページが特大・中央になっているか
- 問題なければ `open` で動画を開いてユーザーに報告する

### 7. アップロードとサイトへのリンク掲載

レンダリング済みの動画は Cloudflare R2（`clips.magical.fm`）にアップロードし、
`src/data/clips.json` にエピソード番号キーで自動追記する（1エピソードに複数可）:

```bash
cd video
bun scripts/upload-clip.mjs out/magicalfm-264-clip.mp4 264 "50歳でもバリベイビー"
```

初回のみ `bunx wrangler login` でCloudflareにログインしておく。
エピソード詳細ページに「切り抜きクリップ」セクションとしてリンクが表示される。
第3引数の `label` にはクリップのオチ・見どころを短く書く。

## 報告に含めること

- 選んだハイライトの根拠（エネルギー分析の順位 + 内容面の理由）
- 施した校正の内容（誤認識→修正のリスト）
- 出力パスと動画の長さ
