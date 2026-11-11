import "server-only";
import { prisma } from "@/lib/prisma";
import { getAppTimeZone } from "@/lib/config/store";
import { getDictationPlan } from "@/lib/dictation/dictation-schedule";
import type { DictationLang, DictationItemType, DictationResult, DictationSource } from "@/lib/dictation/types";

export interface DictationItemDraft {
    lang: DictationLang;
    itemType: DictationItemType;
    text: string;
    pinyin?: string | null;
    meaning?: string | null;
    note?: string | null;
    source?: DictationSource;
    wrongForm?: string | null;
}

export interface DictationItemView {
    id: string;
    lang: DictationLang;
    itemType: DictationItemType;
    text: string;
    pinyin: string | null;
    meaning: string | null;
    note: string | null;
    source: string;
    lastWrongForm: string | null;
    errorCount: number;
    createdAt: string;
    records: { result: string; wrongForm: string | null; createdAt: string }[];
    stage: number;
    nextReviewAt: string | null;
    dueToday: boolean;
    graduated: boolean;
}

export type DictationStatusFilter = "due" | "active" | "graduated" | "all";

export interface ListDictationOptions {
    userId: string;
    lang?: DictationLang;
    status?: DictationStatusFilter;
    timeZone?: string;
}

function toView(
    item: {
        id: string;
        lang: string;
        itemType: string;
        text: string;
        pinyin: string | null;
        meaning: string | null;
        note: string | null;
        source: string;
        lastWrongForm: string | null;
        errorCount: number;
        createdAt: Date;
        records: { result: string; wrongForm: string | null; createdAt: Date }[];
    },
    timeZone: string,
): DictationItemView {
    const plan = getDictationPlan(item, timeZone);
    return {
        id: item.id,
        lang: item.lang as DictationLang,
        itemType: item.itemType as DictationItemType,
        text: item.text,
        pinyin: item.pinyin,
        meaning: item.meaning,
        note: item.note,
        source: item.source,
        lastWrongForm: item.lastWrongForm,
        errorCount: item.errorCount,
        createdAt: item.createdAt.toISOString(),
        records: item.records.map((r) => ({ result: r.result, wrongForm: r.wrongForm, createdAt: r.createdAt.toISOString() })),
        stage: plan.stage,
        nextReviewAt: plan.nextReviewAt ? plan.nextReviewAt.toISOString() : null,
        dueToday: plan.dueToday,
        graduated: plan.graduated,
    };
}

/** 查询默写条目并按调度计划过滤排序：今日到期优先，其次按下次复习时间升序 */
export async function listDictationItems(options: ListDictationOptions): Promise<DictationItemView[]> {
    const timeZone = options.timeZone ?? getAppTimeZone();
    const items = await prisma.dictationItem.findMany({
        where: { userId: options.userId, ...(options.lang ? { lang: options.lang } : {}) },
        include: { records: { orderBy: { createdAt: "asc" } } },
        orderBy: { createdAt: "desc" },
    });

    let views = items.map((item) => toView(item, timeZone));
    const status = options.status ?? "all";
    if (status === "due") views = views.filter((v) => v.dueToday);
    else if (status === "active") views = views.filter((v) => !v.graduated);
    else if (status === "graduated") views = views.filter((v) => v.graduated);

    views.sort((a, b) => {
        if (a.dueToday !== b.dueToday) return a.dueToday ? -1 : 1;
        if (a.graduated !== b.graduated) return a.graduated ? 1 : -1;
        const na = a.nextReviewAt ?? "9999";
        const nb = b.nextReviewAt ?? "9999";
        if (na !== nb) return na < nb ? -1 : 1;
        return b.createdAt.localeCompare(a.createdAt);
    });
    return views;
}

export interface DictationSummary {
    chinese: { total: number; dueToday: number; graduated: number };
    english: { total: number; dueToday: number; graduated: number };
}

export async function getDictationSummary(userId: string, timeZone?: string): Promise<DictationSummary> {
    const items = await prisma.dictationItem.findMany({
        where: { userId },
        include: { records: { orderBy: { createdAt: "asc" } } },
    });
    const tz = timeZone ?? getAppTimeZone();

    const summary: DictationSummary = {
        chinese: { total: 0, dueToday: 0, graduated: 0 },
        english: { total: 0, dueToday: 0, graduated: 0 },
    };
    for (const item of items) {
        const plan = getDictationPlan(item, tz);
        const bucket = item.lang === "english" ? summary.english : summary.chinese;
        bucket.total++;
        if (plan.dueToday) bucket.dueToday++;
        if (plan.graduated) bucket.graduated++;
    }
    return summary;
}

export interface CreateDictationResult {
    created: DictationItemView[];
    skipped: number;
}

/** 批量创建默写条目：同一语言下未掌握的同文条目跳过；带 wrongForm 的条目补一条初始错误记录 */
export async function createDictationItems(userId: string, drafts: DictationItemDraft[]): Promise<CreateDictationResult> {
    const timeZone = getAppTimeZone();
    const created: DictationItemView[] = [];
    let skipped = 0;

    for (const draft of drafts) {
        const text = draft.text.trim();
        if (!text) continue;

        const existing = await prisma.dictationItem.findFirst({
            where: { userId, lang: draft.lang, text },
            include: { records: { orderBy: { createdAt: "asc" } } },
        });
        const existingPlan = existing ? getDictationPlan(existing, timeZone) : null;
        if (existing && existingPlan && !existingPlan.graduated) {
            skipped++;
            continue;
        }

        const item = await prisma.dictationItem.create({
            data: {
                userId,
                lang: draft.lang,
                itemType: draft.itemType,
                text,
                pinyin: draft.pinyin?.trim() || null,
                meaning: draft.meaning?.trim() || null,
                note: draft.note?.trim() || null,
                source: draft.source ?? "manual",
                ...(draft.wrongForm?.trim()
                    ? {
                          lastWrongForm: draft.wrongForm.trim(),
                          errorCount: 1,
                          records: { create: { result: "wrong", wrongForm: draft.wrongForm.trim() } },
                      }
                    : {}),
            },
            include: { records: { orderBy: { createdAt: "asc" } } },
        });
        created.push(toView(item, timeZone));
    }

    return { created, skipped };
}

export interface RecordDictationInput {
    userId: string;
    itemId: string;
    result: DictationResult;
    wrongForm?: string | null;
}

/** 记录一次听写/默写结果：插入历史记录，写错时更新展示用冗余字段 */
export async function recordDictationResult(input: RecordDictationInput): Promise<DictationItemView | null> {
    const item = await prisma.dictationItem.findFirst({
        where: { id: input.itemId, userId: input.userId },
    });
    if (!item) return null;

    const wrongForm = input.wrongForm?.trim() || null;
    await prisma.dictationRecord.create({
        data: { dictationItemId: item.id, result: input.result, wrongForm: input.result === "wrong" ? wrongForm : null },
    });
    if (input.result === "wrong") {
        await prisma.dictationItem.update({
            where: { id: item.id },
            data: { errorCount: { increment: 1 }, ...(wrongForm ? { lastWrongForm: wrongForm } : {}) },
        });
    }

    const refreshed = await prisma.dictationItem.findUniqueOrThrow({
        where: { id: item.id },
        include: { records: { orderBy: { createdAt: "asc" } } },
    });
    return toView(refreshed, getAppTimeZone());
}
