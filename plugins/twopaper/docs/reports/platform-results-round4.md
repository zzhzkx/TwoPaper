# 逐平台检索——实际返回数据

采集时间 2026-09-16 · 每平台 1 次 · 真实 MCP stdio

## 汇总

| 平台 | 工具 | ok | 延迟 | 条目 |
|---|---|---|---|---|
| arxiv | `search_arxiv` | true | 1028ms | 5 |
| biorxiv | `search_biorxiv` | true | 3112ms | — |
| citations_oa | `get_citations` | true | 664ms | 1 |
| crossref | `search_crossref` | true | 2327ms | 5 |
| doi_wos | `get_paper_by_doi` | true | 8902ms | 6 |
| googlescholar | `search_google_scholar` | false | 45159ms | — |
| iacr | `search_iacr` | true | 1592ms | 5 |
| medrxiv | `search_medrxiv` | true | 2066ms | — |
| pubmed | `search_pubmed` | true | 2347ms | 5 |
| sciencedirect | `search_sciencedirect` | false | 962ms | — |
| scihub | `search_scihub` | true | 23063ms | — |
| scopus | `search_scopus` | true | 1281ms | 5 |
| semantic | `search_semantic_scholar` | false | 8655ms | — |
| springer | `search_springer` | true | 2172ms | 5 |
| webofscience | `search_webofscience` | true | 822ms | 5 |

## arxiv

- 工具：`search_arxiv`  参数：`{"query":"transformer attention mechanism","maxResults":5}`
- 结果：ok=true  延迟=1028ms

1. **Transformer-based Personalized Attention Mechanism for Medical Images with Clinical Records**
   - 作者：Yusuke Takagi; Noriaki Hashimoto; Hiroki Masuda; Hiroaki Miyoshi; Koichi Ohshima; Hidekata Hontani; Ichiro Takeuchi
   - year：2022
   - published_date：2022-06-07T04:35:22.000Z
   - pdf_url：https://arxiv.org/pdf/2206.03003v2
   - url：https://arxiv.org/abs/2206.03003v2
   - 摘要：In medical image diagnosis, identifying the attention region, i.e., the region of interest for which the diagnosis is made, is an important task. Various methods have been developed to automatically i…

2. **Dilated Neighborhood Attention Transformer**
   - 作者：Ali Hassani; Humphrey Shi
   - year：2022
   - published_date：2022-09-29T17:57:08.000Z
   - pdf_url：https://arxiv.org/pdf/2209.15001v3
   - url：https://arxiv.org/abs/2209.15001v3
   - 摘要：Transformers are quickly becoming one of the most heavily applied deep learning architectures across modalities, domains, and tasks. In vision, on top of ongoing efforts into plain transformers, hiera…

3. **Music Transformer**
   - 作者：Cheng-Zhi Anna Huang; Ashish Vaswani; Jakob Uszkoreit; Noam Shazeer; Ian Simon; Curtis Hawthorne; Andrew M. Dai; Matthew
   - year：2018
   - published_date：2018-09-12T07:15:26.000Z
   - pdf_url：https://arxiv.org/pdf/1809.04281v3
   - url：https://arxiv.org/abs/1809.04281v3
   - 摘要：Music relies heavily on repetition to build structure and meaning. Self-reference occurs on multiple timescales, from motifs to phrases to reusing of entire sections of music, such as in pieces with A…

4. **Déjà vu: A Contextualized Temporal Attention Mechanism for Sequential Recommendation**
   - 作者：Jibang Wu; Renqin Cai; Hongning Wang
   - year：2020
   - published_date：2020-01-29T20:27:42.000Z
   - pdf_url：https://arxiv.org/pdf/2002.00741v1
   - url：https://arxiv.org/abs/2002.00741v1
   - 摘要：Predicting users' preferences based on their sequential behaviors in history is challenging and crucial for modern recommender systems. Most existing sequential recommendation algorithms focus on tran…

