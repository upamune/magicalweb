import fs from "node:fs";
import path from "node:path";
import React from "react";
import satori from "satori";
import { Resvg } from "@resvg/resvg-js";
import episodesData from "../src/data/episodes.json" with { type: "json" };

// OGP画像のサイズ
const WIDTH = 1200;
const HEIGHT = 630;

const OUT_DIR = path.join(process.cwd(), "public", "og");

// CLI引数をパース
const args = process.argv.slice(2);
const forceOverwrite = args.includes('--force') || args.includes('-f');
const generateVariants = args.includes('--variants') || args.includes('-v');

// 最新n件の指定を解析
const latestIndex = args.findIndex(arg => arg === '--latest' || arg === '-l');
const latestCount = latestIndex !== -1 ? Number.parseInt(args[latestIndex + 1], 10) : null;
if (latestIndex !== -1 && (!Number.isFinite(latestCount) || latestCount <= 0)) {
	console.error('Error: --latest (-l) オプションには正の整数を指定してください');
	process.exit(1);
}

// M PLUS Roundedフォントを読み込み
const fontRegular = fs.readFileSync("./fonts/m-plus-rounded/MPLUSRounded1c-Regular.ttf", null);
const fontBold = fs.readFileSync("./fonts/m-plus-rounded/MPLUSRounded1c-Bold.ttf", null);

// 公式アイコン画像を読み込み（Base64エンコード）
const artworkImagePath = path.join(process.cwd(), "images", "artwork_for_ogp.png");
const artworkImageBuffer = fs.readFileSync(artworkImagePath);
const artworkImageBase64 = artworkImageBuffer.toString('base64');
const artworkImageDataUri = `data:image/png;base64,${artworkImageBase64}`;

// 背景画像を読み込み（Base64エンコード）
const backgroundImagePath = path.join(process.cwd(), "images", "artwork_for_ogp_3000.png");
const backgroundImageBuffer = fs.readFileSync(backgroundImagePath);
const backgroundImageBase64 = backgroundImageBuffer.toString('base64');
const backgroundImageDataUri = `data:image/png;base64,${backgroundImageBase64}`;

