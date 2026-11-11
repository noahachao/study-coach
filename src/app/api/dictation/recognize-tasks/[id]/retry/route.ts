import { NextResponse } from "next/server";
import { withUser } from "@/lib/api-handler";
import type { AuthenticatedContext } from "@/lib/api-handler";
import { notFound } from "@/lib/api-errors";
import { retryDictationRecognizeTask } from "@/lib/dictation/dictation-recognize-tasks";

type RouteContext = { params: Promise<{ id: string }> };

async function handlePost(_req: Request, { user, params }: AuthenticatedContext & RouteContext) {
    const { id } = await params;
    const task = await retryDictationRecognizeTask(user.id, id);
    if (!task) return notFound();
    return NextResponse.json({ task });
}

export const POST = withUser(handlePost);
