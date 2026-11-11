import { describe, expect, it } from "vitest";
import { parseDictationImport, inferItemType } from "@/lib/dictation/import-parser";

describe("parseDictationImport", () => {
    it("逐行解析并按空白分隔注释", () => {
        const result = parseDictationImport("美丽 měi lì\n翅膀\nbeautiful 漂亮的\nhello world\t你好");
        expect(result.invalidLines).toBe(0);
        expect(result.lines).toEqual([
            { text: "美丽", annotation: "měi lì" },
            { text: "翅膀", annotation: undefined },
            { text: "beautiful", annotation: "漂亮的" },
            { text: "hello", annotation: "world 你好" },
        ]);
    });

    it("去除常见序号前缀", () => {
        const result = parseDictationImport("1. 默写\n2、听写\n（三）背诵\n(12) word 释义");
        expect(result.lines.map((line) => line.text)).toEqual(["默写", "听写", "背诵", "word"]);
    });

    it("忽略空行与首尾空白", () => {
        const result = parseDictationImport("  \n\n美丽\n  蜻蜓  \n\r\n");
        expect(result.lines.map((line) => line.text)).toEqual(["美丽", "蜻蜓"]);
        expect(result.invalidLines).toBe(0);
    });

    it("超长行计入 invalidLines", () => {
        const result = parseDictationImport(`好\n${"长".repeat(201)}`);
        expect(result.lines.map((line) => line.text)).toEqual(["好"]);
        expect(result.invalidLines).toBe(1);
    });
});

describe("inferItemType", () => {
    it("语文：单字/词语/短语/句子", () => {
        expect(inferItemType("chinese", "美")).toBe("char");
        expect(inferItemType("chinese", "美丽")).toBe("word");
        expect(inferItemType("chinese", "美丽的蝴蝶")).toBe("phrase");
        expect(inferItemType("chinese", "春天来了，花儿都开了。")).toBe("sentence");
    });

    it("英语：按空格分词判断", () => {
        expect(inferItemType("english", "beautiful")).toBe("word");
        expect(inferItemType("english", "look at")).toBe("phrase");
        expect(inferItemType("english", "I can see a beautiful bird in the tree")).toBe("sentence");
    });
});
