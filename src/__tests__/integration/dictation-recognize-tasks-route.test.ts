// @vitest-environment node
/**
 * /api/dictation/recognize-tasks(真实 SQLite):创建即返回任务、后台识别完成后列表带草稿、重试、删除
 */
import { execFileSync } from 'node:child_process';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { PrismaClient } from '@prisma/client';
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => {
    let workQueue: Array<() => Promise<void>> = [];
    return {
        prisma: undefined as PrismaClient | undefined,
        getServerSession: vi.fn(),
        consumeAiQuota: vi.fn(),
        analyzeDictationImage: vi.fn(),
        scheduleWork: vi.fn((_taskId: string, _release: () => void, work: () => Promise<void>) => {
            workQueue.push(work);
        }),
        bootId: vi.fn(() => 'boot-test'),
        register: vi.fn(() => () => undefined),
        drain: async () => {
            const pending = workQueue;
            workQueue = [];
            await Promise.all(pending.map((work) => work()));
        },
        resetQueue: () => {
            workQueue = [];
        },
    };
});

vi.mock('next-auth', () => ({ getServerSession: mocks.getServerSession }));
vi.mock('@/lib/auth', () => ({ authOptions: {} }));
vi.mock('@/lib/prisma', () => ({ get prisma() { return mocks.prisma; } }));
vi.mock('@/lib/config/store', () => ({ getAppTimeZone: () => 'Asia/Shanghai' }));
vi.mock('@/lib/ai-quota', () => ({
    consumeAiQuota: mocks.consumeAiQuota,
    quotaRejectionCode: vi.fn(async (limited: unknown) => String(limited)),
}));
vi.mock('@/lib/ai', () => ({
    getAIService: async () => ({ analyzeDictationImage: mocks.analyzeDictationImage }),
}));
vi.mock('@/lib/import/import-tasks', () => ({
    register: mocks.register,
    scheduleWork: mocks.scheduleWork,
    bootId: mocks.bootId,
}));

import { GET as listTasks, POST as createTasks } from '@/app/api/dictation/recognize-tasks/route';
import { DELETE as deleteTask } from '@/app/api/dictation/recognize-tasks/[id]/route';
import { POST as retryTask } from '@/app/api/dictation/recognize-tasks/[id]/retry/route';

let database: PrismaClient;
let directory: string;
const session = { user: { id: 'user-1', email: 'user@localhost', role: 'user' }, expires: '2099-01-01' };

const get = () => listTasks(new Request('http://localhost/api/dictation/recognize-tasks'));
const post = (body: unknown) =>
    createTasks(new Request('http://localhost/api/dictation/recognize-tasks', { method: 'POST', body: JSON.stringify(body) }));
const remove = (id: string) =>
    deleteTask(new Request(`http://localhost/api/dictation/recognize-tasks/${id}`, { method: 'DELETE' }), { params: Promise.resolve({ id }) });
const retry = (id: string) =>
    retryTask(new Request(`http://localhost/api/dictation/recognize-tasks/${id}/retry`, { method: 'POST' }), { params: Promise.resolve({ id }) });

const draft = (text: string) => ({ text, itemType: 'word', confidence: 0.9, pinyin: null, meaning: null, wrongForm: null, errorNote: null });
const dataUrl = `data:image/jpeg;base64,${'A'.repeat(1024)}`;

async function seedUser() {
    await database.user.upsert({ where: { email: session.user.email }, update: {}, create: { id: session.user.id, email: session.user.email, password: 'x', role: 'user' } });
}

beforeAll(() => {
    directory = mkdtempSync(join(tmpdir(), 'wrong-notebook-dictation-tasks-test-'));
    const url = `file:${join(directory, 'test.db')}`;
    execFileSync(process.execPath, [resolve('node_modules/prisma/build/index.js'), 'migrate', 'deploy'], {
        env: { ...process.env, DATABASE_URL: url },
        stdio: 'pipe',
    });
    database = new PrismaClient({ datasources: { db: { url } } });
    mocks.prisma = database;
}, 120000);

afterAll(async () => {
    await database?.$disconnect();
    rmSync(directory, { recursive: true, force: true });
});

