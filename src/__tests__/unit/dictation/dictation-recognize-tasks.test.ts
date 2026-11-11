// @vitest-environment node
/**
 * 默写拍照后台任务：幂等创建、配额拒绝、执行成功/失败、中断对账、失败重试
 */
import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
    prisma: {
        dictationImportTask: {
            findUnique: vi.fn(),
            findFirst: vi.fn(),
            findMany: vi.fn(),
            create: vi.fn(),
            update: vi.fn(),
            updateMany: vi.fn(),
            deleteMany: vi.fn(),
        },
        user: {
            findUnique: vi.fn(),
        },
    },
    consumeAiQuota: vi.fn(),
    quotaRejectionCode: vi.fn(),
    getAIService: vi.fn(),
    register: vi.fn(),
    scheduleWork: vi.fn(),
    bootId: vi.fn(),
}));

vi.mock("@/lib/prisma", () => ({ get prisma() { return mocks.prisma; } }));
vi.mock("server-only", () => ({}));
vi.mock("@/lib/ai-quota", () => ({
    consumeAiQuota: mocks.consumeAiQuota,
    quotaRejectionCode: mocks.quotaRejectionCode,
}));
vi.mock("@/lib/ai", () => ({ getAIService: mocks.getAIService }));
vi.mock("@/lib/import/import-tasks", () => ({
    register: mocks.register,
    scheduleWork: mocks.scheduleWork,
    bootId: mocks.bootId,
}));

import {
    createDictationRecognizeTasks,
    deleteDictationRecognizeTask,
    reconcileInterruptedTasks,
    retryDictationRecognizeTask,
} from "@/lib/dictation/dictation-recognize-tasks";

const quotaUser = { id: "user-1", email: "user@localhost", role: "user" as const };
const dataUrl = "data:image/jpeg;base64,AAAA";
const baseTask = (overrides: Record<string, unknown> = {}) => ({
    id: "task-1",
    userId: "user-1",
    clientRequestId: "req-1",
    lang: "chinese",
    status: "analyzing",
    attempts: 1,
    imageData: dataUrl,
    drafts: null,
    error: null,
    runnerId: null,
    heartbeatAt: null,
    finishedAt: null,
    createdAt: new Date("2026-01-01T00:00:00Z"),
    updatedAt: new Date("2026-01-01T00:00:00Z"),
    user: quotaUser,
    ...overrides,
});

let capturedWork: (() => Promise<void>) | undefined;

beforeEach(() => {
    vi.clearAllMocks();
    capturedWork = undefined;
    mocks.bootId.mockReturnValue("boot-1");
    mocks.consumeAiQuota.mockResolvedValue(false);
    mocks.register.mockReturnValue(() => undefined);
    mocks.scheduleWork.mockImplementation((_taskId: string, _release: () => void, work: () => Promise<void>) => {
        capturedWork = work;
    });
});

describe("createDictationRecognizeTasks", () => {
    it("新建任务并调度后台执行", async () => {
        mocks.prisma.dictationImportTask.findUnique.mockResolvedValue(null);
        mocks.prisma.dictationImportTask.create.mockImplementation(({ data }) => baseTask(data));

        const [view] = await createDictationRecognizeTasks(quotaUser, [{ clientRequestId: "req-1", imageData: dataUrl, lang: "chinese" }]);

        expect(view.status).toBe("analyzing");
        expect(mocks.consumeAiQuota).toHaveBeenCalledTimes(1);
        expect(mocks.register).toHaveBeenCalledWith("task-1");
        expect(mocks.scheduleWork).toHaveBeenCalledWith("task-1", expect.any(Function), expect.any(Function));
    });

    it("clientRequestId 已存在时直接返回,不扣配额不重复建", async () => {
        mocks.prisma.dictationImportTask.findUnique.mockResolvedValue(baseTask());

        const [view] = await createDictationRecognizeTasks(quotaUser, [{ clientRequestId: "req-1", imageData: dataUrl, lang: "chinese" }]);

        expect(view.id).toBe("task-1");
        expect(mocks.consumeAiQuota).not.toHaveBeenCalled();
        expect(mocks.prisma.dictationImportTask.create).not.toHaveBeenCalled();
        expect(mocks.scheduleWork).not.toHaveBeenCalled();
    });

    it("配额不足时建 failed 任务并记录原因", async () => {
        mocks.consumeAiQuota.mockResolvedValue("AI_DAILY_LIMIT_EXCEEDED");
        mocks.quotaRejectionCode.mockResolvedValue("AI_DAILY_LIMIT_EXCEEDED");
        mocks.prisma.dictationImportTask.findUnique.mockResolvedValue(null);
        mocks.prisma.dictationImportTask.create.mockImplementation(({ data }) => baseTask(data));

        const [view] = await createDictationRecognizeTasks(quotaUser, [{ clientRequestId: "req-1", imageData: dataUrl, lang: "chinese" }]);

        expect(view.status).toBe("failed");
        expect(view.error).toBe("AI_DAILY_LIMIT_EXCEEDED");
        expect(mocks.scheduleWork).not.toHaveBeenCalled();
    });
});

