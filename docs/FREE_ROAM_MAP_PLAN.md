# Classic 模式自由活动地图 — 下一版设计

## 现状(v0.1)

- 服务端 `GameEngine` 给每个 player 维护 `position: { x, y, room }`,但只在 `randomRoom()` 等关键节点更新房间,中间没有移动过程
- 客户端 `GameMap.tsx` 在 canvas 上 2.5D 等距渲染 10 个房间 + 走廊;玩家根据当前 `position.room` 直接画在房间中心,房间切换会**瞬移**
- 没有"行为可视化"(玩家 in 茶水间 跟 in 服务器机房 看起来一样,只是位置变了)

## 用户期望

> 经典模式下,主角们可以在地图中自由活动,可以看到移动的动画,以及在每个房间做什么,尽可能渲染地美观

具体需求拆解:

1. **自由活动** — 玩家 tick 级别地在房间间移动,而不是事件驱动地瞬移
2. **移动动画** — 切房间时沿走廊曲线插值移动,有过渡感
3. **行为可视化** — 每个房间显示玩家正在做什么(打字 / 喝咖啡 / 开会 / 偷看 etc)
4. **美观渲染** — 整体视觉打磨

## 实现路线图(分 4 个 PR)

### PR 1: 服务端 Tick + Activity 模型

新增 `Activity` 字段 + 周期性 tick:

```ts
// shared/src/types/game.ts
export type Activity =
  | { kind: 'idle' }
  | { kind: 'work'; subject: string }    // "改 PPT" / "debug" / "对齐 OKR"
  | { kind: 'chat'; withId?: string }    // 茶水间闲聊
  | { kind: 'sneak'; targetId?: string } // 资本家蹲点
  | { kind: 'meeting' }                  // 开会(全员会议时)
  | { kind: 'commute' };                 // 在走廊路上

export interface PlayerPosition {
  x: number;
  y: number;
  room: string;
  /** 0..1 — interpolation along corridor when commuting between rooms */
  pathProgress?: number;
  /** Where they're heading (set when commute begins) */
  destination?: string;
}
```

服务端 `GameEngine`:

- 新增 `tick()` 每 1.5s 触发一次(在 `free_roam` phase 内)
- 每个 tick:
  - 30% 概率:玩家选择一个新房间作为 `destination` → 进入 `commute` 状态
  - `commute` 状态下:`pathProgress += 0.25` 每 tick(走廊耗时 ~6s)→ 抵达后切换 `room`
  - 抵达后:基于房间分配 activity(在茶水间→`chat`,服务器机房→`work: debug`,etc)

新增 socket event:`game:tick { players: [{id, position, activity}] }` 频率约 1.5s/次

### PR 2: 客户端动画 + Activity 渲染

- `GameMap.tsx` 用 `requestAnimationFrame` 持续 lerp 玩家位置(从上一次收到的 `position` 平滑过渡到最新)
- 走廊上的玩家用 `pathProgress` 算曲线坐标(贝塞尔或 Catmull-Rom)
- 每个房间右上角小图标(用 iconGen 已生成的 8 种 phase icons 复用 / 新增 8 种 activity icons):
  - 工区 → 程序员🤖打字动画
  - 茶水间 → 咖啡杯 + 气泡聊天
  - 会议室 → PPT
  - HR 办公室 → 文件
  - 老板办公室 → 雪茄 + 高背椅
  - 监控室 → CCTV
  - 服务器机房 → 跳动的指示灯
  - 文印室 → 打印机出纸动画

### PR 3: 美化层

- 房间地板用 noise + dithering shader-like 效果(伪 raycast 灯光)
- 玩家头像用 RoleAvatar 组件统一,圆形剪裁 + 阵营色描边发光
- 房间之间走廊用 glow 渐变,夜晚感
- 全图加一层柔和粒子(灰尘/光晕)
- 当前发言者头像放大 + 房间脉冲光晕

### PR 4: AI 动作叙事

- 服务端给每个 activity 分配文字描述(eg "Frank 在改 PPT 第 18 页"),发到 `game:tick.players[].activityText`
- 客户端 hover 玩家时弹 tooltip 显示 activityText
- 行为日志面板增加"动作"category(跟 speech / kill / vote 并列)

## 工作量预估

- PR 1: 服务端 4-6h(engine tick loop + activity assignment + socket schema)
- PR 2: 客户端 8-12h(canvas animation + activity icons + lerp + bezier)
- PR 3: 美化 6-8h(shader-style canvas + RoleAvatar 替换 + 粒子)
- PR 4: 叙事 2-4h(activity text + tooltip + log)

总计 ~24h 集中开发。建议拆 4 个 PR 并行 review。

## 兼容性保证

- 服务端新增字段全部 optional,旧客户端忽略不会崩
- `game:tick` 是新 event,旧 socket 不订阅就收不到,行为退化为现状(瞬移)
- 性能预算:1.5s/tick × 9 玩家 × ~200B payload = ~9 KB/min(socket 完全可承受)
