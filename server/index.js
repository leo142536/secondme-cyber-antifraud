require('dotenv').config();
const express = require('express');
const session = require('express-session');
const path = require('path');

const authRouter = require('./routes/auth');
const profileRouter = require('./routes/profile');
const battleRouter = require('./routes/battle');

const app = express();
const PORT = process.env.PORT || 3000;

// 中间件
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(session({
  secret: process.env.SESSION_SECRET || 'dev-secret',
  resave: false,
  saveUninitialized: false,
  cookie: { maxAge: 24 * 60 * 60 * 1000 }, // 24h
}));

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
