# Hybrid Video Podcast Pipeline (v1)

完成Podcast音声を唯一のmaster timelineとし、映像区間だけを `videoSegments` で差し込む。
実装対象は `Episode` (1920×1080 / 24fps)。`Clip` と既存の字幕生成は維持する。

## Resolveでの準備

1. 別々のHollyland録音とOsmo動画をResolve Studioに読み込む。録音開始が同時とは仮定しない。
2. Hollyland A/Bを同期・mix/masterする。Osmo音声は同期参照だけに使う。
3. **完成masterの先頭を0秒**にする。カット、速度変更、無音削除はこの時点で確定する。
4. Osmoの開始・中盤・終盤の3箇所で同期を確認する。ドリフトがあればResolveで補正する。
5. 実写の表示開始/終了を選ぶ。カメラが安定し、発話・字幕ページの区切りになる点がよい。
6. 通行人の顔をPower Window/Tracker等でぼかし、焼き込む。画面端・横顔・遠景・交差・遮蔽後・一瞬の映り込みを含め、**使用区間のclean動画を目視確認**する。自動検出0件は確認済み判定にならない。
7. master MP3とclean動画を保存する。v1は操作自動化・顔検出・ドリフト補正をRemotionに実装しない。

推奨exportはSDR / H.264 / MP4 / yuv420p、一定フレームレート。解像度1920×1080が基本。
HDR素材のSDR変換・色・手ブレはResolveで確定する。MOV/ProResもprepareでH.264へ変換するが、長尺は時間がかかる。
動画は全画面 `object-fit: cover` で表示されるため、縦動画はクロップされる。必要な構図をResolve側で確定する。

## ファイル配置

```text
video/work/ep-N/
  source/
    hollyland-michiru.wav
    hollyland-upamune.wav
    osmo-001.mp4
  processed/
    episode-master.mp3
    osmo-001-clean.mov
  manifest.json
```

`work/`、生成音声/動画/receipt、レンダー結果はgit管理外。生のOsmo素材を `public/` に置かない。
manifestの `file` は同階層の `processed/` 内のファイル名のみ。絶対パス、サブディレクトリ、URL、`..` は拒否する。

```json
{
  "videoSegments": [
    {
      "file": "osmo-001-clean.mov",
      "timelineStartSec": 767.0,
      "timelineEndSec": 2650.0,
      "sourceStartSec": 3.8
    }
  ]
}
```

数値は例。`sourceStartSec` は**書き出したclean動画**内の位置。Resolveで冒頭を切ってexportした場合は元Osmoの時刻を転記しない。
master 763.2秒 = clean 0秒なら、master 767秒で見せ始めるsourceは3.8秒。
映像の表示開始を遅らせても物理的な同期は変更しない。

## 実行

リポジトリルートで `bun install`、次に `video/` で `bun install --frozen-lockfile`。ffmpeg / ffprobeとRemotionのChromeが必要。
以下は `video/` から実行する。

```sh
# 同じ完成masterから文字起こしを作成済みであること。
# 別編集版や元トラック由来の文字起こしは使用しない。
bun scripts/build-episode.mjs N \
  --audio work/ep-N/processed/episode-master.mp3 \
  --transcript transcripts/ep-N.json \
  --speakers 0=michiru,1=upamune

# clean動画の使用区間を人間が目視確認した後だけ実行する。
bun scripts/prepare-episode-video.mjs work/ep-N/manifest.json --reviewed

# --propsを忘れるとRootの10秒placeholderが表示される。
bunx remotion studio src/index.ts --props=src/data/episode.json

bun scripts/render-episode.mjs N --concurrency 4 --chunk 2000
```

`--reviewed` は実行者による確認済みの申告であり、機械が安全性を判定した意味ではない。
エージェントは人間から該当clean素材の確認完了が伝えられるまでこのフラグを付けない。
prepareは全区間の検証後、カメラ音声を除去し、clean動画を `public/episode-video-<source-sha256>-clean.mp4` に置く。
`episode.json` に絶対パスは書かず、既存の音声・字幕・envelope・メタデータを維持する。

