import crypto from "node:crypto";
import fs from "node:fs";

// Cloudflare R2 の S3 互換 API を SigV4 で直接叩く最小クライアント。
// Bun / Node どちらでも動く（外部依存なし）。
// 必要な環境変数: R2_ACCESS_KEY_ID / R2_SECRET_ACCESS_KEY / CLOUDFLARE_ACCOUNT_ID

const REGION = "auto";
const SERVICE = "s3";

const sha256 = (data) => crypto.createHash("sha256").update(data).digest("hex");
const hmac = (key, data) =>
	crypto.createHmac("sha256", key).update(data).digest();

export const hasR2Credentials = () =>
	Boolean(
		process.env.R2_ACCESS_KEY_ID &&
			process.env.R2_SECRET_ACCESS_KEY &&
			process.env.CLOUDFLARE_ACCOUNT_ID,
	);

const request = async (method, bucket, key, body, contentType) => {
	const accessKey = process.env.R2_ACCESS_KEY_ID;
	const secretKey = process.env.R2_SECRET_ACCESS_KEY;
	const host = `${process.env.CLOUDFLARE_ACCOUNT_ID}.r2.cloudflarestorage.com`;
	const path = `/${bucket}/${key.split("/").map(encodeURIComponent).join("/")}`;

	const now = new Date();
	const amzDate = now
		.toISOString()
		.replace(/[-:]/g, "")
		.replace(/\.\d{3}/, "");
	const dateStamp = amzDate.slice(0, 8);
	const payloadHash = body ? sha256(body) : sha256("");

	const headers = {
		host,
		"x-amz-content-sha256": payloadHash,
		"x-amz-date": amzDate,
		...(contentType ? { "content-type": contentType } : {}),
	};
	const signedHeaderNames = Object.keys(headers).sort();
	const canonicalHeaders = signedHeaderNames
		.map((h) => `${h}:${headers[h]}\n`)
		.join("");
	const signedHeaders = signedHeaderNames.join(";");
	const canonicalRequest = [
		method,
		path,
		"",
		canonicalHeaders,
		signedHeaders,
		payloadHash,
	].join("\n");
	const scope = `${dateStamp}/${REGION}/${SERVICE}/aws4_request`;
	const stringToSign = [
		"AWS4-HMAC-SHA256",
		amzDate,
		scope,
		sha256(canonicalRequest),
	].join("\n");
	const kDate = hmac(`AWS4${secretKey}`, dateStamp);
	const kRegion = hmac(kDate, REGION);
	const kService = hmac(kRegion, SERVICE);
	const kSigning = hmac(kService, "aws4_request");
	const signature = crypto
		.createHmac("sha256", kSigning)
		.update(stringToSign)
		.digest("hex");

	const res = await fetch(`https://${host}${path}`, {
		method,
		headers: {
			...headers,
			authorization: `AWS4-HMAC-SHA256 Credential=${accessKey}/${scope}, SignedHeaders=${signedHeaders}, Signature=${signature}`,
		},
		body,
	});
	if (!res.ok && !(method === "DELETE" && res.status === 404)) {
		throw new Error(
			`R2 ${method} ${key} failed: ${res.status} ${await res.text()}`,
		);
	}
	return res;
};

export const r2Put = (bucket, key, filePath, contentType = "video/mp4") =>
	request("PUT", bucket, key, fs.readFileSync(filePath), contentType);

export const r2Delete = (bucket, key) => request("DELETE", bucket, key);

export const r2Exists = async (bucket, key) => {
	try {
		await request("HEAD", bucket, key);
		return true;
	} catch (e) {
		if (/failed: 404/.test(e.message)) return false;
		throw e;
	}
};
