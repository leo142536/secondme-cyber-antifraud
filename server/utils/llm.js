require('dotenv').config();
const OpenAI = require('openai');

const client = new OpenAI({
  apiKey: process.env.LLM_API_KEY,
  ...(process.env.LLM_BASE_URL ? { baseURL: process.env.LLM_BASE_URL } : {}),
});

const MODEL = process.env.LLM_MODEL || 'gpt-4o-mini';

/**
 * 调用 LLM，返回完整文本响应
 * @param {string} systemPrompt
 * @param {Array<{role, content}>} messages
 * @param {object} options - 额外参数如 response_format
 */
async function callLLM(systemPrompt, messages = [], options = {}) {
  const response = await client.chat.completions.create({
    model: MODEL,
    messages: [
      { role: 'system', content: systemPrompt },
      ...messages,
    ],
    temperature: 0.9,
    max_tokens: 800,
    ...options,
  });
  return response.choices[0].message.content.trim();
}

/**
 * 调用 LLM，强制 JSON 输出（用于小宝 Agent）
 */
async function callLLMJson(systemPrompt, messages = []) {
  const raw = await callLLM(systemPrompt, messages, {
    temperature: 0.85,
    max_tokens: 600,
  });
  // 提取 JSON（容错：有些模型会加 markdown 代码块）
  const match = raw.match(/\{[\s\S]*\}/);
  if (!match) {
    // fallback：返回原始文本作为 message，thought 为空
    return { thought: '（思维链提取失败）', message: raw };
  }
  try {
    return JSON.parse(match[0]);
  } catch {
    return { thought: '（JSON 解析失败）', message: raw };
  }
}

module.exports = { callLLM, callLLMJson };
