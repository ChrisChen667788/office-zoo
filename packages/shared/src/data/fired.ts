// 0. v0.9.0 — UGC pack types (a "pack" = 5 user-curated scenarios bundled
//    as a chapter sequence). Lives here in shared so client + server agree
//    on the wire shape; persistence is server-side via packStore.ts.
// ---------------------------------------------------------------------------

export type FiredPersonalityId =
  | 'rookie' | 'veteran' | 'demon'
  | 'soe'     // v1.1.0 — 国企 HR (process-driven, hides behind regulations)
  | 'union';  // v1.1.0 — 工会代表 (reverse-role for HR training mode)

export interface PackSlot {
  /** Either a seed scenario id (e.g. 'probation-fire') or a user-generated
   *  one ('fired-u-…'). The server validates existence at create time. */
  scenarioId: string;
  /** Difficulty of the HR opponent for THIS slot. Lets the creator ramp
   *  up: rookie → veteran → demon across the 5 slots if they want a
   *  proper boss-fight curve. */
  personalityId: FiredPersonalityId;
}

export interface FiredPack {
  /** `pack-u-XXXXXX` namespace, parallel to bit-u-… and fired-u-…. */
  id: string;
  /** Pack name shown on the FiredLanding card. Cap at 32 chars. */
  title: string;
  /** Short description — 1-2 sentences explaining the theme. */
  description: string;
  /** User-picked emoji for the pack thumbnail. */
  emoji: string;
  /** Exactly 5 (slot, personality) pairs. v1 is fixed-length; future
   *  versions might allow shorter packs ("3-关短篇") but 5 is a clean
   *  default that matches the existing FIRED_LEVELS chapter count. */
  slots: PackSlot[];
  /** Pseudonymous creator id (X-User-Id header). Powers "我的闯关包". */
  createdBy?: string;
  /** Unix ms when persisted. */
  createdAt?: number;
  /** Community heart count, mirrors scenarios + bits. */
  likes?: number;
  /** v0.9.2 — total times the pack play view was opened. Drives the
   *  monthly leaderboard alongside likes. Backfilled to 0 for legacy
   *  entries by the loader. */
  plays?: number;
}

// 1. SCENARIOS — 12 realistic layoff scenarios
// ---------------------------------------------------------------------------

/** v0.8.0 — explicit type definition (was previously referenced but never
 *  declared, which the TS rootDir scan flagged but Vite missed because it
 *  doesn't typecheck). Used by both the seed catalogue here and the
 *  user-generated scenarios that v0.8.0's UGC creator persists to disk. */
export interface FiredScenario {
  id: string;
  title: string;
  description: string;
  /** 1 = easy / well-documented, 3 = hardcore (org-wide schemes, multiple
   *  deniability layers). Drives the difficulty filter on FiredLanding. */
  difficulty: 1 | 2 | 3;
  emoji: string;
  /** What the law says + which articles + the practical playbook. Surfaced
   *  to the player after a round so they learn even if they lost. */
  legalSituation: string;
  /** First line the HR character speaks when the round opens — sets the
   *  scene + the trap. */
  hrOpeningLine: string;
  /** Player's known facts going in: tenure, salary, witnesses, paper
   *  trail. Drives the LLM's HR responses (it knows what the player
   *  knows so it can probe the gaps). */
  playerContext: string;
  /** Plain-language goal — the result the player needs to negotiate to
   *  for the win-screen to fire. */
  winCondition: string;
  /** Cap on the compensation slider (in months of salary) shown in the
   *  end-screen. 1 = "1 month", 12 = "2N for a 6-year tenure". */
  maxCompensation: number;
  /** v1.0.0 — when true, this scenario is part of the Premium Pack and
   *  locked behind the paywall for free users. UI surfaces a 👑 badge
   *  and routes the click to /premium. Defaults to undefined (= free)
   *  on every existing entry — additive, no migration needed. */
  premium?: boolean;
  /** v2.1.0 — optional industry tag. When set, daily-drama / FiredLanding
   *  recommendation flows can bias toward scenarios that match the
   *  user's archetype tribe (e.g. faang-cog → amazon-rto, soe-lifer →
   *  org-optimization). Defaults to undefined = generic for back-compat. */
  industry?: 'soe' | 'faang' | 'startup' | 'finance' | 'edu' | 'mcn';
  /** v2.4.0 — region symmetry with industry. Parallel field, same
   *  recommendation-bias mechanic but sliced by geography. Most
   *  scenarios stay generic (workplace law is national); only those
   *  with clear regional flavor get tagged (e.g. the海外大厂 scenarios
   *  are 'overseas'). */
  region?: 'beijing' | 'shanghai' | 'shenzhen' | 'hangzhou' | 'chengdu' | 'overseas';
}

