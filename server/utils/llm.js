require('dotenv').config();
const OpenAI = require('openai');

function getLLMClient() {
  if (!process.env.LLM_API_KEY) {
    console.error("LLM_API_KEY is missing!");
  }
  return new OpenAI({
    apiKey: process.env.LLM_API_KEY || 'dummy_to_prevent_crash_at_load_time',
    ...(process.env.LLM_BASE_URL ? { baseURL: process.env.LLM_BASE_URL } : {}),
  });
}

const MODEL = process.env.LLM_MODEL || 'gpt-4o-mini';

async function callLLM(systemPrompt, messages = [], options = {}) {
  const client = getLLMClient();
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

async function callLLMJson(systemPrompt, messages = []) {
  const raw = await callLLM(systemPrompt, messages, {
    temperature: 0.85,
    max_tokens: 600,
  });
  const match = raw.match(/\{[\s\S]*\}/);
  if (!match) {
    return { thought: '（思维链提取失败）', message: raw };
  }
  try {
    return JSON.parse(match[0]);
  } catch {
    return { thought: '（JSON 解析失败）', message: raw };
  }
}

module.exports = { callLLM, callLLMJson };
