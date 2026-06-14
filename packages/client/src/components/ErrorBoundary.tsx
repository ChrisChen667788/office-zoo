/**
 * ErrorBoundary — v6.90 — 把对局视图的任何渲染错误兜成「出错了 · 回大厅」,
 * 而不是让整个旁观端白屏卸载(`#root` 清空)。
 *
 * 起因:真机跑双公司局时,某次串了多局状态产生重复 React key,framer-motion 的
 * `AnimatePresence` 抛硬错 → 无 error boundary → 整端白屏。去重(gameStore)堵了那个
 * 具体来源;这道边界是兜底:**任何**组件渲染抛错都降级成可恢复的 fallback。
 *
 * React error boundary 必须是 class 组件(getDerivedStateFromError / componentDidCatch)。
 * fallback 刻意零依赖、纯内联样式 + 原生 <a> —— 出错态下不能再依赖可能也坏了的东西。
 */
import { Component, type ErrorInfo, type ReactNode } from 'react';

interface Props {
  children: ReactNode;
  /** 兜底文案(默认「这局出了点状况」)。 */
  label?: string;
}
interface State {
  hasError: boolean;
  message?: string;
}

export default class ErrorBoundary extends Component<Props, State> {
  state: State = { hasError: false };

  static getDerivedStateFromError(err: unknown): State {
    return { hasError: true, message: err instanceof Error ? err.message : String(err) };
  }

  componentDidCatch(err: Error, info: ErrorInfo) {
    // 留个痕迹便于排查;不上报(旁观端崩溃非关键路径)。
    console.error('[ErrorBoundary] 对局视图渲染崩溃,已兜底:', err, info.componentStack);
  }

  render() {
    if (!this.state.hasError) return this.props.children;
    return (
      <div
        style={{
          position: 'fixed', inset: 0, zIndex: 9999,
          display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
          gap: 18, background: '#050510', color: '#fff', textAlign: 'center', padding: 24,
          fontFamily: '"PingFang SC", "Microsoft YaHei", system-ui, sans-serif',
        }}
      >
        <div style={{ fontSize: 52 }}>🛠️</div>
        <div style={{ fontSize: 20, fontWeight: 800 }}>{this.props.label ?? '这局出了点状况'}</div>
        <div style={{ fontSize: 13, opacity: 0.5, maxWidth: 420 }}>
          画面渲染崩了一下(不影响服务器对局)。回大厅重开一局就好。
        </div>
        <div style={{ display: 'flex', gap: 12, marginTop: 6 }}>
          <a href="/" style={btn('#4c9eff')}>← 回大厅</a>
          <a href="" onClick={(e) => { e.preventDefault(); window.location.reload(); }} style={btn('rgba(255,255,255,0.12)')}>↻ 刷新重试</a>
        </div>
      </div>
    );
  }
}

function btn(bg: string): React.CSSProperties {
  return {
    padding: '10px 20px', borderRadius: 12, fontSize: 14, fontWeight: 700,
    color: '#fff', background: bg, textDecoration: 'none',
    border: '1px solid rgba(255,255,255,0.18)',
  };
}
