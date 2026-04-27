/**
 * RoleLegend — toggleable side panel showing all roles grouped by faction.
 *
 * First-time viewers have no idea what "📋 HR总监" does vs "🦊 老油条".
 * A single click on a fixed "角色图鉴" button reveals an indexed reference
 * so they can decode emoji/label pairs while AIs are talking.
 *
 * Data is mode-agnostic — if a role doesn't appear in the current game,
 * showing it here is still useful educational context.
 */
import { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';

interface RoleDef {
  key: string;
  emoji: string;
  label: string;
  ability: string;
}

interface FactionDef {
  name: string;
  icon: string;
  color: string;
  blurb: string;
  roles: RoleDef[];
}

const FACTIONS: FactionDef[] = [
  {
    name: '打工人阵营',
    icon: '👨‍💻',
    color: '#4FC3F7',
    blurb: '白天搬砖、晚上互查,靠投票赶走所有资本家即胜利。',
    roles: [
      { key: 'villager_cat',   emoji: '👨‍💻', label: '普通员工',   ability: '没有特殊技能,纯靠嘴炮和投票自保' },
      { key: 'detective_cat',  emoji: '📋',   label: 'HR总监',     ability: '每晚查一个人的真实身份' },
      { key: 'medic_cat',      emoji: '🛡️',  label: '工会代表',   ability: '每晚保护一个人不被"优化"' },
      { key: 'engineer_cat',   emoji: '💻',   label: '程序员',     ability: 'KPI 效率翻倍,加速任务进度条' },
      { key: 'bodyguard_cat',  emoji: '⚖️',  label: '法务顾问',   ability: '投票被平票时额外加一票' },
      { key: 'medium_cat',     emoji: '🔎',   label: '内审专员',   ability: '可以查出已离职员工的真实身份' },
      { key: 'vigilante_cat',  emoji: '📊',   label: '数据分析师', ability: '整局一次机会直接开除嫌疑人' },
      { key: 'adventurer_cat', emoji: '🏆',   label: '销售冠军',   ability: '第一位完成 KPI 的人,获得特殊发言权' },
      { key: 'mimic_cat',      emoji: '🎒',   label: '实习生',     ability: '可以伪装成其他角色混淆视听' },
      { key: 'politician_cat', emoji: '🦊',   label: '老油条',     ability: '每轮发言可以打断别人一次' },
    ],
  },
  {
    name: '资本家阵营',
    icon: '👔',
    color: '#F44336',
    blurb: '夜间"优化"员工,让打工人数量 ≤ 资本家数量即获胜。',
    roles: [
      { key: 'killer_dog',    emoji: '👔',   label: 'CEO',       ability: '每晚选择一个人"优化"掉' },
      { key: 'spy_dog',       emoji: '📽️', label: 'PPT高手',   ability: '伪装成好同事,发言极具迷惑性' },
      { key: 'morphing_dog',  emoji: '🎭',   label: '甩锅王',     ability: '被投票时可以转嫁给另一个人' },
      { key: 'ninja_dog',     emoji: '🥷',   label: '裁员专家',   ability: '夜间行动不留痕迹' },
      { key: 'hypnotist_dog', emoji: '🌀',   label: 'PUA大师',   ability: '让目标下一轮无法投票' },
      { key: 'bomber_dog',    emoji: '🔥',   label: '内卷狂魔',   ability: '自爆带走最后发言者' },
      { key: 'assassin_dog',  emoji: '🗡️', label: '职场刺客',   ability: '每晚选择一人,次日必死' },
      { key: 'silencer_dog',  emoji: '🤐',   label: '禁言管理',   ability: '让目标下一轮不能发言' },
    ],
  },
  {
    name: '摸鱼阵营',
    icon: '😎',
    color: '#A855F7',
    blurb: '独立小分队,各自有专属胜利条件,一般围绕"活下来"或"搞事情"。',
    roles: [
      { key: 'jester',    emoji: '😎', label: '摆烂达人', ability: '如果被冤枉开除,单独胜利' },
      { key: 'phantom',   emoji: '👻', label: '背锅侠',   ability: '已离职员工的另一种玩法' },
      { key: 'pigeon',    emoji: '🕊️', label: '鸽王',    ability: '不出席会议,靠迷踪获胜' },
      { key: 'lone_wolf', emoji: '🐺', label: '独行侠',   ability: '活到最后两人即获胜' },
      { key: 'lover',     emoji: '💕', label: '办公室恋人', ability: '与配对者共存亡' },
    ],
  },
];

export default function RoleLegend() {
  const [open, setOpen] = useState(false);

  return (
    <>
      {/* Trigger button — fixed on the right edge, low-key */}
      <button
        onClick={() => setOpen(true)}
        aria-label="查看角色图鉴"
        className="fixed right-4 bottom-20 z-40 rounded-full px-3 py-2 text-xs font-bold tracking-wide flex items-center gap-1.5 transition hover:scale-105"
        style={{
          background: 'rgba(15, 14, 46, 0.85)',
          border: '1px solid rgba(47, 184, 255, 0.3)',
          color: 'rgba(47, 184, 255, 0.9)',
          boxShadow: '0 0 12px rgba(47,184,255,0.15)',
          backdropFilter: 'blur(10px)',
        }}
      >
        📖 角色图鉴
      </button>

      <AnimatePresence>
        {open && (
          <>
            {/* Backdrop — dismiss on click */}
            <motion.div
              className="fixed inset-0 z-[900]"
              initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
              onClick={() => setOpen(false)}
              style={{ background: 'rgba(0,0,0,0.5)' }}
            />

            {/* Slide-in drawer from the right */}
            <motion.aside
              className="fixed top-0 right-0 h-full z-[901] overflow-y-auto"
              initial={{ x: '100%' }}
              animate={{ x: 0 }}
              exit={{ x: '100%' }}
              transition={{ type: 'spring', damping: 28, stiffness: 260 }}
              style={{
                width: 'min(420px, 94vw)',
                background: 'linear-gradient(150deg, rgba(10,10,30,0.98) 0%, rgba(15,14,46,0.98) 100%)',
                borderLeft: '1px solid rgba(47, 184, 255, 0.2)',
                boxShadow: '-20px 0 40px rgba(0,0,0,0.5)',
              }}
            >
              <div className="sticky top-0 z-10 flex items-center justify-between px-5 py-4"
                style={{
                  background: 'rgba(10,10,30,0.95)',
                  borderBottom: '1px solid rgba(255,255,255,0.08)',
                  backdropFilter: 'blur(20px)',
                }}>
                <div>
                  <h3 className="text-base font-black"
                    style={{
                      background: 'linear-gradient(135deg, #2fb8ff, #a855f7)',
                      WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent',
                    }}>
                    角色图鉴
                  </h3>
                  <p className="text-[10px] tracking-[0.18em] uppercase text-white/40 mt-0.5">
                    Role Reference
                  </p>
                </div>
                <button
                  onClick={() => setOpen(false)}
                  aria-label="关闭"
                  className="w-8 h-8 rounded-lg flex items-center justify-center text-white/50 hover:text-white hover:bg-white/10 transition"
                >
                  ✕
                </button>
              </div>

              <div className="px-5 py-4 space-y-6">
                {FACTIONS.map((f) => (
                  <section key={f.name}>
                    <header className="flex items-center gap-2 mb-2">
                      <span className="text-xl">{f.icon}</span>
                      <div className="flex-1">
                        <h4 className="text-sm font-bold" style={{ color: f.color }}>
                          {f.name}
                        </h4>
                        <p className="text-[11px] text-white/50 leading-snug">{f.blurb}</p>
                      </div>
                    </header>
                    <ul className="space-y-1.5">
                      {f.roles.map((r) => (
                        <li key={r.key}
                          className="flex gap-2.5 rounded-lg px-2.5 py-2"
                          style={{
                            background: `${f.color}08`,
                            border: `1px solid ${f.color}18`,
                          }}>
                          <span className="text-base shrink-0 w-6 text-center">{r.emoji}</span>
                          <div className="flex-1 min-w-0">
                            <div className="text-xs font-semibold text-white/85">{r.label}</div>
                            <div className="text-[11px] text-white/50 leading-snug">{r.ability}</div>
                          </div>
                        </li>
                      ))}
                    </ul>
                  </section>
                ))}

                <p className="text-center text-[10px] text-white/30 pt-2 pb-4">
                  实际对局只会抽取其中一部分角色上场
                </p>
              </div>
            </motion.aside>
          </>
        )}
      </AnimatePresence>
    </>
  );
}
