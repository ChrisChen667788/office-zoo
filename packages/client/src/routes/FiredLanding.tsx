/**
 * FiredLanding — "裁了么" scenario/difficulty picker.
 *
 * Harmonized with the main Landing page: same bento layout language,
 * same aurora background system, same glass panels, but shifted to
 * the red/amber heat palette that lives in design.ts as the danger/warn
 * pair. No more free-floating saturated orbs.
 */
import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { motion, AnimatePresence } from 'framer-motion';
import { useFiredStore, type PersonalityId } from '../stores/firedStore';
import { useFiredProgress, FIRED_LEVELS, totalStars } from '../stores/firedProgress';
import { SCENARIOS as SHARED_SCENARIOS } from '@furball/shared';
import SfxToggle from '../components/game/SfxToggle';
import { colors } from '../constants/design';

type EntryMode = 'chapters' | 'custom';

interface Personality {
  id: PersonalityId;
  emoji: string;
  title: string;
  description: string;
  color: string;
}

const PERSONALITIES: Personality[] = [
  {
    id: 'rookie',
    emoji: '😊',
    title: '菜鸟 HR',
    description: '刚入行的 HR 小白,话术生硬,容易露出破绽。',
    color: colors.semantic.success,
  },
  {
    id: 'veteran',
    emoji: '😏',
    title: '老油条 HR',
    description: '经验丰富,善打感情牌,软硬兼施。',
    color: colors.semantic.warn,
  },
  {
    id: 'demon',
    emoji: '👿',
    title: '魔鬼 HR',
    description: '心理战大师,威逼利诱,PUA 高手,极难对付。',
    color: colors.semantic.danger,
  },
];

