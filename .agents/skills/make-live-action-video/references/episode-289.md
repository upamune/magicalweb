# #289「京都街ブラ」の実証記録

2026-09-17に生成・検証、丸ぼかしの見た目をユーザーが承認。その後に全編へ適用した。2026-09-21には、文字起こしをそのまま表示していたテロップを画面用に編集し、別タイムライン・別完成版として検証した。
以下は実証用の索引。次の回の設定値や、現在のファイル存在を保証するものではない。

基点: #289の素材フォルダ配下の`out/`。実装索引の相対パスはこの基点から解決する。

| 項目 | 実績 |
| --- | --- |
| 最新完成品 | `magicalfm-289-kyoto-machibura-polished-telops.mp4`、同名`.drp` |
| 丸ぼかし確定版 | `magicalfm-289-kyoto-machibura-round-blur.mp4`、同名`.drp` |
| 制作記録 | `README-289.md`、`289-resolve-round-status.json` |
| 尺 | 62434 frames、24000/1001 fps、2604.018083秒 |
| 実写区間 | `[31472,62310)`、原カメラ30839framesのうち30838framesを使用 |
| 最終音量 | −16.1 LUFS、−1.4dBTP |
| 検査 | 全編デコード、黒画面なし、5地点音声lag0ms、15代表フレーム確認 |
| 人間による全編プライバシー確認 | 未完了。スタイル承認とは別 |

## テロップ整理版の実績

- 校正済みの1,001ページを、画面用テロップ933ページへ整理した。835ページを変更し、フィラーだけの68ページを非表示にした。
- 文末の句点と読点を外し、疑問符・感嘆符は意味がある箇所だけ保持した。単独フィラー、短すぎる相づち、直後に具体化する言い直しを整理したが、「なんかありそう」のように意味を持つ口語は残した。
- 話者と時刻を維持し、削除したフィラーの分だけ開始を最初の意味語へ寄せた。最大22文字×2行。実写区間は読み上げ追従を使わない固定テロップ。
- 一回用処理は`episode-style/scripts/polish-289-telops.mjs`、変更前バックアップは`episode-style/src/data/episode.before-telop-polish.json`、変更数と例は`episode-style/out/289-telop-polish-report.json`。
- Resolveタイムラインは`289 Kyoto - Polished Telops`。丸ぼかしとマスター音声を維持したまま、Classic前後と実写の透過テロップだけを差し替えた。
- 完成品は62,434フレームを全編デコードし、黒画面なし、−16.1 LUFS / −1.4dBTP、5地点の音声遅延0ms。代表10フレームで切り替え・テロップ・丸ぼかしを確認した。

`polish-289-telops.mjs`の語彙や正規表現は当該回の発話に合わせた一回用実装。次回へ丸ごとコピーせず、上記の意味判断と検査項目を使って対象回の編集ルールを決める。

## 実装の索引

- 同期・音声: `camera_sync.py`、`master_audio.py`。マイク間は+270samples、カメラはoffset約1312.647秒・scale約1.00000737だったが再利用しない。
- 検出: `scan-289-yunet.py`、`vision-face-scan.swift`、`scan-289-pose.py`、`preview-289-pose.py`（頭部候補）、`burn-289-faces-v2.py`（v3の候補統合も実装）。ファイル名のv2と出力v3を混同しない。
- 検出済みtrace: `289-street-face-clean-v3.masks.jsonl`。当該フレームで採用した顔68,719件。`round-289-face-preview.py`、`render-289-round-faces.py`で見た目だけ変換。
- 素材生成: `episode-style/scripts/render-289-assets.mjs`、`render-289-static-telops.mjs`、`encode-289-static-telops.mjs`。最終採用は`289-street-static-telops-fixed.mov`。修正前の同名に近い素材を使わない。
- Resolve: `resolve-289-round-assemble.lua`、`resolve-289-round-render.lua`。ネイティブConsole経由で実行。外部スクリプティング設定は変更していない。
- 検査: `289-round-seam-verification.json`、`289-resolve-round-final-quality-report.json`、`289-resolve-round-final-audio-sync.json`、`289-resolve-round-final-visual-report.json`。

これらは話数、ローカルパス、区間、hash、モデルパスを含む一回用コード。参考にする際は読んで引数化し、新しい作業フォルダに置く。同梱の丸ぼかし・音量・納品検査ヘルパーはこの経験を引数化したもの。

スキル化時点では、一般化した全工程を新規回で一貫実行した実績はない。同梱コードのテスト、既存完成品への読取検査、#289の実績を区別して報告する。
2026-09-21に同梱`verify_delivery.mjs`を上記完成MP4・WAV・DRPへ実行し、全編デコード・音量・5地点の音声照合・DRP整合性が通過。`289-skill-generalized-verification-20260921/report.json`に記録。元の完成品は変更していない。
同梱テストはPython6件・Node3件を通過。丸ぼかしの中央点保護・区間先頭のフレーム一致、WAV連結のヘッダーと音声bytes、ローカルのみの29.97fps build、無音照合の拒否、尺違い・黒画面・他版のレビュー流用の拒否を含む。実モデルによる新規回の検出精度を保証するテストではない。
