/**
 * credentials — 统一凭证读取。
 * 从 process.env 收集各平台 API key 是否存在到一张表，供 PlatformRegistry 判断 UNCONFIGURED。
 * 只读取、不落盘、不进 git、不在日志/报告打印具体值。
 */
export interface CredentialEntry {
    /** env 变量名 */
    env: string;
    /** 是否已配置（非空） */
    configured: boolean;
    /** 关联平台 */
    platform: string;
}
export declare function collectCredentials(): CredentialEntry[];
/** 返回缺失（未配置）的凭证条目，供 get_platform_status 提示。 */
export declare function missingCredentials(): CredentialEntry[];
declare const _default: {
    collectCredentials: typeof collectCredentials;
    missingCredentials: typeof missingCredentials;
};
export default _default;
//# sourceMappingURL=credentials.d.ts.map