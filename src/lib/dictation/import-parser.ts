import type { DictationItemType, DictationLang } from "@/lib/dictation/types";

export interface ParsedDictationLine {
    text: string;
    annotation?: string;
}

export interface ParseImportResult {
    lines: ParsedDictationLine[];
    invalidLines: number;
}

/**
 * 解析词库粘贴文本：每行一条，行内可用空格或制表符分隔附加注释（拼音/释义）。
 * 空行与首尾空白被忽略，序号前缀（“1.”“1、”“（一）”等）自动去除。
 */
export function parseDictationImport(content: string): ParseImportResult {
    const lines: ParsedDictationLine[] = [];
    let invalidLines = 0;

    for (const rawLine of content.split(/\r?\n/)) {
        const line = rawLine.trim();
        if (!line) continue;

        const stripped = line.replace(/^\s*(?:\d+[.、)．]|[(（][一二三四五六七八九十\d]+[)）])\s*/, "").trim();
        const parts = stripped.split(/[\t ]+/).filter(Boolean);
        const text = parts[0] ?? "";
        const annotation = parts.slice(1).join(" ").trim() || undefined;

        if (!text || text.length > 200) {
            invalidLines++;
            continue;
        }
        lines.push({ text, annotation });
    }

    return { lines, invalidLines };
}

/** 依据文本长度推断条目类型（语文：字/词/句；英语：词/短语/句） */
export function inferItemType(lang: DictationLang, text: string): DictationItemType {
    const trimmed = text.trim();
    if (lang === "chinese") {
        if (/[\u4e00-\u9fff，。！？、；：“”‘’]/.test(trimmed) && trimmed.length <= 2) return "char";
        if (trimmed.length <= 8 && !/[，。！？；]/.test(trimmed)) return "word";
        if (trimmed.length <= 20) return "phrase";
        return "sentence";
    }
    const words = trimmed.split(/\s+/).length;
    if (words <= 1) return "word";
    if (words <= 4) return "phrase";
    return "sentence";
}
