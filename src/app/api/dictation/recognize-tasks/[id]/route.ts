import { NextResponse } from "next/server";
import { withUser } from "@/lib/api-handler";
import type { AuthenticatedContext } from "@/lib/api-handler";
import { notFound } from "@/lib/api-errors";
import { deleteDictationRecognizeTask } from "@/lib/dictation/dictation-recognize-tasks";

type RouteContext = { params: Promise<{ id: string }> };

async function handleDelete(_req: Request, { user, params }: AuthenticatedContext & RouteContext) {
    const { id } = await params;
    const removed = await deleteDictationRecognizeTask(user.id, id);
    if (!removed) return notFound();
    return NextResponse.json({ ok: true });
}

export const DELETE = withUser(handleDelete);
