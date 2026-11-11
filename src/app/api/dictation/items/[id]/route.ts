import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { withUser } from "@/lib/api-handler";
import type { AuthenticatedContext } from "@/lib/api-handler";
import { internalError, notFound, validationError } from "@/lib/api-errors";
import { createLogger } from "@/lib/logger";
import { updateDictationItemSchema } from "@/lib/schemas/dictation";

const logger = createLogger("api:dictation-item");

type RouteContext = { params: Promise<{ id: string }> };

/** PUT /api/dictation/items/[id] 修正条目内容 */
export const PUT = withUser(async (req: Request, { user, params }: RouteContext & AuthenticatedContext) => {
    const { id } = await params;
    const parsed = updateDictationItemSchema.safeParse(await req.json().catch(() => null));
    if (!parsed.success) return validationError("DICTATION_INVALID_INPUT", parsed.error.issues);

    try {
        const existing = await prisma.dictationItem.findFirst({ where: { id, userId: user.id } });
        if (!existing) return notFound("Dictation item not found");

        const data = parsed.data;
        const updated = await prisma.dictationItem.update({
            where: { id },
            data: {
                ...(data.text !== undefined ? { text: data.text } : {}),
                ...(data.itemType !== undefined ? { itemType: data.itemType } : {}),
                ...(data.pinyin !== undefined ? { pinyin: data.pinyin || null } : {}),
                ...(data.meaning !== undefined ? { meaning: data.meaning || null } : {}),
                ...(data.note !== undefined ? { note: data.note || null } : {}),
                ...(data.wrongForm !== undefined ? { lastWrongForm: data.wrongForm || null } : {}),
            },
        });
        return NextResponse.json({ item: { id: updated.id } });
    } catch (error) {
        logger.error({ error, itemId: id }, "Failed to update dictation item");
        return internalError("Failed to update dictation item");
    }
});

/** DELETE /api/dictation/items/[id] */
export const DELETE = withUser(async (_req: Request, { user, params }: RouteContext & AuthenticatedContext) => {
    const { id } = await params;
    try {
        const existing = await prisma.dictationItem.findFirst({ where: { id, userId: user.id } });
        if (!existing) return notFound("Dictation item not found");

        await prisma.dictationItem.delete({ where: { id } });
        return NextResponse.json({ ok: true });
    } catch (error) {
        logger.error({ error, itemId: id }, "Failed to delete dictation item");
        return internalError("Failed to delete dictation item");
    }
});
