// 0. v0.9.0 — UGC pack types (a "pack" = 5 user-curated scenarios bundled
//    as a chapter sequence). Lives here in shared so client + server agree
//    on the wire shape; persistence is server-side via packStore.ts.
// ---------------------------------------------------------------------------

export type FiredPersonalityId = 'rookie' | 'veteran' | 'demon';

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
  id: 'rookie' | 'veteran' | 'demon';
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
];