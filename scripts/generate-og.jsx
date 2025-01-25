import fs from "node:fs";
import path from "node:path";
import satori from "satori";
import { Resvg } from "@resvg/resvg-js";
import episodesData from "../src/data/episodes.json";

// OGP画像のサイズ
const WIDTH = 1200;
const HEIGHT = 630;

const OUT_DIR = path.join(process.cwd(), "public", "og");

// CLI引数をパース
const args = process.argv.slice(2);
const forceOverwrite = args.includes('--force') || args.includes('-f');

// 最新n件の指定を解析
const latestIndex = args.findIndex(arg => arg === '--latest' || arg === '-l');
const latestCount = latestIndex !== -1 ? Number.parseInt(args[latestIndex + 1], 10) : null;
if (latestIndex !== -1 && (!Number.isFinite(latestCount) || latestCount <= 0)) {
	console.error('Error: --latest (-l) オプションには正の整数を指定してください');
	process.exit(1);
}

const fontData = fs.readFileSync("./fonts/morisawa-biz-ud-gothic/fonts/ttf/BIZUDPGothic-Regular.ttf", null);

async function generateOGP(options) {
	const { title, subtitle, outPath } = options;

	// satori用のReact仮想DOMを定義
	const element = (
		<div
			style={{
				width: WIDTH,
				height: HEIGHT,
				display: "flex",
				justifyContent: "center",
				alignItems: "center",
				backgroundImage: "linear-gradient(135deg, #C084FC 0%, #A5F3FC 100%)",
				fontSize: "48px",
				fontFamily: "BIZUDPGothic",
				position: "relative",
			}}
		>
			<div
				style={{
					width: "90%",
					maxWidth: "1100px",
					background: "rgba(255, 255, 255, 0.97)",
					backdropFilter: "blur(8px)",
					borderRadius: "24px",
					boxShadow: "0 8px 32px rgba(0, 0, 0, 0.1)",
					padding: "64px 48px",
					lineHeight: 1.4,
					color: "#111",
					textAlign: "center",
					display: "flex",
					flexDirection: "column",
					gap: "24px",
					alignItems: "center",
				}}
			>
				<div 
					style={{ 
						wordBreak: "break-word",
						display: "flex",
						flexDirection: "column",
						gap: "16px",
						maxWidth: "90%",
					}}
				>
					<div
						style={{
							display: "flex",
							justifyContent: "center",
							fontSize: "56px",
							fontWeight: "bold",
							color: "#7E22CE",
							letterSpacing: "-1px",
							textShadow: "0 1px 2px rgba(0, 0, 0, 0.1)",
						}}
					>
						{title}
					</div>
					{subtitle && (
						<div
							style={{
								display: "flex",
								justifyContent: "center",
								fontSize: "36px",
								color: "#9333EA",
							}}
						>
							{subtitle}
						</div>
					)}
				</div>
			</div>
		</div>
	);

	// satoriでSVGを生成
	const svg = await satori(element, {
		width: WIDTH,
		height: HEIGHT,
		fonts: [
			{
				name: "BIZUDPGothic",
				data: fontData,
				weight: 400,
				style: "normal",
			},
		],
	});

	// SVG → PNG変換
	const resvg = new Resvg(svg, {
		fitTo: {
			mode: "width",
			value: WIDTH,
		},
		background: "white",
	});
	const pngData = resvg.render();
	const pngBuffer = pngData.asPng();

	// 保存
	fs.writeFileSync(outPath, pngBuffer);
	console.log(`Generated -> ${outPath}`);
}

async function main() {
	// 生成先ディレクトリがなければ作成
	if (!fs.existsSync(OUT_DIR)) {
		fs.mkdirSync(OUT_DIR, { recursive: true });
	}

	// エピソードを番号で降順ソート
	const sortedEpisodes = [...episodesData].sort((a, b) => b.number - a.number);
	
	// 最新n件に制限
	const targetEpisodes = latestCount ? sortedEpisodes.slice(0, latestCount) : sortedEpisodes;

	// episodes.json からエピソード一覧を取得
	for (const episode of targetEpisodes) {
		const epNumber = episode.number;
		const fullTitle = episode.title.replace(/~/g, '〜');
		
		// サブタイトルを抽出
		const match = fullTitle.match(/^(.*?)〜(.+?)〜(.*)$/);
		const [title, subtitle] = match 
			? [match[1] + match[3], match[2]]
			: [fullTitle, null];

		const outPath = path.join(OUT_DIR, `ep-${epNumber}.png`);

		// 既に生成済みで上書きしたくない場合はスキップ
		if (fs.existsSync(outPath) && !forceOverwrite) {
			console.log(`ep-${epNumber}.png が既に存在します。スキップします。`);
			continue;
		}

		await generateOGP({ title, subtitle, outPath });
	}
}

main().catch((err) => {
	console.error(err);
	process.exit(1);
});
