import { ArxivSearcher } from '../platforms/ArxivSearcher.js';
import { WebOfScienceSearcher } from '../platforms/WebOfScienceSearcher.js';
import { PubMedSearcher } from '../platforms/PubMedSearcher.js';
import { BioRxivSearcher, MedRxivSearcher } from '../platforms/BioRxivSearcher.js';
import { SemanticScholarSearcher } from '../platforms/SemanticScholarSearcher.js';
import { IACRSearcher } from '../platforms/IACRSearcher.js';
import { GoogleScholarSearcher } from '../platforms/GoogleScholarSearcher.js';
import { SciHubSearcher } from '../platforms/SciHubSearcher.js';
import { ScienceDirectSearcher } from '../platforms/ScienceDirectSearcher.js';
import { SpringerSearcher } from '../platforms/SpringerSearcher.js';
import { WileySearcher } from '../platforms/WileySearcher.js';
import { ScopusSearcher } from '../platforms/ScopusSearcher.js';
import { CrossrefSearcher } from '../platforms/CrossrefSearcher.js';
export interface Searchers {
    arxiv: ArxivSearcher;
    webofscience: WebOfScienceSearcher;
    pubmed: PubMedSearcher;
    wos: WebOfScienceSearcher;
    biorxiv: BioRxivSearcher;
    medrxiv: MedRxivSearcher;
    semantic: SemanticScholarSearcher;
    iacr: IACRSearcher;
    googlescholar: GoogleScholarSearcher;
    scholar: GoogleScholarSearcher;
    scihub: SciHubSearcher;
    sciencedirect: ScienceDirectSearcher;
    springer: SpringerSearcher;
    wiley: WileySearcher;
    scopus: ScopusSearcher;
    crossref: CrossrefSearcher;
}
export declare function initializeSearchers(): Searchers;
//# sourceMappingURL=searchers.d.ts.map