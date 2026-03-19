const express = require('express');
const router = express.Router();

/**
 * GET /api/profile
 * 返回当前 session 中存储的用户画像
 * （已在 OAuth 回调时拉取并缓存，此处直接读 session）
 */
router.get('/', (req, res) => {
  if (!req.session.userProfile) {
    return res.status(401).json({ ok: false, message: '未登录' });
  }
  res.json({ ok: true, profile: req.session.userProfile });
});

module.exports = router;