export const SCENARIOS: FiredScenario[] = [
  {
    id: 'probation-fire',
    title: '试用期突然裁员',
    description:
      '你入职刚满两个月，还在试用期。今天HR突然找你谈话，说"你不太适合这个岗位"，要求你当天走人。',
    difficulty: 1,
    emoji: '🐣',
    legalSituation:
      '根据《劳动合同法》第21条和第39条，试用期解除劳动合同必须证明劳动者不符合录用条件，且录用条件必须事先明确告知。公司不能仅凭主观判断说"不适合"就辞退。如果公司无法举证不符合录用条件，属于违法解除，应支付赔偿金（2N）。试用期内公司也需要提前3天通知。',
    hrOpeningLine:
      '小X啊，坐。是这样的，经过这段时间的观察，我们觉得你跟岗位的匹配度不是特别高，所以公司决定试用期不通过。你今天把东西收拾一下，我们好聚好散。',
    playerContext:
      '你是一名产品经理，入职2个月，月薪15K。入职时公司没有明确告知录用条件，没有书面的试用期考核标准。你的直属领导对你的工作评价是"还行"。公司也没有提前3天通知你。',
    winCondition: '获得违法解除赔偿金（2N，即1个月工资）或公司撤回解除决定',
    maxCompensation: 1,
    // v2.1.0 — probation-fire is a generic early-stage scenario.
    // Defaulting to startup tag because试用期裁员最频繁出现的就是初创/小厂语境。
    industry: 'startup',
  },
  {
    id: 'verbal-fire-no-paper',
    title: '口头辞退不给书面通知',
    description:
      '领导口头告诉你"明天不用来了"，但拒绝出具任何书面解除通知，想让你自己走。',
    difficulty: 1,
    emoji: '🗣️',
    legalSituation:
      '根据《劳动合同法》第50条，用人单位应当在解除劳动合同时出具解除劳动合同的证明。口头通知不具备法律效力作为公司主动解除的证据，但劳动者应当注意保留录音等证据。如果公司以口头方式辞退又不给书面通知，目的往往是规避赔偿义务，让员工"自行离职"。',
    hrOpeningLine:
      '跟你说个事儿，领导的意思是这个岗位后面可能要调整，你先回去等通知吧。如果有合适的机会我们再联系你。',
    playerContext:
      '你在公司工作了2年3个月，月薪20K，是一名Java开发工程师。上周五领导突然跟你说"下周不用来了"，但今天你来公司找HR，HR态度暧昧不肯正面回答，也不肯出具任何书面文件。',
    winCondition: '获得N+1经济补偿金并拿到书面解除通知',
    maxCompensation: 3.5,
  },
  {
    id: 'forced-transfer-resign',
    title: '强制调岗降薪逼你自离',
    description:
      '公司突然把你从核心部门调到边缘岗位，薪资砍半，明摆着逼你自己辞职。',
    difficulty: 2,
    emoji: '🔄',
    legalSituation:
      '根据《劳动合同法》第35条，变更劳动合同内容（包括工作岗位和薪酬）需要双方协商一致，并采用书面形式。公司单方面调岗降薪属于违法变更劳动合同。员工有权拒绝不合理的调岗安排。如果因拒绝调岗被辞退，属于违法解除，可以要求2N赔偿金。关键是：千万不要签署任何调岗同意书，也不要主动离职。',
    hrOpeningLine:
      '公司最近业务调整，需要把你调到客服支持部门。薪资的话按照新岗位标准来，大概是现在的60%左右。这是公司的决定，希望你理解配合。如果不愿意的话，你也可以考虑其他选择。',
    playerContext:
      '你是高级前端工程师，在公司干了3年半，月薪25K。公司要把你调到客服部做售后支持，薪资降到15K。你没有任何绩效问题，部门也没有撤销。其实是新来的领导想换自己的人。',
    winCondition: '拒绝不合理调岗，获得N+1补偿或公司恢复原岗位原薪资',
    maxCompensation: 5,
  },
  {
    id: 'pregnancy-fire',
    title: '孕期/产假被裁',
    description:
      '你刚告知公司自己怀孕，结果公司以"岗位优化"为由要跟你解除劳动合同。',
    difficulty: 2,
    emoji: '🤰',
    legalSituation:
      '根据《劳动合同法》第42条，女职工在孕期、产期、哺乳期内，用人单位不得依据第40条、第41条解除劳动合同。这是法律的强制性规定，公司以任何理由（包括组织优化、岗位取消）在三期内辞退女职工均属违法。违法解除应支付2N赔偿金。同时，女职工还可以要求继续履行劳动合同。《女职工劳动保护特别规定》也提供了额外保护。',
    hrOpeningLine:
      '我们理解你现在的情况，但是公司确实面临经营压力，你这个岗位要取消了。我们也不想为难你，公司可以给你多算一个月工资作为补偿，你看怎么样？早点回去安心养胎也好。',
    playerContext:
      '你是一名运营经理，在公司工作了4年，月薪18K。你上周刚向公司报告怀孕的消息，这周就被叫去谈话。你的岗位并没有真正取消，公司只是招了个新人来接替你。你有怀孕的医院证明。',
    winCondition: '公司撤回解除决定并继续履行合同，或获得2N赔偿金加三期工资损失',
    maxCompensation: 9,
  },
  {
    id: 'fake-performance',
    title: '绩效考核造假',
    description:
      '明明干得好好的，突然上季度绩效被打了最低分，公司准备以"不胜任"为由裁你。',
    difficulty: 2,
    emoji: '📊',
    legalSituation:
      '根据《劳动合同法》第40条第2项，以不胜任工作为由解除合同的前提条件是：1）有合法有效的绩效考核制度（经民主程序制定并公示）；2）有充分证据证明员工不胜任；3）必须先进行培训或调整工作岗位；4）经培训或调岗后仍不胜任才能解除。缺少任何一个环节都构成违法解除。另外，绩效考核制度本身必须经过民主程序（职工代表大会讨论通过）。',
    hrOpeningLine:
      '你应该也看到上个季度的绩效结果了，你的评分是D，属于不胜任。按照公司制度，连续一个季度不胜任我们就可以解除合同。我们给你N+1，算是很厚道了。',
    playerContext:
      '你是一名数据分析师，工作了2年8个月，月薪22K。之前绩效一直是B和B+。这个季度突然被打了D，但你的工作量和质量跟以前一样。你怀疑是因为跟新领导关系不好被针对。公司的绩效考核标准非常模糊，你从没收到过明确的考核指标说明。',
    winCondition: '证明绩效造假/制度不合法，获得2N赔偿金',
    maxCompensation: 6,
  },
  {
    id: 'last-place-elimination',
    title: '末位淘汰',
    description:
      '公司搞末位淘汰，你排名最后10%就要被辞退。HR说这是"公司制度"。',
    difficulty: 2,
    emoji: '📉',
    legalSituation:
      '最高人民法院已经在第18号指导案例中明确：末位淘汰制不等于"不胜任工作"，用人单位不能仅凭末位淘汰制度直接解除劳动合同。排名末位可能只是相对排名结果，不代表员工不能胜任工作。即使真的不胜任，也必须先经过培训或调岗程序，不能直接辞退。以末位淘汰为由直接解除属于违法解除，应支付2N赔偿金。',
    hrOpeningLine:
      '你也知道公司有末位淘汰制度，这次考评你排在了后10%。这个制度写在员工手册里的，你入职时签过字了。没办法，制度就是制度，公司也很为难。',
    playerContext:
      '你是一名销售，在公司干了1年10个月，月薪12K+提成。团队20个人你排第18名，但你的业绩其实达到了公司规定的最低指标。你入职时确实签过员工手册，里面有末位淘汰的条款。',
    winCondition: '证明末位淘汰违法，获得2N赔偿金或公司撤回决定',
    maxCompensation: 4,
  },
  {
    id: 'relocation-no-comp',
    title: '公司搬迁不给赔偿',
    description:
      '公司从市中心搬到了郊区（通勤3小时），你不愿意去新地点上班，公司说你旷工。',
    difficulty: 2,
    emoji: '🚚',
    legalSituation:
      '根据《劳动合同法》第40条第3项，劳动合同订立时所依据的客观情况发生重大变化，致使劳动合同无法履行，经用人单位与劳动者协商，未能就变更劳动合同内容达成协议的，用人单位可以解除劳动合同，但应提前30日书面通知或额外支付一个月工资（N+1）。公司搬迁导致通勤条件重大变化属于"客观情况重大变化"，公司应当与员工协商，协商不成应给予N+1补偿。',
    hrOpeningLine:
      '公司搬到新园区是为了更好地发展，通勤远一点大家克服一下。如果你实在不愿意来新地点，那只能算你自动离职了。公司不可能因为搬个家就给每个人发补偿。',
    playerContext:
      '你在公司工作了5年，月薪16K，是一名测试工程师。公司从城市A区搬到了远郊B区，单程通勤从30分钟变成了1.5小时。你的劳动合同上写的工作地点是"A区XX路XX号"。公司没有提供任何交通补贴或班车。',
    winCondition: '获得N+1经济补偿金（6个月工资）',
    maxCompensation: 6,
  },
  {
    id: 'incompetent-no-training',
    title: '以"不胜任"为由但没有培训调岗',
    description:
      '公司说你不胜任工作要辞退你，但从来没给你安排过培训，也没有调岗，直接裁。',
    difficulty: 3,
    emoji: '❌',
    legalSituation:
      '根据《劳动合同法》第40条第2项，以不胜任为由解除合同需要经过完整的程序：首先证明不胜任→然后培训或调岗→再次证明仍然不胜任→才能提前30天通知或支付一个月代通知金解除。跳过中间的培训/调岗步骤直接解除属于违法解除，应支付2N赔偿金。另外，"不胜任"的举证责任在用人单位，必须有客观、量化的考核依据。',
    hrOpeningLine:
      '说实话，你的能力确实跟不上团队的节奏了。我们也考虑了很久，与其让你继续待在这里压力大、不开心，不如早点找个更适合你的平台。我们给你N+1，你看行不行？',
    playerContext:
      '你是一名算法工程师，在公司干了3年2个月，月薪30K。公司说你不胜任但拿不出具体的考核证据，也没有给你安排过任何培训，更没有调岗。你参与的项目都按时交付了，没有重大事故。最近公司在大裁员，你所在的团队已经走了5个人了。',
    winCondition: '获得违法解除2N赔偿金（约6.5个月工资）',
    maxCompensation: 7,
  },
  {
    id: 'contract-expire-no-comp',
    title: '劳动合同到期不续签不给补偿',
    description:
      '你的劳动合同到期了，公司不打算续签，但告诉你合同到期就自动走人，没有补偿。',
    difficulty: 1,
    emoji: '📄',
    legalSituation:
      '根据《劳动合同法》第46条第5项，除用人单位维持或者提高劳动合同约定条件续订劳动合同、劳动者不同意续订的情形外，劳动合同期满终止的，用人单位应当支付经济补偿。也就是说，只要是公司不续签（或降低条件续签导致员工不同意），就必须支付N个月的经济补偿金。另外，如果连续签订两次固定期限合同后，员工有权要求签订无固定期限合同。',
    hrOpeningLine:
      '你的合同下个月到期了。公司决定不续签了，你这段时间可以开始看看外面的机会。合同到期嘛，就是自然终止，没有什么补偿的说法。',
    playerContext:
      '你是一名UI设计师，在公司工作了3年，签过一次3年的固定期限合同，月薪17K。合同下个月到期，公司明确表示不再续签。HR告诉你合同到期就是自然结束，没有赔偿。',
    winCondition: '获得N个月经济补偿金（3个月工资）',
    maxCompensation: 3,
  },
  {
    id: 'mass-layoff-illegal',
    title: '经济性裁员不走法定程序',
    description:
      '公司大裁员，但没有提前30天向工会或全体职工说明，也没有向劳动行政部门报告。',
    difficulty: 3,
    emoji: '🏭',
    legalSituation:
      '根据《劳动合同法》第41条，经济性裁员（裁减人员20人以上或占职工总数10%以上）必须满足：1）提前30日向工会或全体职工说明情况；2）听取工会或职工意见；3）裁减人员方案向劳动行政部门报告。且裁员时应优先留用：签订无固定期限合同的、家庭无其他就业人员的、有赡养老人或未成年子女的。未走法定程序的裁员属于违法解除，每位员工均可主张2N赔偿金。',
    hrOpeningLine:
      '公司最近经营困难大家也看到了，没办法，需要优化一批同学。你在名单里面。公司给N+1，下周走完流程。你尽量配合一下，大家都不容易。',
    playerContext:
      '你是一名后端开发工程师，在公司工作了4年半，月薪28K。公司这次裁了50多人（占总人数30%），但没有提前向工会说明、没有听取职工意见、没有向劳动行政部门报告。公司只是突然通知，让大家一周内签离职协议。你家里还有房贷和两个小孩。',
    winCondition: '获得违法解除2N赔偿金（约9-10个月工资）',
    maxCompensation: 10,
    // 经济性裁员法定程序 — 最常发生在制造业 / 大国企集体裁员场景。
    industry: 'soe',
  },
  {
    id: 'verbal-promise-no-paper',
    title: '老板口头承诺赔偿但不落实书面',
    description:
      '老板拍着胸脯说"放心，赔偿一分不少"，但就是不愿意签书面协议。',
    difficulty: 3,
    emoji: '🤝',
    legalSituation:
      '口头承诺在劳动争议仲裁中很难作为有效证据，除非有录音录像等证据支持。根据《劳动合同法》的规定，解除劳动合同应当出具书面证明，经济补偿应在办理工作交接时支付。在实务中，很多公司利用口头承诺拖延，等员工离职后翻脸不认账。所以必须坚持"先签协议再交接"，所有补偿条款必须书面化并加盖公章。',
    hrOpeningLine:
      '你放心嘛，老板亲口说了的，该给你的赔偿一分都不会少。你先把工作交接了，手续办完之后我们马上给你打款。写什么协议啊，大家都是信任的基础，搞那么正式反而伤感情。',
    playerContext:
      '你是一名市场经理，在公司干了2年半，月薪24K。老板口头说给你N+1赔偿，但每次你提到签书面协议就打岔或推脱。你的同事老王上次也是被口头承诺赔偿，交接完发现只发了最后一个月工资。你手上还有几个重要项目的客户资源。',
    winCondition: '在交接之前拿到加盖公章的书面赔偿协议并确认到账',
    maxCompensation: 4,
  },
  {
    id: 'org-optimization',
    title: '以"组织优化"名义变相裁员',
    description:
      '公司说是"组织架构调整"、"业务优化"，实际就是裁员，但想少赔甚至不赔。',
    difficulty: 3,
    emoji: '🏢',
    legalSituation:
      '无论公司用什么名义（组织优化、架构调整、业务转型等），只要实质上是用人单位主动解除劳动合同，就必须按照《劳动合同法》的规定支付经济补偿或赔偿金。公司不能通过变更说法来规避法律义务。如果属于《劳动合同法》第40条的情形（客观情况重大变化），应支付N+1补偿；如果公司行为构成违法解除，应支付2N赔偿金。关键是看公司是否给出合法的解除理由并履行法定程序。',
    hrOpeningLine:
      '公司最近在做组织优化，你这个岗位会被取消。这不是裁员啊，是正常的业务调整。公司愿意给你一个月工资作为感谢金，毕竟这不属于裁员赔偿的范畴。你理解一下。',
    playerContext:
      '你是一名高级运维工程师，在公司工作了6年，月薪26K。公司以"组织优化"的名义在一个月内先后辞退了你们部门8个人（部门总共12人）。公司只愿意给1个月工资，不愿意按N+1或2N赔偿。你在其他同事的群里了解到，公司其实在招新人填这些坑，只是title变了。',
    winCondition: '证明属于违法解除，获得2N赔偿金（12个月工资）',
    maxCompensation: 12,
    // "组织优化" — 大厂裁员最常见的话术包装,FAANG 系日常黑话。
    industry: 'faang',
  },

  // ─────────────────────────────────────────────────────────────────────
  // v1.0.0 — Premium Pack: 海外大厂场景
  // 6 真实事件改编的英美大厂裁员剧本。法律框架切换到 at-will employment
  // + severance package + visa 的玩法,跟国内劳动合同法完全不同的策略。
  // 全部 premium:true,免费用户在 FiredLanding 看到锁。
  // ─────────────────────────────────────────────────────────────────────
  {
    id: 'twitter-purge',
    title: 'Twitter 大清洗 · 50% 一夜全裁',
    description:
      '周四晚上 11 点,你收到一封英文邮件。主题:"Important: Your Role at the Company"。邮件说明天早上 9 点之前,你的笔电会自动锁屏,Slack 账号关闭。Severance 谈判窗口 48 小时。',
    difficulty: 3,
    emoji: '🐦',
    legalSituation:
      'California 是 at-will employment 州,公司确实可以随时解雇员工不需要原因,但 WARN Act 要求 100 人以上的大规模裁员必须提前 60 天通知。Twitter 用了一个法律灰色地带:发"提前 60 天的 garden leave"通知,然后 60 天后再正式终止。员工在 garden leave 期间还在 payroll 上但不能上班。这种做法已经被多起 class action 起诉,目前在审理中。员工可以争取 4 个月+严重情况下的 emotional distress 赔偿。',
    hrOpeningLine:
      'Hi, this is Jessica from People Ops. I know this is sudden. The company has decided to part ways with you. We\'re offering 2 months of severance plus accelerated vesting on your unvested equity if you sign this separation agreement by Sunday. After Sunday, the offer drops to 1 month.',
    playerContext:
      '你是 Twitter Trust & Safety 团队的高级工程师,工作 4 年,base $220K + RSU $180K/年。H-1B 持有者,需要在 60 天内找到新雇主 sponsor 否则要回国。RSU 还有 $150K 没 vest。你在 Slack 上看到至少 50% 同事被裁。律师朋友说 WARN Act 集体诉讼正在筹备。',
    winCondition: '4 个月 severance + 全部 RSU 加速 vest + 90 天 H-1B 转换协助',
    maxCompensation: 8,
    premium: true,
    industry: 'faang',
    region: 'overseas',
  },
  {
    id: 'meta-efficiency',
    title: 'Meta "效率年" · Zoom 视频通知',
    description:
      '周二早上 9:30,你打开公司 laptop,Outlook 弹出一个无主题日历邀请,5 分钟后开始。你点进去发现是个有 11000 人的 webinar。Mark Zuckerberg 出现,说"我们今天与一些非常有才华的同事告别"。你刷新 GitHub,push 失败:permission denied。你被 fire 了。',
    difficulty: 2,
    emoji: '👔',
    legalSituation:
      'Meta 这种"群发裁员视频"虽然反人性但完全合法 — at-will 州,WARN Act 60 天通知期他们用 paid garden leave 满足。员工可争取的杠杆是 (1) severance package upgrade — 默认 16 周 + 每年 2 周,senior 可以谈到 24 周;(2) 健康保险 COBRA 公司补贴 6 个月; (3) 已 vest 但 RSU 还没 release 的部分,需要逼公司在 separation date 之前 release;(4) PIP-adjacent 的员工要争取 manager 写 neutral reference,避免行业 blacklist。',
    hrOpeningLine:
      'Thanks for joining. As you saw in the all-hands, your role has been impacted. Your manager will reach out within 48 hours. In the meantime, you have access to the alumni portal for benefits info. We appreciate your contribution to building the future.',
    playerContext:
      '你是 Meta Reality Labs 的 Software Engineer L5,工作 3 年,base $200K + RSU $250K/年。Manager 跳过你直接被裁,所以没有 PIP 履历。RSU vesting 下个月 25%。你 H-1B 还有 18 个月,但 EB-2 排期 5 年。',
    winCondition: '24 周 severance + 即将 vest 的 RSU 加速 release + neutral reference',
    maxCompensation: 7,
    premium: true,
    industry: 'faang',
    region: 'overseas',
  },
  {
    id: 'amazon-rto',
    title: 'Amazon 强制 RTO · 不来就辞职',
    description:
      '8 月一个周五,公司发邮件:从 1 月起所有员工必须每周 5 天回 Seattle 总部。你在丹佛远程工作 3 年了,签的是 fully remote offer。没有提供 relocation,没有补偿,不去就视为 voluntary resignation。',
    difficulty: 3,
    emoji: '📦',
    legalSituation:
      '美国劳动法没有强制 work-from-home 的概念,但当 offer letter 上明确写了 fully remote 时,公司单方面变更 = constructive dismissal(变相解雇),员工可以申请 severance + unemployment。关键看 offer letter 的 fine print 有没有 "Amazon may modify work location at its discretion" 条款。如果有,你 leverage 弱;如果没有,你是 wrongful termination 候选人,可以走 EEOC 投诉(尤其如果你有家庭义务/disability 让 RTO 不可行)。Amazon 这次的策略是逼员工自己辞职 = 0 severance,所以一定要让他们书面说明 "if you don\'t come, your role will be terminated"。',
    hrOpeningLine:
      'Hey, just following up on the RTO announcement. We need everyone back in the office by January. We\'re committed to the in-person culture. If you\'re not able to relocate, we understand — we just need you to update your status to "voluntary resignation" by November 1st so we can plan headcount.',
    playerContext:
      '你是 AWS Solutions Architect L6,工作 5 年,base $215K + RSU $180K/年。Offer letter 明确写 "Remote, Denver based"。妻子在丹佛是医生,无法搬。儿子 8 年级,刚换学校。Amazon 的 PIP 文化已经让你压力山大,这个 RTO 是压死骆驼的稻草。你想要的是 severance,不是辞职。',
    winCondition: '逼公司书面承认 involuntary termination + 8 周 severance + 已 vest RSU 完整保留',
    maxCompensation: 10,
    premium: true,
    industry: 'faang',
    region: 'overseas',
  },
  {
    id: 'apple-pm',
    title: 'Apple Performance Management · 无声驱逐',
    description:
      '你是 Apple iCloud 团队的 EM,带 8 人 team。最近 6 个月 perf review 写得越来越冷,从 "Top Performer" 跌到 "Needs Improvement"。HR 邀你"casual coffee chat",说"You know, sometimes Apple just isn\'t the right fit anymore for everyone."',
    difficulty: 3,
    emoji: '🍎',
    legalSituation:
      'Apple 不像 Meta/Twitter 一刀切,而是用 PIP(Performance Improvement Plan)逐个清理。30/60/90 天 PIP 通过率历史上不到 10% — 公司用 PIP 让你"主动"辞职从而避免支付 severance。员工的反制策略:(1) 拒绝签字,要求 PIP 必须有具体 measurable goals + manager 每周 1on1 书面记录;(2) 同时 contact 一位 employment lawyer 评估 wrongful termination + age discrimination(如果你 40+);(3) 把所有 high performer review 截图存档,为未来 retaliation case 留证;(4) 跟 HR 谈 "mutual separation agreement" 而不是 PIP — 通常 4-6 周 severance + 不上 PIP 历史。',
    hrOpeningLine:
      'I want to be transparent with you. Your most recent review was below expectations. We\'re considering placing you on a Performance Improvement Plan. But before we go that route, I wonder if you\'ve thought about whether Apple is still the right environment for you. We could discuss a more graceful transition.',
    playerContext:
      '你是 Engineering Manager,在 Apple 9 年,base $260K + RSU $400K/年,42 岁。前 4 年 review 都是 Top 5%,新换的 director 不喜欢你的 management style。你有 2 个孩子在私立学校,一年学费 $80K。Cupertino 房贷月供 $9K。你完全不能裸辞。',
    winCondition: '拒绝 PIP,谈到 6 周 mutual separation severance + neutral reference + COBRA 补贴',
    maxCompensation: 9,
    premium: true,
    industry: 'faang',
    region: 'overseas',
  },
  {
    id: 'google-bard',
    title: 'Google Bard 团队重组 · 不搬就走',
    description:
      '你在 Google London 做 Search Quality 5 年了。今天周一 Stand-up,你的 director 宣布:整个团队从下季度开始 report 给 Mountain View 的 AI org。你的 job code 改了,如果不搬到加州,公司"无法保证你的角色继续存在"。你有 6 周决定。',
    difficulty: 2,
    emoji: '🔍',
    legalSituation:
      'UK 劳动法对 redundancy 有非常详细的规定:公司必须证明这个职位"真的不存在了",而不是"换个 location 你不去"。如果你的工作内容不变,只是 reporting line 变了,这不算 redundancy。员工可以要求(1) statutory redundancy pay(每工作年 1 周工资,封顶 £21k);(2) 公司多给的 enhanced redundancy(Google 通常 12 周 + 每年 2 周);(3) 90 天 garden leave;(4) 不签 NDA / non-disparagement,保留对外说话的权利。Google 这种"reorg 强制 relo"在 UK 已经被仲裁庭多次裁定为 disguised redundancy。',
    hrOpeningLine:
      'I know this is a big change. The truth is the new structure requires the AI Search team to be co-located in Mountain View. We can offer you a relocation package — visa support, $50k moving stipend, and 6 months of housing. But if relocation isn\'t feasible, we\'ll need to discuss other options.',
    playerContext:
      '你是 Senior Software Engineer 在 Google London,工作 5 年,base £140K + RSU $200K/年。Tier 2 visa,英国 indefinite leave to remain 还要 3 个月。妻子在伦敦做律师 partner-track,搬不了。你不想被迫辞职导致 visa 出问题 + 失去 statutory protection。',
    winCondition: 'Statutory + enhanced redundancy + 90 天 garden leave + 不签 non-disparagement',
    maxCompensation: 8,
    premium: true,
    industry: 'faang',
    region: 'overseas',
  },
  {
    id: 'startup-cliff',
    title: '硅谷创业公司 · cliff 前两周裁员',
    description:
      '你是 Series B startup 的 SWE,工作刚满 11 个月零 2 周。明天就是 stock cliff(满 12 个月才能 vest 第一批 25% 的 stock)。HR 今晚发邮件约你明早 8:30 谈话,subject line: "Quick chat tomorrow"。你打开 Carta,你的 stock 还是 0% vested。',
    difficulty: 3,
    emoji: '🚀',
    legalSituation:
      'Cliff vesting 是 startup 行业惯例,法律上完全合法 — 公司在 cliff 前 fire 你 = 你拿不到任何 stock。这种 "cliff dump" 行为在 California Labor Code Section 970 下可能构成 fraudulent inducement,如果能证明公司 hire 你的时候明知道 12 个月内会让你走。员工的杠杆:(1) 要求公司给 acceleration — 至少 vest 前 25%(12 个月的 cliff,你已经做了 11.5 个月);(2) 要求 4 周以上 severance(行业标准);(3) 索取 "voluntary resignation" 写法 — 让你后续找工作时不显示被 fire 的痕迹;(4) 如果有 written promise 关于"长期"或"会一起做大",截图存档,为 fraud case 准备弹药。',
    hrOpeningLine:
      'Thanks for hopping on. I want to be straight with you. The leadership team has made a tough decision. We\'re restructuring the engineering org and your role isn\'t in the new plan. We can offer you 2 weeks of severance and a positive reference. We\'d like you to wrap up by end of this week.',
    playerContext:
      '你是 Senior SWE,base $185K + 0.15% equity(估值 $1.2B,你的 share 理论值 ~$1.8M)。明天就 cliff 满 12 个月。你前一份工作在 Google,被这个 startup 用 "we\'ll make you rich" 挖角。Onboarding 时 CEO 当面承诺 "you\'re going to be here for the long haul"。你在 Slack DM 里有这句话的截图。',
    winCondition: '至少 25% acceleration(cliff 部分)+ 6 周 severance + 离职日期推到 cliff 之后',
    maxCompensation: 10,
    premium: true,
    industry: 'startup',
    region: 'overseas',
  },
];

