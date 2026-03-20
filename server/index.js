require('dotenv').config();
const express = require('express');
const cookieParser = require('cookie-parser');

const authRouter = require('./routes/auth');
const profileRouter = require('./routes/profile');
const battleRouter = require('./routes/battle');

const app = express();
const PORT = process.env.PORT || 3000;

// 中间件
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(cookieParser(process.env.SESSION_SECRET || 'dev-secret'));

// ── Session 兼容层（读写 signed cookie） ──
app.use((req, res, next) => {
  const raw = req.signedCookies['_sess'];
  try {
    req.session = raw ? JSON.parse(Buffer.from(raw, 'base64').toString()) : {};
  } catch {
    req.session = {};
  }

  res.saveSession = () => {
    const encoded = Buffer.from(JSON.stringify(req.session)).toString('base64');
    res.cookie('_sess', encoded, {
      signed: true,
      httpOnly: true,
      maxAge: 24 * 60 * 60 * 1000,
      sameSite: 'lax',
    });
  };

  next();
});

// 路由
app.use('/api/auth', authRouter);
app.use('/api/profile', profileRouter);
app.use('/api/battle', battleRouter);

// 健康检查
app.get('/api/health', (req, res) => {
  res.json({ ok: true, time: new Date().toISOString() });
});

// 仅本地开发时启动监听
if (process.env.NODE_ENV !== 'production' && !process.env.VERCEL) {
  const path = require('path');
  app.use(express.static(path.join(__dirname, '../public')));

  app.listen(PORT, () => {
    console.log(`\n🎯 局中局：赛博反诈靶场`);
    console.log(`🚀 Server running on http://localhost:${PORT}`);
    if (!process.env.SECONDME_CLIENT_ID || process.env.SECONDME_CLIENT_ID === 'your-client-id-here') {
      console.warn(`⚠️  警告：SECONDME_CLIENT_ID 未配置，请填写 .env`);
    }
    if (!process.env.LLM_API_KEY || process.env.LLM_API_KEY === 'your-llm-api-key-here') {
      console.warn(`⚠️  警告：LLM_API_KEY 未配置，请填写 .env`);
    }
  });
}

// Vercel Serverless 入口
module.exports = app;
