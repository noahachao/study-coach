import { z } from "zod";
import { DICTATION_LANGS, DICTATION_ITEM_TYPES, DICTATION_RESULTS, DICTATION_SOURCES } from "@/lib/dictation/types";

export const dictationLangSchema = z.enum(DICTATION_LANGS);
export const dictationItemTypeSchema = z.enum(DICTATION_ITEM_TYPES);
export const dictationSourceSchema = z.enum(DICTATION_SOURCES);
export const dictationResultSchema = z.enum(DICTATION_RESULTS);

export const dictationStatusSchema = z.enum(["due", "active", "graduated", "all"]).default("all");

/** GET /api/dictation/items 查询参数 */
export const listDictationQuerySchema = z.object({
    lang: dictationLangSchema.optional(),
    status: dictationStatusSchema,
});

/** POST /api/dictation/items 请求体 */
export const createDictationItemsSchema = z.object({
    lang: dictationLangSchema,
    items: z
        .array(
            z.object({
                itemType: dictationItemTypeSchema,
                text: z.string().trim().min(1).max(200),
                pinyin: z.string().trim().max(200).optional(),
                meaning: z.string().trim().max(300).optional(),
                note: z.string().trim().max(300).optional(),
                wrongForm: z.string().trim().max(200).optional(),
            }),
        )
        .min(1)
        .max(200),
    source: dictationSourceSchema.default("manual"),
});

/** PUT /api/dictation/items/[id] 请求体 */
export const updateDictationItemSchema = z.object({
    text: z.string().trim().min(1).max(200).optional(),
    itemType: dictationItemTypeSchema.optional(),
    pinyin: z.string().trim().max(200).nullable().optional(),
    meaning: z.string().trim().max(300).nullable().optional(),
    note: z.string().trim().max(300).nullable().optional(),
    wrongForm: z.string().trim().max(200).nullable().optional(),
});

/** POST /api/dictation/items/[id]/record 请求体 */
export const recordDictationSchema = z.object({
    result: dictationResultSchema,
    wrongForm: z.string().trim().max(200).optional(),
});

/** POST /api/dictation/recognize 请求体 */
export const recognizeDictationSchema = z.object({
    imageBase64: z.string().min(1),
    mimeType: z.string().default("image/jpeg"),
    lang: dictationLangSchema,
});

const dataUrlSchema = z.string().max(15 * 1024 * 1024).regex(/^data:image\/(?:jpeg|png|webp);base64,[A-Za-z0-9+/]+=*$/);

/** POST /api/dictation/recognize-tasks 请求体 */
export const createDictationRecognizeTasksSchema = z.object({
    lang: dictationLangSchema,
    images: z.array(
        z.object({
            clientRequestId: z.string().regex(/^[A-Za-z0-9_-]{8,64}$/),
            imageData: dataUrlSchema,
        }),
    ).min(1).max(20),
});

/** POST /api/dictation/import 请求体 */
export const importDictationSchema = z.object({
    lang: dictationLangSchema,
    content: z.string().min(1).max(200_000),
});
