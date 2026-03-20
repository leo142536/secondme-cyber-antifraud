require('dotenv').config();
const express = require('express');
const cookieParser = require('cookie-parser');
const path = require('path');

const authRouter = require('./routes/auth');
const profileRouter = require('./routes/profile');
const battleRouter = require('./routes/battle');

const app = express();
const PORT = process.env.PORT || 3000;

// 中间件
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(cookieParser(process.env.SESSION_SECRET || 'dev-secret'));

// ── Session 兼容层（读写 cookie，与 req.session 接口保持一致）──
app.use((req, res, next) => {
  // 读取 session cookie
  const raw = req.signedCookies['_sess'];
  try {
    req.session = raw ? JSON.parse(Buffer.from(raw, 'base64').toString()) : {};
  } catch {
    req.session = {};
  }

  // 注入 save 方法，让路由可以调用 req.session.save?.() 保存
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

// 静态文件
app.use(express.static(path.join(__dirname, '../public')));

// 路由
app.use('/api/auth', authRouter);
app.use('/api/profile', profileRouter);
app.use('/api/battle', battleRouter);

// 健康检查
app.get('/api/health', (req, res) => {
  res.json({ ok: true, time: new Date().toISOString() });
});

app.listen(PORT, () => {
  console.log(`\n🎯 局中局：赛博反诈靶场`);
  console.log(`🚀 Server running on http://localhost:${PORT}`);
  console.log(`───────────────────────────────`);
  if (!process.env.SECONDME_CLIENT_ID || process.env.SECONDME_CLIENT_ID === 'your-client-id-here') {
    console.warn(`⚠️  警告：SECONDME_CLIENT_ID 未配置，请填写 .env`);
  }
  if (!process.env.LLM_API_KEY || process.env.LLM_API_KEY === 'your-llm-api-key-here') {
    console.warn(`⚠️  警告：LLM_API_KEY 未配置，请填写 .env`);
  }
});

module.exports = app;
