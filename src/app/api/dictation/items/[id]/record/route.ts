import { NextResponse } from "next/server";
import { withUser } from "@/lib/api-handler";
import type { AuthenticatedContext } from "@/lib/api-handler";
import { internalError, notFound, validationError } from "@/lib/api-errors";
import { createLogger } from "@/lib/logger";
import { recordDictationResult } from "@/lib/dictation/dictation-service";
import { recordDictationSchema } from "@/lib/schemas/dictation";

const logger = createLogger("api:dictation-record");

type RouteContext = { params: Promise<{ id: string }> };

/** POST /api/dictation/items/[id]/record 回填一次听写/默写结果 */
export const POST = withUser(async (req: Request, { user, params }: RouteContext & AuthenticatedContext) => {
    const { id } = await params;
    const parsed = recordDictationSchema.safeParse(await req.json().catch(() => null));
    if (!parsed.success) return validationError("DICTATION_INVALID_INPUT", parsed.error.issues);

    try {
        const item = await recordDictationResult({
            userId: user.id,
            itemId: id,
            result: parsed.data.result,
            wrongForm: parsed.data.wrongForm,
        });
        if (!item) return notFound("Dictation item not found");
        return NextResponse.json({ item });
    } catch (error) {
        logger.error({ error, itemId: id }, "Failed to record dictation result");
        return internalError("Failed to record dictation result");
    }
});