5. **Energy-Gated Attention and Wavelet Positional Encoding: Complementary Inductive Biases for Transformer Attention**
   - 作者：Athanasios Zeris
   - year：2026
   - published_date：2026-05-25T22:04:31.000Z
   - pdf_url：https://arxiv.org/pdf/2605.26355v1
   - url：https://arxiv.org/abs/2605.26355v1
   - 摘要：Standard transformer attention computes pairwise token similarity but treats all tokens as equally salient and all positions as equally local, regardless of the informational structure of the input. W…

## biorxiv

- 工具：`search_biorxiv`  参数：`{"query":"CRISPR gene editing","maxResults":5,"days":3650}`
- 结果：ok=true  延迟=3112ms

```
Found 0 bioRxiv papers.

[]
```

## citations_oa

- 工具：`get_citations`  参数：`{"doi":"10.1371/journal.pone.0171226"}`
- 结果：ok=true  延迟=664ms

1. **Exposure to digital marketing enhances young adults’ interest in energy drinks: An exploratory investigation**
   - 作者：['Limin Buchanan (119094921)', 'Bridget Kelly (144563911)', 'H. Yeatman (2678400)']
   - DOI：`10.1371/journal.pone.0171226`
   - venue：PLoS ONE
   - year：2017
   - citation_count：85
   - url：https://www.semanticscholar.org/paper/e2387864b7e41f3ed3d59cc7c8849ce8d147a4ff

## crossref

- 工具：`search_crossref`  参数：`{"query":"transformer attention mechanism","maxResults":5}`
- 结果：ok=true  延迟=2327ms

1. **Figure 3: Schematic of Swin Transformer self-attention mechanism.**
   - DOI：`10.7717/peerj-cs.3829/fig-3`
   - year：2026
   - published_date：2026-05-25T16:00:00.000Z
   - url：https://doi.org/10.7717/peerj-cs.3829/fig-3

2. **GDPooled transformer: glaucoma detection using pooled attention based transformer with attention mechanism**
   - 作者：V. C. Bharathi; Sharmila Shaik
   - DOI：`10.1007/s10792-026-03966-3`
   - journal：International Ophthalmology
   - year：2026
   - published_date：2026-01-30T16:00:00.000Z
   - citation_count：1
   - url：https://doi.org/10.1007/s10792-026-03966-3

3. **Generalized Attention Mechanism and Relative Position for Transformer**
   - 作者：Raja Vikram Pandya
   - DOI：`10.31224/2476`
   - year：2022
   - published_date：2022-07-26T16:00:00.000Z
   - url：https://doi.org/10.31224/2476

4. **Combining Transformer and Reverse Attention Mechanism for Polyp Segmentation**
   - 作者：Jianzhuang Lin; Wenzhong Yang; Sixiang Tan
   - DOI：`10.5220/0012014800003633`
   - journal：Proceedings of the 4th International Conference on Biotechnology and Biomedicine
   - year：2022
   - published_date：2021-12-31T16:00:00.000Z
   - citation_count：1
   - url：https://doi.org/10.5220/0012014800003633

5. **What is attention mechanism? A comprehensive survey of attention methods and transformer models**
   - 作者：Farhad Mortezapour Shiri; Fateme Memar; Maryam Parhizgar
   - DOI：`10.31224/7307`
   - year：2026
   - published_date：2026-08-09T16:00:00.000Z
   - url：https://doi.org/10.31224/7307
   - 摘要：The attention mechanism is a fundamental component widely used in deep learning models across numerous domains and tasks. It enables models to selectively focus on the most relevant parts of the input…

## doi_wos

- 工具：`get_paper_by_doi`  参数：`{"doi":"10.1038/nature12373"}`
- 结果：ok=true  延迟=8902ms

1. **Nanometer scale quantum thermometry in a living cell**
   - 作者：G. Kucsko; P. C. Maurer; N. Y. Yao; M. Kubo; H. J. Noh; P. K. Lo; H. Park; M. D. Lukin
   - DOI：`10.1038/nature12373`
   - year：2013
   - published_date：2013-04-03T19:41:29.000Z
   - pdf_url：https://arxiv.org/pdf/1304.1068v1
   - url：https://arxiv.org/abs/1304.1068v1
   - 摘要：Sensitive probing of temperature variations on nanometer scales represents an outstanding challenge in many areas of modern science and technology. In particular, a thermometer capable of sub-degree t…

