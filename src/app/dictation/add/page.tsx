"use client";

import { useCallback, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { Camera, ClipboardPaste, Images, Keyboard, Loader2, Plus, Save } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { PageHeader } from "@/components/ui/page-header";
import { SegmentedControl } from "@/components/ui/segmented-control";
import { Textarea } from "@/components/ui/textarea";
import { apiClient } from "@/lib/api-client";
import { inferItemType } from "@/lib/dictation/import-parser";
import { isDictationLang, type DictationLang } from "@/lib/dictation/types";
import { processImageBlob } from "@/lib/image-pipeline";
import { useDictationTranslations } from "@/lib/hooks/use-dictation-translations";
import { usePageTitle } from "@/lib/page-title";
import type { DictationCreateResult, DictationItem, DictationRecognizeDraft } from "@/types/api";

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

    const [photoState, setPhotoState] = useState<"idle" | "recognizing" | "review" | "error">("idle");
    const [photoProgress, setPhotoProgress] = useState<{ done: number; total: number } | null>(null);
    const [drafts, setDrafts] = useState<(DictationRecognizeDraft & { include: boolean })[]>([]);
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

    const recognizingLabel =
        photoProgress && photoProgress.total > 1
            ? fmt(t.add.recognizingMulti, { done: photoProgress.done + 1, total: photoProgress.total })
            : t.add.recognizing;

    const recognizePhotos = useCallback(
        async (files: File[]) => {
            if (files.length === 0) return;
            setPhotoState("recognizing");
            setSavedMessage(null);
            const collected: (DictationRecognizeDraft & { include: boolean })[] = [];
            let failed = 0;
            for (let i = 0; i < files.length; i++) {
                setPhotoProgress({ done: i, total: files.length });
                try {
                    const { rendered } = await processImageBlob(files[i]);
                    const base64 = rendered.dataUrl.split(",")[1] ?? "";
                    const result = await apiClient.post<{ drafts: DictationRecognizeDraft[] }, unknown>("/api/dictation/recognize", {
                        imageBase64: base64,
                        mimeType: "image/jpeg",
                        lang,
                    });
                    collected.push(...result.drafts.map((draft) => ({ ...draft, include: true })));
                } catch {
                    failed += 1;
                }
            }
            setPhotoProgress(null);
            setDrafts((prev) => [...prev, ...collected]);
            if (collected.length > 0) {
                setPhotoState("review");
                if (failed > 0) setSavedMessage(fmt(t.add.photoFailedSome, { count: failed }));
            } else {
                setPhotoState("error");
                setSavedMessage(failed > 0 && files.length > 1 ? t.add.photoAllFailed : t.add.recognizeError);
            }
        },
        [lang, fmt, t],
    );

    const saveRecognized = useCallback(async () => {
        const included = drafts.filter((draft) => draft.include);
        if (included.length === 0) return;
        setSaving(true);
        try {
            const result = await apiClient.post<DictationCreateResult, unknown>("/api/dictation/items", {
                lang,
                source: "photo",
                items: included.map((draft) => ({
                    itemType: draft.itemType,
                    text: draft.text,
                    pinyin: draft.pinyin || undefined,
                    meaning: draft.meaning || undefined,
                    note: draft.errorNote || undefined,
                    wrongForm: draft.wrongForm || undefined,
                })),
            });
            setSavedMessage(fmt(t.add.savedResult, { created: result.created.length, skipped: result.skipped }));
            setDrafts([]);
            setPhotoState("idle");
        } finally {
            setSaving(false);
        }
    }, [drafts, lang, fmt, t]);

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
                            if (files.length > 0) void recognizePhotos(files);
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
                            if (files.length > 0) void recognizePhotos(files);
                            event.target.value = "";
                        }}
                    />
                    <div className="grid grid-cols-2 gap-2">
                        <Button onClick={() => cameraInputRef.current?.click()} disabled={photoState === "recognizing"} size="lg">
                            {photoState === "recognizing" ? <Loader2 className="h-5 w-5 animate-spin" /> : <Camera className="h-5 w-5" />}
                            {photoState === "recognizing" ? recognizingLabel : t.add.photoButton}
                        </Button>
                        <Button variant="outline" onClick={() => albumInputRef.current?.click()} disabled={photoState === "recognizing"} size="lg">
                            {photoState === "recognizing" ? <Loader2 className="h-5 w-5 animate-spin" /> : <Images className="h-5 w-5" />}
                            {t.add.albumButton}
                        </Button>
                    </div>

                    {photoState === "review" && drafts.length > 0 && (
                        <div className="space-y-3">
                            <p className="text-sm font-medium">{fmt(t.add.recognizeResult, { count: drafts.filter((d) => d.include).length })}</p>
                            {drafts.map((draft, index) => (
                                <Card key={index} className="gap-2 py-4">
                                    <CardContent className="space-y-2 px-4">
                                        <div className="flex items-center justify-between gap-2">
                                            <div className="min-w-0">
                                                <div className="text-lg font-semibold">{draft.text}</div>
                                                <div className="text-xs text-muted-foreground">
                                                    {draft.wrongForm ? `${t.add.wrongFormLabel}: ${draft.wrongForm}` : ""}
                                                    {draft.errorNote ? ` · ${draft.errorNote}` : ""}
                                                </div>
                                            </div>
                                            <div className="flex shrink-0 items-center gap-1">
                                                {draft.confidence < 0.7 && (
                                                    <span className="text-xs text-amber-600">{t.add.lowConfidence}</span>
                                                )}
                                                <Button
                                                    variant={draft.include ? "default" : "outline"}
                                                    size="sm"
                                                    onClick={() => setDrafts((prev) => prev.map((row, i) => (i === index ? { ...row, include: !row.include } : row)))}
                                                >
                                                    {draft.include ? t.add.include : t.add.exclude}
                                                </Button>
                                            </div>
                                        </div>
                                    </CardContent>
                                </Card>
                            ))}
                            <Button onClick={() => void saveRecognized()} disabled={saving || !drafts.some((draft) => draft.include)} className="w-full">
                                {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
                                {t.actions.save}
                            </Button>
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
