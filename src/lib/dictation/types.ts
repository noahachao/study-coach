import { REVIEW_INTERVALS } from "@/lib/review-schedule";

export const DICTATION_LANGS = ["chinese", "english"] as const;
export type DictationLang = (typeof DICTATION_LANGS)[number];

export const DICTATION_ITEM_TYPES = ["char", "word", "phrase", "sentence"] as const;
export type DictationItemType = (typeof DICTATION_ITEM_TYPES)[number];

export const DICTATION_SOURCES = ["manual", "photo", "import"] as const;
export type DictationSource = (typeof DICTATION_SOURCES)[number];

export const DICTATION_RESULTS = ["correct", "wrong"] as const;
export type DictationResult = (typeof DICTATION_RESULTS)[number];

/** 走完全部复习间隔视为已掌握 */
export const DICTATION_GRADUATED_STAGE = REVIEW_INTERVALS.length;

export function isDictationLang(value: unknown): value is DictationLang {
    return typeof value === "string" && (DICTATION_LANGS as readonly string[]).includes(value);
}

export function isDictationItemType(value: unknown): value is DictationItemType {
    return typeof value === "string" && (DICTATION_ITEM_TYPES as readonly string[]).includes(value);
}
