"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { Loader2, Printer } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { PageHeader } from "@/components/ui/page-header";
import { SegmentedControl } from "@/components/ui/segmented-control";
import { apiClient } from "@/lib/api-client";
import type { DictationLang } from "@/lib/dictation/types";
import { useDictationTranslations } from "@/lib/hooks/use-dictation-translations";
import { usePageTitle } from "@/lib/page-title";
import type { DictationListResponse } from "@/types/api";

type SheetKind = "practice" | "quiz";

interface SheetItem {
    id: string;
    text: string;
    pinyin: string | null;
    meaning: string | null;
}

const FOUR_LINE_BACKGROUND = {
    backgroundImage: [
        "linear-gradient(to bottom, transparent calc(25% - 0.5px), #9ca3af calc(25% - 0.5px), #9ca3af 25%, transparent 25%)",
        "linear-gradient(to bottom, transparent calc(50% - 0.5px), #9ca3af calc(50% - 0.5px), #9ca3af 50%, transparent 50%)",
        "linear-gradient(to bottom, transparent calc(75% - 0.5px), #ef4444 calc(75% - 0.5px), #ef4444 75%, transparent 75%)",
        "linear-gradient(to bottom, transparent calc(100% - 1.5px), #4b5563 calc(100% - 1.5px), #4b5563 100%, transparent 100%)",
    ].join(", "),
} as const;

function shuffleArray<T>(input: T[]): T[] {
    const array = [...input];
    for (let i = array.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [array[i], array[j]] = [array[j], array[i]];
    }
    return array;
}