2. **Nanometre-scale thermometry in a living cell**
   - 作者：Kucsko, G.; Maurer, P. C.; Yao, N. Y.; Kubo, M.; Noh, H. J.; Lo, P. K.; Park, H.; Lukin, M. D.
   - DOI：`10.1038/nature12373`
   - journal：NATURE
   - year：2013
   - published_date：2012-12-31T16:00:00.000Z
   - citation_count：1703
   - url：https://www.webofscience.com/wos/woscc/full-record/WOS:000322514800026

3. **Nanometre-scale thermometry in a living cell.**
   - 作者：Kucsko, G; Maurer, P C; Yao, N Y; Kubo, M; Noh, H J; Lo, P K; Park, H; Lukin, M D
   - DOI：`10.1038/nature12373`
   - journal：Nature
   - year：2013
   - published_date：2013-07-31T16:00:00.000Z
   - pdf_url：https://www.ncbi.nlm.nih.gov/pmc/articles/PMC4221854/pdf/
   - url：https://pubmed.ncbi.nlm.nih.gov/23903748/
   - 摘要：Sensitive probing of temperature variations on nanometre scales is an outstanding challenge in many areas of modern science and technology. In particular, a thermometer capable of subdegree temperatur…

4. **Multimodal scanning-probe quantum sensing of quantum materials**
   - 作者：Li; Senlei; Jacques; Vincent; Maletinsky; Patrick; Degen; Christian L.; Du; Chunhui Rita
   - DOI：`10.1038/s41563-026-02648-w`
   - journal：Nature Materials
   - published_date：2026-09-01T00:00:00.000Z
   - pdf_url：https://www.nature.com/articles/s41563-026-02648-w.pdf
   - url：https://www.nature.com/articles/s41563-026-02648-w
   - 摘要：Spin-defect-based quantum microscopy has recently made transformative advances in cutting-edge scientific research and technological innovation. The high sensitivity, high spatial resolution and excel…

5. **(无标题)**

6. **Nanometre-scale thermometry in a living cell**
   - 作者：G. Kucsko; P. C. Maurer; N. Y. Yao; M. Kubo; H. J. Noh; P. K. Lo; H. Park; M. D. Lukin
   - DOI：`10.1038/nature12373`
   - journal：Nature
   - year：2013
   - published_date：2013-07-31T16:00:00.000Z
   - citation_count：1818
   - url：https://doi.org/10.1038/nature12373

## googlescholar

- 工具：`search_google_scholar`  参数：`{"query":"transformer attention mechanism","maxResults":5}`
- 结果：ok=false  延迟=45159ms

```
Error executing tool 'search_google_scholar': google_scholar search failed: conn*************************************************************************************************************************************************************************************************************************:443
```

## iacr

- 工具：`search_iacr`  参数：`{"query":"lattice based cryptography","maxResults":5}`
- 结果：ok=true  延迟=1592ms

1. **Towards Practical Iterative Rejection Sampling: A Compact and Efficient Signature over Module Lattices**
   - 作者：Yifan Ming; Jipeng Zhang; Zihan Liu; Guofeng Tang; Pengfei Chen; Yutao Sun; Si Gao; Cong Zhang; Long Chen
   - year：2026
   - published_date：2026-09-12T00:00:00.000Z
   - pdf_url：https://eprint.iacr.org/2026/1991.pdf
   - url：https://eprint.iacr.org/2026/1991
   - 摘要：Lattice signatures face a strict trade-off among compactness, implementation simplicity, and reliance on standard lattice assumptions: ML-DSA-44 requires a 2420-byte signature (3732 bytes combined) an…

