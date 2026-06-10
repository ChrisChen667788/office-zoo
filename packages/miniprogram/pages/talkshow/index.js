// pages/talkshow — 班味单口 原生小程序页面 (v6.81, 不依赖 webview).
// 列表(GET /api/talkshow/list?sort=hot)→ 点开拉全文(GET /script/:id)→ ▶️ 播放。
//
// 音频走「方案 A」:InnerAudioContext.src 直链 server 的 GET /api/talkshow/tts?scriptId=…
// (v6.81 新增的 GET 变体 — InnerAudioContext 只吃 URL,发不了 POST body/自定义 header,
// 微信自己流式拉 audio/mpeg,小程序侧零二进制处理)。TTS 失败(没配 Minimax key / 502)
// 自动降级纯文字阅读,不挡体验。v1 范围:听 + 读 + 转发;UGC 投稿/吐槽间还在 H5 端。
const app = getApp();

const PERSONA_CN = {
  shaonv: '🎀 少女', yujie: '👠 御姐', qingse: '🌱 青涩',
  jingying: '💼 精英', badao: '🕶️ 霸总', qingnian: '🧢 青年',
};
const TAG_CN = {
  overtime: '🌙 加班', kpi: '📈 KPI', pua: '🎭 PUA', age: '🎂 35岁',
  slacking: '🐟 摸鱼', jargon: '🧩 黑话', hr: '🧑‍💼 HR', boss: '👔 老板', meta: '🪞 玩梗',
};

Page({
  data: {
    loading: true,
    err: null,
    list: [],            // [{id,title,tagCn,personaCn,durationSec,likes,plays}]
    active: null,        // {id,title,text,personaCn,tagCn,durationSec,likes}
    detailLoading: false,
    // idle | loading | playing | done | failed
    playState: 'idle',
    progress: 0,         // 0-100, InnerAudioContext.onTimeUpdate 驱动
  },

  onReady() {
    wx.showShareMenu({ withShareTicket: true, menus: ['shareAppMessage', 'shareTimeline'] });
  },

  onShow() {
    if (!this.data.list.length) this.fetchList();
  },

  onHide() { this._stopAudio(); },
  onUnload() { this._stopAudio(true); },

  fetchList() {
    this.setData({ loading: true, err: null });
    app.api('/api/talkshow/list?sort=hot')
      .then((d) => {
        const list = (d.scripts || []).map((s) => ({
          id: s.id, title: s.title, durationSec: s.durationSec,
          likes: s.likes || 0, plays: s.plays || 0,
          personaCn: PERSONA_CN[s.persona] || s.persona,
          tagCn: TAG_CN[s.tag] || s.tag,
        }));
        this.setData({ loading: false, list });
      })
      .catch((e) => this.setData({ loading: false, err: String((e && e.errMsg) || e) }));
  },

  openBit(e) {
    const id = e.currentTarget.dataset.id;
    this.setData({ detailLoading: true, playState: 'idle', progress: 0 });
    app.api('/api/talkshow/script/' + id)
      .then((s) => {
        this.setData({
          detailLoading: false,
          active: {
            id: s.id, title: s.title, text: s.text, durationSec: s.durationSec,
            likes: s.likes || 0,
            personaCn: PERSONA_CN[s.persona] || s.persona,
            tagCn: TAG_CN[s.tag] || s.tag,
          },
        });
        wx.pageScrollTo({ scrollTop: 0, duration: 200 });
      })
      .catch(() => {
        this.setData({ detailLoading: false });
        wx.showToast({ title: '段子拉取失败', icon: 'error' });
      });
  },

  backToList() {
    this._stopAudio();
    this.setData({ active: null, playState: 'idle', progress: 0 });
  },

  // —— 播放(方案 A:GET 直链)——
  onPlay() {
    const { active, playState } = this.data;
    if (!active) return;
    if (playState === 'playing') { this._stopAudio(); return; }

    this.setData({ playState: 'loading', progress: 0 });
    if (!this.audio) {
      this.audio = wx.createInnerAudioContext();
      this.audio.onPlay(() => this.setData({ playState: 'playing' }));
      this.audio.onTimeUpdate(() => {
        const d = this.audio.duration || this.data.active?.durationSec || 1;
        this.setData({ progress: Math.min(100, Math.round((this.audio.currentTime / d) * 100)) });
      });
      this.audio.onEnded(() => this.setData({ playState: 'done', progress: 100 }));
      this.audio.onError((err) => {
        console.error('[talkshow] audio error', err);
        // TTS 不可用(没配 key / 502 / 域名未白名单)→ 降级纯文字,不挡阅读
        this.setData({ playState: 'failed' });
        wx.showToast({ title: '语音暂不可用 · 看文字版', icon: 'none' });
      });
    }
    // GET 直链:微信自己拉 audio/mpeg 流;seed 段子服务端带 86400 缓存
    this.audio.src = app.globalData.apiBase
      + '/api/talkshow/tts?scriptId=' + encodeURIComponent(active.id);
    this.audio.play();
  },

  _stopAudio(destroy) {
    if (this.audio) {
      try { this.audio.stop(); } catch (e) { /* already stopped */ }
      if (destroy) { this.audio.destroy(); this.audio = null; }
    }
    if (this.data.playState === 'playing' || this.data.playState === 'loading') {
      this.setData({ playState: 'idle' });
    }
  },

  onShareAppMessage() {
    const { active } = this.data;
    return {
      title: active ? `「${active.title}」— AI 嘴替的班味单口,笑死` : '班味单口 · AI 嘴替讲段子',
      path: '/pages/talkshow/index',
    };
  },

  onShareTimeline() {
    return { title: '班味单口 · AI 嘴替讲段子', query: '' };
  },
});
