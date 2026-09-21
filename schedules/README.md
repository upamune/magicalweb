# クラウドスケジュール（routines）の控え

claude.ai の Code routines に登録していた定期ジョブの定義。
routines は API から削除できないため、ここを正本の控えとして残し、本体は無効化（`enabled: false`）してある。

一覧・停止・再開は https://claude.ai/code/routines から行う。

## 登録内容（2026-09-21 時点）

| ファイル | 名前 | cron (UTC) | 日本時間 | リポジトリ | 環境 | 状態 |
| --- | --- | --- | --- | --- | --- | --- |
| [magicalfm-auto-clip.json](magicalfm-auto-clip.json) | magicalfm-auto-clip | `0 19 * * 0,3` | 月・木 4:00 | upamune/magicalweb | magicalweb (`env_01Y45FLzFXoJcXtn9xWR6kZG`) | 停止（2026-09-21 に無効化） |
| [magicalshorts-auto-short.json](magicalshorts-auto-short.json) | magicalshorts: 新着からショートを自動生成 | `0 21 * * *` | 毎日 6:00 | upamune/magicalshorts | magicalshorts (`env_011PTbpSgmCWpNqxLZWaFnmp`) | 停止（2026-09-03 に無効化済み） |

- **magicalfm-auto-clip**: 最新話の切り抜きショートを無人で生成し、R2 にアップして main に直接 push する。手順は `.agents/skills/make-clip/SKILL.md` の「無人モード」。最後の実行は 2026-09-20 19:05 UTC で失敗している。
- **magicalshorts-auto-short**: マヂカルちゃんねるの新着動画からショートを作り、YouTube に限定公開でアップして Issue と PR を開く。手順は magicalshorts 側の `.agents/skills/auto-short/SKILL.md`。最後の実行は 2026-08-30 13:03 UTC で成功。

## 復元のしかた

各 JSON はそのまま routines API の作成ボディになる（`_trigger_id` は元の routine の ID を控えているだけなので送らない）。
Claude Code で `/schedule` を使い、次の要領で作り直す。

```
RemoteTrigger action=create body=<この JSON から _trigger_id を除いたもの>
```

既存の routine を停止・再開するだけなら作り直さず更新する。

```
RemoteTrigger action=update trigger_id=<_trigger_id の値> body={"enabled": false}
```

環境変数（`ELEVENLABS_API_KEY` / `R2_ACCESS_KEY_ID` / `R2_SECRET_ACCESS_KEY` / `CLOUDFLARE_ACCOUNT_ID` / YouTube 系）は環境側に設定されていて、この JSON には含まれない。
