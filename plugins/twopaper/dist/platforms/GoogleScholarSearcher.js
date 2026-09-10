/**
 * Google Scholar搜索器 - 网页抓取实现
 * 基于HTML解析，包含反检测机制、会话管理和代理支持
 */
import axios from 'axios';
import * as cheerio from 'cheerio';
import { PaperFactory } from '../models/Paper.js';
import { PaperSource } from './PaperSource.js';
import { SEARCH_LIMITS, TIMEOUTS } from '../config/constants.js';
import { validateQueryComplexity } from '../utils/SecurityUtils.js';
import { logDebug } from '../utils/Logger.js';
export class GoogleScholarSearcher extends PaperSource {
    scholarUrl = 'https://scholar.google.com/scholar';
    userAgents = [
        'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36',
        'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.2 Safari/605.1.15',
        'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36',
        'Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:133.0) Gecko/20100101 Firefox/133.0',
        'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36 Edg/131.0.0.0'
    ];
    sessionCookies = '';
    lastRequestTime = 0;
    consecutiveFailures = 0;
    maxRetries = 3;
    baseDelay = 3000;
    // Optional proxy support: set SCHOLAR_PROXY=http://user:pass@host:port to bypass IP-based blocking
    proxy = process.env.SCHOLAR_PROXY || process.env.HTTPS_PROXY || process.env.HTTP_PROXY;
    proxyConfig = this.parseProxy(this.proxy);
    constructor() {
        super('google_scholar', 'https://scholar.google.com');
        if (this.proxy) {
            logDebug(`Google Scholar using proxy: ${this.proxy.split('@').pop()}`);
        }
    }
    getCapabilities() {
        return {
            search: true,
            download: false,
            fullText: false,
            citations: true,
            requiresApiKey: false,
            supportedOptions: ['maxResults', 'year', 'author']
        };
    }
    /**
     * 搜索Google Scholar论文
     */
    async search(query, options = {}) {
        logDebug(`Google Scholar Search: query="${query}"`);
        try {
            const validation = validateQueryComplexity(query, {
                maxLength: SEARCH_LIMITS.MAX_QUERY_LENGTH,
                maxBooleanOperators: SEARCH_LIMITS.MAX_BOOLEAN_OPERATORS
            });
            if (!validation.valid) {
                throw new Error(validation.error || 'Invalid Google Scholar query');
            }
            await this.initializeSession();
            const papers = [];
            const seenIds = new Set();
            let start = 0;
            const resultsPerPage = 10;
            const maxResults = Math.min(options.maxResults || 10, 20);
            while (papers.length < maxResults) {
                await this.adaptiveDelay();
                const params = this.buildSearchParams(query, start, options);
                const response = await this.makeScholarRequest(params);
                if (response.status === 429 || response.status === 403) {
                    logDebug(`Google Scholar rate limited (HTTP ${response.status}), resetting session...`);
                    this.consecutiveFailures++;
                    if (this.consecutiveFailures >= this.maxRetries) {
                        throw new Error('Google Scholar access was blocked after repeated rate limits. Configure SCHOLAR_PROXY or try later.');
                    }
                    await this.resetSession();
                    continue;
                }
                if (response.status !== 200) {
                    throw new Error(`Google Scholar returned HTTP ${response.status}`);
                }
                const pageHtml = String(response.data || '');
                const page = cheerio.load(pageHtml);
                const hasScholarResults = page('.gs_ri').length > 0;
                const html = pageHtml.toLowerCase();
                if (!hasScholarResults && (html.includes('recaptcha') || html.includes('captcha') ||
                    html.includes('sorry, we can\'t verify that you\'re not a robot') ||
                    html.includes('consent.google.com'))) {
                    logDebug('Google Scholar captcha or consent page detected');
                    this.consecutiveFailures++;
                    if (this.consecutiveFailures >= this.maxRetries) {
                        throw new Error('Google Scholar requires captcha verification. Please try again later or use a different platform.');
                    }
                    await this.resetSession();
                    continue;
                }
                this.consecutiveFailures = 0;
                const $ = cheerio.load(response.data);
                const results = $('.gs_ri');
                if (results.length === 0) {
                    logDebug('Google Scholar: No more results found');
                    break;
                }
                logDebug(`Google Scholar: Found ${results.length} results on page`);
                results.each((index, element) => {
                    if (papers.length >= maxResults)
                        return false;
                    const paper = this.parseScholarResult($, $(element));
                    if (paper && !seenIds.has(paper.paperId)) {
                        seenIds.add(paper.paperId);
                        papers.push(paper);
                    }
                });
                start += resultsPerPage;
            }
            logDebug(`Google Scholar Results: Found ${papers.length} papers`);
            return papers;
        }
        catch (error) {
            this.handleHttpError(error, 'search');
        }
    }
    /**
     * 初始化会话 - 先访问主页获取cookie
     */
    async initializeSession() {
        try {
            const userAgent = this.getRandomUserAgent();
            const response = await axios.get('https://scholar.google.com', {
                headers: {
                    'User-Agent': userAgent,
                    'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
                    'Accept-Language': 'en-US,en;q=0.9',
                    'Accept-Encoding': 'gzip, deflate, br',
                    'Connection': 'keep-alive',
                    'Cache-Control': 'no-cache',
                    'Pragma': 'no-cache'
                },
                timeout: TIMEOUTS.DEFAULT,
                maxRedirects: 5,
                ...(this.proxyConfig ? { proxy: this.proxyConfig } : {})
            });
            const setCookie = response.headers['set-cookie'];
            if (setCookie) {
                this.sessionCookies = (Array.isArray(setCookie) ? setCookie : [setCookie])
                    .map(c => c.split(';')[0])
                    .join('; ');
                logDebug('Google Scholar session initialized');
            }
        }
        catch (error) {
            logDebug('Failed to initialize Google Scholar session, continuing without cookies');
        }
    }
    /**
     * 重置会话
     */
    async resetSession() {
        this.sessionCookies = '';
        await this.randomDelay(5000, 10000);
        await this.initializeSession();
    }
    /**
     * Google Scholar不支持直接PDF下载
     */
    async downloadPdf(paperId, options) {
        throw new Error('Google Scholar does not support direct PDF download. Please use the paper URL to access the publisher.');
    }
    /**
     * Google Scholar不提供全文内容
     */
    async readPaper(paperId, options) {
        throw new Error('Google Scholar does not provide full-text content. Please use the paper URL to access the full text.');
    }
    /**
     * 构建搜索参数
     */
    buildSearchParams(query, start, options) {
        const params = {
            q: query,
            start: start,
            hl: options.language || 'en',
            as_sdt: '0,5',
            as_vis: '1'
        };
        if (options.yearLow || options.yearHigh) {
            params.as_ylo = options.yearLow || '';
            params.as_yhi = options.yearHigh || '';
        }
        if (options.author) {
            params.as_sauthors = options.author;
        }
        return params;
    }
    /**
     * 发起Scholar请求（不自动重试，由search方法控制重试逻辑）
     */
    async makeScholarRequest(params) {
        const userAgent = this.getRandomUserAgent();
        const headers = {
            'User-Agent': userAgent,
            'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8',
            'Accept-Language': 'en-US,en;q=0.9',
            'Accept-Encoding': 'gzip, deflate, br',
            'Connection': 'keep-alive',
            'Upgrade-Insecure-Requests': '1',
            'Cache-Control': 'no-cache',
            'Pragma': 'no-cache',
            'Sec-Fetch-Dest': 'document',
            'Sec-Fetch-Mode': 'navigate',
            'Sec-Fetch-Site': 'none',
            'Sec-Fetch-User': '?1',
            'DNT': '1'
        };
        if (this.sessionCookies) {
            headers['Cookie'] = this.sessionCookies;
        }
        const config = {
            params,
            headers,
            timeout: TIMEOUTS.DEFAULT,
            maxRedirects: 5,
            validateStatus: (status) => true,
            ...(this.proxyConfig ? { proxy: this.proxyConfig } : {})
        };
        logDebug(`Google Scholar Request: GET ${this.scholarUrl}`);
        return await axios.get(this.scholarUrl, config);
    }
    /**
     * 将 HTTP/HTTPS 代理环境变量转换为 Axios 原生配置。
     */
    parseProxy(proxy) {
        if (!proxy)
            return undefined;
        try {
            const parsed = new URL(proxy);
            const protocol = parsed.protocol.replace(':', '').toLowerCase();
            if (protocol !== 'http' && protocol !== 'https') {
                logDebug(`Unsupported Google Scholar proxy protocol: ${protocol}`);
                return undefined;
            }
            const config = {
                protocol,
                host: parsed.hostname,
                port: Number(parsed.port || (protocol === 'https' ? 443 : 80))
            };
            if (parsed.username || parsed.password) {
                config.auth = {
                    username: decodeURIComponent(parsed.username),
                    password: decodeURIComponent(parsed.password)
                };
            }
            return config;
        }
        catch (error) {
            logDebug(`Failed to parse Google Scholar proxy: ${error.message}`);
            return undefined;
        }
    }
    /**
     * 解析单个Scholar搜索结果
     */
    parseScholarResult($, element) {
        try {
            const titleElement = element.find('h3.gs_rt');
            const titleLink = titleElement.find('a');
            const title = titleElement.text().replace(/^\[PDF\]|\[HTML\]|\[BOOK\]|\[B\]/, '').trim();
            const url = titleLink.attr('href') || '';
            if (!title) {
                return null;
            }
            const titleText = titleElement.text();
            if (titleText.includes('[BOOK]') || titleText.includes('[B]') ||
                url.includes('books.google.com')) {
                return null;
            }
            const infoElement = element.find('div.gs_a');
            const infoText = infoElement.text();
            const authors = this.extractAuthors(infoText);
            const year = this.extractYear(infoText);
            const abstractElement = element.find('div.gs_rs');
            const abstract = abstractElement.text() || '';
            const citationElement = element.find('div.gs_fl a').filter((i, el) => {
                return $(el).text().includes('Cited by');
            });
            const citationText = citationElement.text();
            const citationCount = this.extractCitationCount(citationText);
            const paperId = this.generatePaperId(title, authors);
            return PaperFactory.create({
                paperId,
                title: this.cleanText(title),
                authors,
                abstract: this.cleanText(abstract),
                doi: '',
                publishedDate: year ? new Date(year, 0, 1) : null,
                pdfUrl: '',
                url,
                source: 'googlescholar',
                categories: [],
                keywords: [],
                citationCount,
                journal: this.extractJournal(infoText),
                year,
                extra: {
                    scholarId: paperId,
                    infoText
                }
            });
        }
        catch (error) {
            logDebug('Error parsing Google Scholar result:', error);
            return null;
        }
    }
    /**
     * 提取作者信息
     */
    extractAuthors(infoText) {
        const parts = infoText.split(' - ');
        if (parts.length > 0) {
            const authorPart = parts[0];
            return authorPart.split(',').map(author => author.trim()).filter(a => a.length > 0);
        }
        return [];
    }
    /**
     * 提取年份
     */
    extractYear(text) {
        const yearMatch = text.match(/\b(19|20)\d{2}\b/);
        return yearMatch ? parseInt(yearMatch[0], 10) : undefined;
    }
    /**
     * 提取期刊信息
     */
    extractJournal(infoText) {
        const parts = infoText.split(' - ');
        if (parts.length > 1) {
            return parts[1].split(',')[0].trim();
        }
        return '';
    }
    /**
     * 提取引用次数
     */
    extractCitationCount(citationText) {
        const match = citationText.match(/Cited by (\d+)/);
        return match ? parseInt(match[1], 10) : 0;
    }
    /**
     * 生成论文ID
     */
    generatePaperId(title, authors) {
        const titleHash = this.simpleHash(title);
        const authorHash = this.simpleHash(authors.join(''));
        return `gs_${titleHash}_${authorHash}`;
    }
    /**
     * 简单哈希函数
     */
    simpleHash(str) {
        let hash = 0;
        for (let i = 0; i < str.length; i++) {
            const char = str.charCodeAt(i);
            hash = ((hash << 5) - hash) + char;
            hash = hash & hash;
        }
        return Math.abs(hash).toString(36);
    }
    /**
     * 获取随机User-Agent
     */
    getRandomUserAgent() {
        return this.userAgents[Math.floor(Math.random() * this.userAgents.length)];
    }
    /**
     * 自适应延迟 - 根据请求间隔动态调整
     */
    async adaptiveDelay() {
        const now = Date.now();
        const timeSinceLastRequest = now - this.lastRequestTime;
        const minDelay = this.baseDelay + this.consecutiveFailures * 2000;
        if (timeSinceLastRequest < minDelay) {
            const waitTime = minDelay - timeSinceLastRequest + Math.random() * 2000;
            await new Promise(resolve => setTimeout(resolve, waitTime));
        }
        else {
            await new Promise(resolve => setTimeout(resolve, Math.random() * 1000));
        }
        this.lastRequestTime = Date.now();
    }
    /**
     * 随机延迟
     */
    async randomDelay(min = 1000, max = 3000) {
        const delay = Math.random() * (max - min) + min;
        await new Promise(resolve => setTimeout(resolve, delay));
    }
}
//# sourceMappingURL=GoogleScholarSearcher.js.map