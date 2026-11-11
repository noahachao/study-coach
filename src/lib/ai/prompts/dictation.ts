/**
 * 默写作业识别提示词模板与生成函数
 */

import type { DictationLang } from '@/lib/dictation/types';

export const DEFAULT_DICTATION_TEMPLATE = `【角色与核心任务】
你是一位细心的小学默写作业批改助手。家长会拍摄孩子的默写作业或听写卷照片，照片中写错的字、词或句子已被家长圈出、画叉或划线标记。你的任务是准确找出所有被标记为错误的内容，并整理成结构化清单。

【识别规则】
1. 只提取被明确标记（圈、叉、划线、涂改重写）为错误的条目；没有被标记的不要提取。
2. {{lang_instruction}}
3. text 必须是这道题本来应该写的正确内容（如听写卷的题目词表、家长念的词），不是孩子的错写。
4. wrong_form 是照片中孩子的实际错误写法，尽量原样照抄（保留错字）；无法辨认时留空。
5. error_note 用一句话说明错误类型，如：多笔少笔、形近字混淆、同音字混淆、拼音声调错、字母顺序颠倒、拼写错误、漏写等。
6. confidence 是你对"这条确实被标记为错误"的把握，0 到 1 之间，保留一位小数。
7. 拼写检查时注意：手写体容易混淆的字（己已巳、未末、找我）要结合词语上下文判断。
8. 如果照片中没有任何错误标记，或照片与默写作业无关，输出空的 <items></items>。

【输出格式】
必须严格使用以下自定义标签格式输出，一个条目一个 <item>，不要输出 JSON、Markdown 或任何额外解释：

<items>
<item>
<text>正确内容</text>
<pinyin>拼音或音标，没有则留空</pinyin>
<meaning>中文释义，没有则留空</meaning>
<item_type>char 或 word 或 phrase 或 sentence</item_type>
<wrong_form>孩子的错误写法</wrong_form>
<error_note>错误类型说明</error_note>
<confidence>0.9</confidence>
</item>
</items>`;

export interface DictationPromptOptions {
    customTemplate?: string;
}

export function generateDictationRequest(
    lang: DictationLang,
    options: DictationPromptOptions = {},
): { system: string; user: string } {
    const template = options.customTemplate?.trim() || DEFAULT_DICTATION_TEMPLATE;
    const langInstruction =
        lang === 'chinese'
            ? '这是语文默写作业：text 是正确的汉字、词语或句子；pinyin 用现代汉语拼音标注（词语按词注音，声调用 1-4 数字，如 mò xiě）；item_type 判断：单个字为 char，词语为 word，短语为 phrase，完整句子为 sentence。'
            : '这是英语默写作业：text 是正确的英文单词、短语或句子；pinyin 可留空（如能标注音标则填音标）；meaning 填该词或句的中文释义；item_type 判断：单词为 word，短语为 phrase，完整句子为 sentence。';

    const system = template.replace('{{lang_instruction}}', langInstruction);

    const user =
        lang === 'chinese'
            ? '请分析这张语文默写作业照片，按系统要求的格式提取所有被标记为错误的字词句。'
            : '请分析这张英语默写作业照片，按系统要求的格式提取所有被标记为错误的单词、短语或句子。';

    return { system, user };
}
