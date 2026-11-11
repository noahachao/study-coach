"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { ArrowLeft, ArrowRight, Check, Ear, Eye, Loader2, ListChecks, RotateCcw, Volume2, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/empty-state";
import { PageHeader } from "@/components/ui/page-header";
import { Progress } from "@/components/ui/progress";
import { apiClient } from "@/lib/api-client";
import { browserSpeak, stopSpeaking } from "@/lib/dictation/browser-tts";
import type { DictationLang } from "@/lib/dictation/types";
import { useDictationTranslations } from "@/lib/hooks/use-dictation-translations";
import { usePageTitle } from "@/lib/page-title";
import type { DictationListResponse } from "@/types/api";

interface PracticeEntry {
    id: string;
    lang: DictationLang;
    text: string;
    pinyin: string | null;
    meaning: string | null;
}

export default function DictationPracticePage() {
    const { t, fmt } = useDictationTranslations();
    usePageTitle(t.practice.title);

    const [entries, setEntries] = useState<PracticeEntry[] | null>(null);
    const [started, setStarted] = useState(false);
    const [index, setIndex] = useState(0);
    const [revealed, setRevealed] = useState(false);
    const [results, setResults] = useState<{ id: string; correct: boolean }[]>([]);
    const [submitting, setSubmitting] = useState(false);

    useEffect(() => {
        void (async () => {
            const data = await apiClient.get<DictationListResponse>("/api/dictation/items?status=due");
            setEntries(
                data.items.map((item) => ({ id: item.id, lang: item.lang, text: item.text, pinyin: item.pinyin, meaning: item.meaning })),
            );
        })();
        return () => stopSpeaking();
    }, []);

    const finished = started && entries !== null && index >= entries.length;
    const current = started && entries !== null ? entries[index] : null;
    const correctCount = useMemo(() => results.filter((result) => result.correct).length, [results]);

    const record = useCallback(
        async (entry: PracticeEntry, correct: boolean) => {
            setResults((prev) => [...prev, { id: entry.id, correct }]);
            setSubmitting(true);
            try {
                await apiClient.post(`/api/dictation/items/${entry.id}/record`, {
                    result: correct ? "correct" : "wrong",
                });
            } finally {
                setSubmitting(false);
                setRevealed(false);
                setIndex((prev) => prev + 1);
            }
        },
        [],
    );

    if (entries === null) {
        return (
            <div className="flex min-h-[50vh] items-center justify-center">
                <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
            </div>
        );
    }

    return (
        <div className="mx-auto w-full max-w-2xl space-y-6 p-4 sm:p-6">
            <PageHeader title={t.practice.title} backHref="/dictation" />

            {!started && !finished && (
                <>
                    {entries.length === 0 ? (
                        <EmptyState icon={ListChecks} title={t.practice.emptyDue} />
                    ) : (
                        <Card>
                            <CardContent className="flex flex-col items-center gap-6 py-10">
                                <Ear className="h-12 w-12 text-muted-foreground" />
                                <p className="text-center text-lg">{fmt(t.practice.prompt, { count: entries.length })}</p>
                                <Button size="lg" onClick={() => setStarted(true)}>
                                    {t.practice.start}
                                </Button>
                            </CardContent>
                        </Card>
                    )}
                </>
            )}

            {started && current && (
                <div className="space-y-6">
                    <div className="flex items-center justify-between text-sm text-muted-foreground">
                        <span>{fmt(t.practice.progress, { current: index + 1, total: entries.length })}</span>
                        <span>{fmt(t.practice.summaryCorrect, { count: correctCount })}</span>
                    </div>
                    <Progress value={(index / entries.length) * 100} />

                    <Card>
                        <CardContent className="flex min-h-48 flex-col items-center justify-center gap-6 py-10">
                            <div className="text-center">
                                <div className="text-3xl font-semibold tracking-wide text-muted-foreground">
                                    {current.lang === "chinese" ? current.pinyin ?? "？" : current.meaning ?? "？"}
                                </div>
                                {revealed && <div className="mt-4 text-4xl font-bold">{current.text}</div>}
                            </div>
                            <div className="flex items-center gap-3">
                                <Button variant="outline" size="icon" aria-label={t.practice.play} onClick={() => browserSpeak(current.text, current.lang)}>
                                    <Volume2 className="h-5 w-5" />
                                </Button>
                                {!revealed && (
                                    <Button variant="outline" onClick={() => setRevealed(true)}>
                                        <Eye className="h-4 w-4" />
                                        {t.practice.showAnswer}
                                    </Button>
                                )}
                            </div>
                        </CardContent>
                    </Card>

                    {revealed && (
                        <div className="grid grid-cols-2 gap-3">
                            <Button
                                variant="outline"
                                size="lg"
                                className="border-red-300 text-red-600 hover:bg-red-50"
                                disabled={submitting}
                                onClick={() => void record(current, false)}
                            >
                                <X className="h-5 w-5" />
                                {t.practice.wrong}
                            </Button>
                            <Button
                                size="lg"
                                className="bg-emerald-600 hover:bg-emerald-700"
                                disabled={submitting}
                                onClick={() => void record(current, true)}
                            >
                                <Check className="h-5 w-5" />
                                {t.practice.correct}
                            </Button>
                        </div>
                    )}

                    <div className="flex items-center justify-between">
                        <Button variant="ghost" size="sm" disabled={index === 0} onClick={() => setIndex((prev) => Math.max(0, prev - 1))}>
                            <ArrowLeft className="h-4 w-4" />
                            {t.practice.prev}
                        </Button>
                        <Button variant="ghost" size="sm" onClick={() => void record(current, true)} disabled={submitting}>
                            {t.practice.next}
                            <ArrowRight className="h-4 w-4" />
                        </Button>
                    </div>
                </div>
            )}

            {finished && (
                <Card>
                    <CardContent className="flex flex-col items-center gap-4 py-10">
                        <Check className="h-12 w-12 text-emerald-600" />
                        <h2 className="text-xl font-bold">{t.practice.finished}</h2>
                        <div className="flex gap-6">
                            <div className="text-center">
                                <div className="text-3xl font-bold text-emerald-600">{correctCount}</div>
                                <div className="text-xs text-muted-foreground">{t.practice.correct}</div>
                            </div>
                            <div className="text-center">
                                <div className="text-3xl font-bold text-red-600">{results.length - correctCount}</div>
                                <div className="text-xs text-muted-foreground">{t.practice.wrong}</div>
                            </div>
                        </div>
                        <div className="flex gap-2">
                            <Button asChild>
                                <Link href="/dictation">{t.practice.backToList}</Link>
                            </Button>
                            <Button
                                variant="outline"
                                onClick={() => {
                                    setStarted(false);
                                    setIndex(0);
                                    setRevealed(false);
                                    setResults([]);
                                }}
                            >
                                <RotateCcw className="h-4 w-4" />
                                {t.practice.start}
                            </Button>
                        </div>
                    </CardContent>
                </Card>
            )}
        </div>
    );
}
