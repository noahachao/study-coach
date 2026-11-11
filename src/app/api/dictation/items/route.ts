import { NextResponse } from "next/server";
import { withUser } from "@/lib/api-handler";
import type { AuthenticatedContext } from "@/lib/api-handler";
import { internalError, validationError } from "@/lib/api-errors";
import { createLogger } from "@/lib/logger";
import { listDictationItems, getDictationSummary, createDictationItems } from "@/lib/dictation/dictation-service";
import { listDictationQuerySchema, createDictationItemsSchema } from "@/lib/schemas/dictation";

const logger = createLogger("api:dictation-items");

/** GET /api/dictation/items?lang=&status= 返回条目列表与两科汇总 */
export const GET = withUser(async (req: Request, { user }: AuthenticatedContext) => {
    const url = new URL(req.url);
    const parsed = listDictationQuerySchema.safeParse({
        lang: url.searchParams.get("lang") ?? undefined,
        status: url.searchParams.get("status") ?? undefined,
    });
    if (!parsed.success) return validationError("DICTATION_INVALID_QUERY", parsed.error.issues);

    try {
        const [items, summary] = await Promise.all([
            listDictationItems({ userId: user.id, lang: parsed.data.lang, status: parsed.data.status }),
            getDictationSummary(user.id),
        ]);
        return NextResponse.json({ items, summary });
    } catch (error) {
        logger.error({ error }, "Failed to list dictation items");
        return internalError("Failed to list dictation items");
    }
});

/** POST /api/dictation/items 批量录入（手动/拍照确认/导入共用） */
export const POST = withUser(async (req: Request, { user }: AuthenticatedContext) => {
    const parsed = createDictationItemsSchema.safeParse(await req.json().catch(() => null));
    if (!parsed.success) return validationError("DICTATION_INVALID_INPUT", parsed.error.issues);

    try {
        const { lang, items, source } = parsed.data;
        const result = await createDictationItems(
            user.id,
            items.map((item) => ({
                lang,
                itemType: item.itemType,
                text: item.text,
                pinyin: item.pinyin,
                meaning: item.meaning,
                note: item.note,
                wrongForm: item.wrongForm,
                source,
            })),
        );
        return NextResponse.json(result);
    } catch (error) {
        logger.error({ error }, "Failed to create dictation items");
        return internalError("Failed to create dictation items");
    }
});
