// @vitest-environment node
/**
 * /api/dictation/*（真实 SQLite）：条目 CRUD、重复跳过、回填调度（答对进档/连续答对毕业）、词库导入、拍照识别协议
 */
import { execFileSync } from 'node:child_process';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { PrismaClient } from '@prisma/client';
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
    prisma: undefined as PrismaClient | undefined,
    getServerSession: vi.fn(),
    consumeAiQuota: vi.fn(),
    analyzeDictationImage: vi.fn(),
}));

vi.mock('next-auth', () => ({ getServerSession: mocks.getServerSession }));
vi.mock('@/lib/auth', () => ({ authOptions: {} }));
vi.mock('@/lib/prisma', () => ({ get prisma() { return mocks.prisma; } }));
vi.mock('@/lib/config/store', () => ({ getAppTimeZone: () => 'Asia/Shanghai' }));
vi.mock('@/lib/ai-quota', () => ({ consumeAiQuota: mocks.consumeAiQuota }));
vi.mock('@/lib/ai', () => ({
    getAIService: async () => ({ analyzeDictationImage: mocks.analyzeDictationImage }),
}));

import { GET as listItems, POST as createItems } from '@/app/api/dictation/items/route';
import { DELETE as deleteItem, PUT as updateItem } from '@/app/api/dictation/items/[id]/route';
import { POST as recordResult } from '@/app/api/dictation/items/[id]/record/route';
import { POST as recognize } from '@/app/api/dictation/recognize/route';
import { POST as importItems } from '@/app/api/dictation/import/route';

let database: PrismaClient;
let directory: string;
const session = { user: { id: 'user-1', email: 'user@localhost', role: 'user' }, expires: '2099-01-01' };

const get = (query = '') => listItems(new Request(`http://localhost/api/dictation/items${query}`));
const post = (body: unknown) => createItems(new Request('http://localhost/api/dictation/items', { method: 'POST', body: JSON.stringify(body) }));
const record = (id: string, body: unknown) => recordResult(new Request(`http://localhost/api/dictation/items/${id}/record`, { method: 'POST', body: JSON.stringify(body) }), { params: Promise.resolve({ id }) });
const put = (id: string, body: unknown) => updateItem(new Request(`http://localhost/api/dictation/items/${id}`, { method: 'PUT', body: JSON.stringify(body) }), { params: Promise.resolve({ id }) });
const remove = (id: string) => deleteItem(new Request(`http://localhost/api/dictation/items/${id}`, { method: 'DELETE' }), { params: Promise.resolve({ id }) });
const importPost = (body: unknown) => importItems(new Request('http://localhost/api/dictation/import', { method: 'POST', body: JSON.stringify(body) }));
const recognizePost = (body: unknown) => recognize(new Request('http://localhost/api/dictation/recognize', { method: 'POST', body: JSON.stringify(body) }));

async function seedUser() {
    await database.user.upsert({ where: { email: session.user.email }, update: {}, create: { id: session.user.id, email: session.user.email, password: 'x', role: 'user' } });
}

beforeAll(() => {
    directory = mkdtempSync(join(tmpdir(), 'wrong-notebook-dictation-test-'));
    const url = `file:${join(directory, 'test.db')}`;
    execFileSync(process.execPath, [resolve('node_modules/prisma/build/index.js'), 'migrate', 'deploy'], {
        env: { ...process.env, DATABASE_URL: url },
        stdio: 'pipe',
    });
    database = new PrismaClient({ datasources: { db: { url } } });
    mocks.prisma = database;
}, 120000);

beforeEach(async () => {
    vi.clearAllMocks();
    mocks.getServerSession.mockResolvedValue(session);
    mocks.consumeAiQuota.mockResolvedValue(undefined);
    await database.dictationRecord.deleteMany();
    await database.dictationItem.deleteMany();
    await database.user.deleteMany();
    await seedUser();
});

afterAll(async () => {
    await database?.$disconnect();
    if (directory) rmSync(directory, { recursive: true, force: true });
});

