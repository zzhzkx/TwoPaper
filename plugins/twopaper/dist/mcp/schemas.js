import { z } from 'zod';
const SortBySchema = z.enum(['relevance', 'date', 'citations']);
const SortOrderSchema = z.enum(['asc', 'desc']);
export const SearchPapersSchema = z
    .object({
    query: z.string().min(1),
    platform: z
        .enum([
        'arxiv',
        'webofscience',
        'pubmed',
        'wos',
        'biorxiv',
        'medrxiv',
        'semantic',
        'iacr',
        'googlescholar',
        'scholar',
        'scihub',
        'sciencedirect',
        'springer',
        'scopus',
        'crossref',
        'all'
    ])
        .optional()
        .default('crossref'),
    maxResults: z.number().int().min(1).max(100).optional().default(10),
    year: z.string().optional(),
    author: z.string().optional(),
    journal: z.string().optional(),
    category: z.string().optional(),
    days: z.number().int().min(1).max(3650).optional(),
    fetchDetails: z.boolean().optional(),
    fieldsOfStudy: z.array(z.string()).optional(),
    sortBy: SortBySchema.optional().default('relevance'),
    sortOrder: SortOrderSchema.optional().default('desc')
})
    .strip();
export const SearchArxivSchema = z
    .object({
    query: z.string().min(1),
    maxResults: z.number().int().min(1).max(50).optional().default(10),
    category: z.string().optional(),
    author: z.string().optional(),
    year: z.string().optional(),
    sortBy: SortBySchema.optional(),
    sortOrder: SortOrderSchema.optional()
})
    .strip();
export const SearchWebOfScienceSchema = z
    .object({
    query: z.string().min(1),
    maxResults: z.number().int().min(1).max(50).optional().default(10),
    year: z.string().optional(),
    author: z.string().optional(),
    journal: z.string().optional(),
    sortBy: z
        .enum(['relevance', 'date', 'citations', 'title', 'author', 'journal'])
        .optional(),
    sortOrder: SortOrderSchema.optional()
})
    .strip();
export const SearchPubMedSchema = z
    .object({
    query: z.string().min(1),
    maxResults: z.number().int().min(1).max(100).optional().default(10),
    year: z.string().optional(),
    author: z.string().optional(),
    journal: z.string().optional(),
    publicationType: z.array(z.string()).optional(),
    sortBy: z.enum(['relevance', 'date']).optional()
})
    .strip();
export const SearchBioRxivSchema = z
    .object({
    query: z.string().min(1),
    maxResults: z.number().int().min(1).max(100).optional().default(10),
    days: z.number().int().min(1).max(3650).optional(),
    category: z.string().optional()
})
    .strip();
export const SearchMedRxivSchema = SearchBioRxivSchema;
export const SearchSemanticScholarSchema = z
    .object({
    query: z.string().min(1),
    maxResults: z.number().int().min(1).max(100).optional().default(10),
    year: z.string().optional(),
    fieldsOfStudy: z.array(z.string()).optional()
})
    .strip();
export const SearchIACRSchema = z
    .object({
    query: z.string().min(1),
    maxResults: z.number().int().min(1).max(50).optional().default(10),
    fetchDetails: z.boolean().optional()
})
    .strip();
export const DownloadPaperSchema = z
    .object({
    paperId: z.string().min(1),
    platform: z.enum(['arxiv', 'biorxiv', 'medrxiv', 'semantic', 'iacr', 'scihub', 'springer', 'wiley']),
    savePath: z.string().optional()
})
    .strip();
export const SearchGoogleScholarSchema = z
    .object({
    query: z.string().min(1),
    maxResults: z.number().int().min(1).max(20).optional().default(10),
    yearLow: z.number().int().optional(),
    yearHigh: z.number().int().optional(),
    author: z.string().optional()
})
    .strip();
export const GetPaperByDoiSchema = z
    .object({
    doi: z.string().min(1),
    platform: z.enum(['arxiv', 'webofscience', 'all']).optional().default('all')
})
    .strip();
export const SearchSciHubSchema = z
    .object({
    doiOrUrl: z.string().min(1),
    downloadPdf: z.boolean().optional().default(false),
    savePath: z.string().optional()
})
    .strip();
export const CheckSciHubMirrorsSchema = z
    .object({
    forceCheck: z.boolean().optional().default(false)
})
    .strip();
export const SearchScienceDirectSchema = z
    .object({
    query: z.string().min(1),
    maxResults: z.number().int().min(1).max(100).optional().default(10),
    year: z.string().optional(),
    author: z.string().optional(),
    journal: z.string().optional(),
    openAccess: z.boolean().optional()
})
    .strip();
