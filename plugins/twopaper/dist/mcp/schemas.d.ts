import { z } from 'zod';
export declare const SearchPapersSchema: z.ZodObject<{
    query: z.ZodString;
    platform: z.ZodDefault<z.ZodOptional<z.ZodEnum<["arxiv", "webofscience", "pubmed", "wos", "biorxiv", "medrxiv", "semantic", "iacr", "googlescholar", "scholar", "scihub", "sciencedirect", "springer", "scopus", "crossref", "all"]>>>;
    maxResults: z.ZodDefault<z.ZodOptional<z.ZodNumber>>;
    year: z.ZodOptional<z.ZodString>;
    author: z.ZodOptional<z.ZodString>;
    journal: z.ZodOptional<z.ZodString>;
    category: z.ZodOptional<z.ZodString>;
    days: z.ZodOptional<z.ZodNumber>;
    fetchDetails: z.ZodOptional<z.ZodBoolean>;
    fieldsOfStudy: z.ZodOptional<z.ZodArray<z.ZodString, "many">>;
    sortBy: z.ZodDefault<z.ZodOptional<z.ZodEnum<["relevance", "date", "citations"]>>>;
    sortOrder: z.ZodDefault<z.ZodOptional<z.ZodEnum<["asc", "desc"]>>>;
}, "strip", z.ZodTypeAny, {
    query: string;
    platform: "arxiv" | "webofscience" | "pubmed" | "wos" | "biorxiv" | "medrxiv" | "semantic" | "iacr" | "googlescholar" | "scholar" | "scihub" | "sciencedirect" | "springer" | "scopus" | "crossref" | "all";
    maxResults: number;
    sortBy: "relevance" | "date" | "citations";
    sortOrder: "asc" | "desc";
    year?: string | undefined;
    author?: string | undefined;
    journal?: string | undefined;
    category?: string | undefined;
    days?: number | undefined;
    fetchDetails?: boolean | undefined;
    fieldsOfStudy?: string[] | undefined;
}, {
    query: string;
    platform?: "arxiv" | "webofscience" | "pubmed" | "wos" | "biorxiv" | "medrxiv" | "semantic" | "iacr" | "googlescholar" | "scholar" | "scihub" | "sciencedirect" | "springer" | "scopus" | "crossref" | "all" | undefined;
    maxResults?: number | undefined;
    year?: string | undefined;
    author?: string | undefined;
    journal?: string | undefined;
    category?: string | undefined;
    days?: number | undefined;
    fetchDetails?: boolean | undefined;
    fieldsOfStudy?: string[] | undefined;
    sortBy?: "relevance" | "date" | "citations" | undefined;
    sortOrder?: "asc" | "desc" | undefined;
}>;
export declare const SearchArxivSchema: z.ZodObject<{
    query: z.ZodString;
    maxResults: z.ZodDefault<z.ZodOptional<z.ZodNumber>>;
    category: z.ZodOptional<z.ZodString>;
    author: z.ZodOptional<z.ZodString>;
    year: z.ZodOptional<z.ZodString>;
    sortBy: z.ZodOptional<z.ZodEnum<["relevance", "date", "citations"]>>;
    sortOrder: z.ZodOptional<z.ZodEnum<["asc", "desc"]>>;
}, "strip", z.ZodTypeAny, {
    query: string;
    maxResults: number;
    year?: string | undefined;
    author?: string | undefined;
    category?: string | undefined;
    sortBy?: "relevance" | "date" | "citations" | undefined;
    sortOrder?: "asc" | "desc" | undefined;
}, {
    query: string;
    maxResults?: number | undefined;
    year?: string | undefined;
    author?: string | undefined;
    category?: string | undefined;
    sortBy?: "relevance" | "date" | "citations" | undefined;
    sortOrder?: "asc" | "desc" | undefined;
}>;
export declare const SearchWebOfScienceSchema: z.ZodObject<{
    query: z.ZodString;
    maxResults: z.ZodDefault<z.ZodOptional<z.ZodNumber>>;
    year: z.ZodOptional<z.ZodString>;
    author: z.ZodOptional<z.ZodString>;
    journal: z.ZodOptional<z.ZodString>;
    sortBy: z.ZodOptional<z.ZodEnum<["relevance", "date", "citations", "title", "author", "journal"]>>;
    sortOrder: z.ZodOptional<z.ZodEnum<["asc", "desc"]>>;
}, "strip", z.ZodTypeAny, {
    query: string;
    maxResults: number;
    year?: string | undefined;
    author?: string | undefined;
    journal?: string | undefined;
    sortBy?: "title" | "author" | "journal" | "relevance" | "date" | "citations" | undefined;
    sortOrder?: "asc" | "desc" | undefined;
}, {
    query: string;
    maxResults?: number | undefined;
    year?: string | undefined;
    author?: string | undefined;
    journal?: string | undefined;
    sortBy?: "title" | "author" | "journal" | "relevance" | "date" | "citations" | undefined;
    sortOrder?: "asc" | "desc" | undefined;
}>;
export declare const SearchPubMedSchema: z.ZodObject<{
    query: z.ZodString;
    maxResults: z.ZodDefault<z.ZodOptional<z.ZodNumber>>;
    year: z.ZodOptional<z.ZodString>;
    author: z.ZodOptional<z.ZodString>;
    journal: z.ZodOptional<z.ZodString>;
    publicationType: z.ZodOptional<z.ZodArray<z.ZodString, "many">>;
    sortBy: z.ZodOptional<z.ZodEnum<["relevance", "date"]>>;
}, "strip", z.ZodTypeAny, {
    query: string;
    maxResults: number;
    year?: string | undefined;
    author?: string | undefined;
    journal?: string | undefined;
    sortBy?: "relevance" | "date" | undefined;
    publicationType?: string[] | undefined;
}, {
    query: string;
    maxResults?: number | undefined;
    year?: string | undefined;
    author?: string | undefined;
    journal?: string | undefined;
    sortBy?: "relevance" | "date" | undefined;
    publicationType?: string[] | undefined;
}>;
export declare const SearchBioRxivSchema: z.ZodObject<{
    query: z.ZodString;
    maxResults: z.ZodDefault<z.ZodOptional<z.ZodNumber>>;
    days: z.ZodOptional<z.ZodNumber>;
    category: z.ZodOptional<z.ZodString>;
}, "strip", z.ZodTypeAny, {
    query: string;
    maxResults: number;
    category?: string | undefined;
    days?: number | undefined;
}, {
    query: string;
    maxResults?: number | undefined;
    category?: string | undefined;
    days?: number | undefined;
}>;
export declare const SearchMedRxivSchema: z.ZodObject<{
    query: z.ZodString;
    maxResults: z.ZodDefault<z.ZodOptional<z.ZodNumber>>;
    days: z.ZodOptional<z.ZodNumber>;
    category: z.ZodOptional<z.ZodString>;
}, "strip", z.ZodTypeAny, {
    query: string;
    maxResults: number;
    category?: string | undefined;
    days?: number | undefined;
}, {
    query: string;
    maxResults?: number | undefined;
    category?: string | undefined;
    days?: number | undefined;
}>;
export declare const SearchSemanticScholarSchema: z.ZodObject<{
    query: z.ZodString;
    maxResults: z.ZodDefault<z.ZodOptional<z.ZodNumber>>;
    year: z.ZodOptional<z.ZodString>;
    fieldsOfStudy: z.ZodOptional<z.ZodArray<z.ZodString, "many">>;
}, "strip", z.ZodTypeAny, {
    query: string;
    maxResults: number;
    year?: string | undefined;
    fieldsOfStudy?: string[] | undefined;
}, {
    query: string;
    maxResults?: number | undefined;
    year?: string | undefined;
    fieldsOfStudy?: string[] | undefined;
}>;
export declare const SearchIACRSchema: z.ZodObject<{
    query: z.ZodString;
    maxResults: z.ZodDefault<z.ZodOptional<z.ZodNumber>>;
    fetchDetails: z.ZodOptional<z.ZodBoolean>;
}, "strip", z.ZodTypeAny, {
    query: string;
    maxResults: number;
    fetchDetails?: boolean | undefined;
}, {
    query: string;
    maxResults?: number | undefined;
    fetchDetails?: boolean | undefined;
}>;
export declare const DownloadPaperSchema: z.ZodObject<{
    paperId: z.ZodString;
    platform: z.ZodEnum<["arxiv", "biorxiv", "medrxiv", "semantic", "iacr", "scihub", "springer", "wiley"]>;
    savePath: z.ZodOptional<z.ZodString>;
}, "strip", z.ZodTypeAny, {
    platform: "arxiv" | "biorxiv" | "medrxiv" | "semantic" | "iacr" | "scihub" | "springer" | "wiley";
    paperId: string;
    savePath?: string | undefined;
}, {
    platform: "arxiv" | "biorxiv" | "medrxiv" | "semantic" | "iacr" | "scihub" | "springer" | "wiley";
    paperId: string;
    savePath?: string | undefined;
}>;
export declare const SearchGoogleScholarSchema: z.ZodObject<{
    query: z.ZodString;
    maxResults: z.ZodDefault<z.ZodOptional<z.ZodNumber>>;
    yearLow: z.ZodOptional<z.ZodNumber>;
    yearHigh: z.ZodOptional<z.ZodNumber>;
    author: z.ZodOptional<z.ZodString>;
}, "strip", z.ZodTypeAny, {
    query: string;
    maxResults: number;
    author?: string | undefined;
    yearLow?: number | undefined;
    yearHigh?: number | undefined;
}, {
    query: string;
    maxResults?: number | undefined;
    author?: string | undefined;
    yearLow?: number | undefined;
    yearHigh?: number | undefined;
}>;
export declare const GetPaperByDoiSchema: z.ZodObject<{
    doi: z.ZodString;
    platform: z.ZodDefault<z.ZodOptional<z.ZodEnum<["all", "arxiv", "webofscience", "wos", "pubmed", "biorxiv", "medrxiv", "semantic", "iacr", "googlescholar", "scholar", "sciencedirect", "springer", "scopus", "crossref", "scihub", "wiley"]>>>;
}, "strip", z.ZodTypeAny, {
    platform: "arxiv" | "webofscience" | "pubmed" | "wos" | "biorxiv" | "medrxiv" | "semantic" | "iacr" | "googlescholar" | "scholar" | "scihub" | "sciencedirect" | "springer" | "scopus" | "crossref" | "all" | "wiley";
    doi: string;
}, {
    doi: string;
    platform?: "arxiv" | "webofscience" | "pubmed" | "wos" | "biorxiv" | "medrxiv" | "semantic" | "iacr" | "googlescholar" | "scholar" | "scihub" | "sciencedirect" | "springer" | "scopus" | "crossref" | "all" | "wiley" | undefined;
}>;
export declare const SearchSciHubSchema: z.ZodObject<{
    doiOrUrl: z.ZodString;
    downloadPdf: z.ZodDefault<z.ZodOptional<z.ZodBoolean>>;
    savePath: z.ZodOptional<z.ZodString>;
}, "strip", z.ZodTypeAny, {
    doiOrUrl: string;
    downloadPdf: boolean;
    savePath?: string | undefined;
}, {
    doiOrUrl: string;
    savePath?: string | undefined;
    downloadPdf?: boolean | undefined;
}>;
export declare const CheckSciHubMirrorsSchema: z.ZodObject<{
    forceCheck: z.ZodDefault<z.ZodOptional<z.ZodBoolean>>;
}, "strip", z.ZodTypeAny, {
    forceCheck: boolean;
}, {
    forceCheck?: boolean | undefined;
}>;
export declare const SearchScienceDirectSchema: z.ZodObject<{
    query: z.ZodString;
    maxResults: z.ZodDefault<z.ZodOptional<z.ZodNumber>>;
    year: z.ZodOptional<z.ZodString>;
    author: z.ZodOptional<z.ZodString>;
    journal: z.ZodOptional<z.ZodString>;
    openAccess: z.ZodOptional<z.ZodBoolean>;
}, "strip", z.ZodTypeAny, {
    query: string;
    maxResults: number;
    year?: string | undefined;
    author?: string | undefined;
    journal?: string | undefined;
    openAccess?: boolean | undefined;
}, {
    query: string;
    maxResults?: number | undefined;
    year?: string | undefined;
    author?: string | undefined;
    journal?: string | undefined;
    openAccess?: boolean | undefined;
}>;
export declare const SearchSpringerSchema: z.ZodObject<{
    query: z.ZodString;
    maxResults: z.ZodDefault<z.ZodOptional<z.ZodNumber>>;
    year: z.ZodOptional<z.ZodString>;
    author: z.ZodOptional<z.ZodString>;
    journal: z.ZodOptional<z.ZodString>;
    subject: z.ZodOptional<z.ZodString>;
    openAccess: z.ZodOptional<z.ZodBoolean>;
    type: z.ZodOptional<z.ZodEnum<["Journal", "Book", "Chapter"]>>;
}, "strip", z.ZodTypeAny, {
    query: string;
    maxResults: number;
    type?: "Journal" | "Book" | "Chapter" | undefined;
    year?: string | undefined;
    author?: string | undefined;
    journal?: string | undefined;
    openAccess?: boolean | undefined;
    subject?: string | undefined;
}, {
    query: string;
    type?: "Journal" | "Book" | "Chapter" | undefined;
    maxResults?: number | undefined;
    year?: string | undefined;
    author?: string | undefined;
    journal?: string | undefined;
    openAccess?: boolean | undefined;
    subject?: string | undefined;
}>;
export declare const SearchScopusSchema: z.ZodObject<{
    query: z.ZodString;
    maxResults: z.ZodDefault<z.ZodOptional<z.ZodNumber>>;
    year: z.ZodOptional<z.ZodString>;
    author: z.ZodOptional<z.ZodString>;
    journal: z.ZodOptional<z.ZodString>;
    affiliation: z.ZodOptional<z.ZodString>;
    subject: z.ZodOptional<z.ZodString>;
    openAccess: z.ZodOptional<z.ZodBoolean>;
    documentType: z.ZodOptional<z.ZodEnum<["ar", "cp", "re", "bk", "ch"]>>;
}, "strip", z.ZodTypeAny, {
    query: string;
    maxResults: number;
    year?: string | undefined;
    author?: string | undefined;
    journal?: string | undefined;
    openAccess?: boolean | undefined;
    subject?: string | undefined;
    affiliation?: string | undefined;
    documentType?: "ar" | "cp" | "re" | "bk" | "ch" | undefined;
}, {
    query: string;
    maxResults?: number | undefined;
    year?: string | undefined;
    author?: string | undefined;
    journal?: string | undefined;
    openAccess?: boolean | undefined;
    subject?: string | undefined;
    affiliation?: string | undefined;
    documentType?: "ar" | "cp" | "re" | "bk" | "ch" | undefined;
}>;
export declare const SearchCrossrefSchema: z.ZodObject<{
    query: z.ZodString;
    maxResults: z.ZodDefault<z.ZodOptional<z.ZodNumber>>;
    year: z.ZodOptional<z.ZodString>;
    author: z.ZodOptional<z.ZodString>;
    sortBy: z.ZodDefault<z.ZodOptional<z.ZodEnum<["relevance", "date", "citations"]>>>;
    sortOrder: z.ZodDefault<z.ZodOptional<z.ZodEnum<["asc", "desc"]>>>;
}, "strip", z.ZodTypeAny, {
    query: string;
    maxResults: number;
    sortBy: "relevance" | "date" | "citations";
    sortOrder: "asc" | "desc";
    year?: string | undefined;
    author?: string | undefined;
}, {
    query: string;
    maxResults?: number | undefined;
    year?: string | undefined;
    author?: string | undefined;
    sortBy?: "relevance" | "date" | "citations" | undefined;
    sortOrder?: "asc" | "desc" | undefined;
}>;
export declare const GetPlatformStatusSchema: z.ZodObject<{
    validate: z.ZodDefault<z.ZodOptional<z.ZodBoolean>>;
}, "strip", z.ZodTypeAny, {
    validate: boolean;
}, {
    validate?: boolean | undefined;
}>;
export declare const GetCitationsSchema: z.ZodObject<{
    doi: z.ZodString;
    forceRefresh: z.ZodDefault<z.ZodOptional<z.ZodBoolean>>;
}, "strip", z.ZodTypeAny, {
    doi: string;
    forceRefresh: boolean;
}, {
    doi: string;
    forceRefresh?: boolean | undefined;
}>;
/** 合法 OA 定位（不下载）：DOI 或 title(+year)。 */
export declare const GetOaPdfSchema: z.ZodEffects<z.ZodObject<{
    doi: z.ZodOptional<z.ZodString>;
    title: z.ZodOptional<z.ZodString>;
    year: z.ZodOptional<z.ZodString>;
}, "strip", z.ZodTypeAny, {
    title?: string | undefined;
    year?: string | undefined;
    doi?: string | undefined;
}, {
    title?: string | undefined;
    year?: string | undefined;
    doi?: string | undefined;
}>, {
    title?: string | undefined;
    year?: string | undefined;
    doi?: string | undefined;
}, {
    title?: string | undefined;
    year?: string | undefined;
    doi?: string | undefined;
}>;
/** 统一拿 PDF：OA → 合法平台 → 桥接 scansci。落盘受下载限流管束 + PaperNamer 命名。 */
export declare const GetPdfSchema: z.ZodEffects<z.ZodObject<{
    doi: z.ZodOptional<z.ZodString>;
    paperId: z.ZodOptional<z.ZodString>;
    platform: z.ZodOptional<z.ZodString>;
    savePath: z.ZodOptional<z.ZodString>;
}, "strip", z.ZodTypeAny, {
    platform?: string | undefined;
    paperId?: string | undefined;
    savePath?: string | undefined;
    doi?: string | undefined;
}, {
    platform?: string | undefined;
    paperId?: string | undefined;
    savePath?: string | undefined;
    doi?: string | undefined;
}>, {
    platform?: string | undefined;
    paperId?: string | undefined;
    savePath?: string | undefined;
    doi?: string | undefined;
}, {
    platform?: string | undefined;
    paperId?: string | undefined;
    savePath?: string | undefined;
    doi?: string | undefined;
}>;
/** DOI/paperId(或既有 zip 的 pdfPath) → MinerU 转 Markdown。 */
export declare const GetFulltextSchema: z.ZodEffects<z.ZodObject<{
    doi: z.ZodOptional<z.ZodString>;
    paperId: z.ZodOptional<z.ZodString>;
    platform: z.ZodOptional<z.ZodString>;
    pdfPath: z.ZodOptional<z.ZodString>;
    maxPages: z.ZodOptional<z.ZodNumber>;
}, "strip", z.ZodTypeAny, {
    platform?: string | undefined;
    paperId?: string | undefined;
    doi?: string | undefined;
    pdfPath?: string | undefined;
    maxPages?: number | undefined;
}, {
    platform?: string | undefined;
    paperId?: string | undefined;
    doi?: string | undefined;
    pdfPath?: string | undefined;
    maxPages?: number | undefined;
}>, {
    platform?: string | undefined;
    paperId?: string | undefined;
    doi?: string | undefined;
    pdfPath?: string | undefined;
    maxPages?: number | undefined;
}, {
    platform?: string | undefined;
    paperId?: string | undefined;
    doi?: string | undefined;
    pdfPath?: string | undefined;
    maxPages?: number | undefined;
}>;
export declare const GetScansciStatusSchema: z.ZodObject<{}, "strip", z.ZodTypeAny, {}, {}>;
export type ToolName = 'search_papers' | 'search_arxiv' | 'search_webofscience' | 'search_pubmed' | 'search_biorxiv' | 'search_medrxiv' | 'search_semantic_scholar' | 'search_iacr' | 'download_paper' | 'search_google_scholar' | 'get_paper_by_doi' | 'search_scihub' | 'check_scihub_mirrors' | 'get_platform_status' | 'search_sciencedirect' | 'search_springer' | 'search_scopus' | 'search_crossref' | 'get_citations' | 'get_oa_pdf' | 'get_pdf' | 'get_fulltext' | 'get_scansci_status';
export declare function parseToolArgs(toolName: ToolName, args: unknown): any;
//# sourceMappingURL=schemas.d.ts.map