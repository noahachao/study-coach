import { GRADE_NAMES } from "@/lib/grade-options";

export function gradeFromGradeSemester(value: string | null | undefined): number | null {
    if (!value) return null;
    const trimmed = value.trim();
    if (!trimmed) return null;
    const index = GRADE_NAMES.findIndex((name) => trimmed.startsWith(name));
    return index >= 0 ? index + 1 : null;
}

export function formatGradeRange(gradeRange: string | null | undefined): string | null {
    if (!gradeRange) return null;
    let parsed: unknown;
    try {
        parsed = JSON.parse(gradeRange);
    } catch {
        return null;
    }
    if (!Array.isArray(parsed)) return null;
    const grades = parsed
        .filter((value): value is number => typeof value === "number" && value >= 1 && value <= GRADE_NAMES.length)
        .sort((a, b) => a - b);
    if (grades.length === 0) return null;
    const first = GRADE_NAMES[grades[0] - 1];
    const last = GRADE_NAMES[grades[grades.length - 1] - 1];
    if (grades.length === 1) return first;
    if (grades[grades.length - 1] - grades[0] + 1 === grades.length) return `${first}–${last}`;
    return grades.map((grade) => GRADE_NAMES[grade - 1]).join("、");
}
