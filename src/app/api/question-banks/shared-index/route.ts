import { NextResponse } from "next/server";
import { withUser } from "@/lib/api-handler";
import { DEFAULT_BANK_INDEX_URL } from "@/lib/question-bank/types";
import { createLogger } from "@/lib/logger";

const logger = createLogger("api:question-banks:shared-index");

export const GET = withUser(async () => {
    try {
        const response = await fetch(DEFAULT_BANK_INDEX_URL, { cache: "no-store", signal: AbortSignal.timeout(15_000) });
        if (!response.ok) {
            logger.warn(`Shared index fetch failed: HTTP ${response.status}`);
            return NextResponse.json({ error: `HTTP ${response.status}` }, { status: 502 });
        }
        const data: unknown = await response.json();
        return NextResponse.json(data);
    } catch (err) {
        logger.warn(`Shared index fetch error: ${err instanceof Error ? err.message : String(err)}`);
        return NextResponse.json({ error: "SHARED_INDEX_FETCH_FAILED" }, { status: 502 });
    }
});