// スタイルバリエーションの定義
export const STYLE_VARIANTS = {
	brandBottomRight: {
		name: 'brand-bottom-right',
		position: { bottom: '32px', right: '40px' },
		showIcon: true,
		fontSize: '24px',
	},
	brandTopLeft: {
		name: 'brand-top-left',
		position: { top: '32px', left: '40px' },
		showIcon: true,
		fontSize: '24px',
	},
	brandBottomRightNoIcon: {
		name: 'brand-bottom-right-no-icon',
		position: { bottom: '32px', right: '40px' },
		showIcon: false,
		fontSize: '24px',
	},
	brandTopLeftNoIcon: {
		name: 'brand-top-left-no-icon',
		position: { top: '32px', left: '40px' },
		showIcon: false,
		fontSize: '24px',
	},
	brandCenterBottom: {
		name: 'brand-center-bottom',
		position: { bottom: '32px', left: '0', right: '0' },
		showIcon: true,
		fontSize: '28px',
		centerAlign: true,
	},
	brandCenterBottomNoIcon: {
		name: 'brand-center-bottom-no-icon',
		position: { bottom: '32px', left: '0', right: '0' },
		showIcon: false,
		fontSize: '28px',
		centerAlign: true,
	},
	brandTopRight: {
		name: 'brand-top-right',
		position: { top: '32px', right: '40px' },
		showIcon: true,
		fontSize: '20px',
	},
	brandBottomRightSmall: {
		name: 'brand-bottom-right-small',
		position: { bottom: '32px', right: '40px' },
		showIcon: true,
		fontSize: '24px',
		backgroundSize: '250px 250px',
		backgroundRepeat: 'repeat',
		backgroundPosition: '-60px -60px',
	},
	brandTopLeftSmall: {
		name: 'brand-top-left-small',
		position: { top: '32px', left: '40px' },
		showIcon: true,
		fontSize: '24px',
		backgroundSize: '250px 250px',
		backgroundRepeat: 'repeat',
		backgroundPosition: '-60px -60px',
	},
	brandBottomRightSmallNoIcon: {
		name: 'brand-bottom-right-small-no-icon',
		position: { bottom: '32px', right: '40px' },
		showIcon: false,
		fontSize: '24px',
		backgroundSize: '250px 250px',
		backgroundRepeat: 'repeat',
		backgroundPosition: '-60px -60px',
	},
	brandTopLeftSmallNoIcon: {
		name: 'brand-top-left-small-no-icon',
		position: { top: '32px', left: '40px' },
		showIcon: false,
		fontSize: '24px',
		backgroundSize: '250px 250px',
		backgroundRepeat: 'repeat',
		backgroundPosition: '-60px -60px',
	},
	brandBottomRightNoBg: {
		name: 'brand-bottom-right-no-bg',
		position: { bottom: '32px', right: '40px' },
		showIcon: true,
		fontSize: '24px',
		useBackgroundImage: false,
	},
	brandTopLeftNoBg: {
		name: 'brand-top-left-no-bg',
		position: { top: '32px', left: '40px' },
		showIcon: true,
		fontSize: '24px',
		useBackgroundImage: false,
	},
	brandBottomRightNoIconNoBg: {
		name: 'brand-bottom-right-no-icon-no-bg',
		position: { bottom: '32px', right: '40px' },
		showIcon: false,
		fontSize: '24px',
		useBackgroundImage: false,
	},
	brandTopLeftNoIconNoBg: {
		name: 'brand-top-left-no-icon-no-bg',
		position: { top: '32px', left: '40px' },
		showIcon: false,
		fontSize: '24px',
		useBackgroundImage: false,
	},
	brandBottomRightStrongBlur: {
		name: 'brand-bottom-right-strong-blur',
		position: { bottom: '32px', right: '40px' },
		showIcon: true,
		fontSize: '24px',
		backgroundBlur: '8px',
	},
	brandTopLeftStrongBlur: {
		name: 'brand-top-left-strong-blur',
		position: { top: '32px', left: '40px' },
		showIcon: true,
		fontSize: '24px',
		backgroundBlur: '8px',
	},
	brandBottomRightNoIconStrongBlur: {
		name: 'brand-bottom-right-no-icon-strong-blur',
		position: { bottom: '32px', right: '40px' },
		showIcon: false,
		showText: false,
		fontSize: '24px',
		backgroundBlur: '8px',
		titleStyle: {
			fontSize: '56px',
			fontWeight: 700,
			color: 'rgba(255, 255, 255, 1)',
			textShadow: '0 3px 12px rgba(0, 0, 0, 0.7), 0 1px 3px rgba(0, 0, 0, 0.5)',
		},
	},
	brandBottomRightNoIconStrongBlurWithBg: {
		name: 'brand-bottom-right-no-icon-strong-blur-with-bg',
		position: { bottom: '32px', right: '40px' },
		showIcon: false,
		showText: false,
		fontSize: '24px',
		backgroundBlur: '8px',
		titleStyle: {
			fontSize: '64px',
			fontWeight: 700,
			color: 'rgba(255, 255, 255, 1)',
			textShadow: '0 3px 12px rgba(0, 0, 0, 0.7)',
			background: 'rgba(0, 0, 0, 0.6)',
			padding: '16px 32px',
			borderRadius: '20px',
			backdropFilter: 'blur(8px)',
		},
	},
	brandBottomRightNoIconStrongBlurLarge: {
		name: 'brand-bottom-right-no-icon-strong-blur-large',
		position: { bottom: '32px', right: '40px' },
		showIcon: false,
		showText: false,
		fontSize: '24px',
		backgroundBlur: '8px',
		titleStyle: {
			fontSize: '72px',
			fontWeight: 700,
			color: 'rgba(255, 255, 255, 1)',
			textShadow: '0 3px 12px rgba(0, 0, 0, 0.7), 0 1px 3px rgba(0, 0, 0, 0.5)',
		},
	},
	brandTopLeftNoIconStrongBlur: {
		name: 'brand-top-left-no-icon-strong-blur',
		position: { top: '32px', left: '40px' },
		showIcon: false,
		fontSize: '24px',
		backgroundBlur: '8px',
	},
	brandCenterBottomStrongBlur: {
		name: 'brand-center-bottom-strong-blur',
		position: { bottom: '32px', left: '0', right: '0' },
		showIcon: true,
		fontSize: '28px',
		centerAlign: true,
		backgroundBlur: '8px',
	},
	brandCenterBottomNoIconStrongBlur: {
		name: 'brand-center-bottom-no-icon-strong-blur',
		position: { bottom: '32px', left: '0', right: '0' },
		showIcon: false,
		fontSize: '28px',
		centerAlign: true,
		backgroundBlur: '8px',
	},
	brandTopRightStrongBlur: {
		name: 'brand-top-right-strong-blur',
		position: { top: '32px', right: '40px' },
		showIcon: true,
		fontSize: '20px',
		backgroundBlur: '8px',
	},
	brandBottomRightSmallStrongBlur: {
		name: 'brand-bottom-right-small-strong-blur',
		position: { bottom: '32px', right: '40px' },
		showIcon: true,
		fontSize: '24px',
		backgroundSize: '250px 250px',
		backgroundRepeat: 'repeat',
		backgroundPosition: '-60px -60px',
		backgroundBlur: '8px',
	},
	brandTopLeftSmallStrongBlur: {
		name: 'brand-top-left-small-strong-blur',
		position: { top: '32px', left: '40px' },
		showIcon: true,
		fontSize: '24px',
		backgroundSize: '250px 250px',
		backgroundRepeat: 'repeat',
		backgroundPosition: '-60px -60px',
		backgroundBlur: '8px',
	},
	brandBottomRightSmallNoIconStrongBlur: {
		name: 'brand-bottom-right-small-no-icon-strong-blur',
		position: { bottom: '32px', right: '40px' },
		showIcon: false,
		fontSize: '24px',
		backgroundSize: '250px 250px',
		backgroundRepeat: 'repeat',
		backgroundPosition: '-60px -60px',
		backgroundBlur: '8px',
	},
	brandTopLeftSmallNoIconStrongBlur: {
		name: 'brand-top-left-small-no-icon-strong-blur',
		position: { top: '32px', left: '40px' },
		showIcon: false,
		fontSize: '24px',
		backgroundSize: '250px 250px',
		backgroundRepeat: 'repeat',
		backgroundPosition: '-60px -60px',
		backgroundBlur: '8px',
	},
	brandBottomRightNoBgStrongBlur: {
		name: 'brand-bottom-right-no-bg-strong-blur',
		position: { bottom: '32px', right: '40px' },
		showIcon: true,
		fontSize: '24px',
		useBackgroundImage: false,
		backgroundBlur: '8px',
	},
	brandTopLeftNoBgStrongBlur: {
		name: 'brand-top-left-no-bg-strong-blur',
		position: { top: '32px', left: '40px' },
		showIcon: true,
		fontSize: '24px',
		useBackgroundImage: false,
		backgroundBlur: '8px',
	},
	brandBottomRightNoIconNoBgStrongBlur: {
		name: 'brand-bottom-right-no-icon-no-bg-strong-blur',
		position: { bottom: '32px', right: '40px' },
		showIcon: false,
		fontSize: '24px',
		useBackgroundImage: false,
		backgroundBlur: '8px',
	},
	brandTopLeftNoIconNoBgStrongBlur: {
		name: 'brand-top-left-no-icon-no-bg-strong-blur',
		position: { top: '32px', left: '40px' },
		showIcon: false,
		fontSize: '24px',
		useBackgroundImage: false,
		backgroundBlur: '8px',
	},
	brandCenterBottomNoBg: {
		name: 'brand-center-bottom-no-bg',
		position: { bottom: '32px', left: '0', right: '0' },
		showIcon: true,
		fontSize: '28px',
		centerAlign: true,
		useBackgroundImage: false,
	},
	brandCenterBottomNoIconNoBg: {
		name: 'brand-center-bottom-no-icon-no-bg',
		position: { bottom: '32px', left: '0', right: '0' },
		showIcon: false,
		fontSize: '28px',
		centerAlign: true,
		useBackgroundImage: false,
	},
	brandCenterBottomNoBgStrongBlur: {
		name: 'brand-center-bottom-no-bg-strong-blur',
		position: { bottom: '32px', left: '0', right: '0' },
		showIcon: true,
		fontSize: '28px',
		centerAlign: true,
		useBackgroundImage: false,
		backgroundBlur: '8px',
	},
	brandCenterBottomNoIconNoBgStrongBlur: {
		name: 'brand-center-bottom-no-icon-no-bg-strong-blur',
		position: { bottom: '32px', left: '0', right: '0' },
		showIcon: false,
		fontSize: '28px',
		centerAlign: true,
		useBackgroundImage: false,
		backgroundBlur: '8px',
	},
};