2. **Akita: A High-Performance Lattice-Based Polynomial Commitment Scheme**
   - 作者：Quang Dao; Omid Bodaghi; Amirhossein Khajehpour; Giuseppe Vitto; Mohammadtaghi Badakhshan; Markos Georghiades; Fengrun L
   - year：2026
   - published_date：2026-09-11T00:00:00.000Z
   - pdf_url：https://eprint.iacr.org/2026/1983.pdf
   - url：https://eprint.iacr.org/2026/1983
   - 摘要：Lattice-based polynomial commitment schemes (PCSs) promise post-quantum SNARKs with two properties that elliptic curves provide and hash-based schemes, today's deployed post-quantum default, do not: c…

3. **Lattice-based Threshold Traitor Tracing with Public Traceability**
   - 作者：Sébastien Canard; Nathan Papon; Duong Hieu Phan
   - year：2026
   - published_date：2026-09-10T00:00:00.000Z
   - pdf_url：https://eprint.iacr.org/2026/1965.pdf
   - url：https://eprint.iacr.org/2026/1965
   - 摘要：Since the introduction of Threshold Traitor Tracing by Boneh, Partap and Rotem at CRYPTO '24, several works have extended the functionalities within the framework or improved the parameters. However, …

4. **DualMS 2.0: Practical Lattice-Based Two-Round Fiat-Shamir Multi-Signature with Better Efficiency**
   - 作者：Qiqi Lai; Chongshen Chen; Feng-Hao Liu; Tianyu Zhao; Qi Wang; Zhedong Wang
   - year：2026
   - published_date：2026-09-09T00:00:00.000Z
   - pdf_url：https://eprint.iacr.org/2026/1941.pdf
   - url：https://eprint.iacr.org/2026/1941
   - 摘要：We present a more practical lattice-based two-round Fiat–Shamir multi-signature scheme that achieves a substantial reduction in signature size compared with DualMS, the state-of-the-art two-round latt…

