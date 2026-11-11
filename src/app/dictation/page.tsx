"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { CalendarClock, CheckCircle2, GraduationCap, ListChecks, PenLine, Plus, Printer, RotateCw, Volume2 } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/empty-state";
import { PageHeader } from "@/components/ui/page-header";
import { SegmentedControl } from "@/components/ui/segmented-control";
import { apiClient } from "@/lib/api-client";
import { browserSpeak } from "@/lib/dictation/browser-tts";
import { useDictationTranslations } from "@/lib/hooks/use-dictation-translations";
import { usePageTitle } from "@/lib/page-title";
import { REVIEW_INTERVALS } from "@/lib/review-schedule";
import type { DictationItem, DictationListResponse, DictationSummary } from "@/types/api";

type StatusFilter = "all" | "due" | "active" | "graduated";
type LangFilter = "all" | "chinese" | "english";

function formatDate(iso: string | null): string {
    if (!iso) return "";
    return iso.slice(0, 10);
}

export default function DictationPage() {
    const { t, fmt } = useDictationTranslations();
    usePageTitle(t.title);

    const [items, setItems] = useState<DictationItem[] | null>(null);
    const [summary, setSummary] = useState<DictationSummary | null>(null);
    const [status, setStatus] = useState<StatusFilter>("all");
    const [lang, setLang] = useState<LangFilter>("all");
    const [loading, setLoading] = useState(true);

    const fetchList = useCallback(async () => {
        setLoading(true);
        try {
            const params = new URLSearchParams({ status });
            if (lang !== "all") params.set("lang", lang);
            const data = await apiClient.get<DictationListResponse>(`/api/dictation/items?${params.toString()}`);
            setItems(data.items);
            setSummary(data.summary);
        } finally {
            setLoading(false);
        }
    }, [status, lang]);

    useEffect(() => {
        // eslint-disable-next-line react-hooks/set-state-in-effect -- 数据请求：筛选变化时重新拉取默写列表
        void fetchList();
    }, [fetchList]);

    const dueCount = useMemo(
        () => (summary ? summary.chinese.dueToday + summary.english.dueToday : 0),
        [summary],
    );

    const removeItem = useCallback(async (id: string) => {
        await apiClient.delete(`/api/dictation/items/${id}`);
        setItems((prev) => prev?.filter((item) => item.id !== id) ?? null);
    }, []);

    return (
        <div className="mx-auto w-full max-w-4xl space-y-6 p-4 sm:p-6">
            <PageHeader
                title={t.title}
                description={t.subtitle}
                actions={
                    <>
                        <Button variant="outline" size="sm" asChild className="hidden sm:inline-flex">
                            <Link href="/dictation/print">
                                <Printer className="h-4 w-4" />
                                {t.actions.print}
                            </Link>
                        </Button>
                        <Button size="sm" asChild>
                            <Link href="/dictation/add">
                                <Plus className="h-4 w-4" />
                                {t.actions.add}
                            </Link>
                        </Button>
                    </>
                }
            />

            {summary && (
                <div className="grid grid-cols-2 gap-3">
                    {[summary.chinese, summary.english].map((bucket, index) => (
                        <Card key={index} className="gap-3 py-4">
                            <CardContent className="px-4">
                                <div className="flex items-center justify-between">
                                    <span className="text-sm font-medium">{index === 0 ? t.summary.chinese : t.summary.english}</span>
                                    <Badge variant={bucket.dueToday > 0 ? "default" : "secondary"}>
                                        <CalendarClock className="h-3 w-3" />
                                        {fmt(t.summary.dueToday, { count: bucket.dueToday })}
                                    </Badge>
                                </div>
                                <div className="mt-2 flex items-end gap-4">
                                    <div>
                                        <div className="text-2xl font-bold">{bucket.total}</div>
                                        <div className="text-xs text-muted-foreground">{t.summary.total}</div>
                                    </div>
                                    <div>
                                        <div className="text-2xl font-bold text-emerald-600">{bucket.graduated}</div>
                                        <div className="text-xs text-muted-foreground">{t.summary.graduated}</div>
                                    </div>
                                </div>
                            </CardContent>
                        </Card>
                    ))}
                </div>
            )}

            <div className="flex flex-wrap items-center gap-2">
                <SegmentedControl
                    value={lang}
                    onChange={setLang}
                    options={[
                        { value: "all", label: t.lang.all },
                        { value: "chinese", label: t.lang.chinese },
                        { value: "english", label: t.lang.english },
                    ]}
                />
                <SegmentedControl
                    value={status}
                    onChange={setStatus}
                    options={[
                        { value: "all", label: t.filter.all },
                        { value: "due", label: t.filter.due },
                        { value: "active", label: t.filter.active },
                        { value: "graduated", label: t.filter.graduated },
                    ]}
                />
                <Button variant="ghost" size="icon" onClick={() => void fetchList()} disabled={loading} aria-label="refresh">
                    <RotateCw className={loading ? "h-4 w-4 animate-spin" : "h-4 w-4"} />
                </Button>
            </div>

            {items !== null && items.length === 0 && !loading && (
                <EmptyState
                    icon={PenLine}
                    title={status === "all" && lang === "all" ? t.list.empty : t.list.emptyFiltered}
                    action={
                        <Button asChild size="sm">
                            <Link href="/dictation/add">
                                <Plus className="h-4 w-4" />
                                {t.actions.add}
                            </Link>
                        </Button>
                    }
                />
            )}

            <div className="space-y-2">
                {items?.map((item) => (
                    <DictationRow key={item.id} item={item} onRemove={removeItem} />
                ))}
            </div>

            {dueCount > 0 && (
                <Button asChild className="w-full" size="lg">
                    <Link href="/dictation/practice">
                        <ListChecks className="h-5 w-5" />
                        {fmt(t.practice.prompt, { count: dueCount })}
                    </Link>
                </Button>
            )}
        </div>
    );

    function DictationRow({ item, onRemove }: { item: DictationItem; onRemove: (id: string) => Promise<void> }) {
        const [confirming, setConfirming] = useState(false);
        const itemTypeLabels = t.itemType;
        const sourceLabels = t.source;

        return (
            <Card className="gap-2 py-4">
                <CardContent className="flex items-start justify-between gap-3 px-4">
                    <div className="min-w-0 flex-1">
                        <div className="flex flex-wrap items-center gap-2">
                            <button
                                type="button"
                                className="text-lg font-semibold hover:underline"
                                onClick={() => browserSpeak(item.text, item.lang)}
                                title={t.practice.play}
                            >
                                {item.text}
                                <Volume2 className="ml-1 inline h-4 w-4 text-muted-foreground" />
                            </button>
                            <Badge variant="outline">{itemTypeLabels[item.itemType]}</Badge>
                            <Badge variant="secondary">{sourceLabels[item.source as keyof typeof sourceLabels] ?? item.source}</Badge>
                            {item.dueToday && !item.graduated && (
                                <Badge>
                                    <CalendarClock className="h-3 w-3" />
                                    {t.list.dueNow}
                                </Badge>
                            )}
                            {item.graduated && (
                                <Badge variant="secondary" className="text-emerald-600">
                                    <GraduationCap className="h-3 w-3" />
                                    {t.list.graduatedLabel}
                                </Badge>
                            )}
                        </div>
                        {(item.pinyin || item.meaning) && (
                            <div className="mt-1 text-sm text-muted-foreground">
                                {item.lang === "chinese" ? item.pinyin : item.meaning}
                            </div>
                        )}
                        {item.lastWrongForm && (
                            <div className="mt-1 text-xs text-destructive">{fmt(t.list.lastWrong, { form: item.lastWrongForm })}</div>
                        )}
                        <div className="mt-2 flex flex-wrap items-center gap-3 text-xs text-muted-foreground">
                            <span className="inline-flex items-center gap-1">
                                <CheckCircle2 className="h-3 w-3" />
                                {fmt(t.list.stageProgress, { stage: item.stage, total: REVIEW_INTERVALS.length })}
                            </span>
                            {item.errorCount > 0 && <span>{fmt(t.list.errorCount, { count: item.errorCount })}</span>}
                            {item.nextReviewAt && <span>{fmt(t.list.nextReview, { date: formatDate(item.nextReviewAt) })}</span>}
                        </div>
                    </div>
                    <div className="flex shrink-0 items-center gap-1">
                        {confirming ? (
                            <>
                                <Button variant="destructive" size="sm" onClick={() => void onRemove(item.id)}>
                                    {t.actions.confirmDelete}
                                </Button>
                                <Button variant="ghost" size="sm" onClick={() => setConfirming(false)}>
                                    {t.actions.cancel}
                                </Button>
                            </>
                        ) : (
                            <Button variant="ghost" size="sm" onClick={() => setConfirming(true)}>
                                {t.actions.delete}
                            </Button>
                        )}
                    </div>
                </CardContent>
            </Card>
        );
    }
}
