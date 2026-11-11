import { NextResponse } from "next/server";
import { withUser } from "@/lib/api-handler";
import type { AuthenticatedContext } from "@/lib/api-handler";
import { createErrorResponse, ErrorCode, reportApiError, validationError } from "@/lib/api-errors";
import { createLogger } from "@/lib/logger";
import { consumeAiQuota } from "@/lib/ai-quota";
import { withRecoverableResponse } from "@/lib/recoverable-response";
import { getAIService } from "@/lib/ai";
import { recognizeDictationSchema } from "@/lib/schemas/dictation";

const logger = createLogger("api:dictation-recognize");

/**
 * 同步识别默写作业照片：返回结构化草稿，由前端确认后再录入。
 * 耗时 AI 请求：浏览器中断连接后，前端可通过 /api/requests/:id 取回响应。
 */
async function handlePost(req: Request, { user, session }: AuthenticatedContext) {
    const parsed = recognizeDictationSchema.safeParse(await req.json().catch(() => null));
    if (!parsed.success) return validationError("DICTATION_INVALID_INPUT", parsed.error.issues);
    const { imageBase64, mimeType, lang } = parsed.data;

    const limited = await consumeAiQuota(session.user, "analyze");
    if (limited) return limited;

    try {
        const service = await getAIService({ userId: user.id, kind: "analyze" });
        const drafts = await service.analyzeDictationImage(imageBase64, mimeType, lang);
        return NextResponse.json({ drafts });
    } catch (error) {
        logger.error({ error }, "Dictation recognition failed");
        reportApiError("api:dictation-recognize", error);
        return createErrorResponse("Dictation recognition failed", 500, ErrorCode.AI_ERROR);
    }
}

export const POST = withRecoverableResponse(withUser(handlePost));
