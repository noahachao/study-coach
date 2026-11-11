/**
 * 默写识别响应解析：从 <items><item>…</item></items> 协议中提取结构化草稿
 */

import { z } from "zod";
import type { DictationItemType } from "@/lib/dictation/types";

const ITEM_TYPES: readonly DictationItemType[] = ["char", "word", "phrase", "sentence"];

export const DictationDraftSchema = z.object({
    text: z.string().trim().min(1).max(200),
    pinyin: z.string().trim().max(200).optional(),
    meaning: z.string().trim().max(300).optional(),
    itemType: z.enum(["char", "word", "phrase", "sentence"]),
    wrongForm: z.string().trim().max(200).optional(),
    errorNote: z.string().trim().max(200).optional(),
    confidence: z.number().min(0).max(1),
});

export type DictationDraft = z.infer<typeof DictationDraftSchema>;

function normalizeItemType(value: string | null, text: string): DictationItemType {
    const trimmed = value?.trim().toLowerCase();
    if (trimmed && (ITEM_TYPES as readonly string[]).includes(trimmed)) {
        return trimmed as DictationItemType;
    }
    const len = [...text].length;
    if (len <= 2) return "char";
    if (len <= 8) return "word";
    return "sentence";
}

function extractItemBlock(block: string): DictationDraft | null {
    const pick = (tag: string): string | null => {
        const match = block.match(new RegExp(`<${tag}>([\\s\\S]*?)</${tag}>`, "i"));
        return match ? match[1].trim() : null;
    };

    const text = pick("text");
    if (!text) return null;

    const confidenceRaw = pick("confidence");
    let confidence = 1;
    if (confidenceRaw !== null) {
        const parsed = Number.parseFloat(confidenceRaw);
        if (Number.isFinite(parsed)) confidence = Math.min(1, Math.max(0, parsed));
    }

    const draft = DictationDraftSchema.safeParse({
        text,
        pinyin: pick("pinyin") || undefined,
        meaning: pick("meaning") || undefined,
        itemType: normalizeItemType(pick("item_type"), text),
        wrongForm: pick("wrong_form") || undefined,
        errorNote: pick("error_note") || undefined,
        confidence,
    });
    return draft.success ? draft.data : null;
}

/** 解析默写识别响应；无有效条目时返回空数组 */
export function parseDictationResponse(text: string): DictationDraft[] {
    const matches = text.match(/<item>([\s\S]*?)<\/item>/gi) ?? [];
    const drafts: DictationDraft[] = [];
    for (const match of matches) {
        const draft = extractItemBlock(match);
        if (draft) drafts.push(draft);
    }

    const seen = new Set<string>();
    return drafts.filter((draft) => {
        const key = `${draft.text}`;
        if (seen.has(key)) return false;
        seen.add(key);
        return true;
    });
}