describe("executeTask(经 scheduleWork 回调)", () => {
    it("识别成功后转 review 并写入草稿清空图片", async () => {
        mocks.prisma.dictationImportTask.findUnique
            .mockResolvedValueOnce(null)
            .mockResolvedValue(baseTask());
        mocks.prisma.dictationImportTask.create.mockImplementation(({ data }) => baseTask(data));
        mocks.prisma.dictationImportTask.update.mockResolvedValue(baseTask());
        const drafts = [{ text: "美丽", itemType: "word", confidence: 0.9, pinyin: "měi lì", meaning: "", wrongForm: "", errorNote: "" }];
        mocks.getAIService.mockResolvedValue({ analyzeDictationImage: vi.fn().mockResolvedValue(drafts) });

        await createDictationRecognizeTasks(quotaUser, [{ clientRequestId: "req-1", imageData: dataUrl, lang: "chinese" }]);
        expect(capturedWork).toBeTypeOf("function");
        await capturedWork!();

        const lastUpdate = mocks.prisma.dictationImportTask.update.mock.calls.at(-1)?.[0];
        expect(lastUpdate.data).toMatchObject({ status: "review", drafts: JSON.stringify(drafts), imageData: "" });
    });

    it("识别抛错时任务转 failed", async () => {
        mocks.prisma.dictationImportTask.findUnique
            .mockResolvedValueOnce(null)
            .mockResolvedValue(baseTask());
        mocks.prisma.dictationImportTask.create.mockImplementation(({ data }) => baseTask(data));
        mocks.prisma.dictationImportTask.update.mockResolvedValue(baseTask());
        mocks.getAIService.mockResolvedValue({ analyzeDictationImage: vi.fn().mockRejectedValue(new Error("boom")) });

        await createDictationRecognizeTasks(quotaUser, [{ clientRequestId: "req-1", imageData: dataUrl, lang: "chinese" }]);
        await capturedWork!();

        const lastUpdate = mocks.prisma.dictationImportTask.update.mock.calls.at(-1)?.[0];
        expect(lastUpdate.data).toMatchObject({ status: "failed", error: "DICTATION_RECOGNIZE_FAILED" });
    });
});

describe("reconcileInterruptedTasks", () => {
    it("把上次进程遗留的 analyzing 任务标记为 failed", async () => {
        mocks.prisma.dictationImportTask.findMany.mockResolvedValue([baseTask({ runnerId: "boot-old" })]);
        mocks.prisma.dictationImportTask.updateMany.mockResolvedValue({ count: 1 });

        await reconcileInterruptedTasks("user-1");

        expect(mocks.prisma.dictationImportTask.updateMany).toHaveBeenCalledWith({
            where: { id: { in: ["task-1"] } },
            data: expect.objectContaining({ status: "failed", error: "DICTATION_TASK_INTERRUPTED" }),
        });
    });

    it("无中断任务时不写库", async () => {
        mocks.prisma.dictationImportTask.findMany.mockResolvedValue([baseTask({ runnerId: "boot-1" })]);

        await reconcileInterruptedTasks("user-1");

        expect(mocks.prisma.dictationImportTask.updateMany).not.toHaveBeenCalled();
    });
});

describe("retryDictationRecognizeTask", () => {
    it("failed 任务重新扣额并恢复 analyzing", async () => {
        mocks.prisma.dictationImportTask.findFirst.mockResolvedValue(baseTask({ status: "failed" }));
        mocks.prisma.user.findUnique.mockResolvedValue(quotaUser);
        mocks.prisma.dictationImportTask.update.mockResolvedValue(baseTask({ status: "analyzing", attempts: 2 }));

        const view = await retryDictationRecognizeTask("user-1", "task-1");

        expect(view?.status).toBe("analyzing");
        expect(view?.attempts).toBe(2);
        expect(mocks.prisma.dictationImportTask.update).toHaveBeenCalledWith({
            where: { id: "task-1" },
            data: expect.objectContaining({ status: "analyzing", attempts: { increment: 1 } }),
        });
        expect(mocks.consumeAiQuota).toHaveBeenCalledTimes(1);
        expect(mocks.scheduleWork).toHaveBeenCalledWith("task-1", expect.any(Function), expect.any(Function));
    });

    it("配额不足时只记原因不恢复执行", async () => {
        mocks.consumeAiQuota.mockResolvedValue("AI_QUOTA_INSUFFICIENT");
        mocks.quotaRejectionCode.mockResolvedValue("AI_QUOTA_INSUFFICIENT");
        mocks.prisma.dictationImportTask.findFirst.mockResolvedValue(baseTask({ status: "failed" }));
        mocks.prisma.user.findUnique.mockResolvedValue(quotaUser);
        mocks.prisma.dictationImportTask.update.mockResolvedValue(baseTask({ status: "failed", attempts: 2, error: "AI_QUOTA_INSUFFICIENT" }));

        const view = await retryDictationRecognizeTask("user-1", "task-1");

        expect(view?.status).toBe("failed");
        expect(view?.error).toBe("AI_QUOTA_INSUFFICIENT");
        expect(mocks.scheduleWork).not.toHaveBeenCalled();
    });

    it("非 failed 任务原样返回不重试", async () => {
        mocks.prisma.dictationImportTask.findFirst.mockResolvedValue(baseTask({ status: "review" }));

        const view = await retryDictationRecognizeTask("user-1", "task-1");

        expect(view?.status).toBe("review");
        expect(mocks.consumeAiQuota).not.toHaveBeenCalled();
        expect(mocks.scheduleWork).not.toHaveBeenCalled();
    });
});

describe("deleteDictationRecognizeTask", () => {
    it("按用户归属删除并返回结果", async () => {
        mocks.prisma.dictationImportTask.deleteMany.mockResolvedValue({ count: 1 });

        await expect(deleteDictationRecognizeTask("user-1", "task-1")).resolves.toBe(true);
        expect(mocks.prisma.dictationImportTask.deleteMany).toHaveBeenCalledWith({ where: { id: "task-1", userId: "user-1" } });
    });
});
