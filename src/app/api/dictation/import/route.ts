import { NextResponse } from "next/server";
import { withUser } from "@/lib/api-handler";
import type { AuthenticatedContext } from "@/lib/api-handler";
import { internalError, validationError } from "@/lib/api-errors";
import { createLogger } from "@/lib/logger";
import { createDictationItems } from "@/lib/dictation/dictation-service";
import { parseDictationImport, inferItemType } from "@/lib/dictation/import-parser";
import { importDictationSchema } from "@/lib/schemas/dictation";

const logger = createLogger("api:dictation-import");

/** POST /api/dictation/import 粘贴词库批量导入 */
export const POST = withUser(async (req: Request, { user }: AuthenticatedContext) => {
    const parsed = importDictationSchema.safeParse(await req.json().catch(() => null));
    if (!parsed.success) return validationError("DICTATION_INVALID_INPUT", parsed.error.issues);

    const { lang, content } = parsed.data;
    const { lines, invalidLines } = parseDictationImport(content);
    if (lines.length === 0) {
        return NextResponse.json({ created: [], skipped: 0, invalidLines });
    }

    try {
        const result = await createDictationItems(
            user.id,
            lines.map((line) => ({
                lang,
                itemType: inferItemType(lang, line.text),
                text: line.text,
                ...(lang === "chinese" ? { pinyin: line.annotation } : { meaning: line.annotation }),
                source: "import" as const,
            })),
        );
        logger.info({ userId: user.id, lang, total: lines.length, created: result.created.length, skipped: result.skipped }, "Dictation import done");
        return NextResponse.json({ ...result, invalidLines });
    } catch (error) {
        logger.error({ error }, "Failed to import dictation items");
        return internalError("Failed to import dictation items");
    }
});
