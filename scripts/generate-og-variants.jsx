import fs from "node:fs";
import path from "node:path";
import episodesData from "../src/data/episodes.json";

// バリエーション用の出力ディレクトリ（public配下ではない）
const OUT_DIR = path.join(process.cwd(), "og-variants");

// CLI引数をパース
const args = process.argv.slice(2);
// variantsスクリプトは常に強制上書き
const forceOverwrite = true;

// watchモードの確認
const watchMode = args.includes('--watch') || args.includes('-w');

// 最新n件の指定を解析
const latestIndex = args.findIndex(arg => arg === '--latest' || arg === '-l');
const latestCount = latestIndex !== -1 ? Number.parseInt(args[latestIndex + 1], 10) : null;
if (latestIndex !== -1 && (!Number.isFinite(latestCount) || latestCount <= 0)) {
	console.error('Error: --latest (-l) オプションには正の整数を指定してください');
	process.exit(1);
}

async function main() {
	// 動的にモジュールを読み込み（watchモードで再読み込み可能にするため）
	const { generateOGP, STYLE_VARIANTS } = await import('./generate-og.jsx');
	
	// 生成先ディレクトリがなければ作成
	if (!fs.existsSync(OUT_DIR)) {
		fs.mkdirSync(OUT_DIR, { recursive: true });
	} else {
		// 既存のPNGファイルをクリーンアップ
		const files = fs.readdirSync(OUT_DIR);
		for (const file of files) {
			if (file.endsWith('.png')) {
				fs.unlinkSync(path.join(OUT_DIR, file));
				console.log(`Deleted -> ${file}`);
			}
		}
	}

	// エピソードを番号で降順ソート
	const sortedEpisodes = [...episodesData].sort((a, b) => b.number - a.number);
	
	// 最新n件に制限（デフォルトは1件）
	const targetEpisodes = latestCount 
		? sortedEpisodes.slice(0, latestCount) 
		: sortedEpisodes.slice(0, 1);

	// episodes.json からエピソード一覧を取得
	for (const episode of targetEpisodes) {
		const epNumber = episode.number;
		const fullTitle = episode.title.replace(/~/g, '〜');
		
		// サブタイトルを抽出
		const match = fullTitle.match(/^(.*?)〜(.+?)〜(.*)$/);
		const [title, subtitle] = match 
			? [match[1] + match[3], match[2]]
			: [fullTitle, null];

		// brandBottomRightNoIconStrongBlurのみを生成
		const variant = STYLE_VARIANTS.brandBottomRightNoIconStrongBlur;
		const outPath = path.join(OUT_DIR, `ep-${epNumber}-${variant.name}.png`);
		await generateOGP({ title, subtitle, outPath, styleVariant: variant });
	}
}

async function watchAndGenerate() {
	const generateOgPath = path.join(process.cwd(), "scripts", "generate-og.jsx");
	
	console.log(`Watching ${generateOgPath} for changes...`);
	console.log('Press Ctrl+C to stop watching.\n');
	
	// 初回実行
	await main();
	
	// ファイル変更を監視
	fs.watchFile(generateOgPath, { interval: 1000 }, async (curr, prev) => {
		if (curr.mtime !== prev.mtime) {
			console.log('\n📝 File changed, regenerating variants...\n');
			try {
				// 再生成（main関数内で動的にインポートされる）
				await main();
				console.log('\n✅ Regeneration complete!\n');
			} catch (err) {
				console.error('❌ Error during regeneration:', err);
			}
		}
	});
}

if (watchMode) {
	watchAndGenerate().catch((err) => {
		console.error(err);
		process.exit(1);
	});
} else {
	main().catch((err) => {
		console.error(err);
		process.exit(1);
	});
}
