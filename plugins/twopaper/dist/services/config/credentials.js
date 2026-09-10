/**
 * credentials — 统一凭证读取。
 * 从 process.env 收集各平台 API key 是否存在到一张表，供 PlatformRegistry 判断 UNCONFIGURED。
 * 只读取、不落盘、不进 git、不在日志/报告打印具体值。
 */
const CREDENTIAL_MAP = [
    { env: 'WOS_API_KEY', platform: 'webofscience' },
    { env: 'PUBMED_API_KEY', platform: 'pubmed' },
    { env: 'SEMANTIC_SCHOLAR_API_KEY', platform: 'semantic' },
    { env: 'ELSEVIER_API_KEY', platform: 'sciencedirect/scopus' },
    { env: 'SPRINGER_API_KEY', platform: 'springer' },
    { env: 'WILEY_TDM_TOKEN', platform: 'wiley' },
    { env: 'OPENALEX_API_KEY', platform: 'oa' },
    { env: 'OA_EMAIL', platform: 'oa' },
    { env: 'MINERU_TOKEN', platform: 'mineru' }
];
export function collectCredentials() {
    return CREDENTIAL_MAP.map((c) => ({
        env: c.env,
        configured: !!(process.env[c.env] && process.env[c.env].trim() !== ''),
        platform: c.platform
    }));
}
/** 返回缺失（未配置）的凭证条目，供 get_platform_status 提示。 */
export function missingCredentials() {
    return collectCredentials().filter((c) => !c.configured);
}
export default { collectCredentials, missingCredentials };
//# sourceMappingURL=credentials.js.map