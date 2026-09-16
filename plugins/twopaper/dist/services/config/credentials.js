/**
 * credentials — 统一凭证读取与配置。
 * 从 process.env 收集各平台 API key 是否存在到一张表，供 PlatformRegistry 判断 UNCONFIGURED。
 * setup 工具据此生成引导清单，并把用户提供的值写入插件 .env。
 *
 * 安全约定：只读取/写入，不在日志、工具返回值或报告中回显具体值。
 */
import * as fs from 'fs';
import * as path from 'path';
import { resolveEnvPath } from '../../utils/env.js';
const CREDENTIAL_MAP = [
    {
        env: 'WOS_API_KEY',
        platform: 'webofscience',
        required: true,
        unlocks: 'Web of Science 检索（引文分析、高被引）',
        signup: 'https://developer.clarivate.com/apis'
    },
    {
        env: 'ELSEVIER_API_KEY',
        platform: 'sciencedirect/scopus',
        required: true,
        unlocks: 'Scopus 检索 + ScienceDirect（需产品授权）',
        signup: 'https://dev.elsevier.com/apikey/manage'
    },
    {
        env: 'SPRINGER_API_KEY',
        platform: 'springer',
        required: true,
        unlocks: 'Springer 检索与下载',
        signup: 'https://dev.springernature.com/signup'
    },
    {
        env: 'WILEY_TDM_TOKEN',
        platform: 'wiley',
        required: true,
        unlocks: 'Wiley TDM 全文下载（需机构订阅注册）',
        signup: 'https://onlinelibrary.wiley.com/library-info/resources/text-and-datamining'
    },
    {
        env: 'MINERU_TOKEN',
        platform: 'mineru',
        required: true,
        unlocks: 'get_fulltext 的 PDF→Markdown 转换',
        signup: 'https://mineru.net/apiManage'
    },
    {
        env: 'OA_EMAIL',
        platform: 'oa',
        required: true,
        unlocks: 'get_oa_pdf / get_pdf 的合法 OA 定位（Unpaywall 礼貌池）',
        signup: '填你自己的邮箱即可，无需申请'
    },
    {
        env: 'PUBMED_API_KEY',
        platform: 'pubmed',
        required: false,
        unlocks: 'PubMed 限流从 3 rps 提到 10 rps',
        signup: 'https://www.ncbi.nlm.nih.gov/books/NBK25497/'
    },
    {
        env: 'SEMANTIC_SCHOLAR_API_KEY',
        platform: 'semantic',
        required: false,
        unlocks: 'Semantic Scholar 限流从 20 rpm 提到 ~180 rpm',
        signup: 'https://www.semanticscholar.org/product/api'
    },
    {
        env: 'OPENALEX_API_KEY',
        platform: 'oa',
        required: false,
        unlocks: 'OpenAlex key+credits 模式（无 key 也可用）',
        signup: 'https://openalex.org/'
    }
];
/** 允许被 setup 工具写入的 env 名白名单。杜绝任意键注入。 */
export const WRITABLE_ENV_KEYS = new Set(CREDENTIAL_MAP.map((c) => c.env));
export function collectCredentials() {
    return CREDENTIAL_MAP.map((c) => ({
        ...c,
        configured: !!(process.env[c.env] && process.env[c.env].trim() !== '')
    }));
}
/** 返回缺失（未配置）的凭证条目，供 get_platform_status 提示。 */
export function missingCredentials() {
    return collectCredentials().filter((c) => !c.configured);
}
/**
 * 把凭证写入插件 .env。
 *
 * 采用「读取-合并-写回」以保留用户已有但不在白名单内的自定义行（如 SCHOLAR_PROXY），
 * 且写回的键是**原位替换**，不打乱既有顺序。
 *
 * @returns 实际写入的键名（不含值）与目标路径
 */
export function writeCredentials(updates) {
    const envPath = resolveEnvPath();
    const written = [];
    let lines = [];
    try {
        lines = fs.readFileSync(envPath, 'utf8').split(/\r?\n/);
    }
    catch {
        // 文件不存在 → 从空开始
    }
    for (const [key, rawValue] of Object.entries(updates)) {
        if (!WRITABLE_ENV_KEYS.has(key))
            continue;
        const value = String(rawValue ?? '').trim();
        if (value === '')
            continue;
        const idx = lines.findIndex((l) => new RegExp(`^\\s*${key}\\s*=`).test(l));
        const assignment = `${key}=${value}`;
        if (idx >= 0) {
            lines[idx] = assignment;
        }
        else {
            lines.push(assignment);
        }
        written.push(key);
        // 立即生效，让同进程内的后续调用无需重启即可用上新值
        process.env[key] = value;
    }
    if (written.length > 0) {
        fs.mkdirSync(path.dirname(envPath), { recursive: true });
        const body = lines.filter((l, i) => !(l === '' && i === lines.length - 1)).join('\n');
        fs.writeFileSync(envPath, body + '\n', { encoding: 'utf8', mode: 0o600 });
    }
    return { written, envPath };
}
export default { collectCredentials, missingCredentials, writeCredentials, WRITABLE_ENV_KEYS };
//# sourceMappingURL=credentials.js.map