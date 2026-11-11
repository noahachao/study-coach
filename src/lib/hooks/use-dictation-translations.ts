"use client";

import { useMemo } from "react";
import { useLanguage } from "@/contexts/LanguageContext";
import { dictationZh } from "@/lib/i18n/dictation-zh";
import { dictationEn } from "@/lib/i18n/dictation-en";
import type { DictationTranslations } from "@/lib/i18n/dictation-zh";

function interpolate(template: string, values: Record<string, string | number>): string {
    return template.replace(/\{(\w+)\}/g, (match, key: string) => (key in values ? String(values[key]) : match));
}

export interface DictationT {
    t: DictationTranslations;
    fmt: (template: string, values: Record<string, string | number>) => string;
}

/** 默写模块文案：fork 自有翻译，不进上游 en.ts/zh.ts 主文件 */
export function useDictationTranslations(): DictationT {
    const { language } = useLanguage();
    return useMemo(
        () => ({
            t: language === "en" ? dictationEn : dictationZh,
            fmt: interpolate,
        }),
        [language],
    );
}