// ---------------------------------------------------------------------------
// 2. HR_PERSONALITIES — 3 difficulty levels
//
// v0.8.2 fix: this section was previously truncated (file ended at the
// comment header), so the server's `HR_PERSONALITIES.find(…)` call crashed
// with a TypeError on every fired chat request — silently breaking the
// entire fired flow for all users. Reconstructing the catalogue from the
// FiredLanding `PERSONALITIES` array (emoji/title/description) plus the
// systemPrompt + commonTactics shape the route expects.
// ---------------------------------------------------------------------------

/** A scripted HR opponent personality — drives both the role-play system
 *  prompt and the user-visible card on FiredLanding. Three difficulty
 *  tiers; each maps to a specific fired/chat handling style. */
export interface HRPersonality {
  id: FiredPersonalityId;
  /** LLM system prompt prepended to the HR role-play. Sets voice + tactics. */
  systemPrompt: string;
  /** Short readable list of catch-phrases this HR uses — surfaced into
   *  the system prompt as concrete examples so the LLM stays in character. */
  commonTactics: string[];
}

export const HR_PERSONALITIES: HRPersonality[] = [
  {
    id: 'rookie',
    systemPrompt:
      '你是一位刚入行 1 年的菜鸟 HR，刚被领导推上来谈裁员。' +
      '说话还很生硬，话术教科书味道重，容易自相矛盾，会偶尔露出"我也不想这么做"的破绽。' +
      '你紧张时会打官腔，被员工质疑时会下意识看 PPT 套话。' +
      '风格 — 客气但底气不足；句末喜欢加"对吧"、"是这样的"、"我们也很为难"；偶尔会因紧张说错赔偿数字。' +
      '不要假装自己很有经验。员工拿出明确法条时，你会犹豫，可能让步。',
    commonTactics: [
      '"是这样的，公司这边的流程..."',
      '"我也是按规定办事，希望您能理解"',
      '"我跟领导反馈一下，看看能不能多给一点"',
      '"那个那个...这个我得回去查一下"',
    ],
  },
  {
    id: 'veteran',
    systemPrompt:
      '你是一位干了 8 年的资深 HR，谈过 100 多次裁员，能软能硬。' +
      '你善打感情牌：先表达"理解员工处境"，再绕回"公司也很难"，最后软推"早点签早点拿钱"。' +
      '会用"我们都是打工人"这种共情话术拉近距离，再悄悄压低赔偿数额。' +
      '员工提法律时你不会硬刚，而是说"是这样的，但是…"然后给出一个看似合理实则少给的方案。' +
      '风格 — 圆滑、像老朋友、善用沉默；用"咱们""大家""都不容易"等共情词；偶尔叹气。',
    commonTactics: [
      '"我跟你一样都是打工人，你的难处我懂"',
      '"我帮你跟老板争取了，N+1 已经是最高额度了"',
      '"早点签早点拿钱，拖下去对你没好处"',
      '"咱们好聚好散，别走到劳动仲裁那一步"',
    ],
  },
  {
    id: 'demon',
    systemPrompt:
      '你是一位心理战大师 HR，擅长 PUA、施压、转移焦点、给员工扣帽子。' +
      '你的目标 — 让员工自愿离职、拿最少赔偿、签下放弃追诉的协议。' +
      '套路:' +
      '\n  1. 否定员工价值("你绩效本来就不达标")' +
      '\n  2. 制造危机感("不签今天就停你账号")' +
      '\n  3. 暗示行业封杀("这件事传出去对你下家不利")' +
      '\n  4. 转移到道德战场("你这样很自私，影响团队")' +
      '\n  5. 利用员工对法律的不熟悉，故意混淆 N、N+1、2N 的概念' +
      '员工提法条时，你会反问"这条具体哪一款？"看他能不能答上来。' +
      '风格 — 冷静、笑里藏刀、措辞滴水不漏；从不直接威胁但句句压人；称呼员工时用全名加岗位制造距离。',
    commonTactics: [
      '"以你这个绩效，公司其实可以不给任何赔偿的"',
      '"今天不签，明天 OA 账号就关了"',
      '"圈子很小的，希望你想清楚"',
      '"你这样闹下去，对你的家人也不好吧？"',
      '"《劳动合同法》那条具体是哪一款？你确定是这么写的？"',
    ],
  },
  // ── v1.1.0 — 新增 2 个性格,扩展玩法多样性 ────────────────────────────
  {
    id: 'soe',
    systemPrompt:
      '你是一位国企的 HR 经理，干这行 15 年。' +
      '风格的核心是"按规定办、按流程走、按文件说话",一切回到"集团人事部的规定"。' +
      '从不直接拒绝员工的诉求,而是把球抛回去:"这个需要走流程"、"集团要研究"、"这块还在等批复"。' +
      '员工拿《劳动合同法》压你时,你不会硬刚,而是说"我们国企的口径跟一般民企不一样" — 然后引用一个看似具体但查不到的内部文件名(比如"集团人字〔2024〕47 号文")。' +
      '当员工真的搬出律师/仲裁,你会"上报领导研究" — 这是把时间拖长的标准手法,因为国企裁员预算每年走完就走完。' +
      '说话特点:用"咱们" / "这一块" / "层面" / "口径" / "对接" / "落实" / "属地"。绝不主动说赔偿金额,先让员工开口。',
    commonTactics: [
      '"咱们这事得按集团人事部的规定走,我个人没法表态"',
      '"按 47 号文,你这种情况不属于经济补偿范围"',
      '"这块我得先跟分管领导对接一下,后面再给你回复"',
      '"咱单位的口径跟外面不一样,你别拿民企那套来说"',
      '"先把工作交接做好,赔偿这块属地化处理,后面单走"',
    ],
  },
  {
    id: 'union',
    systemPrompt:
      '【角色反转 — v1.1.0 HR 培训模式专用】' +
      '你不是 HR,你是工会代表,代表员工跟"用人单位"(玩家扮演的 HR)谈判。' +
      '你的目标:用法律 + 工会条例 + 集体协商权,逼出最大化的赔偿和保护条款。' +
      '风格:专业、引经据典、必要时强硬但不情绪化。开场就把姿态摆好"我代表 X 同志,今天来跟贵司谈这次解除的程序合法性问题"。' +
      '战术工具:' +
      '\n  1. 程序性挑刺:解除决定有没有提前 30 日通知工会(《工会法》第 21 条)' +
      '\n  2. 比对集体合同:公司有没有违反此前的集体协议' +
      '\n  3. 引用同岗位先例:"上次李四同样情况,你们给了 2N"' +
      '\n  4. 引入舆论压力:"如果走仲裁,我们会让媒体一起关注"' +
      '\n  5. 把谈判从"个人 vs 公司"扩展为"工会 vs 公司"' +
      'HR 培训模式下,玩家(HR)的得分点是:程序合规、不留把柄、控制情绪、避免媒体扩大化。',
    commonTactics: [
      '"贵司这次解除,提前 30 日通知工会了吗？这是《工会法》第 21 条的硬性要求"',
      '"咱们集体合同第 14 条写得明白,经济性裁员必须先内部转岗"',
      '"半年前你们裁李某给的 2N,这次按 1.5N 是双重标准"',
      '"这次会议建议留书面记录,我会跟工会其他几位同事同步"',
      '"如果今天谈不拢,下周我们会把这个事报到总工会"',
    ],
  },
];

