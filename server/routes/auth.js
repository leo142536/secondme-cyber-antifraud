const express = require('express');
const axios = require('axios');
const router = express.Router();

const {
  SECONDME_CLIENT_ID,
  SECONDME_CLIENT_SECRET,
  SECONDME_REDIRECT_URI,
  SECONDME_OAUTH_URL,
  SECONDME_API_BASE,
} = process.env;

/**
 * GET /api/auth/login
 * 构造 SecondMe OAuth 授权 URL，重定向用户
 */
router.get('/login', (req, res) => {
  const params = new URLSearchParams({
    client_id: SECONDME_CLIENT_ID,
    redirect_uri: SECONDME_REDIRECT_URI,
    response_type: 'code',
    scope: 'user.info user.info.shades',
    state: 'anti-fraud-battle', // 简单防 CSRF
  });
  // 注意：SECONDME_OAUTH_URL 已含完整路径，直接追加 ? 参数
  const authUrl = `${SECONDME_OAUTH_URL}?${params.toString()}`;
  res.redirect(authUrl);
});

/**
 * GET /api/auth/callback
 * OAuth 授权码回调，交换 token 并拉取用户画像
 */
router.get('/callback', async (req, res) => {
  const { code, error } = req.query;

  if (error || !code) {
    return res.redirect('/?error=' + encodeURIComponent(error || 'no_code'));
  }

  try {
    // 1. 授权码换 token（必须用 form-urlencoded）
    const tokenRes = await axios.post(
      `${SECONDME_API_BASE}/api/oauth/token/code`,
      new URLSearchParams({
        grant_type: 'authorization_code',
        code,
        client_id: SECONDME_CLIENT_ID,
        client_secret: SECONDME_CLIENT_SECRET,
        redirect_uri: SECONDME_REDIRECT_URI,
      }).toString(),
      { headers: { 'Content-Type': 'application/x-www-form-urlencoded' } }
    );

    const tokenData = tokenRes.data;
    if (tokenData.code !== 0 || !tokenData.data?.accessToken) {
      throw new Error('Token exchange failed: ' + JSON.stringify(tokenData));
    }

    const accessToken = tokenData.data.accessToken;

    // 2. 拉取用户基本信息
    const [infoRes, shadesRes] = await Promise.all([
      axios.get(`${SECONDME_API_BASE}/api/secondme/user/info`, {
        headers: { Authorization: `Bearer ${accessToken}` },
      }),
      axios.get(`${SECONDME_API_BASE}/api/secondme/user/shades`, {
        headers: { Authorization: `Bearer ${accessToken}` },
      }).catch(() => ({ data: { data: [] } })), // shades 容错
    ]);

    const userInfo = infoRes.data?.data || {};
    const shades = shadesRes.data?.data || [];

    // 3. 组装用户画像存入 session
    req.session.accessToken = accessToken;
    req.session.userProfile = {
      name: userInfo.nickname || userInfo.name || '神秘用户',
      jobTitle: userInfo.jobTitle || userInfo.title || '',
      selfIntro: userInfo.selfIntro || userInfo.aboutMe || '',
      interests: Array.isArray(shades)
        ? shades.map(s => s.tagName || s.name || s).filter(Boolean).slice(0, 6)
        : [],
    };

    console.log(`[Auth] 用户登录成功：${req.session.userProfile.name}`);
    res.redirect('/battle.html');
  } catch (err) {
    console.error('[Auth] OAuth callback error:', err.message);
    res.redirect('/?error=' + encodeURIComponent('auth_failed'));
  }
});

/**
 * GET /api/auth/me
 * 返回当前登录用户画像（供前端读取）
 */
router.get('/me', (req, res) => {
  if (!req.session.userProfile) {
    return res.status(401).json({ ok: false, message: '未登录' });
  }
  res.json({ ok: true, profile: req.session.userProfile });
});

/**
 * GET /api/auth/logout
 */
router.get('/logout', (req, res) => {
  req.session.destroy();
  res.redirect('/');
});

module.exports = router;
