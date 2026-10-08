/**
 * v6.160 — ModelScope 模型卡与同步的纯函数(scripts/__tests__/modelscopeCard.test.ts 覆盖)。
 *
 * ModelScope 上的模型卡就是仓库根的 README.md,但 GitHub 版 README 里的图片和文档链接
 * 都是相对路径,在 ModelScope 上渲染不出来 / 点进去 404。所以:
 *  - assets/ 下的图片、动图 → ModelScope 自托管地址(resolve/master,随代码一起上传)
 *  - 其他相对链接(docs/、LICENSE、README.en.md、packages/…)→ GitHub 地址
 *  - 绝对地址与锚点(#…)原样不动
 */

export const MS_REPO = 'haozi667788/office-zoo';
export const MS_RESOLVE = `https://modelscope.cn/models/${MS_REPO}/resolve/master`;
export const GH_BASE = 'https://github.com/ChrisChen667788/office-zoo';
/** ModelScope 个人中心的访问令牌页。 */
export const TOKEN_PAGE = 'https://modelscope.cn/my/myaccesstoken';

export const CARD_HEADER =
  '<!-- 由 scripts/gen-modelscope-intro.mjs 从 README.md 自动生成:assets 图片 → ModelScope 自托管地址,'
  + '其余相对链接 → GitHub 绝对地址,正文逐字不变。勿手改,改 README.md 后重跑 npm run gen:modelscope-intro。 -->';

/** 把一个(可能带 ./ 前缀的)相对路径改成绝对地址;绝对地址、锚点、mailto 原样返回。 */
export function absolutize(ref) {
  if (/^(?:[a-z][a-z0-9+.-]*:|\/\/|#)/i.test(ref)) return ref;
  const clean = ref.replace(/^\.\//, '');
  if (clean.startsWith('assets/')) return `${MS_RESOLVE}/${clean}`;
  return `${GH_BASE}/${clean.endsWith('/') ? 'tree' : 'blob'}/main/${clean}`;
}

/** GitHub README → ModelScope 模型卡。 */
export function toModelScopeCard(readme) {
  const body = readme
    // markdown 链接与图片:](path) / ](path "title")
    .replace(/\]\(([^)\s]+)((?:\s+"[^"]*")?)\)/g, (_m, ref, title) => `](${absolutize(ref)}${title})`)
    // HTML 属性:src / href / srcset(srcset 可能是逗号分隔的多项)
    .replace(/\b(src|href)="([^"]+)"/g, (_m, attr, ref) => `${attr}="${absolutize(ref)}"`)
    .replace(/\bsrcset="([^"]+)"/g, (_m, list) =>
      `srcset="${list.split(',').map((part) => {
        const [ref, ...rest] = part.trim().split(/\s+/);
        return [absolutize(ref), ...rest].join(' ');
      }).join(', ')}"`);
  return `${CARD_HEADER}\n\n${body}`;
}

/** 模型卡自检:还有相对路径的图片/资源引用就说明卡被 GitHub 版 README 覆盖了。 */
export function cardLooksClobbered(markdown) {
  const rel = (markdown.match(/(?:\]\(|(?:src|srcset|href)=")(?:\.\/)?assets\//g) || []).length;
  const ms = (markdown.match(/modelscope\.cn\/models\/[^/]+\/[^/]+\/resolve/g) || []).length;
  return { rel, ms, clobbered: rel > 0 };
}

/**
 * 令牌格式预检(与 wind-comic 同款):返回 null = 通过;否则一句人话,**绝不含令牌本身**。
 * 令牌只会是可打印 ASCII;占位文字、⌥V 打出的「√」、粘贴混进的换行都在这里拦下。
 */
export function tokenProblem(raw) {
  const t = String(raw ?? '').trim();
  if (!t) return '缺 ModelScope 令牌:在终端里直接运行 npm run ms:sync 会提示粘贴(不回显);非交互环境用环境变量 MODELSCOPE_API_TOKEN';
  // 曾经有人把整条同步命令粘进了令牌提示 —— 说清楚要粘的是什么
  if (/MODELSCOPE_API_TOKEN|npm run|ms:sync|git checkout|&&/.test(t)) {
    return `粘贴的是命令(共 ${t.length} 个字符),不是令牌。令牌在 ${TOKEN_PAGE} 复制,是一串以 ms- 开头的字符`;
  }
  for (let i = 0; i < t.length; i++) {
    const code = t.charCodeAt(i);
    if (code >= 0x21 && code <= 0x7e) continue;
    const ch = t[i];
    const hint = ch === '√' ? ' —— macOS 上 ⌥V 会打出「√」,粘贴请用 ⌘V'
      : /[㐀-鿿]/.test(ch) ? ' —— 看起来还是占位文字,请换成 ModelScope 个人中心「访问令牌」里的真实令牌'
      : /\s/.test(ch) ? ' —— 令牌中间不该有空白,可能粘贴时混进了换行或空格'
      : '';
    return `MODELSCOPE_API_TOKEN 第 ${i + 1} 个字符不是可打印 ASCII(共 ${t.length} 个字符)${hint}`;
  }
  return null;
}

/** 日志掩码:失败输出里可能带 oauth2:<令牌>@ 形式的远端地址。 */
export const redact = (s) => String(s)
  .replace(/ms-[0-9a-f-]{8,}/gi, 'ms-***')
  .replace(/oauth2:[^@\s]+@/g, 'oauth2:***@');