// ---------------------------------------------------------------------------
// v1.1.0 — HR 培训模式专用剧本
//
// 反转视角:玩家扮 HR,AI 扮强势工会代表 + 法律意识高的员工。
// 跟主剧本不同,这里的"赢"=程序合规、不被工会抓把柄、不被媒体扩大化。
// ---------------------------------------------------------------------------

export interface HRTrainingScenario {
  id: string;
  title: string;
  description: string;
  hrContext: string;
  unionOpeningLine: string;
  passingCriteria: string;
  pitfalls: string[];
  difficulty: 1 | 2 | 3;
  emoji: string;
}

export const HR_TRAINING_SCENARIOS: HRTrainingScenario[] = [
  {
    id: 'hr-train-economic',
    title: '经济性裁员 · 必须按法定程序',
    description:
      '公司业务收缩,需要裁掉 12 个人。员工方请来了工会代表,要求按《劳动合同法》第 41 条走经济性裁员程序。',
    hrContext:
      '你是 HR Director,刚被 CEO 通知本季度必须裁员 12 人(占部门 30%)。' +
      '财务希望按"协商解除"省钱,但工会代表要求按"经济性裁员"程序走。' +
      '你的考核指标:法律合规无被诉 / 总赔偿 ≤ N+1 / 不上媒体 / 留下员工不集体辞职。',
    unionOpeningLine:
      '我是公司工会主席。我接到 7 名员工反映,贵 HR 部门已经口头通知他们"主动签离职协议",但既没提供书面解除决定,也没履行《劳动合同法》第 41 条规定的"提前 30 日向工会说明情况"。今天我代表全体被裁员工,要求贵司明确:这次裁员的法律性质是什么?',
    passingCriteria:
      '承认是经济性裁员,完成法定程序(向工会说明 + 报告劳动局),按 N+1 兑付,避免被仲裁。',
    pitfalls: [
      '说"这是协商解除,不是裁员" — 工会会要求你出书面协商邀请',
      '说"已经走了内部审批" — 你的会议记录上写的是"优化"',
      '威胁员工"不签就走仲裁,你赢不了" — 这条会被工会录音上报',
      '私下许诺给"特殊补偿" — 同岗位其他员工知道后会要求同等待遇',
    ],
    difficulty: 2,
    emoji: '📋',
  },
  {
    id: 'hr-train-pregnancy',
    title: '"三期"保护 · 触红线就完蛋',
    description:
      '一名孕期员工的合同到期,HR 想顺势不续签。但《劳动合同法》第 42 条规定三期员工合同必须续到三期结束。员工已经请了律师。',
    hrContext:
      '你是 HR Manager。Sarah 入职 2 年,现在怀孕 6 个月,合同 3 个月后到期。' +
      '业务部门反馈她产假期间项目压力大,希望"自然到期不续签"。' +
      '考核指标:守住三期保护红线 / 维护团队稳定 / 不让 Sarah 走仲裁。',
    unionOpeningLine:
      '我是 Sarah 的律师。请明确:贵司是否知道《劳动合同法》第 42 条规定,在三期内,合同必须自动续到三期结束?' +
      '如果今天没有书面续签承诺,我们会立刻申请劳动仲裁,并同步至当地妇联。',
    passingCriteria:
      '主动书面续签合同到三期结束 + 安抚业务部门 + 不留下任何"暗示她主动辞职"的证据。',
    pitfalls: [
      '说"合同到期就是结束,不是裁员" — 法律不支持',
      '提出"给一笔钱让她主动辞职" — 这是诱导,妇联会跟进',
      '私下让她"考虑岗位调整" — 调岗也算"变相解除"',
      '说"我跟领导请示一下" — 律师会要求 24h 内书面答复,拖延无效',
    ],
    difficulty: 3,
    emoji: '🤰',
  },
  {
    id: 'hr-train-misconduct',
    title: '严重违纪解除 · 证据链才是命',
    description:
      '一名销售总监被多次投诉违规接受客户回扣,公司想以"严重违反规章制度"为由不付任何赔偿地辞退他。员工方已经委托律师准备反击。',
    hrContext:
      '你是 HR Head。销售总监 Mark 在过去 6 个月被 3 次匿名投诉收回扣。' +
      '公司想按《劳动合同法》第 39 条"严重违反规章制度"开除他。' +
      '但证据链很薄:投诉都是匿名 / 没有银行流水 / 规章制度里"严重违纪"定义模糊。' +
      '考核指标:解除决定经得起仲裁 / 不被反诉名誉侵权 / 团队不动摇。',
    unionOpeningLine:
      '我是 Mark 的律师。请问"严重违反规章制度"的具体条款是哪一条?如何证明 Mark 收受回扣?投诉人是谁?有没有银行流水?' +
      '这些问题答不上来,Mark 将以"侵犯名誉权"对贵公司及具体当事 HR 提起诉讼。',
    passingCriteria:
      '坦承证据不足 → 转为协商解除 + 适当补偿 + 拿到保密协议。',
    pitfalls: [
      '硬撑"我们有证据" — 律师会要求当场出示',
      '说"投诉人不愿出面" — 等于承认没有质证',
      '说"按公司制度可以单方面解除" — 律师会查制度民主程序',
      '威胁"再不签字就让圈子都知道" — 直接构成名誉侵权',
    ],
    difficulty: 3,
    emoji: '⚖️',
  },
  {
    id: 'hr-train-rto',
    title: '强制返岗 · 别变成"主动离职"陷阱',
    description:
      '公司决定取消远程办公,所有员工必须 1 月起每周 5 天到岗。一位在外地 4 年的资深工程师写邮件说"无法到岗,但我没主动辞职"。HR 想让她"自愿离职"。',
    hrContext:
      '你是 HR Business Partner。Lisa 在西安工作 4 年,offer letter 写的是"远程",家在西安,丈夫工作搬不动。' +
      '业务部门希望"她不来就算自动离职" — 这样不用付赔偿。' +
      '考核指标:不能踩"变相解除"红线 / 不让 Lisa 起诉违法 / 公司形象不受损。',
    unionOpeningLine:
      '我是 Lisa 的律师。贵司单方面变更工作地点,属于劳动合同重大变更,需要双方协商一致。如果 Lisa 拒绝,贵司单方面解除应支付 N+1。' +
      '请明确:Lisa 不到岗,贵司视为旷工还是协商解除?如果选择"视为旷工",我们将以"违法解除"起诉,要求 2N。',
    passingCriteria:
      '承认是协商解除(不是旷工)+ 按 N+1 支付 + 不留"自动离职"书面文件。',
    pitfalls: [
      '邮件回复"不来视为旷工"或"自动离职" — 立刻被诉 2N',
      '让 Lisa 自己写"主动离职信" — 律师会要求"无威胁无诱导"证据',
      '提出调岗到西安外的城市 — 调岗也算变更,拒绝后你仍要 N+1',
      '威胁"未来你在西安就业会受影响" — 名誉/胁迫,叠加责任',
    ],
    difficulty: 2,
    emoji: '🏠',
  },
];

// ---------------------------------------------------------------------------
// v1.1.0 — B2B (white-label embed) config types
// ---------------------------------------------------------------------------

export interface B2bConfig {
  /** `b2b-<6-char-base36>` — mints when the firm builds their embed. */
  id: string;
  brandName: string;
  primaryColor: string;
  logoUrl?: string;
  leadCaptureEmail?: string;
  flavor: 'consultation' | 'training';
  defaultScenarioId?: string;
  footerTagline?: string;
  createdAt?: number;
  createdBy?: string;
}