export default function DictationPrintPage() {
    const { t, fmt } = useDictationTranslations();
    usePageTitle(t.print.title);

    const [kind, setKind] = useState<SheetKind>("practice");
    const [lang, setLang] = useState<DictationLang>("chinese");
    const [items, setItems] = useState<SheetItem[] | null>(null);
    const [columns, setColumns] = useState(4);
    const [shuffle, setShuffle] = useState(true);
    const [showPinyin, setShowPinyin] = useState(true);
    const [showMeaning, setShowMeaning] = useState(false);
    const [showNameDate, setShowNameDate] = useState(true);

    useEffect(() => {
        void (async () => {
            const data = await apiClient.get<DictationListResponse>(`/api/dictation/items?status=active&lang=${lang}`);
            setItems(data.items.map((item) => ({ id: item.id, text: item.text, pinyin: item.pinyin, meaning: item.meaning })));
        })();
    }, [lang]);

    const sheetItems = useMemo(() => {
        const base = items ?? [];
        return shuffle ? shuffleArray(base) : base;
    }, [items, shuffle]);

    const handlePrint = useCallback(() => {
        window.print();
    }, []);

    const title = kind === "quiz" ? t.print.quizSheetTitle : lang === "chinese" ? t.print.chineseSheetTitle : t.print.englishSheetTitle;

    return (
        <div className="mx-auto w-full max-w-4xl space-y-6 p-4 sm:p-6">
            <div className="print:hidden">
                <PageHeader title={t.print.title} backHref="/dictation" />
            </div>

            <Card className="print:hidden">
                <CardContent className="flex flex-wrap items-end gap-4 px-4">
                    <div className="space-y-1">
                        <Label>{t.print.title}</Label>
                        <SegmentedControl
                            value={kind}
                            onChange={setKind}
                            options={[
                                { value: "practice", label: t.print.dictationSheet },
                                { value: "quiz", label: t.print.quizSheet },
                            ]}
                        />
                    </div>
                    <div className="space-y-1">
                        <Label>{t.lang[lang === "chinese" ? "chinese" : "english"]}</Label>
                        <SegmentedControl
                            value={lang}
                            onChange={setLang}
                            options={[
                                { value: "chinese", label: t.lang.chinese },
                                { value: "english", label: t.lang.english },
                            ]}
                        />
                    </div>
                    <div className="space-y-1">
                        <Label htmlFor="columns">{t.print.columnsPerRow}</Label>
                        <Input
                            id="columns"
                            type="number"
                            min={2}
                            max={8}
                            value={columns}
                            className="w-20"
                            onChange={(event) => setColumns(Math.min(8, Math.max(2, Number(event.target.value) || 4)))}
                        />
                    </div>
                    <div className="flex items-center gap-4 pb-2">
                        <label className="flex items-center gap-1.5 text-sm">
                            <Checkbox checked={shuffle} onCheckedChange={(checked) => setShuffle(checked === true)} />
                            {t.print.shuffle}
                        </label>
                        {kind === "quiz" ? (
                            <>
                                <label className="flex items-center gap-1.5 text-sm">
                                    <Checkbox checked={showPinyin} onCheckedChange={(checked) => setShowPinyin(checked === true)} />
                                    {t.print.showPinyin}
                                </label>
                                <label className="flex items-center gap-1.5 text-sm">
                                    <Checkbox checked={showMeaning} onCheckedChange={(checked) => setShowMeaning(checked === true)} />
                                    {t.print.showMeaning}
                                </label>
                            </>
                        ) : (
                            <label className="flex items-center gap-1.5 text-sm">
                                <Checkbox checked={showNameDate} onCheckedChange={(checked) => setShowNameDate(checked === true)} />
                                {t.print.showNameDate}
                            </label>
                        )}
                    </div>
                    <Button onClick={handlePrint} disabled={!sheetItems || sheetItems.length === 0}>
                        <Printer className="h-4 w-4" />
                        {t.print.printButton}
                    </Button>
                </CardContent>
            </Card>

            {items === null ? (
                <div className="flex min-h-[40vh] items-center justify-center print:hidden">
                    <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
                </div>
            ) : sheetItems.length === 0 ? null : (
                <div id="dictation-sheet" className="mx-auto w-[210mm] min-h-[297mm] bg-white p-10 text-black shadow print:shadow-none">
                    <div className="mb-6 space-y-2 border-b-2 border-black pb-3 text-center">
                        <h1 className="text-xl font-bold tracking-widest">{title}</h1>
                        <div className="text-xs text-gray-600">{fmt(t.print.wordCount, { count: sheetItems.length })}</div>
                    </div>

                    {showNameDate && kind === "practice" && (
                        <div className="mb-6 flex gap-8 text-sm">
                            <span className="flex-1 border-b border-black pb-1">{t.print.name}</span>
                            <span className="flex-1 border-b border-black pb-1">{t.print.date}</span>
                            <span className="flex-1 border-b border-black pb-1">{t.print.score}</span>
                        </div>
                    )}

                    {kind === "quiz" ? (
                        <ol className="grid gap-x-6 gap-y-5" style={{ gridTemplateColumns: `repeat(${columns}, 1fr)` }}>
                            {sheetItems.map((item, index) => (
                                <li key={item.id} className="break-words">
                                    <span className="mr-1 text-sm text-gray-500">{index + 1}.</span>
                                    <span className="text-lg font-medium">{item.text}</span>
                                    {showPinyin && item.pinyin && <div className="pl-5 text-xs text-gray-600">{item.pinyin}</div>}
                                    {showMeaning && item.meaning && <div className="pl-5 text-xs text-gray-600">{item.meaning}</div>}
                                </li>
                            ))}
                        </ol>
                    ) : lang === "chinese" ? (
                        <ol className="grid gap-x-6 gap-y-4" style={{ gridTemplateColumns: `repeat(${columns}, 1fr)` }}>
                            {sheetItems.map((item) => (
                                <li key={item.id} className="text-center">
                                    <div className="h-6 text-xs leading-6 text-gray-400">{item.pinyin ?? "\u00A0"}</div>
                                    <div className="h-10 border-b border-gray-800" />
                                </li>
                            ))}
                        </ol>
                    ) : (
                        <ol className="grid gap-x-6 gap-y-4" style={{ gridTemplateColumns: `repeat(${Math.min(columns, 3)}, 1fr)` }}>
                            {sheetItems.map((item) => (
                                <li key={item.id} className="h-12" style={FOUR_LINE_BACKGROUND}>
                                    <span className="pl-1 text-xs text-gray-400">{item.meaning ?? ""}</span>
                                </li>
                            ))}
                        </ol>
                    )}
                </div>
            )}
        </div>
    );
}
