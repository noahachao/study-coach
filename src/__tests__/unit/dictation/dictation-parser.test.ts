import { describe, expect, it } from "vitest";
import { parseDictationResponse } from "@/lib/ai/dictation-parser";

const response = (items: string) => `<items>${items}</items>`;

const item = (fields: Record<string, string>) =>
    Object.entries(fields)
        .map(([tag, value]) => `<${tag}>${value}</${tag}>`)
        .map((line) => `${line}`)
        .join("\n");

describe("parseDictationResponse", () => {
    it("解析完整条目", () => {
        const text = response(`
<item>
${item({ text: "美丽", pinyin: "měi lì", meaning: "好看的", item_type: "word", wrong_form: "美利", error_note: "同音字混淆", confidence: "0.9" })}
</item>
`);
        const drafts = parseDictationResponse(text);
        expect(drafts).toEqual([
            {
                text: "美丽",
                pinyin: "měi lì",
                meaning: "好看的",
                itemType: "word",
                wrongForm: "美利",
                errorNote: "同音字混淆",
                confidence: 0.9,
            },
        ]);
    });

    it("无条目时返回空数组", () => {
        expect(parseDictationResponse(response(""))).toEqual([]);
        expect(parseDictationResponse("模型闲聊没有标签")).toEqual([]);
    });

    it("confidence 非法时回退为 1", () => {
        const text = response(`<item>${item({ text: "默写", item_type: "char", confidence: "abc" })}</item>`);
        expect(parseDictationResponse(text)[0].confidence).toBe(1);
    });

    it("item_type 非法时按长度推断", () => {
        const text = response(`<item>${item({ text: "美丽", item_type: "nonsense", confidence: "0.8" })}</item>`);
        expect(parseDictationResponse(text)[0].itemType).toBe("word");
    });

    it("缺少 text 的条目被丢弃，重复条目去重", () => {
        const text = response(`
<item>${item({ pinyin: "mò xiě", item_type: "word", confidence: "0.9" })}</item>
<item>${item({ text: "默写", item_type: "char", confidence: "0.9" })}</item>
<item>${item({ text: "默写", item_type: "char", confidence: "0.8" })}</item>
`);
        const drafts = parseDictationResponse(text);
        expect(drafts).toHaveLength(1);
        expect(drafts[0].text).toBe("默写");
    });
});