export async function generateOGP(options) {
	const { title, subtitle, outPath, styleVariant = null, episodeNumber = null } = options;
	
	// スタイルバリエーションの選択
	const variant = styleVariant || STYLE_VARIANTS.brandBottomRightNoIconStrongBlur;
	const brandPosition = variant.position;
	const showIcon = variant.showIcon;
	const showText = variant.showText !== false; // デフォルトはtrue
	const brandFontSize = variant.fontSize;
	const backgroundSize = variant.backgroundSize || '400px 400px';
	const backgroundRepeat = variant.backgroundRepeat || 'repeat';
	const backgroundPosition = variant.backgroundPosition || '-50px -50px';
	const useBackgroundImage = variant.useBackgroundImage !== false; // デフォルトはtrue
	const backgroundBlur = variant.backgroundBlur || '3px';
	const titleStyle = variant.titleStyle || {
		fontSize: '48px',
		fontWeight: 700,
		color: 'rgba(255, 255, 255, 1)',
		textShadow: '0 3px 12px rgba(0, 0, 0, 0.7), 0 1px 3px rgba(0, 0, 0, 0.5)',
	};

	// エピソード番号がない場合の背景色
	const backgroundColor = episodeNumber === 0 ? "#4EACAB" : "#B753E7";

	// satori用のReact仮想DOMを定義
	const element = (
		<div
			style={{
				width: WIDTH,
				height: HEIGHT,
				display: "flex",
				justifyContent: "center",
				alignItems: "center",
				fontSize: "48px",
				fontFamily: "MPLUSRounded1c",
				position: "relative",
				backgroundColor: backgroundColor,
			}}
		>
			{/* 背景画像（ブラー効果付き） - 現在は使用していません */}
			{/* 番組名とアイコン */}
			{(showIcon || showText) && (
				<div
					style={{
						position: "absolute",
						...brandPosition,
						display: "flex",
						alignItems: "center",
						justifyContent: variant.centerAlign ? "center" : "flex-start",
						gap: "12px",
						fontSize: brandFontSize,
						fontFamily: "MPLUSRounded1c",
						fontWeight: 400,
						padding: "8px 16px",
						background: "rgba(0, 0, 0, 0.3)",
						backdropFilter: "blur(4px)",
						borderRadius: "16px",
						border: "1px solid rgba(255, 255, 255, 0.2)",
					}}
				>
					{/* 公式アイコン */}
					{showIcon && (
						<img
							src={artworkImageDataUri}
							alt="マヂカル.fm"
							width="120"
							height="120"
							style={{
								width: "120px",
								height: "120px",
								objectFit: "contain",
								filter: "drop-shadow(0 2px 8px rgba(0, 0, 0, 0.3))",
								flexShrink: 0,
							}}
						/>
					)}
					{showText && (
						<span
							style={{
								color: "rgba(255, 255, 255, 1)",
								textShadow: "0 2px 8px rgba(0, 0, 0, 0.5), 0 1px 2px rgba(0, 0, 0, 0.3)",
								fontWeight: 500,
								whiteSpace: "nowrap",
							}}
						>
							🎧マヂカル.fm🎧
						</span>
					)}
				</div>
			)}
			{/* マヂカル.fm タイトル */}
			<div
				style={{
					position: "absolute",
					top: "50px",
					left: "0",
					right: "0",
					display: "flex",
					justifyContent: "center",
					alignItems: "center",
					fontFamily: "MPLUSRounded1c",
					marginBottom: "40px",
					...(titleStyle.containerStyle || {}),
				}}
			>
				<span
					style={{
						...titleStyle,
						...(titleStyle.background && {
							background: titleStyle.background,
							padding: titleStyle.padding || '12px 24px',
							borderRadius: titleStyle.borderRadius || '16px',
						}),
					}}
				>
					🎧マヂカル.fm🎧
				</span>
			</div>
			<div
				style={{
					width: "90%",
					maxWidth: "1100px",
					background: "rgba(255, 255, 255, 0.97)",
					backdropFilter: "blur(8px)",
					borderRadius: "24px",
					boxShadow: "0 8px 32px rgba(0, 0, 0, 0.1)",
					padding: "64px 48px",
					marginBottom: brandPosition.bottom ? "100px" : "0",
					marginTop: brandPosition.top ? "220px" : "180px",
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
							fontWeight: 700,
							fontFamily: "MPLUSRounded1c",
							color: "#7E22CE",
							letterSpacing: "-0.5px",
							textShadow: "0 2px 4px rgba(0, 0, 0, 0.08)",
							wordBreak: "keep-all",
							overflowWrap: "break-word",
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
								fontFamily: "MPLUSRounded1c",
								fontWeight: 400,
								color: "#9333EA",
								letterSpacing: "-0.3px",
								wordBreak: "keep-all",
								overflowWrap: "break-word",
							}}
						>
							〜{subtitle}〜
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
				name: "MPLUSRounded1c",
				data: fontRegular,
				weight: 400,
				style: "normal",
			},
			{
				name: "MPLUSRounded1c",
				data: fontBold,
				weight: 700,
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
		const epSlug = episode.customPath || epNumber.toString();
		const fullTitle = episode.title.replace(/~/g, '〜');

		// サブタイトルを抽出
		const match = fullTitle.match(/^(.*?)〜(.+?)〜(.*)$/);
		const [title, subtitle] = match
			? [match[1] + match[3], match[2]]
			: [fullTitle, null];

		// バリエーション生成モードの場合
		if (generateVariants) {
			for (const [key, variant] of Object.entries(STYLE_VARIANTS)) {
				const outPath = path.join(OUT_DIR, `ep-${epSlug}-${variant.name}.png`);
				await generateOGP({ title, subtitle, outPath, styleVariant: variant, episodeNumber: epNumber });
			}
		} else {
			const outPath = path.join(OUT_DIR, `ep-${epSlug}.png`);

			// 既に生成済みで上書きしたくない場合はスキップ
			if (fs.existsSync(outPath) && !forceOverwrite) {
				console.log(`ep-${epSlug}.png が既に存在します。スキップします。`);
				continue;
			}

			await generateOGP({ title, subtitle, outPath, episodeNumber: epNumber });
		}
	}
}

// 直接実行された場合のみmain関数を実行
if (import.meta.url === `file://${process.argv[1]}`) {
	main().catch((err) => {
		console.error(err);
		process.exit(1);
	});
}
