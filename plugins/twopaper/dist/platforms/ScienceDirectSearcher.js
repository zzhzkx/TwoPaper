/**
 * ScienceDirect (Elsevier) Searcher
 *
 * Documentation: https://dev.elsevier.com/
 * API Endpoints:
 * - Search API: https://api.elsevier.com/content/search/sciencedirect
 * - Article API: https://api.elsevier.com/content/article/doi/
 *
 * Required API Key: Yes (X-ELS-APIKey header)
 * Get API key from: https://dev.elsevier.com/apikey/manage
 */
import axios from 'axios';
import { PaperSource } from './PaperSource.js';
import { PaperFactory } from '../models/Paper.js';
import { RateLimiter } from '../utils/RateLimiter.js';
import { ErrorHandler } from '../utils/ErrorHandler.js';
import { QuotaManager } from '../utils/QuotaManager.js';
import { logDebug } from '../utils/Logger.js';
import { TIMEOUTS, USER_AGENT } from '../config/constants.js';
export class ScienceDirectSearcher extends PaperSource {
    client;
    rateLimiter;
    quotaManager;
    institutionToken;
    constructor(apiKey) {
        super('sciencedirect', 'https://api.elsevier.com', apiKey);
        this.institutionToken = process.env.ELSEVIER_INSTTOKEN || process.env.SCIDIRECT_INSTTOKEN;
        this.client = axios.create({
            baseURL: 'https://api.elsevier.com',
            timeout: TIMEOUTS.DEFAULT,
            headers: {
                'Accept': 'application/json',
                'User-Agent': USER_AGENT,
                ...(apiKey ? { 'X-ELS-APIKey': apiKey } : {})
            }
        });
        // Elsevier assigns throttling and quota per API key/service level.
        // Use a conservative default until X-RateLimit-* headers describe this key.
        const requestsPerSecond = apiKey ? 1 : 0.2;
        this.rateLimiter = new RateLimiter({
            requestsPerSecond,
            burstCapacity: 1
        });
        this.quotaManager = QuotaManager.getInstance();
        this.quotaManager.registerPlatform('sciencedirect', {
            dailyLimit: 5000,
            envPrefix: 'SCIENCEDIRECT'
        });
    }
    async search(query, options = {}) {
        const customOptions = options;
        if (!this.apiKey) {
            throw new Error('ScienceDirect API key is required');
        }
        const maxResults = Math.min(options.maxResults || 10, 100);
        const papers = [];
        try {
            // ScienceDirect Search API V2 documents PUT as the native request form.
            const requestBody = {
                query,
                count: maxResults,
                start: 0,
                sort: options.sortBy === 'date' ? 'coverDate' : 'relevance'
            };
            // Add year filter
            if (options.year) {
                if (options.year.includes('-')) {
                    const [startYear, endYear] = options.year.split('-');
                    requestBody.date = endYear ? `${startYear}-${endYear}` : startYear;
                }
                else {
                    requestBody.date = options.year;
                }
            }
            // Add author filter
            if (options.author) {
                requestBody.authors = options.author;
            }
            await this.rateLimiter.waitForPermission();
            this.quotaManager.checkQuota('sciencedirect');
            const response = await ErrorHandler.retryWithBackoff(() => this.client.put('/content/search/sciencedirect', requestBody, {
                headers: { 'Content-Type': 'application/json' },
                params: this.institutionToken ? { insttoken: this.institutionToken } : undefined
            }), { context: 'ScienceDirect search' });
            this.rateLimiter.applyResponseHeaders(response.headers);
            this.quotaManager.incrementUsage('sciencedirect');
            const results = response.data?.results
                || response.data?.['search-results']?.entry
                || [];
            for (const result of results) {
                const paper = this.parseNewApiResult(result);
                if (paper) {
                    papers.push(paper);
                }
            }
            // Enrich with abstracts if requested
            if (customOptions.includeAbstract && papers.length > 0) {
                const enrichedPapers = await this.enrichPapersWithAbstracts(papers);
                return enrichedPapers;
            }
            return papers;
        }
        catch (error) {
            this.handleHttpError(error, 'search');
        }
    }
    /**
     * Parse result from new PUT API format
     */
    parseNewApiResult(result) {
        try {
            const title = result.title || result['dc:title'] || 'No title';
            const doi = result.doi || result['prism:doi'] ||
                String(result['dc:identifier'] || '').replace(/^DOI:/i, '');
            const paperId = result.pii || doi || result['dc:identifier'];
            if (!paperId) {
                return null;
            }
            const pubDateStr = result.publicationDate || result['prism:coverDate'];
            const publishedDate = pubDateStr ? new Date(pubDateStr) : null;
            const year = publishedDate && !Number.isNaN(publishedDate.getTime())
                ? publishedDate.getFullYear()
                : undefined;
            const authors = [];
            const authorsData = result.authors || result.authors?.author || result['dc:creator'];
            if (Array.isArray(authorsData)) {
                for (const author of authorsData) {
                    const name = typeof author === 'string' ? author : author.name || author['$'] || '';
                    if (name)
                        authors.push(String(name).trim());
                }
            }
            else if (authorsData) {
                authors.push(String(authorsData).trim());
            }
            return PaperFactory.create({
                paperId: String(paperId),
                title,
                authors,
                abstract: result.abstract || result['dc:description'] || '',
                doi,
                publishedDate: publishedDate && !Number.isNaN(publishedDate.getTime()) ? publishedDate : null,
                url: result.uri || result['prism:url'] || (doi ? `https://doi.org/${doi}` : ''),
                source: 'sciencedirect',
                journal: result.sourceTitle || result['prism:publicationName'],
                year,
                extra: {
                    pii: result.pii,
                    openAccess: result.openAccess || result.openaccess || result.openaccessFlag || false,
                    volumeIssue: result.volumeIssue,
                    pages: result.pages || result['prism:pageRange']
                }
            });
        }
        catch (error) {
            logDebug('Error parsing ScienceDirect result:', error);
            return null;
        }
    }
    /**
     * Enrich papers with abstracts using Article Retrieval API
     */
    async enrichPapersWithAbstracts(papers) {
        const enrichedPapers = [];
        for (const paper of papers) {
            try {
                await this.rateLimiter.waitForPermission();
                const response = await ErrorHandler.retryWithBackoff(() => this.client.get(`/content/article/pii/${paper.paperId}`, {
                    params: { view: 'META_ABS' }
                }), { context: 'ScienceDirect abstract' });
                const coredata = response.data?.['full-text-retrieval-response']?.coredata;
                if (coredata) {
                    paper.abstract = coredata['dc:description'] || '';
                }
                enrichedPapers.push(paper);
            }
            catch (error) {
                // If enrichment fails, keep original paper
                enrichedPapers.push(paper);
            }
        }
        return enrichedPapers;
    }
    async parseEntry(entry) {
        try {
            // Extract PDF URL if available
            let pdfUrl;
            if (entry.link) {
                const pdfLink = entry.link.find(l => l['@type'] === 'application/pdf');
                if (pdfLink) {
                    pdfUrl = pdfLink['@href'];
                }
            }
            // Build paper URL
            const paperUrl = entry['prism:url'] ||
                (entry['prism:doi'] ? `https://doi.org/${entry['prism:doi']}` : undefined);
            return PaperFactory.create({
                paperId: entry['prism:doi'] || entry['dc:identifier'] || entry.pii || '',
                title: entry['dc:title'] || '',
                authors: entry['dc:creator'] ? [entry['dc:creator']] : [],
                abstract: entry['dc:description'] || '',
                doi: entry['prism:doi'],
                publishedDate: entry['prism:coverDate'] ? new Date(entry['prism:coverDate']) : null,
                pdfUrl: pdfUrl,
                url: paperUrl,
                source: 'sciencedirect',
                journal: entry['prism:publicationName'],
                volume: entry['prism:volume'],
                issue: entry['prism:issueIdentifier'],
                pages: entry['prism:pageRange'],
                extra: {
                    pii: entry.pii,
                    openAccess: entry.openaccess || entry.openaccessFlag || false
                }
            });
        }
        catch (error) {
            logDebug('Error parsing ScienceDirect entry:', error);
            return null;
        }
    }
    async getArticleDetails(doi) {
        if (!this.apiKey) {
            throw new Error('ScienceDirect API key is required');
        }
        try {
            await this.rateLimiter.waitForPermission();
            const response = await ErrorHandler.retryWithBackoff(() => this.client.get(`/content/article/doi/${doi}`, {
                params: { view: 'FULL' }
            }), { context: 'ScienceDirect article details' });
            const coredata = response.data['full-text-retrieval-response']?.coredata;
            if (!coredata)
                return null;
            // Extract authors
            let authors = '';
            if (coredata['dc:creator']) {
                if (Array.isArray(coredata['dc:creator'])) {
                    authors = coredata['dc:creator'].map((a) => a.$).join(', ');
                }
                else if (typeof coredata['dc:creator'] === 'string') {
                    authors = coredata['dc:creator'];
                }
            }
            return PaperFactory.create({
                paperId: doi,
                title: coredata['dc:title'] || '',
                authors: authors ? [authors] : [],
                abstract: coredata['dc:description'] || '',
                doi: coredata['prism:doi'] || doi,
                publishedDate: coredata['prism:coverDate'] ? new Date(coredata['prism:coverDate']) : null,
                url: `https://doi.org/${doi}`,
                source: 'sciencedirect',
                journal: coredata['prism:publicationName'],
                volume: coredata['prism:volume'],
                issue: coredata['prism:issueIdentifier'],
                pages: coredata['prism:pageRange'],
                citationCount: coredata['citedby-count'] ? parseInt(coredata['citedby-count']) : undefined
            });
        }
        catch (error) {
            logDebug('ScienceDirect article details error:', error.message);
            return null;
        }
    }
    getCapabilities() {
        return {
            search: true,
            download: false,
            fullText: false,
            citations: true,
            requiresApiKey: true,
            supportedOptions: ['maxResults', 'year', 'author', 'journal']
        };
    }
    async downloadPdf(paperId, options = {}) {
        throw new Error('PDF download requires institutional access for ScienceDirect');
    }
    async readPaper(paperId, options = {}) {
        const paper = await this.getArticleDetails(paperId);
        if (!paper) {
            throw new Error('Paper not found');
        }
        return paper.abstract || 'Abstract not available';
    }
    /**
     * 获取引用此论文的文献列表(通过Crossref/OpenCitations)
     */
    async getCitations(paperId) {
        try {
            // Get paper to check DOI
            const paper = await this.getArticleDetails(paperId);
            if (!paper || !paper.doi) {
                logDebug(`ScienceDirect paper ${paperId} has no DOI, cannot fetch citations`);
                return [];
            }
            const { CrossrefSearcher } = await import('./CrossrefSearcher.js');
            const crossref = new CrossrefSearcher();
            return await crossref.getCitations(paper.doi);
        }
        catch (error) {
            logDebug('Error getting ScienceDirect citations:', error);
            return [];
        }
    }
    /**
     * 获取论文的参考文献列表(通过Crossref)
     */
    async getReferences(paperId) {
        try {
            // Get paper to check DOI
            const paper = await this.getArticleDetails(paperId);
            if (!paper || !paper.doi) {
                logDebug(`ScienceDirect paper ${paperId} has no DOI, cannot fetch references`);
                return [];
            }
            const { CrossrefSearcher } = await import('./CrossrefSearcher.js');
            const crossref = new CrossrefSearcher();
            return await crossref.getReferences(paper.doi);
        }
        catch (error) {
            logDebug('Error getting ScienceDirect references:', error);
            return [];
        }
    }
}
//# sourceMappingURL=ScienceDirectSearcher.js.map