確認記録 `public/episode-video-review.json` はmaster音声・元clean素材・prepared動画のSHA-256と使用区間に結び付く。
clean素材の再生成後は目視確認をやり直す。prepared動画・master音声・区間を変えた場合、レンダーは停止するので同期と確認状態を確かめてprepareをやり直す。
これは誤操作防止であり、顔ぼかしの品質証明や改ざん防止機構ではない。

`build-episode.mjs` を再実行すると映像区間は外れるため、hybrid回は必ずprepareを再実行する。
映像を外す場合は `{"videoSegments": []}` のmanifestをprepareに渡す（`--reviewed`不要）。
従来の映像なし回はprepareせず、そのままbuild → renderで動く。
古いcontent hashの動画は自動削除しない。不要になった生成動画はレンダー停止中に手動で削除できる。

## 時刻と検証

- 区間は `[timelineStartSec, timelineEndSec)`。隙間は従来UIに戻る。配列順は問わないが重複は拒否する。
- 時刻は有限の非負数、終了 > 開始、終了 ≤ episode duration。動画の実stream durationを超えるsource範囲も拒否する。
- fpsに乗らない開始/終了はそれぞれ次の出力フレームから切り替える。区間内に出力フレームがない場合は拒否する。
- `source = sourceStartSec + masterTime - timelineStartSec`。開始フレームへの切り上げ分をsource trimに反映し、trimは最寄りフレームへ丸める。誤差は最大半出力フレーム（24fpsで約20.8ms）。ソースfps由来のサンプリング誤差は別途あり得る。
- Remotion **4.0.243**の `OffthreadVideo.startFrom` と `Sequence` を使う。新しい `trimBefore` APIは使用しない。
- 字幕は親から渡したmaster秒で評価する。映像のSequence内の局所frameを使わない。
- 街歩き字幕は最大2行。既存字幕ページの文字タイミングとspeakerを使用する。無字幕時は両ホストinactive。
- 直接 `bunx remotion render` するとファイルハッシュ/動画durationの検証を迂回するため、最終出力には必ず `render-episode.mjs` を使う。

## 分割レンダーと音声

チャンクは `out/episode-N-chunks/<fingerprint>/` に保存する。props、src、public素材内容、依存lock、設定、レンダースクリプト、chunk/concurrencyの変更でキャッシュを分ける。
既存のhashなしチャンクは使い回さない。存在判定だけで古いclean映像を再利用しない。
実行中に素材・データ・コードを編集しない。結合前に変更を検出した場合は不整合チャンクを破棄して停止する。

チャンクは映像のみレンダーし、結合時に**master音声を一度だけAACエンコードしてmux**する。
これによりチャンクごとのAAC delay/paddingを結合して音声がずれることを避ける。Studioでは親のAudioが継続再生される。

## 検証コマンド / 実素材の受け入れ

```sh
bun run test:episode
bunx tsc --noEmit
```

テストは区間境界、source trim、不正入力、準備前検証、カメラ音声除去、review/source差し替え、cache無効化を確認する。
実素材では開始前後・中盤・終盤・複数segment間の隙間をStudioと最終mp4で確認する。
顔ぼかしは最終動画でも目視確認し、音声・リップシンク・字幕・アイコンがmaster時間に一致することを確認してから公開する。

## 実装検証のプレビュー

テストパターン＋合成音声（実際の京都映像ではない）。8秒/192フレーム、映像区間2–4秒・5–7秒。
実写開始はsource 1.25秒。master 65/24秒でsource 47/24秒を表示し、字幕はmaster秒で評価している。
チャンク境界83/24秒をまたいでレンダーし、mux後の映像・音声がともに8秒、境界付近に音声欠落がないことを確認した。

検証環境はRemotion 4.0.243 + Chromium 153。Google Fontsの通信制限のため、QA用bundleのみリポジトリ内の同名TTFに置き換えた（M PLUSの500はRegular代用、700はBold）。本番のフォント取得処理は変更していない。
ネットワークインターフェース列挙が使えない環境のため、QAプロセスのみloopback指定の互換処理を使用した。
従来UIは旧実装と同一条件のframe 30で比較し、ピクセル差分ゼロ。

![従来画面](previews/hybrid-classic.png)

![実写区間の字幕と話者表示](previews/hybrid-street.png)
