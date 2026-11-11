import { NextResponse } from "next/server";
import { withUser } from "@/lib/api-handler";
import type { AuthenticatedContext } from "@/lib/api-handler";
import { validationError } from "@/lib/api-errors";
import { createDictationRecognizeTasks, listDictationRecognizeTasks } from "@/lib/dictation/dictation-recognize-tasks";
import { createDictationRecognizeTasksSchema } from "@/lib/schemas/dictation";

async function handleGet(_req: Request, { user }: AuthenticatedContext) {
    const tasks = await listDictationRecognizeTasks(user.id);
    return NextResponse.json({ tasks });
}

async function handlePost(req: Request, { user }: AuthenticatedContext) {
    const parsed = createDictationRecognizeTasksSchema.safeParse(await req.json().catch(() => null));
    if (!parsed.success) return validationError("DICTATION_INVALID_INPUT", parsed.error.issues);
    const tasks = await createDictationRecognizeTasks(user, parsed.data.images.map((image) => ({
        clientRequestId: image.clientRequestId,
        imageData: image.imageData,
        lang: parsed.data.lang,
    })));
    return NextResponse.json({ tasks });
}

export const GET = withUser(handleGet);
export const POST = withUser(handlePost);
