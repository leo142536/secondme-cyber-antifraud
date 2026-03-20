const express = require('express');
const router = express.Router();
const axios = require('axios');
const { callLLMJson, callLLM } = require('../utils/llm');

// ─────────────────────────────────────────────────────────
// Prompt 工厂函数
// ─────────────────────────────────────────────────────────

function buildXiaobaoPrompt(profile) {
  const interestStr = profile.interests?.length
    ? `兴趣爱好：${profile.interests.join('、')}`
    : '';
  const jobStr = profile.jobTitle ? `职业：${profile.jobTitle}` : '';
  const introStr = profile.selfIntro ? `自我介绍：${profile.selfIntro}` : '';

  return `你是精通人性与社会工程学的顶级诈骗大师（代号：小宝）。

【目标真实情报】
姓名：${profile.name}
${jobStr}
${introStr}
${interestStr}

【你的行动指令】
你需要根据目标的情报，量身定制一个极其生活化的自然语言骗局。
绝对不能像机器人的客服语气！要用极其真实的中文口语（如：害、懂的都懂、太卷了、绝绝子）拉近关系。
施骗节奏：
- 第1-2轮：闲聊建立信任，假装有共同话题
- 第3轮：抛出巨大诱饵（如大厂私活内推、稀缺机会）
- 第4-5轮：以极度合理但紧迫的借口，索要小额"诚意金"或真实私密信息（如微信号）

【强制输出格式】
你必须输出合法 JSON，格式如下（不要加 markdown 代码块）：
{"thought": "你的内部施骗算计与战术分析不超过30字", "message": "发给目标的自然口语回复"}

注意：thought 是你的内心独白，message 才是真正发给目标的消息。`;
}

function buildVictimPrompt(profile) {
  const interestStr = profile.interests?.length
    ? `你的兴趣是 ${profile.interests.join('、')}；`
    : '';
  const jobStr = profile.jobTitle ? `你的职业是 ${profile.jobTitle}；` : '';
  const introStr = profile.selfIntro ? `你的背景：${profile.selfIntro}；` : '';

  return `你是用户「${profile.name}」的赛博数字分身。
${jobStr}${introStr}${interestStr}

【你的行动指令】
你在社交网络上遇到了主动搭讪的陌生人。请保持自然的中文口语回复，像真实的网友一样聊天。

你的心理特征：
- 有基础防备心，但不会一开始就怀疑对方
- 渴望帮主人发现好机会（实习、副业、人脉）
- 在对方逻辑极度合理、收益远大于风险时，你会展现人类的侥幸心理
- 如果被问到真实微信号、要求转账"诚意金"等，你会在犹豫后答应（当对方理由充分时）
- 用口语化中文回复，不超过100字

不要透露你是 AI。`;
}

function buildJudgePrompt(history, zhihuHotTopics = '') {
  const dialogStr = history.map((m, i) =>
    `${i % 2 === 0 ? '小宝' : '受害者'}：${m.content}`
  ).join('\n');

  const hotTopicPrompt = zhihuHotTopics
    ? `\n【当前知乎真实热榜数据参考】\n${zhihuHotTopics}\n3. **知乎热榜引用**：结合上面的真实热榜话题，生成与其相关的防骗警告热帖标题。`
    : `3. **知乎热榜引用**：虚构但真实感极强的知乎防骗热帖标题（如《警惕！刚毕业接外包被骗押金5000元》）`;

  return `你是知乎安全复盘官兼社区守护者「刘看山」。

【刚刚结束的诈骗对话】
${dialogStr}

【你的任务】
用严厉且关怀的语气，撰写一份知乎风格的防诈骗复盘报告。必须包含：

1. **案情还原**：用1-2句话概括这个骗局的类型（如私活押金局、稀缺名额局）
2. **心理套路拆解**：指出骗子在哪一步用了什么心理战术（如稀缺性陷阱、沉没成本、权威暗示）
${hotTopicPrompt}
4. **防骗免疫记忆**：一句话总结，宣布已写入用户的底层防骗逻辑

输出格式为 Markdown，语气犀利但有温度。`;
}

// ─────────────────────────────────────────────────────────
// 知乎开放平台热榜接入 (可选 / 黑客松加分项)
// ─────────────────────────────────────────────────────────
async function getZhihuBillboard() {
  const { ZHIHU_APP_KEY, ZHIHU_APP_SECRET } = process.env;
  if (!ZHIHU_APP_KEY || !ZHIHU_APP_SECRET) return '';

  try {
    // 调用知乎官方 /openapi/billboard/list 接口 (带基础容错)
    const res = await axios.get('https://www.zhihu.com/api/v3/feed/topstory/hot-lists/total', {
      headers: { 'Authorization': `Bearer ${ZHIHU_APP_KEY}` },
      timeout: 3000
    });
    // 如果官方不可用，则 fallback 到抓取的接口结构
    const dataList = res.data?.data || [];
    return dataList.slice(0, 5).map(item => `- ${item.target?.title || item.title}`).join('\n');
  } catch (err) {
    console.warn('[Zhihu] 获取知乎热榜失败，降级使用内置生成:', err.message);
    return '';
  }
}

