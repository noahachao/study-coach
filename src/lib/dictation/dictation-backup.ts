import { z } from "zod";
import { prisma } from "@/lib/prisma";
import type { BackupExtension, BackupExportContext, BackupImportContext } from "@/lib/backup-extensions";

/** 默写模块备份数据：条目 + 作答历史，记录按条目分组导出 */
const BackupItemSchema = z.object({
    id: z.string(),
    userId: z.string(),
    lang: z.string(),
    itemType: z.string(),
    text: z.string(),
    pinyin: z.string().nullable(),
    meaning: z.string().nullable(),
    note: z.string().nullable(),
    source: z.string(),
    lastWrongForm: z.string().nullable(),
    errorCount: z.number(),
    createdAt: z.string(),
    updatedAt: z.string(),
    records: z.array(
        z.object({
            result: z.string(),
            wrongForm: z.string().nullable(),
            createdAt: z.string(),
        }),
    ),
});

export type DictationBackupItem = z.infer<typeof BackupItemSchema>;

function exportItems(ctx: BackupExportContext): Promise<DictationBackupItem[]> {
    return prisma.dictationItem.findMany({
        where: ctx.userIds ? { userId: { in: ctx.userIds } } : undefined,
        orderBy: { createdAt: "asc" },
        include: { records: { orderBy: { createdAt: "asc" } } },
    }).then((items) =>
        items.map((item) => ({
            ...item,
            createdAt: item.createdAt.toISOString(),
            updatedAt: item.updatedAt.toISOString(),
            records: item.records.map((record) => ({
                result: record.result,
                wrongForm: record.wrongForm,
                createdAt: record.createdAt.toISOString(),
            })),
        })),
    );
}

async function importItems(ctx: BackupImportContext, items: DictationBackupItem[]): Promise<number> {
    let count = 0;
    for (const item of items) {
        const userId = ctx.userIdMap(item.userId);
        if (!userId) continue;

        const created = await ctx.tx.dictationItem.create({
            data: {
                userId,
                lang: item.lang,
                itemType: item.itemType,
                text: item.text,
                pinyin: item.pinyin,
                meaning: item.meaning,
                note: item.note,
                source: item.source,
                lastWrongForm: item.lastWrongForm,
                errorCount: item.errorCount,
                createdAt: new Date(item.createdAt),
                records: {
                    create: item.records.map((record) => ({
                        result: record.result,
                        wrongForm: record.wrongForm,
                        createdAt: new Date(record.createdAt),
                    })),
                },
            },
        });
        count += created ? 1 : 0;
    }
    return count;
}

/** 默写条目备份扩展：随全量备份导出/导入 */
export const dictationBackupExtension: BackupExtension = {
    key: "dictation",
    version: 1,
    export: (ctx: BackupExportContext) => exportItems(ctx),
    import: async (ctx: BackupImportContext, payload: { version: number; data: unknown }) => {
        const parsed = z.array(BackupItemSchema).safeParse(payload.data);
        if (!parsed.success) return 0;
        return importItems(ctx, parsed.data);
    },
};

export function registerDictationBackup(extensions: BackupExtension[]): void {
    if (!extensions.some((ext) => ext.key === dictationBackupExtension.key)) {
        extensions.push(dictationBackupExtension);
    }
}
