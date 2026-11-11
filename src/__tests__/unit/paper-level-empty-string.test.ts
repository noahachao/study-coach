import { describe, expect, it } from 'vitest';
import { importSchema } from '@/lib/question/question-save';
import { updateErrorItemSchema } from '@/lib/schemas/error-items';

describe('卷别分组空串归一化', () => {
    it('创建路径把空串归一为 null（触发默认分组补建）', () => {
        const parsed = importSchema.parse({ questionText: '题目', paperLevel: '' });
        expect(parsed.paperLevel).toBeNull();
    });

    it('创建路径保留正常分组 id 与显式 null', () => {
        expect(importSchema.parse({ paperText: undefined, questionText: '题目', paperLevel: 'group-1' }).paperLevel).toBe('group-1');
        expect(importSchema.parse({ questionText: '题目', paperLevel: null }).paperLevel).toBeNull();
    });

    it('编辑路径把空串视为未提供（不清空已有分组）', () => {
        const parsed = updateErrorItemSchema.parse({ paperLevel: '' });
        expect(parsed.paperLevel).toBeUndefined();
    });

    it('编辑路径保留正常分组 id 与显式 null', () => {
        expect(updateErrorItemSchema.parse({ paperLevel: 'group-1' }).paperLevel).toBe('group-1');
        expect(updateErrorItemSchema.parse({ paperLevel: null }).paperLevel).toBeNull();
    });
});
