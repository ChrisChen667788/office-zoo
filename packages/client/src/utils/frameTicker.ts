/**
 * frameTicker — v6.169 — 导出视频的逐帧驱动。
 *
 * 原先用 requestAnimationFrame:页面一被切到后台(或预览面板没显示),rAF 就停了,录出来的
 * 画面冻住、声音照走。主线程的 setInterval 在后台也会被限到每秒一次。Worker 里的定时器不受
 * 这类限制,所以用一个内联 Worker 按 fps 发消息,主线程收到就画一帧;Worker 建不起来
 * (例如 CSP 不允许 blob: worker)时退回 setInterval。返回停止函数。
 */
export function startFrameTicker(fps: number, onTick: () => void): () => void {
  const interval = Math.max(5, Math.round(1000 / fps));
  try {
    const src = `const id=setInterval(()=>postMessage(0),${interval});onmessage=()=>{clearInterval(id);close();};`;
    const url = URL.createObjectURL(new Blob([src], { type: 'text/javascript' }));
    const worker = new Worker(url);
    // Worker 脚本是异步加载的,立刻 revoke 可能让个别浏览器加载失败;稍后再释放。
    setTimeout(() => URL.revokeObjectURL(url), 10_000);
    worker.onmessage = () => onTick();
    return () => {
      try { worker.postMessage('stop'); } catch { /* 已终止 */ }
      worker.terminate();
    };
  } catch {
    const id = setInterval(onTick, interval);
    return () => clearInterval(id);
  }
}
