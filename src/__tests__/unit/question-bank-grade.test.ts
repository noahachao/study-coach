import { describe, expect, it } from "vitest";
import { formatGradeRange, gradeFromGradeSemester } from "@/lib/question-bank/grade";

describe("gradeFromGradeSemester", () => {
    it("解析中文年级学期", () => {
        expect(gradeFromGradeSemester("一年级上")).toBe(1);
        expect(gradeFromGradeSemester("六年级下")).toBe(6);
        expect(gradeFromGradeSemester("初一下")).toBe(7);
        expect(gradeFromGradeSemester("高一")).toBe(10);
    });

    it("无法解析时返回 null", () => {
        expect(gradeFromGradeSemester(null)).toBeNull();
        expect(gradeFromGradeSemester(undefined)).toBeNull();
        expect(gradeFromGradeSemester("")).toBeNull();
        expect(gradeFromGradeSemester("小学")).toBeNull();
        expect(gradeFromGradeSemester("Grade 2")).toBeNull();
    });
});

describe("formatGradeRange", () => {
    it("连续年级显示为区间", () => {
        expect(formatGradeRange("[1,2,3,4,5,6]")).toBe("一年级–六年级");
        expect(formatGradeRange("[3,1,2]")).toBe("一年级–三年级");
    });

    it("单年级直接显示年级名", () => {
        expect(formatGradeRange("[2]")).toBe("二年级");
    });

    it("不连续年级逐个列出", () => {
        expect(formatGradeRange("[1,3,5]")).toBe("一年级、三年级、五年级");
    });

    it("非法或空值返回 null", () => {
        expect(formatGradeRange(null)).toBeNull();
        expect(formatGradeRange("[]")).toBeNull();
        expect(formatGradeRange("not-json")).toBeNull();
        expect(formatGradeRange('{"a":1}')).toBeNull();
        expect(formatGradeRange("[0,99]")).toBeNull();
    });
});
