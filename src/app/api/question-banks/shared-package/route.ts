import { NextResponse } from "next/server";
import { withUser } from "@/lib/api-handler";
import { bankPackageUrl } from "@/lib/question-bank/format";
import { DEFAULT_BANK_INDEX_URL } from "@/lib/question-bank/types";
import { badRequest } from "@/lib/api-errors";
import { createLogger } from "@/lib/logger";

const logger = createLogger("api:question-banks:shared-package");

const SHARED_PACKAGE_FILE_PATTERN = /^banks\/[A-Za-z0-9][A-Za-z0-9._-]*(?:\/[A-Za-z0-9][A-Za-z0-9._-]*)*\.json$/;

export const GET = withUser(async (req) => {
    const file = new URL(req.url).searchParams.get("file") ?? "";
    if (!SHARED_PACKAGE_FILE_PATTERN.test(file)) {
        return badRequest("Invalid shared package file");
    }
    const url = bankPackageUrl(DEFAULT_BANK_INDEX_URL, file);
    try {
        const response = await fetch(url, { cache: "no-store", signal: AbortSignal.timeout(60_000) });
        if (!response.ok) {
            logger.warn(`Shared package fetch failed: HTTP ${response.status} for ${file}`);
            return NextResponse.json({ error: `HTTP ${response.status}` }, { status: 502 });
        }
        const data: unknown = await response.json();
        return NextResponse.json(data);
    } catch (err) {
        logger.warn(`Shared package fetch error for ${file}: ${err instanceof Error ? err.message : String(err)}`);
        return NextResponse.json({ error: "SHARED_PACKAGE_FETCH_FAILED" }, { status: 502 });
    }
});
