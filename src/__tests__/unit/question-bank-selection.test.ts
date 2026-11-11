import { beforeEach, describe, expect, it, vi } from "vitest";

const prismaMock = vi.hoisted(() => ({
    questionBank: { findMany: vi.fn() },
    practiceRecord: { findMany: vi.fn() },
    bankQuestion: { findMany: vi.fn() },
}));

vi.mock("@/lib/prisma", () => ({ prisma: prismaMock }));

import { selectBankQuestion } from "@/lib/question-bank/selection";

function row(overrides: Record<string, unknown> = {}) {
    return {
        id: "q1",
        bankId: "b1",
        text: "3 的后面一个数是几？",
        material: null,
        optionsJson: null,
        answer: "4",
        analysis: "按顺序数数",
        knowledgePoints: "[]",
        difficultyStars: 3,
        questionType: "fill_blank",
        grade: 1,
        semester: "上",
        figureSvg: null,
        subjectKey: "math",
        source: null,
        ...overrides,
    };
}

function input(gradeSemester: string | null) {
    return {
        userId: "u1",
        errorItem: { id: "e1", questionText: "2 的后面一个数是几？", gradeSemester, subject: null },
        tagNames: [] as string[],
        difficulty: "medium" as const,
        bankId: null,
    };
}

describe("selectBankQuestion 年级过滤", () => {
    beforeEach(() => {
        vi.clearAllMocks();
        prismaMock.questionBank.findMany.mockResolvedValue([{ id: "b1", name: "一年级数学" }]);
        prismaMock.practiceRecord.findMany.mockResolvedValue([]);
    });

    it("优先选同年级题目", async () => {
        prismaMock.bankQuestion.findMany.mockResolvedValue([row()]);

        const selected = await selectBankQuestion(input("一年级上"));

        expect(selected?.question.gradeSemester).toBe("一年级上");
        expect(prismaMock.bankQuestion.findMany).toHaveBeenCalledTimes(1);
        expect(prismaMock.bankQuestion.findMany.mock.calls[0][0].where.grade).toEqual({ in: [1] });
    });

    it("同年级无题时放宽到相邻年级", async () => {
        prismaMock.bankQuestion.findMany
            .mockResolvedValueOnce([])
            .mockResolvedValueOnce([row({ grade: 2, semester: "上" })]);

        const selected = await selectBankQuestion(input("一年级上"));

        expect(selected?.question.gradeSemester).toBe("二年级上");
        expect(prismaMock.bankQuestion.findMany).toHaveBeenCalledTimes(2);
        expect(prismaMock.bankQuestion.findMany.mock.calls[1][0].where.grade).toEqual({ in: [1, 2] });
    });

    it("相邻年级也无题时退回不限年级", async () => {
        prismaMock.bankQuestion.findMany
            .mockResolvedValueOnce([])
            .mockResolvedValueOnce([])
            .mockResolvedValueOnce([row({ grade: 5, semester: "下" })]);

        const selected = await selectBankQuestion(input("一年级上"));

        expect(selected?.question.gradeSemester).toBe("五年级下");
        expect(prismaMock.bankQuestion.findMany).toHaveBeenCalledTimes(3);
        expect(prismaMock.bankQuestion.findMany.mock.calls[2][0].where.grade).toBeUndefined();
    });

    it("错题没有年级时不做年级过滤", async () => {
        prismaMock.bankQuestion.findMany.mockResolvedValue([row({ grade: 4 })]);

        const selected = await selectBankQuestion(input(null));

        expect(selected?.question.gradeSemester).toBe("四年级上");
        expect(prismaMock.bankQuestion.findMany).toHaveBeenCalledTimes(1);
        expect(prismaMock.bankQuestion.findMany.mock.calls[0][0].where.grade).toBeUndefined();
    });

    it("完全没有候选时返回 null", async () => {
        prismaMock.bankQuestion.findMany.mockResolvedValue([]);

        const selected = await selectBankQuestion(input("三年级下"));

        expect(selected).toBeNull();
        expect(prismaMock.bankQuestion.findMany).toHaveBeenCalledTimes(3);
    });
});