beforeEach(async () => {
    mocks.resetQueue();
    mocks.getServerSession.mockResolvedValue(session);
    mocks.consumeAiQuota.mockResolvedValue(false);
    mocks.analyzeDictationImage.mockReset();
    await database.dictationImportTask.deleteMany();
    await seedUser();
});

describe('POST /api/dictation/recognize-tasks', () => {
    it('创建任务后立刻返回 analyzing,后台完成后列表变 review 且带草稿', async () => {
        mocks.analyzeDictationImage.mockResolvedValue([draft('美丽')]);

        const created = await post({ lang: 'chinese', images: [{ clientRequestId: 'req-aaaa-1', imageData: dataUrl }] });
        expect(created.status).toBe(200);
        const createdBody = await created.json();
        expect(createdBody.tasks[0].status).toBe('analyzing');
        expect(createdBody.tasks[0].drafts).toEqual([]);

        await mocks.drain();

        const listed = await get();
        const listBody = await listed.json();
        expect(listBody.tasks).toHaveLength(1);
        expect(listBody.tasks[0].status).toBe('review');
        expect(listBody.tasks[0].drafts[0].text).toBe('美丽');
        expect(mocks.analyzeDictationImage).toHaveBeenCalledTimes(1);
    });

    it('相同 clientRequestId 重复提交只保留一个任务且不重复扣额', async () => {
        mocks.analyzeDictationImage.mockResolvedValue([]);

        await post({ lang: 'chinese', images: [{ clientRequestId: 'req-aaaa-2', imageData: dataUrl }] });
        await post({ lang: 'chinese', images: [{ clientRequestId: 'req-aaaa-2', imageData: dataUrl }] });

        expect(mocks.consumeAiQuota).toHaveBeenCalledTimes(1);
        const listed = await get();
        const listBody = await listed.json();
        expect(listBody.tasks).toHaveLength(1);
    });

    it('配额不足时任务直接以 failed 返回原因', async () => {
        mocks.consumeAiQuota.mockResolvedValue('AI_DAILY_LIMIT_EXCEEDED');

        const created = await post({ lang: 'english', images: [{ clientRequestId: 'req-aaaa-3', imageData: dataUrl }] });
        const body = await created.json();
        expect(body.tasks[0].status).toBe('failed');
        expect(body.tasks[0].error).toBe('AI_DAILY_LIMIT_EXCEEDED');
        expect(mocks.analyzeDictationImage).not.toHaveBeenCalled();
    });

    it('校验失败返回 400', async () => {
        const response = await post({ lang: 'chinese', images: [] });
        expect(response.status).toBe(400);
    });
});

describe('POST /api/dictation/recognize-tasks/[id]/retry', () => {
    it('识别失败的任务可重试并再次进入分析', async () => {
        mocks.analyzeDictationImage.mockRejectedValueOnce(new Error('boom')).mockResolvedValue([draft('apple')]);

        await post({ lang: 'english', images: [{ clientRequestId: 'req-bbbb-1', imageData: dataUrl }] });
        await mocks.drain();
        let listed = await get();
        expect((await listed.json()).tasks[0].status).toBe('failed');

        const retried = await retry((await (await get()).json()).tasks[0].id);
        expect(retried.status).toBe(200);
        expect((await retried.json()).task.status).toBe('analyzing');

        await mocks.drain();
        listed = await get();
        const tasks = (await listed.json()).tasks;
        expect(tasks[0].status).toBe('review');
        expect(tasks[0].drafts[0].text).toBe('apple');
        expect(tasks[0].attempts).toBe(2);
    });
});

describe('DELETE /api/dictation/recognize-tasks/[id]', () => {
    it('删除自己的任务,他人任务 404', async () => {
        await post({ lang: 'chinese', images: [{ clientRequestId: 'req-cccc-1', imageData: dataUrl }] });
        const listed = (await (await get()).json()).tasks;
        expect(listed).toHaveLength(1);

        const removed = await remove(listed[0].id);
        expect(removed.status).toBe(200);

        const other = await database.user.create({ data: { id: 'user-2', email: 'other@localhost', password: 'x', role: 'user' } });
        expect(other.id).toBe('user-2');
        const gone = await remove(listed[0].id);
        expect(gone.status).toBe(404);
    });
});