export const SearchSpringerSchema = z
    .object({
    query: z.string().min(1),
    maxResults: z.number().int().min(1).max(100).optional().default(10),
    year: z.string().optional(),
    author: z.string().optional(),
    journal: z.string().optional(),
    subject: z.string().optional(),
    openAccess: z.boolean().optional(),
    type: z.enum(['Journal', 'Book', 'Chapter']).optional()
})
    .strip();
export const SearchScopusSchema = z
    .object({
    query: z.string().min(1),
    maxResults: z.number().int().min(1).max(25).optional().default(10),
    year: z.string().optional(),
    author: z.string().optional(),
    journal: z.string().optional(),
    affiliation: z.string().optional(),
    subject: z.string().optional(),
    openAccess: z.boolean().optional(),
    documentType: z.enum(['ar', 'cp', 're', 'bk', 'ch']).optional()
})
    .strip();
export const SearchCrossrefSchema = z
    .object({
    query: z.string().min(1),
    maxResults: z.number().int().min(1).max(100).optional().default(10),
    year: z.string().optional(),
    author: z.string().optional(),
    sortBy: SortBySchema.optional().default('relevance'),
    sortOrder: SortOrderSchema.optional().default('desc')
})
    .strip();
export const GetPlatformStatusSchema = z
    .object({
    validate: z.boolean().optional().default(false)
})
    .strip();
export const GetCitationsSchema = z
    .object({
    doi: z.string().min(1),
    forceRefresh: z.boolean().optional().default(false)
})
    .strip();
/** 合法 OA 定位（不下载）：DOI 或 title(+year)。 */
export const GetOaPdfSchema = z
    .object({
    doi: z.string().optional(),
    title: z.string().optional(),
    year: z.string().optional()
})
    .strip()
    .refine((v) => v.doi || v.title, { message: 'Provide doi or title' });
/** 统一拿 PDF：OA → 合法平台 → 桥接 scansci。落盘受下载限流管束 + PaperNamer 命名。 */
export const GetPdfSchema = z
    .object({
    doi: z.string().optional(),
    paperId: z.string().optional(),
    platform: z.string().optional(),
    savePath: z.string().optional()
})
    .strip()
    .refine((v) => v.doi || v.paperId, { message: 'Provide doi or paperId' });
/** DOI/paperId(或既有 zip 的 pdfPath) → MinerU 转 Markdown。 */
export const GetFulltextSchema = z
    .object({
    doi: z.string().optional(),
    paperId: z.string().optional(),
    platform: z.string().optional(),
    pdfPath: z.string().optional(),
    maxPages: z.number().int().min(1).max(200).optional()
})
    .strip()
    .refine((v) => v.doi || v.paperId || v.pdfPath, { message: 'Provide doi, paperId or pdfPath' });
export const GetScansciStatusSchema = z
    .object({})
    .strip();
export function parseToolArgs(toolName, args) {
    switch (toolName) {
        case 'search_papers':
            return SearchPapersSchema.parse(args);
        case 'search_arxiv':
            return SearchArxivSchema.parse(args);
        case 'search_webofscience':
            return SearchWebOfScienceSchema.parse(args);
        case 'search_pubmed':
            return SearchPubMedSchema.parse(args);
        case 'search_biorxiv':
            return SearchBioRxivSchema.parse(args);
        case 'search_medrxiv':
            return SearchMedRxivSchema.parse(args);
        case 'search_semantic_scholar':
            return SearchSemanticScholarSchema.parse(args);
        case 'search_iacr':
            return SearchIACRSchema.parse(args);
        case 'download_paper':
            return DownloadPaperSchema.parse(args);
        case 'search_google_scholar':
            return SearchGoogleScholarSchema.parse(args);
        case 'get_paper_by_doi':
            return GetPaperByDoiSchema.parse(args);
        case 'search_scihub':
            return SearchSciHubSchema.parse(args);
        case 'check_scihub_mirrors':
            return CheckSciHubMirrorsSchema.parse(args);
        case 'get_platform_status':
            return GetPlatformStatusSchema.parse(args ?? {});
        case 'get_citations':
            return GetCitationsSchema.parse(args);
        case 'search_sciencedirect':
            return SearchScienceDirectSchema.parse(args);
        case 'search_springer':
            return SearchSpringerSchema.parse(args);
        case 'search_scopus':
            return SearchScopusSchema.parse(args);
        case 'search_crossref':
            return SearchCrossrefSchema.parse(args);
        case 'get_oa_pdf':
            return GetOaPdfSchema.parse(args);
        case 'get_pdf':
            return GetPdfSchema.parse(args);
        case 'get_fulltext':
            return GetFulltextSchema.parse(args);
        case 'get_scansci_status':
            return GetScansciStatusSchema.parse(args ?? {});
        default:
            return args;
    }
}
//# sourceMappingURL=schemas.js.map