export default function FiredLanding() {
  const navigate = useNavigate();
  const { setScenario, setPersonality, reset } = useFiredStore();
  const { unlockedLevels, stars, lastClearedLevel } = useFiredProgress();

  const [entryMode, setEntryMode] = useState<EntryMode>('chapters');
  const [selectedScenario, setSelectedScenario] = useState<string | null>(null);
  const [selectedPersonality, setSelectedPersonality] = useState<PersonalityId>('veteran');

  const handleStart = () => {
    if (!selectedScenario) return;
    reset();
    setScenario(selectedScenario);
    setPersonality(selectedPersonality);
    navigate('/fired/chat');
  };

  // Launch a level — same flow as custom but driven by the level definition.
  // `level` number is stashed in sessionStorage so FiredResult can call
  // `awardLevel(level, outcome)` after the game ends without re-deriving it.
  const handleStartLevel = (levelNum: number) => {
    const level = FIRED_LEVELS.find((l) => l.level === levelNum);
    if (!level) return;
    if (!unlockedLevels.includes(levelNum)) return;
    reset();
    setScenario(level.scenarioId);
    setPersonality(level.personalityId);
    try { sessionStorage.setItem('office-zoo.active-level', String(levelNum)); } catch { /* noop */ }
    navigate('/fired/chat');
  };

  const activePersonality = PERSONALITIES.find((p) => p.id === selectedPersonality)!;
  const totalEarnedStars = totalStars(stars);
  const maxStars = FIRED_LEVELS.length * 3;

  return (
    <div
      className="relative min-h-screen overflow-hidden noise"
      style={{ background: colors.bg.base }}
    >
      {/* -- Aurora background — heat-tinted ------------------------------ */}
      <div aria-hidden className="pointer-events-none absolute inset-0 overflow-hidden">
        <div
          className="aurora"
          style={{
            top: '-20%',
            left: '-10%',
            width: '60vmax',
            height: '60vmax',
            ['--c' as never]: 'rgba(255, 51, 85, 0.38)',
            opacity: 0.5,
          }}
        />
        <div
          className="aurora"
          style={{
            top: '5%',
            right: '-15%',
            width: '55vmax',
            height: '55vmax',
            ['--c' as never]: 'rgba(255, 138, 76, 0.32)',
            opacity: 0.42,
          }}
        />
        <div
          className="aurora"
          style={{
            bottom: '-25%',
            left: '30%',
            width: '50vmax',
            height: '50vmax',
            ['--c' as never]: 'rgba(255, 184, 76, 0.22)',
            opacity: 0.35,
          }}
        />
        <div
          className="absolute inset-0 grid-dots"
          style={{ opacity: 0.55, maskImage: 'linear-gradient(180deg, black 20%, transparent 100%)' }}
        />
      </div>

      {/* -- Header ------------------------------------------------------- */}
      <header className="relative z-20 flex items-center justify-between px-8 md:px-14 py-6">
        <button
          onClick={() => navigate('/')}
          className="flex items-center gap-2 text-xs tracking-wider text-white/55 hover:text-white transition"
        >
          <span>←</span> 返回首页
        </button>
        <div className="flex items-center gap-3">
          <span className="text-[10px] tracking-[0.28em] uppercase text-white/40 hidden md:inline">
            AI Labor Negotiation
          </span>
          <SfxToggle />
        </div>
      </header>

      {/* -- Main --------------------------------------------------------- */}
      <main className="relative z-10 px-6 md:px-14 pb-20">
        <div className="mx-auto max-w-6xl">
          {/* Hero heading */}
          <motion.div
            className="text-center mb-12"
            initial={{ opacity: 0, y: 24 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.8, ease: [0.22, 1, 0.36, 1] }}
          >
            <div className="inline-flex items-center gap-2 px-3 py-1.5 rounded-full mb-6"
              style={{
                background: 'rgba(255,51,85,0.1)',
                border: '1px solid rgba(255,51,85,0.28)',
              }}
            >
              <span className="w-1.5 h-1.5 rounded-full" style={{ background: '#ff3355', boxShadow: '0 0 10px #ff3355' }} />
              <span className="text-[11px] tracking-[0.2em] uppercase text-white/75">劳动仲裁模拟</span>
            </div>

            <h1
              className="font-black leading-[0.92] tracking-[-0.03em] mb-3"
              style={{ fontSize: 'clamp(3rem, 6.5vw, 5.5rem)' }}
            >
              <span className="text-gradient-heat">裁了么</span>
            </h1>
            <p className="text-white/55 text-sm md:text-base max-w-xl mx-auto leading-relaxed">
              5 关闯关 · 跟 AI HR 斗智斗勇 · 边玩边学劳动法
              <br className="hidden md:block" />
              每关一条法条,通关解锁下一个 BOSS。
            </p>

            {/* Achievement summary chip + mode tabs */}
            <div className="mt-6 flex flex-col items-center gap-4">
              <div
                className="inline-flex items-center gap-3 px-4 py-2 rounded-full"
                style={{
                  background: 'rgba(255,184,76,0.10)',
                  border: '1px solid rgba(255,184,76,0.3)',
                }}
              >
                <span className="text-[15px]" style={{ filter: 'drop-shadow(0 0 6px rgba(255,184,76,0.7))' }}>⭐</span>
                <span className="text-sm font-black tabular-nums" style={{ color: '#ffb84c' }}>
                  {totalEarnedStars} / {maxStars}
                </span>
                <span className="text-[10px] tracking-[0.2em] uppercase text-white/50">总成就</span>
                <span className="w-px h-3 bg-white/15" />
                <span className="text-[11px] text-white/65 font-bold">
                  {lastClearedLevel > 0 ? `已通过第 ${lastClearedLevel} 关` : '尚未通关'}
                </span>
              </div>
              <div
                className="inline-flex p-1 rounded-2xl"
                style={{
                  background: 'rgba(255,255,255,0.04)',
                  border: '1px solid rgba(255,255,255,0.08)',
                }}
              >
                {(['chapters', 'custom'] as EntryMode[]).map((m) => (
                  <button
                    key={m}
                    onClick={() => setEntryMode(m)}
                    className="relative px-4 py-1.5 rounded-xl text-xs font-bold tracking-wide transition"
                    style={{
                      color: entryMode === m ? '#fff' : 'rgba(255,255,255,0.55)',
                      background: entryMode === m
                        ? 'linear-gradient(135deg, #ff3355 0%, #ff8a4c 100%)'
                        : 'transparent',
                      boxShadow: entryMode === m ? '0 4px 14px rgba(255,51,85,0.35)' : 'none',
                    }}
                  >
                    {m === 'chapters' ? '🎯 闯关模式' : '⚙️ 自由练习'}
                  </button>
                ))}
              </div>
            </div>
          </motion.div>

          {/* Chapter mode — 5 progressive HR levels */}
          <AnimatePresence mode="wait">
          {entryMode === 'chapters' && (
          <motion.div
            key="chapters"
            initial={{ opacity: 0, y: 12 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -12 }}
            transition={{ duration: 0.3 }}
            className="space-y-4"
          >
            {FIRED_LEVELS.map((lvl) => {
              const unlocked = unlockedLevels.includes(lvl.level);
              const earned = (stars[lvl.level] ?? 0) as 0 | 1 | 2 | 3;
              return (
                <motion.button
                  key={lvl.level}
                  onClick={() => handleStartLevel(lvl.level)}
                  disabled={!unlocked}
                  whileHover={unlocked ? { y: -2 } : {}}
                  whileTap={unlocked ? { scale: 0.99 } : {}}
                  className="relative overflow-hidden rounded-2xl p-5 md:p-6 w-full text-left flex items-center gap-4 disabled:cursor-not-allowed"
                  style={{
                    background: unlocked
                      ? `linear-gradient(135deg, ${lvl.accent}14 0%, rgba(255,255,255,0.025) 75%)`
                      : 'rgba(255,255,255,0.02)',
                    border: `1px solid ${unlocked ? lvl.accent + '55' : 'rgba(255,255,255,0.06)'}`,
                    opacity: unlocked ? 1 : 0.45,
                    boxShadow: unlocked ? `0 8px 28px ${lvl.accent}22, inset 0 1px 0 rgba(255,255,255,0.06)` : 'inset 0 1px 0 rgba(255,255,255,0.03)',
                  }}
                >
                  {/* Big level badge */}
                  <div
                    className="w-16 h-16 md:w-20 md:h-20 rounded-2xl grid place-items-center text-3xl md:text-4xl shrink-0"
                    style={{
                      background: unlocked
                        ? `linear-gradient(135deg, ${lvl.accent}40 0%, ${lvl.accent}10 100%)`
                        : 'rgba(255,255,255,0.04)',
                      border: `1px solid ${unlocked ? lvl.accent + '66' : 'rgba(255,255,255,0.08)'}`,
                      filter: unlocked ? `drop-shadow(0 0 12px ${lvl.accent}55)` : 'grayscale(0.6)',
                    }}
                  >
                    {unlocked ? lvl.badge : '🔒'}
                  </div>

                  {/* Body */}
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 mb-1">
                      <span
                        className="text-[10px] font-mono tracking-[0.22em] px-2 py-0.5 rounded-full"
                        style={{
                          color: unlocked ? lvl.accent : 'rgba(255,255,255,0.35)',
                          background: unlocked ? `${lvl.accent}15` : 'rgba(255,255,255,0.04)',
                          border: `1px solid ${unlocked ? lvl.accent + '40' : 'rgba(255,255,255,0.06)'}`,
                        }}
                      >
                        LV {lvl.level.toString().padStart(2, '0')}
                      </span>
                      <h3 className="text-lg md:text-xl font-black tracking-tight" style={{ color: unlocked ? '#fff' : 'rgba(255,255,255,0.55)' }}>
                        {lvl.title}
                      </h3>
                    </div>
                    <p className="text-[12px] md:text-[13px] text-white/55 leading-relaxed mb-2">
                      {lvl.subtitle}
                    </p>
                    <p className="text-[11px] text-white/35 italic">
                      📚 {lvl.legalLesson}
                    </p>
                  </div>

                  {/* Stars + CTA */}
                  <div className="flex flex-col items-end gap-2 shrink-0">
                    <div className="flex gap-0.5">
                      {[1, 2, 3].map((i) => (
                        <span
                          key={i}
                          className="text-[15px]"
                          style={{
                            color: i <= earned ? '#ffb84c' : 'rgba(255,255,255,0.18)',
                            filter: i <= earned ? 'drop-shadow(0 0 6px rgba(255,184,76,0.6))' : 'none',
                          }}
                        >
                          ★
                        </span>
                      ))}
                    </div>
                    {unlocked ? (
                      <span
                        className="text-xs font-bold tracking-wide px-3 py-1.5 rounded-lg"
                        style={{
                          background: `${lvl.accent}25`,
                          border: `1px solid ${lvl.accent}55`,
                          color: '#fff',
                        }}
                      >
                        {earned > 0 ? '再战 →' : '挑战 →'}
                      </span>
                    ) : (
                      <span className="text-[10px] text-white/40">
                        通关 LV{lvl.level - 1} 解锁
                      </span>
                    )}
                  </div>
                </motion.button>
              );
            })}
          </motion.div>
          )}
          </AnimatePresence>

          {/* Custom mode — original scenario+personality picker, hidden by default */}
          <AnimatePresence mode="wait">
          {entryMode === 'custom' && (
          <motion.div
            key="custom"
            initial={{ opacity: 0, y: 12 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -12 }}
            transition={{ duration: 0.3 }}
            className="grid grid-cols-1 lg:grid-cols-12 gap-6"
          >
            {/* -- Scenario column (left) ---------------------------------- */}
            <motion.section
              className="lg:col-span-7"
              initial={{ opacity: 0, y: 16 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.6, delay: 0.1 }}
            >
              <div className="flex items-baseline justify-between mb-4">
                <h2 className="text-xs tracking-[0.25em] uppercase text-white/45">
                  <span style={{ color: colors.semantic.danger }}>01</span> · 选择剧本
                </h2>
                <span className="text-[10px] tracking-[0.2em] uppercase text-white/30">
                  {SHARED_SCENARIOS.length} scenarios
                </span>
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                {SHARED_SCENARIOS.map((scenario) => {
                  const active = selectedScenario === scenario.id;
                  return (
                    <motion.button
                      key={scenario.id}
                      onClick={() => setSelectedScenario(scenario.id)}
                      whileHover={{ y: -2 }}
                      whileTap={{ scale: 0.985 }}
                      className="relative overflow-hidden rounded-2xl p-5 text-left transition min-h-[168px]"
                      style={{
                        background: active
                          ? 'linear-gradient(155deg, rgba(255,51,85,0.14) 0%, rgba(255,138,76,0.08) 100%)'
                          : 'rgba(255,255,255,0.025)',
                        border: active
                          ? '1px solid rgba(255,51,85,0.55)'
                          : '1px solid rgba(255,255,255,0.06)',
                        boxShadow: active
                          ? '0 10px 36px rgba(255,51,85,0.2), inset 0 1px 0 rgba(255,255,255,0.06)'
                          : 'inset 0 1px 0 rgba(255,255,255,0.03)',
                      }}
                    >
                      {active && (
                        <motion.div
                          aria-hidden
                          className="absolute -top-12 -right-12 w-36 h-36 rounded-full pointer-events-none"
                          style={{ background: 'radial-gradient(circle, rgba(255,51,85,0.3) 0%, transparent 70%)' }}
                          animate={{ opacity: [0.45, 0.85, 0.45] }}
                          transition={{ duration: 3.2, repeat: Infinity, ease: 'easeInOut' }}
                        />
                      )}
                      <div className="relative z-10">
                        <div className="flex items-start justify-between mb-4">
                          <div
                            className="w-11 h-11 rounded-xl grid place-items-center text-xl"
                            style={{
                              background: active
                                ? 'linear-gradient(135deg, rgba(255,51,85,0.3) 0%, rgba(255,138,76,0.18) 100%)'
                                : 'rgba(255,255,255,0.04)',
                              border: `1px solid ${active ? 'rgba(255,51,85,0.55)' : 'rgba(255,255,255,0.06)'}`,
                            }}
                          >
                            {scenario.emoji}
                          </div>
                          <div className="flex gap-0.5 mt-2">
                            {Array.from({ length: 3 }, (_, i) => (
                              <span
                                key={i}
                                className="text-[11px]"
                                style={{
                                  color: i < scenario.difficulty ? '#ffb84c' : 'rgba(255,255,255,0.18)',
                                  filter: i < scenario.difficulty ? 'drop-shadow(0 0 4px rgba(255,184,76,0.6))' : 'none',
                                }}
                              >
                                ★
                              </span>
                            ))}
                          </div>
                        </div>
                        <h3
                          className="text-base font-bold mb-1.5 tracking-tight"
                          style={{ color: active ? '#fff' : 'rgba(255,255,255,0.82)' }}
                        >
                          {scenario.title}
                        </h3>
                        <p
                          className="text-[12px] leading-relaxed"
                          style={{ color: active ? 'rgba(255,255,255,0.72)' : 'rgba(255,255,255,0.4)' }}
                        >
                          {scenario.description}
                        </p>
                      </div>
                      {active && (
                        <motion.div
                          aria-hidden
                          className="absolute top-4 right-4 w-1.5 h-1.5 rounded-full"
                          style={{ background: '#ff3355', boxShadow: '0 0 10px #ff3355' }}
                          animate={{ opacity: [1, 0.35, 1] }}
                          transition={{ duration: 1.6, repeat: Infinity }}
                        />
                      )}
                    </motion.button>
                  );
                })}
              </div>
            </motion.section>

            {/* -- HR difficulty column (right) ---------------------------- */}
            <motion.section
              className="lg:col-span-5"
              initial={{ opacity: 0, y: 16 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.6, delay: 0.2 }}
            >
              <div className="flex items-baseline justify-between mb-4">
                <h2 className="text-xs tracking-[0.25em] uppercase text-white/45">
                  <span style={{ color: colors.semantic.warn }}>02</span> · HR 难度
                </h2>
                <span className="text-[10px] tracking-[0.2em] uppercase text-white/30">pick your opponent</span>
              </div>
              <div className="flex flex-col gap-3">
                {PERSONALITIES.map((p) => {
                  const active = selectedPersonality === p.id;
                  return (
                    <motion.button
                      key={p.id}
                      onClick={() => setSelectedPersonality(p.id)}
                      whileHover={{ y: -1 }}
                      whileTap={{ scale: 0.985 }}
                      className="relative overflow-hidden rounded-2xl p-4 text-left flex items-center gap-4"
                      style={{
                        background: active ? `${p.color}14` : 'rgba(255,255,255,0.025)',
                        border: `1px solid ${active ? p.color + '66' : 'rgba(255,255,255,0.06)'}`,
                        boxShadow: active
                          ? `0 8px 28px ${p.color}22, inset 0 1px 0 rgba(255,255,255,0.06)`
                          : 'inset 0 1px 0 rgba(255,255,255,0.03)',
                      }}
                    >
                      <div
                        className="w-12 h-12 rounded-xl grid place-items-center text-2xl shrink-0"
                        style={{
                          background: active ? `${p.color}30` : 'rgba(255,255,255,0.04)',
                          border: `1px solid ${active ? p.color + '55' : 'rgba(255,255,255,0.06)'}`,
                        }}
                      >
                        {p.emoji}
                      </div>
                      <div className="flex-1 min-w-0">
                        <div
                          className="font-bold text-sm mb-0.5"
                          style={{ color: active ? '#fff' : 'rgba(255,255,255,0.82)' }}
                        >
                          {p.title}
                        </div>
                        <div
                          className="text-[11px] leading-relaxed"
                          style={{ color: active ? 'rgba(255,255,255,0.7)' : 'rgba(255,255,255,0.4)' }}
                        >
                          {p.description}
                        </div>
                      </div>
                      {active && (
                        <motion.div
                          aria-hidden
                          className="w-1.5 h-1.5 rounded-full shrink-0"
                          style={{ background: p.color, boxShadow: `0 0 10px ${p.color}` }}
                          animate={{ opacity: [1, 0.35, 1] }}
                          transition={{ duration: 1.6, repeat: Infinity }}
                        />
                      )}
                    </motion.button>
                  );
                })}
              </div>

              {/* CTA panel */}
              <div
                className="mt-5 rounded-2xl p-5"
                style={{
                  background: 'linear-gradient(180deg, rgba(255,255,255,0.05) 0%, rgba(255,255,255,0.02) 100%)',
                  border: '1px solid rgba(255,255,255,0.08)',
                }}
              >
                <div className="text-[11px] tracking-[0.2em] uppercase text-white/45 mb-2">准备就绪</div>
                <div className="text-white/85 text-sm mb-4 leading-relaxed">
                  {selectedScenario ? (
                    <>剧本已选 · 对手 <span style={{ color: activePersonality.color }}>{activePersonality.title}</span></>
                  ) : (
                    '先在左侧选一个被优化的剧本。'
                  )}
                </div>
                <motion.button
                  onClick={handleStart}
                  disabled={!selectedScenario}
                  whileHover={selectedScenario ? { scale: 1.015, y: -1 } : {}}
                  whileTap={selectedScenario ? { scale: 0.985 } : {}}
                  className="relative w-full overflow-hidden py-3.5 rounded-xl text-sm font-semibold tracking-wide disabled:opacity-35 disabled:cursor-not-allowed"
                  style={{
                    background: selectedScenario
                      ? 'linear-gradient(135deg, #ff3355 0%, #ff8a4c 100%)'
                      : 'rgba(255,255,255,0.04)',
                    color: '#fff',
                    boxShadow: selectedScenario
                      ? '0 10px 40px rgba(255,51,85,0.35), inset 0 1px 0 rgba(255,255,255,0.18)'
                      : 'none',
                  }}
                >
                  {selectedScenario && (
                    <motion.span
                      aria-hidden
                      className="absolute inset-0 opacity-35"
                      style={{ background: 'linear-gradient(105deg, transparent 35%, rgba(255,255,255,0.55) 50%, transparent 65%)' }}
                      animate={{ x: ['-110%', '210%'] }}
                      transition={{ duration: 2.6, repeat: Infinity, ease: 'easeInOut', repeatDelay: 2.5 }}
                    />
                  )}
                  <span className="relative z-10">
                    {selectedScenario ? '进入谈判室 →' : '选择剧本后解锁'}
                  </span>
                </motion.button>
              </div>
            </motion.section>
          </motion.div>
          )}
          </AnimatePresence>
        </div>
      </main>
    </div>
  );
}
