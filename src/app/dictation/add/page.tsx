"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { AlertCircle, Camera, CheckCircle2, ClipboardPaste, Images, Keyboard, Loader2, Plus, Save } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { PageHeader } from "@/components/ui/page-header";
import { SegmentedControl } from "@/components/ui/segmented-control";
import { Textarea } from "@/components/ui/textarea";
import { apiClient } from "@/lib/api-client";
import { newClientRequestId } from "@/lib/import/import-task-client";
import { inferItemType } from "@/lib/dictation/import-parser";
import { isDictationLang, type DictationLang } from "@/lib/dictation/types";
import { DEFAULT_IMAGE_LIMITS, processImageBlob } from "@/lib/image-pipeline";
import { useDictationTranslations } from "@/lib/hooks/use-dictation-translations";
import { usePageTitle } from "@/lib/page-title";
import type { DictationCreateResult, DictationItem, DictationRecognizeTaskView, DictationRecognizeTasksResponse } from "@/types/api";

type AddTab = "manual" | "photo" | "import";

interface ManualEntry {
    text: string;
    pinyin: string;
    meaning: string;
    wrongForm: string;
}

const emptyEntry: ManualEntry = { text: "", pinyin: "", meaning: "", wrongForm: "" };

export default function DictationAddPage() {
    const { t, fmt } = useDictationTranslations();
    usePageTitle(t.add.title);
    const router = useRouter();

    const [tab, setTab] = useState<AddTab>("manual");
    const [lang, setLang] = useState<DictationLang>("chinese");
    const [saving, setSaving] = useState(false);
    const [savedMessage, setSavedMessage] = useState<string | null>(null);

    const [entries, setEntries] = useState<ManualEntry[]>([{ ...emptyEntry }]);
    const [importContent, setImportContent] = useState("");

    const [uploading, setUploading] = useState(false);
    const [uploadError, setUploadError] = useState<string | null>(null);
    const [tasks, setTasks] = useState<DictationRecognizeTaskView[]>([]);
    const [saveError, setSaveError] = useState<string | null>(null);
    const [excluded, setExcluded] = useState<Record<string, boolean>>({});
    const cameraInputRef = useRef<HTMLInputElement>(null);
    const albumInputRef = useRef<HTMLInputElement>(null);

    const saveManual = useCallback(async () => {
        const valid = entries.filter((entry) => entry.text.trim());
        if (valid.length === 0) return;
        setSaving(true);
        try {
            const result = await apiClient.post<DictationCreateResult, unknown>("/api/dictation/items", {
                lang,
                source: "manual",
                items: valid.map((entry) => ({
                    itemType: inferItemType(lang, entry.text.trim()),
                    text: entry.text.trim(),
                    pinyin: entry.pinyin.trim() || undefined,
                    meaning: entry.meaning.trim() || undefined,
                    wrongForm: entry.wrongForm.trim() || undefined,
                })),
            });
            setSavedMessage(fmt(t.add.savedResult, { created: result.created.length, skipped: result.skipped }));
            setEntries([{ ...emptyEntry }]);
        } finally {
            setSaving(false);
        }
    }, [entries, lang, fmt, t]);

    const saveImport = useCallback(async () => {
        if (!importContent.trim()) return;
        setSaving(true);
        try {
            const result = await apiClient.post<DictationCreateResult, unknown>("/api/dictation/import", {
                lang,
                content: importContent,
            });
            setSavedMessage(fmt(t.add.savedResult, { created: result.created.length, skipped: result.skipped }));
            setImportContent("");
        } finally {
            setSaving(false);
        }
    }, [importContent, lang, fmt, t]);

    useEffect(() => {
        if (tab !== "photo") return;
        let stopped = false;
        const tick = async () => {
            try {
                const result = await apiClient.get<DictationRecognizeTasksResponse>("/api/dictation/recognize-tasks");
                if (!stopped) setTasks(result.tasks);
            } catch {
                // 轮询失败时保留上次列表
            }
        };
        void tick();
        const timer = setInterval(() => { void tick(); }, 3000);
        return () => { stopped = true; clearInterval(timer); };
    }, [tab]);

    const handlePhotoFiles = useCallback(
        async (files: File[]) => {
            if (files.length === 0) return;
            setUploading(true);
            setUploadError(null);
            setSavedMessage(null);
            try {
                const images = await Promise.all(files.map(async (file) => {
                    const { rendered } = await processImageBlob(file, { ...DEFAULT_IMAGE_LIMITS, maxLongEdge: 1600, maxBytes: 1024 * 1024 });
                    return { clientRequestId: newClientRequestId(), imageData: rendered.dataUrl };
                }));
                const result = await apiClient.post<DictationRecognizeTasksResponse, unknown>("/api/dictation/recognize-tasks", {
                    lang,
                    images,
                });
                setTasks(result.tasks);
            } catch {
                setUploadError(t.add.uploadFailed);
            } finally {
                setUploading(false);
            }
        },
        [lang, t],
    );

    const retryTask = useCallback(
        async (taskId: string) => {
            try {
                const result = await apiClient.post<{ task: DictationRecognizeTaskView }, unknown>(`/api/dictation/recognize-tasks/${taskId}/retry`, {});
                setTasks((prev) => prev.map((task) => (task.id === taskId ? result.task : task)));
            } catch {
                setUploadError(t.add.uploadFailed);
            }
        },
        [t],
    );

    const reviewTasks = tasks.filter((task) => task.status === "review");
    const draftRows = reviewTasks.flatMap((task) => task.drafts.map((draft) => ({ taskId: task.id, draft })));
    const includedRows = draftRows.filter((row) => !excluded[`${row.taskId}:${row.draft.text}`]);

    const saveRecognized = async () => {
        if (includedRows.length === 0) return;
        setSaving(true);
        setSaveError(null);
        try {
            const result = await apiClient.post<DictationCreateResult, unknown>("/api/dictation/items", {
                lang,
                source: "photo",
                items: includedRows.map((row) => ({
                    itemType: row.draft.itemType,
                    text: row.draft.text,
                    pinyin: row.draft.pinyin || undefined,
                    meaning: row.draft.meaning || undefined,
                    note: row.draft.errorNote || undefined,
                    wrongForm: row.draft.wrongForm || undefined,
                })),
            });
            setSavedMessage(fmt(t.add.savedResult, { created: result.created.length, skipped: result.skipped }));
            const savedKeys = new Set(includedRows.map((row) => `${row.taskId}:${row.draft.text}`));
            const settledTasks = reviewTasks.filter((task) => task.drafts.every((draft) => savedKeys.has(`${task.id}:${draft.text}`)));
            await Promise.allSettled(settledTasks.map((task) => apiClient.delete(`/api/dictation/recognize-tasks/${task.id}`)));
            const settledIds = new Set(settledTasks.map((task) => task.id));
            setTasks((prev) => prev.filter((task) => !settledIds.has(task.id)));
            setExcluded({});
        } catch {
            setSaveError(t.add.saveFailed);
        } finally {
            setSaving(false);
        }
    };

    const closeAfterSave = useCallback(() => {
        if (savedMessage) router.push("/dictation");
    }, [savedMessage, router]);

    return (
        <div className="mx-auto w-full max-w-2xl space-y-6 p-4 sm:p-6">
            <PageHeader title={t.add.title} backHref="/dictation" />

            <div className="space-y-2">
                <SegmentedControl
                    value={tab}
                    onChange={setTab}
                    options={[
                        { value: "manual", label: t.add.manual, icon: Keyboard },
                        { value: "photo", label: t.add.photo, icon: Camera },
                        { value: "import", label: t.add.import, icon: ClipboardPaste },
                    ]}
                />
                {tab === "import" && (
                    <SegmentedControl
                        value={lang}
                        onChange={(value) => setLang(isDictationLang(value) ? value : "chinese")}
                        options={[
                            { value: "chinese", label: t.lang.chinese },
                            { value: "english", label: t.lang.english },
                        ]}
                    />
                )}
            </div>

            {savedMessage && (
                <Card className="border-emerald-300 py-3">
                    <CardContent className="flex items-center justify-between px-4">
                        <span className="text-sm">{savedMessage}</span>
                        <Button size="sm" variant="outline" onClick={closeAfterSave}>
                            {t.actions.save}
                        </Button>
                    </CardContent>
                </Card>
            )}

            {tab === "manual" && (
                <div className="space-y-4">
                    <SegmentedControl
                        value={lang}
                        onChange={(value) => setLang(isDictationLang(value) ? value : "chinese")}
                        options={[
                            { value: "chinese", label: t.lang.chinese },
                            { value: "english", label: t.lang.english },
                        ]}
                    />
                    {entries.map((entry, index) => (
                        <Card key={index} className="gap-3 py-4">
                            <CardContent className="grid gap-3 px-4 sm:grid-cols-2">
                                <div className="space-y-1 sm:col-span-2">
                                    <Label>{t.add.textLabel}</Label>
                                    <Input
                                        value={entry.text}
                                        placeholder={t.add.textPlaceholder}
                                        onChange={(event) =>
                                            setEntries((prev) => prev.map((row, i) => (i === index ? { ...row, text: event.target.value } : row)))
                                        }
                                    />
                                </div>
                                {lang === "chinese" && (
                                    <div className="space-y-1">
                                        <Label>{t.add.pinyinLabel}</Label>
                                        <Input
                                            value={entry.pinyin}
                                            placeholder={t.add.pinyinPlaceholder}
                                            onChange={(event) =>
                                                setEntries((prev) => prev.map((row, i) => (i === index ? { ...row, pinyin: event.target.value } : row)))
                                            }
                                        />
                                    </div>
                                )}
                                {lang === "english" && (
                                    <div className="space-y-1">
                                        <Label>{t.add.meaningLabel}</Label>
                                        <Input
                                            value={entry.meaning}
                                            placeholder={t.add.meaningPlaceholder}
                                            onChange={(event) =>
                                                setEntries((prev) => prev.map((row, i) => (i === index ? { ...row, meaning: event.target.value } : row)))
                                            }
                                        />
                                    </div>
                                )}
                                <div className="space-y-1">
                                    <Label>{t.add.wrongFormLabel}</Label>
                                    <Input
                                        value={entry.wrongForm}
                                        placeholder={t.add.wrongFormPlaceholder}
                                        onChange={(event) =>
                                            setEntries((prev) => prev.map((row, i) => (i === index ? { ...row, wrongForm: event.target.value } : row)))
                                        }
                                    />
                                </div>
                            </CardContent>
                        </Card>
                    ))}
                    <div className="flex gap-2">
                        <Button variant="outline" onClick={() => setEntries((prev) => [...prev, { ...emptyEntry }])}>
                            <Plus className="h-4 w-4" />
                            {t.add.addItem}
                        </Button>
                        <Button onClick={() => void saveManual()} disabled={saving || !entries.some((entry) => entry.text.trim())}>
                            {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
                            {t.actions.save}
                        </Button>
                    </div>
                </div>
            )}

            {tab === "photo" && (
                <div className="space-y-4">
                    <SegmentedControl
                        value={lang}
                        onChange={(value) => setLang(isDictationLang(value) ? value : "chinese")}
                        options={[
                            { value: "chinese", label: t.lang.chinese },
                            { value: "english", label: t.lang.english },
                        ]}
                    />
                    <p className="text-sm text-muted-foreground">{t.add.photoTip}</p>
                    <input
                        ref={cameraInputRef}
                        type="file"
                        accept="image/*"
                        capture="environment"
                        className="hidden"
                        onChange={(event) => {
                            const files = Array.from(event.target.files ?? []);
                            if (files.length > 0) void handlePhotoFiles(files);
                            event.target.value = "";
                        }}
                    />
                    <input
                        ref={albumInputRef}
                        type="file"
                        accept="image/*"
                        multiple
                        className="hidden"
                        onChange={(event) => {
                            const files = Array.from(event.target.files ?? []);
                            if (files.length > 0) void handlePhotoFiles(files);
                            event.target.value = "";
                        }}
                    />
                    <div className="grid grid-cols-2 gap-2">
                        <Button onClick={() => cameraInputRef.current?.click()} disabled={uploading} size="lg">
                            {uploading ? <Loader2 className="h-5 w-5 animate-spin" /> : <Camera className="h-5 w-5" />}
                            {uploading ? t.add.uploading : t.add.photoButton}
                        </Button>
                        <Button variant="outline" onClick={() => albumInputRef.current?.click()} disabled={uploading} size="lg">
                            {uploading ? <Loader2 className="h-5 w-5 animate-spin" /> : <Images className="h-5 w-5" />}
                            {t.add.albumButton}
                        </Button>
                    </div>
                    {uploadError && <p className="text-sm text-destructive">{uploadError}</p>}

                    {tasks.length > 0 && (
                        <div className="space-y-2">
                            {tasks.map((task) => (
                                <Card key={task.id} className="gap-2 py-3">
                                    <CardContent className="flex items-center justify-between gap-2 px-4">
                                        <div className="flex min-w-0 items-center gap-2">
                                            {task.status === "analyzing" ? (
                                                <Loader2 className="h-4 w-4 shrink-0 animate-spin" />
                                            ) : task.status === "review" ? (
                                                <CheckCircle2 className="h-4 w-4 shrink-0 text-green-600" />
                                            ) : (
                                                <AlertCircle className="h-4 w-4 shrink-0 text-destructive" />
                                            )}
                                            <span className="truncate text-sm">
                                                {task.status === "analyzing"
                                                    ? t.add.taskAnalyzing
                                                    : task.status === "review"
                                                      ? task.drafts.length > 0
                                                            ? fmt(t.add.taskFoundItems, { count: task.drafts.length })
                                                            : t.add.recognizeEmpty
                                                      : task.error === "AI_DAILY_LIMIT_EXCEEDED" || task.error === "AI_QUOTA_INSUFFICIENT"
                                                        ? t.add.taskQuotaExceeded
                                                        : task.error === "AI_CONSENT_REQUIRED"
                                                          ? t.add.taskConsentRequired
                                                          : t.add.taskFailed}
                                            </span>
                                        </div>
                                        {task.status === "failed" && (
                                            <Button variant="outline" size="sm" onClick={() => void retryTask(task.id)}>
                                                {t.add.taskRetry}
                                            </Button>
                                        )}
                                    </CardContent>
                                </Card>
                            ))}
                        </div>
                    )}

                    {draftRows.length > 0 && (
                        <div className="space-y-3">
                            <p className="text-sm font-medium">{fmt(t.add.recognizeResult, { count: includedRows.length })}</p>
                            {draftRows.map((row, index) => {
                                const key = `${row.taskId}:${row.draft.text}`;
                                const included = !excluded[key];
                                return (
                                <Card key={index} className="gap-2 py-4">
                                    <CardContent className="space-y-2 px-4">
                                        <div className="flex items-center justify-between gap-2">
                                            <div className="min-w-0">
                                                <div className="text-lg font-semibold">{row.draft.text}</div>
                                                <div className="text-xs text-muted-foreground">
                                                    {row.draft.wrongForm ? `${t.add.wrongFormLabel}: ${row.draft.wrongForm}` : ""}
                                                    {row.draft.errorNote ? ` · ${row.draft.errorNote}` : ""}
                                                </div>
                                            </div>
                                            <div className="flex shrink-0 items-center gap-1">
                                                {row.draft.confidence < 0.7 && (
                                                    <span className="text-xs text-amber-600">{t.add.lowConfidence}</span>
                                                )}
                                                <Button
                                                    variant={included ? "default" : "outline"}
                                                    size="sm"
                                                    onClick={() => setExcluded((prev) => ({ ...prev, [key]: included }))}
                                                >
                                                    {included ? t.add.include : t.add.exclude}
                                                </Button>
                                            </div>
                                        </div>
                                    </CardContent>
                                </Card>
                                );
                            })}
                            <Button onClick={() => void saveRecognized()} disabled={saving || includedRows.length === 0} className="w-full">
                                {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
                                {t.actions.save}
                            </Button>
                            {saveError && <p className="text-sm text-destructive">{saveError}</p>}
                        </div>
                    )}
                </div>
            )}

            {tab === "import" && (
                <div className="space-y-4">
                    <div className="space-y-1">
                        <Label>{t.add.import}</Label>
                        <Textarea
                            rows={10}
                            value={importContent}
                            placeholder={t.add.importPlaceholder}
                            onChange={(event) => setImportContent(event.target.value)}
                        />
                    </div>
                    <Button onClick={() => void saveImport()} disabled={saving || !importContent.trim()}>
                        {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <ClipboardPaste className="h-4 w-4" />}
                        {t.add.importButton}
                    </Button>
                </div>
            )}
        </div>
    );
}

export type { DictationItem };
