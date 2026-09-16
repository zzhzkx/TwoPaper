/**
 * credentials — 统一凭证读取与配置。
 * 从 process.env 收集各平台 API key 是否存在到一张表，供 PlatformRegistry 判断 UNCONFIGURED。
 * setup 工具据此生成引导清单，并把用户提供的值写入插件 .env。
 *
 * 安全约定：只读取/写入，不在日志、工具返回值或报告中回显具体值。
 */
export interface CredentialEntry {
    /** env 变量名 */
    env: string;
    /** 是否已配置（非空） */
    configured: boolean;
    /** 关联平台 */
    platform: string;
    /** 是否必需（false = 可选，缺了只是降级） */
    required: boolean;
    /** 该凭证解锁什么能力 */
    unlocks: string;
    /** 申请地址 */
    signup: string;
}
/** 允许被 setup 工具写入的 env 名白名单。杜绝任意键注入。 */
export declare const WRITABLE_ENV_KEYS: ReadonlySet<string>;
export declare function collectCredentials(): CredentialEntry[];
/** 返回缺失（未配置）的凭证条目，供 get_platform_status 提示。 */
export declare function missingCredentials(): CredentialEntry[];
/**
 * 把凭证写入插件 .env。
 *
 * 采用「读取-合并-写回」以保留用户已有但不在白名单内的自定义行（如 SCHOLAR_PROXY），
 * 且写回的键是**原位替换**，不打乱既有顺序。
 *
 * @returns 实际写入的键名（不含值）与目标路径
 */
export declare function writeCredentials(updates: Record<string, string>): {
    written: string[];
    envPath: string;
};
declare const _default: {
    collectCredentials: typeof collectCredentials;
    missingCredentials: typeof missingCredentials;
    writeCredentials: typeof writeCredentials;
    WRITABLE_ENV_KEYS: ReadonlySet<string>;
};
export default _default;
//# sourceMappingURL=credentials.d.ts.map