describe('/api/dictation/items', () => {
    it('未登录返回 401', async () => {
        mocks.getServerSession.mockResolvedValue(null);
        expect((await get()).status).toBe(401);
        expect((await post({ items: [] })).status).toBe(401);
    });

    it('创建带错误写法的条目并出现在列表，初始次日到期', async () => {
        const created = await post({
            lang: 'chinese',
            items: [{ itemType: 'word', text: '美丽', wrongForm: '美利', note: '同音字混淆' }],
        });
        expect(created.status).toBe(200);
        const body = await created.json();
        expect(body.created).toHaveLength(1);
        expect(body.skipped).toBe(0);
        expect(body.created[0]).toMatchObject({ text: '美丽', lang: 'chinese', itemType: 'word', lastWrongForm: '美利', errorCount: 1, stage: 0 });
        expect(body.created[0].records).toHaveLength(1);

        const list = await (await get('?status=active')).json();
        expect(list.items).toHaveLength(1);
        expect(list.items[0].dueToday).toBe(false);
        expect(list.summary.chinese).toMatchObject({ total: 1, dueToday: 0, graduated: 0 });
    });

    it('未掌握的同文条目跳过，已掌握后允许再建', async () => {
        await post({ lang: 'english', items: [{ itemType: 'word', text: 'beautiful' }] });
        const again = await (await post({ lang: 'english', items: [{ itemType: 'word', text: 'beautiful' }] })).json();
        expect(again.created).toHaveLength(0);
        expect(again.skipped).toBe(1);

        const item = await database.dictationItem.findFirstOrThrow();
        for (let i = 0; i < 6; i++) {
            await record(item.id, { result: 'correct' });
        }
        const afterGraduate = await (await post({ lang: 'english', items: [{ itemType: 'word', text: 'beautiful' }] })).json();
        expect(afterGraduate.created).toHaveLength(1);
    });

    it('回填答对进档、答错清零并计错误次数', async () => {
        const item = (await (await post({ lang: 'chinese', items: [{ itemType: 'char', text: '蜓' }] })).json()).created[0];

        const correct = await (await record(item.id, { result: 'correct' })).json();
        expect(correct.item.stage).toBe(1);

        const wrong = await (await record(item.id, { result: 'wrong', wrongForm: '廷' })).json();
        expect(wrong.item.stage).toBe(0);
        expect(wrong.item.errorCount).toBe(1);
        expect(wrong.item.lastWrongForm).toBe('廷');
    });

    it('连续答对六次后毕业', async () => {
        const item = (await (await post({ lang: 'chinese', items: [{ itemType: 'word', text: '蜻蜓' }] })).json()).created[0];
        let view: { item: { graduated: boolean; stage: number } } | null = null;
        for (let i = 0; i < 6; i++) {
            view = (await (await record(item.id, { result: 'correct' })).json());
        }
        expect(view).not.toBeNull();
        expect(view!.item.stage).toBe(6);
        expect(view!.item.graduated).toBe(true);

        const graduatedList = await (await get('?status=graduated')).json();
        expect(graduatedList.items).toHaveLength(1);
    });

    it('PUT 修改备注与拼音，DELETE 删除条目及历史', async () => {
        const item = (await (await post({ lang: 'chinese', items: [{ itemType: 'word', text: '默写', pinyin: 'mò xiě' }] })).json()).created[0];
        await record(item.id, { result: 'wrong', wrongForm: '墨写' });

        const updated = await (await put(item.id, { pinyin: 'mò xiě', note: '易错字' })).json();
        expect(updated.item.id).toBe(item.id);
        expect((await database.dictationItem.findFirstOrThrow()).note).toBe('易错字');

        expect((await remove(item.id)).status).toBe(200);
        expect(await database.dictationItem.count()).toBe(0);
        expect(await database.dictationRecord.count()).toBe(0);
    });
});

describe('/api/dictation/import', () => {
    it('按行导入并区分注释归属', async () => {
        const body = await (await importPost({ lang: 'chinese', content: '1. 美丽 měi lì\n2、蜻蜓\n\n好' })).json();
        expect(body.created).toHaveLength(3);
        expect(body.skipped).toBe(0);
        expect(body.invalidLines).toBe(0);
        const items = await database.dictationItem.findMany({ orderBy: { text: 'asc' } });
        expect(items.find((i) => i.text === '美丽')?.pinyin).toBe('měi lì');
    });

    it('英语导入注释进释义', async () => {
        const body = await (await importPost({ lang: 'english', content: 'beautiful 美丽的' })).json();
        expect(body.created).toHaveLength(1);
        const item = await database.dictationItem.findFirstOrThrow();
        expect(item.meaning).toBe('美丽的');
        expect(item.source).toBe('import');
    });
});

describe('/api/dictation/recognize', () => {
    it('返回识别草稿并消耗额度', async () => {
        mocks.analyzeDictationImage.mockResolvedValue([{ text: '美丽', itemType: 'word', confidence: 0.9 }]);
        const response = await recognizePost({ imageBase64: 'aGVsbG8=', lang: 'chinese' });
        expect(response.status).toBe(200);
        const body = await response.json();
        expect(body.drafts).toEqual([{ text: '美丽', itemType: 'word', confidence: 0.9 }]);
        expect(mocks.consumeAiQuota).toHaveBeenCalledWith(session.user, 'analyze');
    });

    it('无图像数据返回 400', async () => {
        expect((await recognizePost({ lang: 'chinese' })).status).toBe(400);
    });
});
