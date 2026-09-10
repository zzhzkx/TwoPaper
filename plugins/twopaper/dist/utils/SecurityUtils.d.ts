/**
 * Security utilities for sanitizing and validating data
 * Provides comprehensive protection against security vulnerabilities
 */
/**
 * Validate and sanitize a download path to prevent path traversal.
 *
 * Resolves the given path relative to `baseDir` (default: './downloads')
 * and rejects any resolved path that escapes the base directory.
 * MCP tool arguments are untrusted (LLM-controlled); this guard ensures
 * a malicious `savePath` like '../../etc' or an absolute system path
 * cannot be used to write outside the allowed download directory.
 *
 * After lexical resolve, also checks the real (on-disk) path via
 * `realpathSync` to defeat symlinks and Windows junctions that point
 * outside the base directory.
 *
 * @param input - User-supplied save path (may be undefined/empty)
 * @param baseDir - Allowed root directory (default: './downloads')
 * @returns { valid: boolean; sanitized: string; error?: string }
 *   `sanitized` is the resolved absolute path when valid.
 */
export declare function sanitizeDownloadPath(input?: string, baseDir?: string): {
    valid: boolean;
    sanitized: string;
    error?: string;
};
/**
 * Sanitize a filename component derived from untrusted input (e.g. paperId).
 * Strips path separators and other filesystem-dangerous characters so the
 * result cannot escape the enclosing directory via '../' or absolute paths.
 */
export declare function sanitizeFilename(input: string): string;
/**
 * Comprehensive request sanitization to remove sensitive data
 * @param config - Axios request configuration
 * @returns Sanitized configuration copy
 */
export declare function sanitizeRequest(config: any): any;
/**
 * Sanitize headers to remove sensitive information
 */
export declare function sanitizeHeaders(headers: Record<string, any>): Record<string, any>;
/**
 * Sanitize URL parameters
 */
export declare function sanitizeParams(params: Record<string, any>): Record<string, any>;
/**
 * Sanitize request body
 */
export declare function sanitizeBody(body: any): any;
/**
 * Sanitize URL to remove sensitive query parameters
 */
export declare function sanitizeUrl(url: string): string;
/**
 * Validate and sanitize a DOI string
 */
export declare function sanitizeDoi(doi: string): {
    valid: boolean;
    sanitized: string;
    error?: string;
};
/**
 * Escape query value for different contexts
 */
export declare function escapeQueryValue(value: string, context?: 'springer' | 'wos' | 'general'): string;
/**
 * Validate query complexity to prevent DoS
 */
export declare function validateQueryComplexity(query: string, options?: {
    maxLength?: number;
    maxBooleanOperators?: number;
}): {
    valid: boolean;
    error?: string;
};
/**
 * Create a timeout wrapper for promises
 */
export declare function withTimeout<T>(promise: Promise<T>, ms: number, message?: string): Promise<T>;
/**
 * Generate a correlation ID for request tracking
 */
export declare function generateCorrelationId(): string;
/**
 * Mask sensitive data in strings
 */
export declare function maskSensitiveData(str: string): string;
/**
 * Check if a string looks like an API key or token
 */
export declare function looksLikeToken(str: string): boolean;
declare const _default: {
    sanitizeDownloadPath: typeof sanitizeDownloadPath;
    sanitizeFilename: typeof sanitizeFilename;
    sanitizeRequest: typeof sanitizeRequest;
    sanitizeHeaders: typeof sanitizeHeaders;
    sanitizeParams: typeof sanitizeParams;
    sanitizeBody: typeof sanitizeBody;
    sanitizeUrl: typeof sanitizeUrl;
    sanitizeDoi: typeof sanitizeDoi;
    escapeQueryValue: typeof escapeQueryValue;
    validateQueryComplexity: typeof validateQueryComplexity;
    withTimeout: typeof withTimeout;
    generateCorrelationId: typeof generateCorrelationId;
    maskSensitiveData: typeof maskSensitiveData;
    looksLikeToken: typeof looksLikeToken;
};
export default _default;
//# sourceMappingURL=SecurityUtils.d.ts.map