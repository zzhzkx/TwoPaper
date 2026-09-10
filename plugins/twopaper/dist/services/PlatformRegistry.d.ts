/**
 * PlatformRegistry — 统一渠道状态目录与四态判定。
 * 静态声明式能力表 + 运行时结合 searchers 的 hasApiKey/validateApiKey 产出
 * UNCONFIGURED / OK / NEED_LOGIN / DEGRADED 状态矩阵，供 get_platform_status 使用。
 */
import type { Searchers } from '../mcp/searchers.js';
export type ChannelStatus = 'UNCONFIGURED' | 'OK' | 'NEED_LOGIN' | 'DEGRADED';
export interface PlatformEntry {
    platform: string;
    /** 搜索/下载/全文能力 */
    ability: {
        search: boolean;
        download: boolean;
        fulltext: boolean;
    };
    /** 是否需要 API key */
    requiresApiKey?: boolean;
    /** 可选 API key（未配置时降级为 DEGRADED） */
    optionalKey?: boolean;
    /** 需要的登录类型 */
    loginType?: 'webvpn' | 'sso' | 'none';
    /** 凭证 env 名（用于 setupHint） */
    keyEnv?: string;
    /** 申请/登录路径提示 */
    setupHint?: string;
}
export interface PlatformRow extends PlatformEntry {
    status: ChannelStatus;
    configured: boolean;
}
export declare class PlatformRegistry {
    private catalog;
    constructor(extra?: PlatformEntry[]);
    /** 汇总所有平台状态。validate=true 时对需要 key 的平台做真实校验（may hit upstream）。 */
    getStatus(searchers: Searchers, validate?: boolean): Promise<PlatformRow[]>;
    private lookupSearcher;
}
export default PlatformRegistry;
//# sourceMappingURL=PlatformRegistry.d.ts.map