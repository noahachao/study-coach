import "server-only";

import { z } from "zod";
import { getErrorMessage } from "@/lib/error-message";
import { createLogger } from "@/lib/logger";
import { prisma } from "@/lib/prisma";
import { bootId, register, scheduleWork } from "@/lib/import/import-tasks";
import { getAIService } from "@/lib/ai";
import { consumeAiQuota, quotaRejectionCode } from "@/lib/ai-quota";
import type { DictationDraft } from "@/lib/ai/dictation-parser";
import type { DictationLang } from "@/lib/dictation/types";

type QuotaUser = Parameters<typeof consumeAiQuota>[0];

const logger = createLogger("dictation-recognize-tasks");

export type DictationTaskStatus = "analyzing" | "review" | "failed";

export interface DictationRecognizeTaskView {
    id: string;
    lang: DictationLang;
    status: DictationTaskStatus;
    attempts: number;
    drafts: DictationDraft[];
    error: string | null;
    createdAt: string;
    finishedAt: string | null;
}

const draftsSchema = z.array(
    z.object({
        text: z.string(),
        pinyin: z.string().nullish(),
        meaning: z.string().nullish(),
        itemType: z.string(),
        wrongForm: z.string().nullish(),
        errorNote: z.string().nullish(),
        confidence: z.number(),
    }),
);

function parseDrafts(raw: string | null): DictationDraft[] {
    if (!raw) return [];
    const parsed = draftsSchema.safeParse(JSON.parse(raw));
    return parsed.success ? (parsed.data as DictationDraft[]) : [];
}

function toView(task: { id: string; lang: string; status: string; attempts: number; drafts: string | null; error: string | null; createdAt: Date; finishedAt: Date | null }): DictationRecognizeTaskView {
    return {
        id: task.id,
        lang: task.lang as DictationLang,
        status: (["analyzing", "review", "failed"] as const).includes(task.status as DictationTaskStatus) ? (task.status as DictationTaskStatus) : "failed",
        attempts: task.attempts,
        drafts: task.status === "review" ? parseDrafts(task.drafts) : [],
        error: task.error,
        createdAt: task.createdAt.toISOString(),
        finishedAt: task.finishedAt ? task.finishedAt.toISOString() : null,
    };
}

export function isDictationTaskInterrupted(task: { runnerId: string | null }): boolean {
    return task.runnerId !== bootId();
}

export async function reconcileInterruptedTasks(userId: string): Promise<void> {
    const stale = await prisma.dictationImportTask.findMany({
        where: { userId, status: "analyzing" },
        select: { id: true, runnerId: true },
    });
    const interrupted = stale.filter((task) => isDictationTaskInterrupted(task));
    if (interrupted.length === 0) return;
    await prisma.dictationImportTask.updateMany({
        where: { id: { in: interrupted.map((task) => task.id) } },
        data: { status: "failed", error: "DICTATION_TASK_INTERRUPTED", finishedAt: new Date() },
    });
}

async function executeTask(taskId: string): Promise<void> {
    const task = await prisma.dictationImportTask.findUnique({ where: { id: taskId }, include: { user: true } });
    if (!task || task.status !== "analyzing") return;
    const user = task.user;
    await prisma.dictationImportTask.update({
        where: { id: taskId },
        data: { runnerId: bootId(), heartbeatAt: new Date(), error: null },
    });
    try {
        const base64 = task.imageData.split(",")[1] ?? "";
        const mimeType = /^data:([^;]+);/.exec(task.imageData)?.[1] ?? "image/jpeg";
        const service = await getAIService({ userId: user.id, kind: "analyze" });
        const drafts = await service.analyzeDictationImage(base64, mimeType, task.lang as DictationLang);
        await prisma.dictationImportTask.update({
            where: { id: taskId },
            data: { status: "review", drafts: JSON.stringify(drafts), finishedAt: new Date(), imageData: "" },
        });
        logger.info({ taskId, count: drafts.length }, "Dictation recognize task done");
    } catch (error) {
        await prisma.dictationImportTask.update({
            where: { id: taskId },
            data: { status: "failed", error: "DICTATION_RECOGNIZE_FAILED", finishedAt: new Date() },
        });
        logger.error({ taskId, error: getErrorMessage(error) }, "Dictation recognize task failed");
    }
}

function scheduleTask(taskId: string): void {
    const release = register(taskId);
    try {
        scheduleWork(taskId, release, () => executeTask(taskId));
    } catch (error) {
        release();
        throw error;
    }
}

export interface CreateDictationRecognizeTaskInput {
    clientRequestId: string;
    imageData: string;
    lang: DictationLang;
}

export async function createDictationRecognizeTasks(
    user: QuotaUser,
    inputs: CreateDictationRecognizeTaskInput[],
): Promise<DictationRecognizeTaskView[]> {
    const created: DictationRecognizeTaskView[] = [];
    for (const input of inputs) {
        const existing = await prisma.dictationImportTask.findUnique({
            where: { userId_clientRequestId: { userId: user.id, clientRequestId: input.clientRequestId } },
        });
        if (existing) {
            created.push(toView(existing));
            continue;
        }
        const limited = await consumeAiQuota(user, "analyze");
        if (limited) {
            const task = await prisma.dictationImportTask.create({
                data: {
                    userId: user.id,
                    clientRequestId: input.clientRequestId,
                    lang: input.lang,
                    status: "failed",
                    error: await quotaRejectionCode(limited),
                    imageData: input.imageData,
                    finishedAt: new Date(),
                },
            });
            created.push(toView(task));
            continue;
        }
        const task = await prisma.dictationImportTask.create({
            data: {
                userId: user.id,
                clientRequestId: input.clientRequestId,
                lang: input.lang,
                status: "analyzing",
                imageData: input.imageData,
            },
        });
        scheduleTask(task.id);
        created.push(toView(task));
    }
    return created;
}

export async function listDictationRecognizeTasks(userId: string): Promise<DictationRecognizeTaskView[]> {
    await reconcileInterruptedTasks(userId);
    const tasks = await prisma.dictationImportTask.findMany({
        where: { userId, status: { in: ["analyzing", "review", "failed"] } },
        orderBy: { createdAt: "asc" },
    });
    return tasks.map(toView);
}

export async function retryDictationRecognizeTask(userId: string, taskId: string): Promise<DictationRecognizeTaskView | null> {
    const task = await prisma.dictationImportTask.findFirst({ where: { id: taskId, userId } });
    if (!task) return null;
    if (task.status !== "failed") return toView(task);
    const user = await prisma.user.findUnique({ where: { id: userId } });
    if (!user) return null;
    const limited = await consumeAiQuota(user, "analyze");
    const updated = await prisma.dictationImportTask.update({
        where: { id: taskId },
        data: limited
            ? { attempts: { increment: 1 }, error: await quotaRejectionCode(limited) }
            : { status: "analyzing", attempts: { increment: 1 }, error: null, finishedAt: null },
    });
    if (!limited) scheduleTask(taskId);
    return toView(updated);
}

export async function deleteDictationRecognizeTask(userId: string, taskId: string): Promise<boolean> {
    const result = await prisma.dictationImportTask.deleteMany({ where: { id: taskId, userId } });
    return result.count > 0;
}
