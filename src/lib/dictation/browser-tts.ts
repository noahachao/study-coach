"use client";

import type { DictationLang } from "@/lib/dictation/types";

/** 浏览器本地语音合成朗读：零成本、无网络依赖，后续可替换为云端 TTS */

function speechVoice(lang: DictationLang): string {
    return lang === "english" ? "en-US" : "zh-CN";
}

export function browserSpeak(text: string, lang: DictationLang): boolean {
    if (typeof window === "undefined" || !("speechSynthesis" in window)) return false;
    window.speechSynthesis.cancel();
    const utterance = new SpeechSynthesisUtterance(text);
    utterance.lang = speechVoice(lang);
    utterance.rate = 0.8;
    window.speechSynthesis.speak(utterance);
    return true;
}

export function stopSpeaking(): void {
    if (typeof window === "undefined" || !("speechSynthesis" in window)) return;
    window.speechSynthesis.cancel();
}

export function isBrowserSpeechAvailable(): boolean {
    return typeof window !== "undefined" && "speechSynthesis" in window;
}