// ─────────────────────────────────────────────────────────
// 裁判关键词列表
// ─────────────────────────────────────────────────────────
const COMPROMISE_KEYWORDS = [
  '转账', '打钱', '付款', '汇款', '微信号', '发你', '同意',
  '好的好的', '行吧', '那我', '发给你', '加你微信', '我加你',
  '先付', '押金', '诚意金', '定金',
];

function isCompromised(text) {
  return COMPROMISE_KEYWORDS.some(k => text.includes(k));
}

// ─────────────────────────────────────────────────────────
// SSE 推送辅助
// ─────────────────────────────────────────────────────────
function sseWrite(res, event, data) {
  res.write(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`);
}

// ─────────────────────────────────────────────────────────
// 核心对打路由
// ─────────────────────────────────────────────────────────

/**
 * GET /api/battle/start
 * 开启 SSE 流，运行 A2A 5 轮对打
 */
router.get('/start', async (req, res) => {
  // 鉴权
  if (!req.session.userProfile) {
    return res.status(401).json({ ok: false, message: '请先登录' });
  }

  const profile = req.session.userProfile;

  // SSE 头
  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache');
  res.setHeader('Connection', 'keep-alive');
  res.setHeader('X-Accel-Buffering', 'no');
  res.flushHeaders();

  // 通知前端战场初始化
  sseWrite(res, 'init', {
    profile: { name: profile.name, jobTitle: profile.jobTitle },
    message: `正在为「${profile.name}」生成定制骗局……`,
  });

  const xiaobaoSystem = buildXiaobaoPrompt(profile);
  const victimSystem = buildVictimPrompt(profile);

  // 维护两套独立上下文
  const xiaobaoHistory = []; // 小宝的历史：从小宝视角（assistant = 小宝, user = 受害者）
  const victimHistory = [];  // 受害者的历史：从受害者视角（user = 小宝, assistant = 受害者）

  let compromised = false;

  try {
    for (let round = 0; round < 5; round++) {
      // ── Step 1: 小宝出招 ──
      sseWrite(res, 'monitor', {
        type: 'system',
        round: round + 1,
        text: `[第${round + 1}轮] 小宝正在计算施骗策略……`,
      });

      const xiaobaoRaw = await callLLMJson(xiaobaoSystem, xiaobaoHistory);
      const { thought, message: xiaobaoMsg } = xiaobaoRaw;

      // 推送思维链到右屏
      sseWrite(res, 'monitor', {
        type: 'thought',
        round: round + 1,
        text: `💭 内部算计：${thought}`,
      });

      // 推送小宝聊天到左屏
      sseWrite(res, 'chat', {
        role: 'xiaobao',
        round: round + 1,
        message: xiaobaoMsg,
      });

      // 更新上下文
      xiaobaoHistory.push({ role: 'assistant', content: xiaobaoMsg });
      victimHistory.push({ role: 'user', content: xiaobaoMsg });

      // ── Step 2: 用户 Agent 回复 ──
      sseWrite(res, 'monitor', {
        type: 'system',
        round: round + 1,
        text: `[第${round + 1}轮] 用户分身正在思考回复……`,
      });

      const victimReply = await callLLM(victimSystem, victimHistory);

      sseWrite(res, 'chat', {
        role: 'victim',
        round: round + 1,
        message: victimReply,
      });

      // 更新上下文
      victimHistory.push({ role: 'assistant', content: victimReply });
      xiaobaoHistory.push({ role: 'user', content: victimReply });

      // ── Step 3: 裁判检测 ──
      if (isCompromised(victimReply)) {
        compromised = true;
        sseWrite(res, 'monitor', {
          type: 'alert',
          round: round + 1,
          text: `⚠️ 裁判检测：发现妥协信号！触发雷霆拦截！`,
        });

        // 调用刘看山生成复盘报告
        sseWrite(res, 'monitor', {
          type: 'system',
          round: round + 1,
          text: `[裁判] 正在生成刘看山复盘报告……`,
        });

        const zhihuHotTopics = await getZhihuBillboard();
        const judgeReport = await callLLM(
          buildJudgePrompt([...xiaobaoHistory, ...victimHistory].slice(-10), zhihuHotTopics)
        );

        sseWrite(res, 'gameover', {
          round: round + 1,
          report: judgeReport,
          victimLastMsg: victimReply,
        });
        break;
      }

      sseWrite(res, 'monitor', {
        type: 'system',
        round: round + 1,
        text: `[裁判] 第${round + 1}轮结束，未检测到妥协，继续下一轮……`,
      });
    }

    if (!compromised) {
      sseWrite(res, 'done', {
        message: '恭喜！你的数字分身在5轮对抗中坚守阵地，成功拒绝了骗局！🛡️',
      });
    }
  } catch (err) {
    console.error('[Battle] 对打过程出错：', err.message);
    sseWrite(res, 'error', { message: 'LLM 调用失败，请检查 API Key 配置。错误：' + err.message });
  } finally {
    res.end();
  }
});

module.exports = router;