5. **Reproducible Design-Space Study of Lightweight Lattice-Based Authentication and Signatures for Blockchain Transactions**
   - 作者：Zhiqian Lin
   - year：2026
   - published_date：2026-09-08T00:00:00.000Z
   - pdf_url：https://eprint.iacr.org/2026/1925.pdf
   - url：https://eprint.iacr.org/2026/1925
   - 摘要：Quantum computers threaten the classical public-key primitives (RSA, ECDSA) used by most blockchains today; NIST has therefore standardized lattice-based signatures (ML-DSA, FIPS 204; and FN-DSA, a FA…

## medrxiv

- 工具：`search_medrxiv`  参数：`{"query":"CRISPR gene editing","maxResults":5,"days":3650}`
- 结果：ok=true  延迟=2066ms

```
Found 0 medRxiv papers.

[]
```

## pubmed

- 工具：`search_pubmed`  参数：`{"query":"CRISPR gene editing","maxResults":5}`
- 结果：ok=true  延迟=2347ms

1. **CRISPR-Cas9 system: A new-fangled dawn in gene editing.**
   - 作者：Gupta, Darshana; Bhattacharjee, Oindrila; Mandal, Drishti; Sen, Madhab Kumar; Dey, Dhritiman; Dasgupta, Adhiraj; Kazi, T
   - DOI：`10.1016/j.lfs.2019.116636`
   - journal：Life sciences
   - year：2019
   - published_date：2019-08-31T16:00:00.000Z
   - url：https://pubmed.ncbi.nlm.nih.gov/31295471/
   - 摘要：Till date, only three techniques namely Zinc Finger Nuclease (ZFN), Transcription-Activator Like Effector Nucleases (TALEN) and Clustered Regularly Interspaced Short Palindromic Repeats-CRISPR-Associa…

2. **CRISPR-mediated gene editing for the surgeon scientist.**
   - 作者：O'Brien, Stephen J; Ekman, Matthew B; Manek, Stephen; Galandiuk, Susan
   - DOI：`10.1016/j.surg.2019.01.030`
   - journal：Surgery
   - year：2019
   - published_date：2019-07-31T16:00:00.000Z
   - url：https://pubmed.ncbi.nlm.nih.gov/30922545/
   - 摘要：Tremendous advances have occurred in gene editing during the past 20 years with the development of a number of systems. The Clustered Regularly Interspaced Short Palindromic Repeats (CRISPR)-associate…

3. **CRISPR technology: A decade of genome editing is only the beginning.**
   - 作者：Wang, Joy Y; Doudna, Jennifer A
   - DOI：`10.1126/science.add8643`
   - journal：Science (New York, N.Y.)
   - year：2023
   - published_date：2023-01-19T16:00:00.000Z
   - url：https://pubmed.ncbi.nlm.nih.gov/36656942/
   - 摘要：The advent of clustered regularly interspaced short palindromic repeat (CRISPR) genome editing, coupled with advances in computing and imaging capabilities, has initiated a new era in which genetic di…

4. **Efficient CRISPR/Cas9 Gene Editing in Uncultured Naive Mouse T Cells for In Vivo Studies.**
   - 作者：Nüssing, Simone; House, Imran G; Kearney, Conor J; Chen, Amanda X Y; Vervoort, Stephin J; Beavis, Paul A; Oliaro, Jane; 
   - DOI：`10.4049/jimmunol.1901396`
   - journal：Journal of immunology (Baltimore, Md. : 1950)
   - year：2020
   - published_date：2020-04-14T16:00:00.000Z
   - url：https://pubmed.ncbi.nlm.nih.gov/32152070/

5. **CRISPR-Based Gene Editing: a Modern Approach for Study and Treatment of Cancer.**
   - 作者：Talukder, Pratik; Chanda, Sounak; Chaudhuri, Biswadeep; Choudhury, Sonjoy Roy; Saha, Debanjan; Dash, Sudipta; Banerjee, 
   - DOI：`10.1007/s12010-023-04708-2`
   - journal：Applied biochemistry and biotechnology
   - year：2024
   - published_date：2024-06-30T16:00:00.000Z
   - url：https://pubmed.ncbi.nlm.nih.gov/37737443/
   - 摘要：The development and emergence of clustered regularly interspaced short palindromic repeats (CRISPR) as a genome-editing technology have created a plethora of opportunities in genetic engineering. The …

## sciencedirect

- 工具：`search_sciencedirect`  参数：`{"query":"transformer attention mechanism","maxResults":5}`
- 结果：ok=false  延迟=962ms

```
Error executing tool 'search_sciencedirect': sciencedirect: Invalid or missing API key. Please check your credentials.
```

## scihub

- 工具：`search_scihub`  参数：`{"doiOrUrl":"10.48550/arXiv.1706.03762"}`
- 结果：ok=true  延迟=23063ms

```
No paper found on Sci-Hub for: 10.48550/arXiv.1706.03762
```

## scopus

- 工具：`search_scopus`  参数：`{"query":"transformer attention mechanism","maxResults":5}`
- 结果：ok=true  延迟=1281ms

1. **Structured-DGA transformer for power transformer fault diagnosis under missing-gas setting**
   - 作者：Xi S.
   - DOI：`10.1016/j.epsr.2026.114017`
   - journal：Electric Power Systems Research
   - published_date：2027-04-01T00:00:00.000Z
   - url：https://api.elsevier.com/content/abstract/scopus_id/105048854767

2. **HMDA-Net: Hybrid multi-dimensional attention network for aerial power line segmentation**
   - 作者：Fang Z.
   - DOI：`10.1016/j.epsr.2026.113947`
   - journal：Electric Power Systems Research
   - published_date：2027-04-01T00:00:00.000Z
   - url：https://api.elsevier.com/content/abstract/scopus_id/105046798139

3. **A parallel ensemble framework with multiscale convolution and validation-optimized weighting for wind power forecasting**
   - 作者：Jiang W.
   - DOI：`10.1016/j.epsr.2026.113967`
   - journal：Electric Power Systems Research
   - published_date：2027-04-01T00:00:00.000Z
   - url：https://api.elsevier.com/content/abstract/scopus_id/105046880598

4. **Electricity load forecasting based on time-varying frequency domain attention enhanced LSTM network**
   - 作者：Liu X.
   - DOI：`10.1016/j.epsr.2026.113860`
   - journal：Electric Power Systems Research
   - published_date：2027-03-01T00:00:00.000Z
   - url：https://api.elsevier.com/content/abstract/scopus_id/105045857814

5. **Research on infrared thermal fault detection for transformer bushings based on the LTF-YOLO algorithm**
   - 作者：Fu Z.
   - DOI：`10.1016/j.epsr.2026.113820`
   - journal：Electric Power Systems Research
   - published_date：2027-03-01T00:00:00.000Z
   - url：https://api.elsevier.com/content/abstract/scopus_id/105045173363

## semantic

- 工具：`search_semantic_scholar`  参数：`{"query":"transformer attention mechanism","maxResults":5}`
- 结果：ok=false  延迟=8655ms

```
Error executing tool 'search_semantic_scholar': semantic: Rate limit exceeded. Please wait before making more requests.
```

## springer

- 工具：`search_springer`  参数：`{"query":"transformer attention mechanism","maxResults":5}`
- 结果：ok=true  延迟=2172ms

1. **Hybrid Deep Learning Framework for Lung Disease Detection Using CT and X-ray Images**
   - 作者：Pugazhendhi; M. Arul; Hemanth; S.; Muritala; Ismaila; Kumar; T. Ananth; Ajiboye; Grace O.; Balogun; Rukayat; Ajagbe; Sun
   - DOI：`10.1007/978-3-032-31998-2_31`
   - journal：From Algorithms to Applications: Computational Breakthroughs in Information Systems and Management Science
   - published_date：2027-01-01T00:00:00.000Z
   - pdf_url：http://link.springer.com/openurl/pdf?id=doi:10.1007/978-3-032-31998-2_31
   - url：http://link.springer.com/openurl/fulltext?id=doi:10.1007/978-3-032-31998-2_31
   - 摘要：The lung diseases including pneumonia, tuberculosis, COVID-19 and lung cancer have a significant effect on the respiratory system, as they reduce the efficiency of breathing, as well as interfere with…

2. **A Novel Hybrid Transformer-Based Framework for Reconstruction-Based ECG Anomaly Detection**
   - 作者：Sharma; Aashish; Jain; Shweta; Aggarwal; Rishit; Mishra; Rajiv; Gandhi; Anju Bhandari; Lakhina; Upasana
   - DOI：`10.1007/978-3-032-31998-2_15`
   - journal：From Algorithms to Applications: Computational Breakthroughs in Information Systems and Management Science
   - published_date：2027-01-01T00:00:00.000Z
   - pdf_url：http://link.springer.com/openurl/pdf?id=doi:10.1007/978-3-032-31998-2_15
   - url：http://link.springer.com/openurl/fulltext?id=doi:10.1007/978-3-032-31998-2_15
   - 摘要：Early detection of heart disorders relies heavily on identifying abnormalities in electrocardiogram (ECG) signals, yet most deep learning methods depend on large annotated datasets, which are difficul…

3. **Survey on Multimodal Product Reviews Summarisation in E-Commerce**
   - 作者：Subbapurmath; Nagbhushan R; Misra; Rajiv; Verma; Pradeepika
   - DOI：`10.1007/978-3-032-31998-2_10`
   - journal：From Algorithms to Applications: Computational Breakthroughs in Information Systems and Management Science
   - published_date：2027-01-01T00:00:00.000Z
   - pdf_url：http://link.springer.com/openurl/pdf?id=doi:10.1007/978-3-032-31998-2_10
   - url：http://link.springer.com/openurl/fulltext?id=doi:10.1007/978-3-032-31998-2_10
   - 摘要：The proliferation of e-commerce systems and online marketplaces has resulted in an enormous volume of user-generated content, such as textual reviews, product pictures, demonstration videos, voice fee…

4. **Lightweight Attention-Based Deep Learning Models for Marine Vegetation Classification**
   - 作者：Grewal; Jatin; Sowmya Kamath; S.; Geetha; V.
   - DOI：`10.1007/978-3-032-31998-2_25`
   - journal：From Algorithms to Applications: Computational Breakthroughs in Information Systems and Management Science
   - published_date：2027-01-01T00:00:00.000Z
   - pdf_url：http://link.springer.com/openurl/pdf?id=doi:10.1007/978-3-032-31998-2_25
   - url：http://link.springer.com/openurl/fulltext?id=doi:10.1007/978-3-032-31998-2_25
   - 摘要：The rapid spread of invasive aquatic plants such as water hyacinth poses significant ecological and economic threats to freshwater ecosystems. Timely, accurate and detailed monitoring is critical for …

5. **Real-Time Indian Sign Language Recognition Using Hierarchical Windowed Graph Attention Networks with Motion-Gated Inference and Multi-language Support**
   - 作者：Verma; Chhavi; Sharma; Nonita
   - DOI：`10.1007/978-3-032-31998-2_21`
   - journal：From Algorithms to Applications: Computational Breakthroughs in Information Systems and Management Science
   - published_date：2027-01-01T00:00:00.000Z
   - pdf_url：http://link.springer.com/openurl/pdf?id=doi:10.1007/978-3-032-31998-2_21
   - url：http://link.springer.com/openurl/fulltext?id=doi:10.1007/978-3-032-31998-2_21
   - 摘要：Purpose: Over 5M+ people in India rely on Indian Sign Language for communication with specially-abled people, and yet technological support remains very limited. We developed a real-time ISL recogniti…

## webofscience

- 工具：`search_webofscience`  参数：`{"query":"transformer attention mechanism","maxResults":5}`
- 结果：ok=true  延迟=822ms

1. **PERFORMANCE OF NEW MATERIALS IN TRANSFORMER CORES**
   - 作者：PFUTZNER, H
   - DOI：`10.1016/0304-8853(92)91213-D`
   - journal：JOURNAL OF MAGNETISM AND MAGNETIC MATERIALS
   - year：1992
   - published_date：1991-12-31T16:00:00.000Z
   - citation_count：6
   - url：https://www.webofscience.com/wos/woscc/full-record/WOS:A1992JT19500121

2. **Partial discharges - Their mechanism, detection and measurement**
   - 作者：Bartnikas, R
   - DOI：`10.1109/TDEI.2002.1038663`
   - journal：IEEE TRANSACTIONS ON DIELECTRICS AND ELECTRICAL INSULATION
   - year：2002
   - published_date：2001-12-31T16:00:00.000Z
   - citation_count：407
   - url：https://www.webofscience.com/wos/woscc/full-record/WOS:000178901200023

3. **Experimental study of thickness gradient formation in the VARTM process**
   - 作者：Tackitt, KD; Walsh, SM
   - DOI：`10.1081/AMP-200041896`
   - journal：MATERIALS AND MANUFACTURING PROCESSES
   - year：2005
   - published_date：2004-12-31T16:00:00.000Z
   - citation_count：49
   - url：https://www.webofscience.com/wos/woscc/full-record/WOS:000230842500002

4. **Kinetics and mechanisms of the reduction of Cu<sub>0.5</sub>Zn<sub>0.5</sub>Fe<sub>2</sub>O<sub>4</sub> with hydrogen at 400-600°C for the production of metallic nanoparticles**
   - 作者：Halim, K. S. Abdel; Khedr, M. H.; Zaki, A. H.
   - DOI：`10.1016/j.jaap.2007.04.004`
   - journal：JOURNAL OF ANALYTICAL AND APPLIED PYROLYSIS
   - year：2007
   - published_date：2006-12-31T16:00:00.000Z
   - citation_count：8
   - url：https://www.webofscience.com/wos/woscc/full-record/WOS:000249877000008

5. **Amperometric biosensors**
   - 作者：Hristov, S. M.
   - journal：BULGARIAN CHEMICAL COMMUNICATIONS
   - year：2008
   - published_date：2007-12-31T16:00:00.000Z
   - citation_count：4
   - url：https://www.webofscience.com/wos/woscc/full-record/WOS:000260153300006
