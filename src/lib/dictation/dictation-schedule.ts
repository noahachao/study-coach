import { getReviewPlan, isReviewDue, REVIEW_INTERVALS } from "@/lib/review-schedule";
import { DICTATION_GRADUATED_STAGE } from "@/lib/dictation/types";

export interface DictationScheduleRecord {
    result: string;
    createdAt: Date;
}

export interface DictationScheduleInput {
    createdAt: Date;
    records: DictationScheduleRecord[];
}

export interface DictationPlan {
    stage: number;
    nextReviewAt: Date | null;
    dueToday: boolean;
    graduated: boolean;
}

/** 按作答历史推算默写条目的复习计划，间隔与错题复习一致 */
export function getDictationPlan(item: DictationScheduleInput, timeZone: string, now = new Date()): DictationPlan {
    const plan = getReviewPlan(item.createdAt, item.records, timeZone);
    const graduated = plan.nextReviewAt === null;
    return {
        stage: plan.stage,
        nextReviewAt: plan.nextReviewAt,
        dueToday: !graduated && isReviewDue(plan, timeZone, now),
        graduated: graduated || plan.stage >= DICTATION_GRADUATED_STAGE,
    };
}

/** 还剩几次答对可掌握（已掌握为 0） */
export function remainingCorrects(plan: Pick<DictationPlan, "stage">): number {
    return Math.max(0, REVIEW_INTERVALS.length - plan.stage);
}
