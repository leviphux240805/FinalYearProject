# Super League Pro — Final Year Project Report

---

## Cover Page

**Super League Pro: A Real-Time, Financially Elastic Fantasy Football Platform**

| | |
|---|---|
| Student Name | *[Điền tên sinh viên]* |
| Student ID | *[Điền mã số sinh viên]* |
| Supervisor | *[Điền tên giảng viên hướng dẫn]* |
| Institution | *[Điền tên trường]* |
| Submission Date | *[Điền ngày nộp]* |

---

## Acknowledgements

*[Điền lời cảm ơn cá nhân — giảng viên hướng dẫn, gia đình, bạn học...]*

---

## Table of Contents

1. Introduction — Context and Motivation; Problem Statement; Proposed Solution; Objectives and Scope
2. Literature Review — Background Knowledge; Related Technologies and Methodologies; Related Work / Existing Systems; Scope Compared with Similar Systems
3. Requirement Analysis — Functional/Non-Functional Requirements; MoSCoW Prioritisation; Use Case Diagram and Specifications; Business Rules; Legal/Social/Ethical Issues
4. Design — System Architecture; Component and Service Design; Database Design; UI Design; Algorithm Design; API and Data Flow Design; Security and Access Control Design
5. Implementation — Development Environment; Real-Time Engine; BNPL Engine; Tactical Fit Analyzer; Real Player Data; Technical Problems and Solutions; Gameweek Summary Scoring; Squad State Gap Fix; Economic System Audit; Public Deployment; Real Club/League Crests and Club Roster View; Registration Security UX and Onboarding; Social Login (OAuth); Vue Template Composition Bug
6. Testing and Evaluation — Testing Strategy; Concurrency Testing; Data-Layer Verification; Designed Test Plan; Performance and Load Testing; Live End-to-End Verification; Production Deployment Verification; Evaluation Summary
7. Conclusion, Lessons Learned, and Future Work — Project Summary and Objective Evaluation; System Limitations; Future Work; Lessons Learned

References

Appendices

*(This is a section-level overview; use Word's "Update Table" on this document's automatic heading styles, or References → Table of Contents, to generate one with live page numbers once the front-matter fields above are filled in.)*

---

## List of Figures

- Figure 3.1 — UML Use Case Diagram
- Figure 4.1 — N-Tier System Architecture Diagram
- Figure 4.2 — Entity Relationship Diagram
- Figure 4.3 — UI Wireframes / Screenshots
- Figure 4.4 — Public Deployment Topology (Vercel ↔ Render ↔ Upstash)
- Figure 4.5 — Transfer Market with Real Club and League Crests
- Figure 4.6 — Fixtures Page with Club and League Crests and League Filter
- Figure 4.7 — Leagues & Clubs Page and Club Roster Panel (Photo, Name, Nationality)
- Figure 4.8 — Registration Password Policy Checklist
- Figure 4.9 — Welcome Onboarding Modal

---

## List of Tables

- Table 1.1 — Project Objectives and Success Criteria
- Table 1.2 — Scope Boundaries
- Table 2.1 — Technology Stack Overview
- Table 2.2 — Comparative Feature Matrix
- Table 3.1 — Functional Requirements
- Table 3.2 — Non-Functional Requirements
- Table 3.3 — MoSCoW Prioritisation
- Table 4.1 — Component Responsibilities
- Table 4.2 — Core Entity Relationships
- Table 4.3 — Application Site Map
- Table 5.1 — Development Tooling
- Table 5.2 — OAuth 2.0 Provider Configuration (Google, Facebook, X)
- Table 6.1 — Concurrency Test Cases (executed, results verified)
- Table 6.2 — Unit Test Plan
- Table 6.3 — Integration Test Plan
- Table 6.4 — Security Test Plan
- Table 6.5 — Bugs Found by Live Browser-Driven Testing
- Table 6.6 — Defects and Configuration Issues Found During Public Deployment
- Table 7.1 — Objectives Achievement Matrix

---

### Abstract

Commercial Fantasy Sports platforms typically optimise for either real-time responsiveness or financial flexibility, but rarely both, because combining the two multiplies concurrency risk. This report presents **Super League Pro**, a four-tier Fantasy Football platform that replaces HTTP polling with a WebSocket-based, room-scoped, event-driven scoring pipeline (Node.js, Express, Socket.io), and introduces a Buy Now, Pay Later (BNPL) micro-finance engine whose transactional integrity is enforced through PostgreSQL row-level locking (`SELECT ... FOR UPDATE`) inside atomic Prisma transactions. Unlike many student projects where such claims remain aspirational, this report documents an implementation that was iteratively built, connected to a real PostgreSQL instance, and *empirically verified*: a Jest/Supertest concurrency suite reproduces the double-spend race condition with locking disabled, confirms it is eliminated with locking enabled, and validates the "only one of N concurrent overdraft requests succeeds" invariant end-to-end through the live HTTP API. The report also documents a server-side Tactical Fit scoring service, room-scoped WebSocket broadcasting with webhook idempotency, and a real (not placeholder) player dataset spanning all five top European leagues, sourced after evaluating and rejecting two data providers whose free tiers proved unusable for this purpose. The result is a working MVP whose headline engineering claims — transactional integrity under concurrency and event-driven real-time delivery — are demonstrated against a live database and live API responses rather than assumed by design alone. A later iteration extended the platform with a one-shot gameweek summary scoring feature ("Chạy Matchday", Section 4.5's Algorithm 4) computed from real per-match statistics, and a full live browser-driven walkthrough of the running application — not just API-level testing — was used to find and fix five further defects, including one (an unpersisted captain selection) that would otherwise have silently broken that feature's headline scoring path. A final iteration moved the system from a local-only demo to a public deployment (Vercel frontend, Render backend, Upstash-managed Redis), added real club and league crest imagery, a clickable club roster view, a live password-policy checklist, an onboarding walkthrough, and delegated Google/Facebook/X login — and, consistent with this report's stated commitment to verifying against the running system rather than the design alone, that deployment phase surfaced and fixed two further production-only defects (a cross-origin session cookie misconfiguration and a Vue template composition bug that rendered the authenticated application shell to logged-out visitors), both documented in Sections 5.10–5.14 and Section 6.7 with the same evidence-first standard applied throughout this report.

### List of Abbreviations / Glossary

| Term | Meaning |
|------|---------|
| ACID | Atomicity, Consistency, Isolation, Durability — the transactional guarantees a relational database provides |
| API | Application Programming Interface |
| BNPL | Buy Now, Pay Later — the platform's virtual micro-credit/overdraft facility |
| CRUD | Create, Read, Update, Delete |
| DOM | Document Object Model |
| ERD | Entity-Relationship Diagram |
| FK / PK | Foreign Key / Primary Key |
| FR / NFR | Functional Requirement / Non-Functional Requirement |
| FPS | Frames Per Second |
| HMR | Hot Module Replacement |
| JWT | JSON Web Token |
| MVCC | Multi-Version Concurrency Control |
| MVP | Minimum Viable Product |
| ORM | Object-Relational Mapper |
| REST | Representational State Transfer |
| SPA | Single Page Application |
| SQL | Structured Query Language |
| TTL | Time To Live |
| UX/UI | User Experience / User Interface |
| WS | WebSocket |
| XSS | Cross-Site Scripting |
| ZSET | Redis Sorted Set data structure |

---

# 1. Introduction

## 1.1 Context and Motivation

The contemporary landscape of enterprise web engineering is defined by a fundamental paradigm shift in application architecture. The ecosystem has evolved from the static document-delivery model of Web 1.0 to the highly interactive, data-driven interfaces of Web 2.0, and has now converged upon what Taivalsaari and Mikkonen (2021) characterise as the era of *reactive real-time web applications*. Within this modern paradigm, end-user expectations have transcended mere informational accuracy; they demand transactional immediacy and continuous, seamless state synchronisation. System latency — even when measured in seconds — introduces measurable cognitive friction, disrupting user immersion and degrading the overall User Experience (UX) in ways that empirically correlate with user disengagement (Nielsen, 1994).

Parallel to these architectural advancements, the global Fantasy Sports industry has emerged as a strategically significant sector of the digital entertainment economy. As of 2024, the global fantasy sports market was valued at approximately USD 28.3 billion, with a projected compound annual growth rate exceeding 14.2% through 2030 (Grand View Research, 2024). Fantasy Football in particular constitutes the dominant vertical — an analytical simulation environment in which users assume the role of virtual team managers, constructing squads from real-world professional athletes and accruing competitive scores derived from empirically measurable in-match performance statistics. Prominent industrial platforms, including Fantasy Premier League (FPL) and Sorare, routinely sustain concurrent user bases exceeding ten million active accounts (Fantasy Premier League, 2024).

A significant market gap exists within the Southeast Asian region, and specifically within the Vietnamese digital sports market. Despite Vietnam's rapidly growing internet penetration rate — exceeding 78% of the population as of 2024 (DataReportal, 2024) — and a demonstrably passionate football fan base, no technically sophisticated, locally-language fantasy football platform has been engineered to serve this demographic. The prevailing platforms are exclusively English-language and lack the advanced gamification mechanics — such as randomised pack-opening (Gacha) systems and dynamic pricing economies borrowed from the global mobile gaming paradigm — that resonate most strongly with the Vietnamese consumer market.

However, as user bases scale, the legacy computational architectures underlying incumbent systems encounter critical technical limitations. Maintaining a resilient infrastructure capable of guaranteeing structural data integrity across concurrent micro-economic transactions, while simultaneously broadcasting real-time state mutations to millions of client connections, represents a formidable distributed systems engineering challenge that necessitates specialised, high-performance architectural solutions. It is this problem — not the sports domain itself — that motivates the present project.

## 1.2 Problem Statement

Through a rigorous architectural analysis of current industrial Fantasy Sports frameworks, this project identifies two core systemic bottlenecks:

**Bottleneck 1 — Architectural latency from legacy HTTP polling.** The majority of contemporary Fantasy Sports platforms continue to rely on client-server models utilising HTTP/1.1 or HTTP/2 request-response cycles for score delivery. To simulate live score updates, these architectures typically resort to HTTP short polling, which introduces a tripartite problem: (i) immense, redundant server overhead, as empirical studies indicate that up to 95% of polling requests yield empty payloads due to the intermittent nature of sporting events (Pimentel and Nickerson, 2012); (ii) rapid connection pool exhaustion under peak traffic conditions, particularly during gameweek deadline spikes; and (iii) inherent data staleness, as asynchronous batch-processing systems sacrifice the temporal immediacy that constitutes the core value proposition of a live sports platform.

**Bottleneck 2 — Rigid micro-economic models and distributed concurrency risks.** Financial models in existing Fantasy Sports systems operate on a static hard-cap constraint: users are allocated a fixed virtual budget with zero mechanisms for financial leverage. Introducing a more flexible micro-credit framework — such as a virtual Buy Now, Pay Later (BNPL) overdraft engine — escalates backend complexity substantially: a single credit-extended transfer requires a sequence of dependent write operations spanning multiple normalised tables (balance, penalty points, squad composition, transaction ledger), and under concurrent load this is precisely the pattern that produces race conditions, double-spending, and connection-pool exhaustion if not engineered with transactional guarantees from the outset.

## 1.3 Proposed Solution

"Super League Pro" addresses both problems with two coordinated architectural decisions:

**Event-driven, real-time transmission architecture.** HTTP polling is replaced with the WebSocket protocol (RFC 6455; Fette and Melnikov, 2011) via Socket.io. Third-party webhook payloads are ingested once, processed once, and pushed to every subscribed client over a persistent bidirectional connection, scoped to Socket.io *rooms* keyed by gameweek so that broadcast cost tracks the number of interested clients rather than the total connected population.

**Elastic micro-finance engine with ACID-compliant integrity.** A BNPL model allows a bounded overdraft (up to $2.0M) against a user's virtual balance, at the cost of a −4 point penalty. Every state-changing financial operation is wrapped in a single atomic Prisma `$transaction` against PostgreSQL, with the user's row explicitly locked (`SELECT ... FOR UPDATE`) for the duration of the transaction so that concurrent requests for the same user serialise instead of racing on a stale balance read.

## 1.4 Objectives and Scope

**Table 1.1 — Project Objectives and Success Criteria**

| ID | Objective | Success Criterion |
|-----|-----------|-------------------|
| OBJ-01 | Latency eradication | Client-side polling is structurally eliminated for live score updates; broadcast is push-based via Socket.io rooms |
| OBJ-02 | Transactional security | Zero double-spending under concurrent BNPL overdraft requests, verified by a targeted concurrency test against a real database |
| OBJ-03 | Reactive presentation | Incoming WebSocket payloads trigger localised Vue 3 reactive updates rather than full-page re-renders |
| OBJ-04 | Algorithmic gamification | Gacha pack drop probabilities are computed and enforced exclusively server-side |
| OBJ-05 | Performance leaderboard | Global ranking queries execute in O(log N) time via Redis Sorted Sets |
| OBJ-06 | Real player data | Squad-building draws on real footballers from all five top European leagues, not a synthetic dataset |

**Table 1.2 — Scope Boundaries**

| Dimension | In-Scope | Out-of-Scope |
|-----------|----------|--------------|
| Architecture | Four-tier web stack (Presentation, API Gateway, Business Logic, Persistence) | Cloud orchestration, Kubernetes clustering |
| Authentication | JWT (7-day expiry) + bcrypt (cost factor 12) | OAuth2, social login, biometric auth |
| Financial engine | Virtual BNPL overdraft, dynamic market pricing | Real-money payment gateways, PCI-DSS compliance |
| Dataset | Real players sourced from free-tier sports-data APIs across all five top European leagues, supplemented by a hand-curated core roster (Section 5.5) | The complete first-team-depth registry (2,500+ players); that scale requires a paid data-provider tier (Section 5.5.3) |
| Real-time | WebSocket live score broadcasting via a simulated webhook ingestion endpoint | Multi-sport event streams, live commentary |
| Localisation | Vietnamese-language UI | Multi-language i18n framework |

**Report structure.** Chapter 2 (Literature Review) surveys the systems-engineering and financial-ledger literature underpinning the design and benchmarks three commercial Fantasy Sports platforms. Chapter 3 (Requirement Analysis) specifies the functional and non-functional requirements, use cases, business rules, and legal/ethical considerations. Chapter 4 (Design) presents the system architecture, database schema, UI design, and core algorithms. Chapter 5 (Implementation) documents how the system was actually built, including the concurrency engine, real-time broadcasting, tactical-fit scoring, and the real-world data-sourcing and environment-configuration problems encountered and solved. Chapter 6 (Testing and Evaluation) reports the concurrency test suite executed against a live database and distinguishes verified results from designed-but-unexecuted test plans. Chapter 7 (Conclusion) evaluates objectives against evidence, states honest limitations, and records lessons learned.

---

# 2. Literature Review

This chapter surveys the theoretical and technological background that informs the system's design, reviews comparable commercial systems, and states the selected technology stack against that background.

## 2.1 Background Knowledge

**Real-time web communication.** Two broad bodies of prior work inform this project. The first is the systems-engineering literature on real-time web communication, which has converged on persistent-connection protocols (WebSockets, Server-Sent Events, gRPC streaming) as the standard alternative to polling once update frequency and client count both grow past a moderate threshold (Fette and Melnikov, 2011; Pimentel and Nickerson, 2012). WebSockets (RFC 6455) provide a full-duplex channel over a single TCP connection, eliminating the per-request overhead (headers, connection setup, redundant empty responses) inherent to polling.

**Transactional integrity and concurrency control.** The second is the literature and commercial practice around financial ledger design, where the double-entry principle and transaction-isolation guarantees, as formalised by the ACID model, remain the baseline expectation for any system that manages user-owned balances, virtual or otherwise (Kleppmann, 2017). PostgreSQL's Multi-Version Concurrency Control (MVCC) allows readers and writers to proceed without blocking each other, while explicit row-level locking (`SELECT ... FOR UPDATE`) is the standard mechanism for serialising concurrent writers against the same row — the specific technique this project relies on to make double-spending structurally impossible rather than merely statistically unlikely.

## 2.2 Related Technologies and Methodologies

**Table 2.1 — Technology Stack Overview**

| Layer | Technology | Primary Role |
|-------|-----------|--------------|
| Presentation | Vue.js 3 (Composition API) | Reactive SPA framework |
| Build tooling | Vite | ESM-native bundler and HMR server |
| Data visualisation | Chart.js | Canvas-based radar charts |
| HTTP server | Express.js | REST API routing and middleware |
| Runtime | Node.js | Async, event-loop backend |
| Real-time | Socket.io | Room-scoped WebSocket abstraction |
| ORM | Prisma | Type-safe database client, migrations, interactive transactions |
| Primary database | PostgreSQL | ACID-compliant relational data store |
| Cache / rankings | Redis | In-memory Sorted Set leaderboard engine |
| Scheduler | node-cron | Daily market price adjustment trigger |
| Authentication | bcrypt + jsonwebtoken | Password hashing and JWT signing |
| Testing | Jest + Supertest | Concurrency and HTTP integration testing (Chapter 6) |

**Vue.js 3 (Composition API).** Vue 3's reactivity system is proxy-based (JavaScript `Proxy` rather than Vue 2's `Object.defineProperty` getters/setters), allowing the framework to track dependencies at the level of individual reactive properties. In a system where WebSocket payloads mutate single player-score fields repeatedly, only the DOM nodes bound to the mutated property are patched, not the surrounding component tree. The Composition API was preferred over the Options API because it groups logic by concern — all WebSocket-subscription logic lives in one place in `store.js` — which keeps socket-handling code legible and testable in isolation from rendering code. Application state is held in a hand-written `reactive()` store rather than Pinia or Vuex, an appropriate simplification given the single-user, single-active-squad state topology of an MVP.

**Node.js and Express.js.** The backend runtime was chosen because the workload is I/O-bound rather than CPU-bound: the server spends most of its time waiting on database queries, external webhook calls, and open socket connections. Node's single-threaded event loop with non-blocking I/O allows one process to hold many concurrent WebSocket connections open without the per-connection memory and context-switch overhead of a thread-per-request model (Tilkov and Vinoski, 2010). Express provides the RESTful surface — authentication, transfer processing, market queries — and its middleware chain handles JSON parsing and JWT verification before a request reaches business logic.

**Socket.io.** Selected over raw WebSockets for three concrete reasons: automatic reconnection with exponential backoff; namespace/room support, which lets the server broadcast a gameweek's events only to clients actually viewing that gameweek instead of to every connected socket; and graceful degradation to HTTP long-polling for clients behind proxies that block persistent TCP upgrades. Room-based fan-out is the single most important scalability lever in the real-time engine, because it bounds broadcast cost to the number of interested clients rather than the total connected population — and, as Chapter 5 documents, this was a genuine gap between the original design intent and the first implementation pass, subsequently closed.

**PostgreSQL, Prisma, and Redis.** PostgreSQL was chosen over a document store specifically for its transactional guarantees and row-level locking. Prisma's schema-first workflow generates a fully typed client from a single `schema.prisma` definition, removes an entire class of runtime errors at compile time, and its `$transaction` API is the concrete mechanism used to implement the atomic BNPL transfer (Chapter 5). Redis is used exclusively for the global leaderboard: ranking millions of rows with `ORDER BY` is an O(N log N) relational operation that competes with the transactional workload for I/O, whereas a Redis Sorted Set turns both score updates (`ZINCRBY`) and rank lookups (`ZREVRANGE`) into O(log N) in-memory operations.

## 2.3 Related Work / Existing Systems

Three commercial platforms were reviewed to ground requirements in observed market behaviour. Claims not backed by a citable public source are informal, observational benchmarks made for this project and are labelled as such.

**Fantasy Premier League (FPL).** The official fantasy game of the English Premier League, sustaining a very large active user base (Fantasy Premier League, 2024) and benefiting from an authoritative official data feed. Architecturally, it is built around a rigid £100M hard-cap budget with no leverage mechanism, and point updates are, by user reports, prone to lagging live match events, consistent with a batch-oriented rather than event-driven update pipeline.

**Yahoo Fantasy Sports.** Popular in North American markets; uses HTTP long-polling to power a "StatTracker" feature delivering near-live, though not truly push-based, updates. Its player-acquisition model is built around a waiver-wire priority queue rather than an open market — procedurally fair but slower than a continuously-clearing market — and its analytics surface is almost entirely tabular.

**Sorare (blockchain-based Fantasy Football).** A third architectural pattern worth benchmarking: player "cards" are NFTs traded on a blockchain-backed marketplace, achieving genuine scarcity and verifiable ownership, but settlement times are bound by blockchain confirmation latency — orders of magnitude slower than a sub-second UX target — and transaction fees make micro-transactions economically unattractive.

**Table 2.2 — Comparative Feature Matrix**

| Feature | FPL | Yahoo Fantasy | Sorare | Super League Pro |
|---------|-----|---------------|--------|-------------------|
| Update mechanism | Batch (periodic) | HTTP long-polling | Blockchain event log | WebSocket push, room-scoped |
| Economic model | Fixed hard-cap budget | Fixed budget + waiver queue | Market-priced NFTs, on-chain fees | Fixed budget + bounded BNPL overdraft |
| Analytics presentation | Basic charts | Tabular data grids | Card marketplace stats | Client radar charts + server-computed Tactical Fit score |
| Settlement latency | Minutes (batch cycle) | Seconds (polling interval) | Minutes (block confirmation) | Sub-second, push-based |

## 2.4 Scope of the Project Compared with Similar Systems

Commercial Fantasy Sports platforms sit at the intersection of the two literatures reviewed above but, as Section 2.3 shows, have generally optimised only one side at a time: platforms with richer statistical tooling tend to use simpler, batch-oriented update models, while platforms with faster updates tend to keep their economic model deliberately simple to avoid concurrency risk. The contribution of this project is not a novel algorithm in either area individually, but a concrete demonstration that both properties — real-time delivery and transactional financial flexibility — can be engineered together, and, critically, that the transactional-integrity claim can be *empirically verified against a real database* rather than asserted by architecture diagram alone (Chapter 6). Unlike the reference commercial systems, this project explicitly excludes real-money settlement, multi-region deployment, and full player-registry ingestion, scoping instead to a demonstrable proof of the underlying concurrency-safety and real-time-delivery mechanisms (Section 1.4).

---

# 3. Requirement Analysis

## 3.1 Functional Requirements

**Table 3.1 — Functional Requirements**

| ID | Requirement | Priority |
|----|-------------|----------|
| FR-01 | The system shall allow users to register and authenticate using JWT (7-day expiry) and bcrypt password hashing (cost factor 12) | Must |
| FR-02 | The system shall enable users to build a squad via a Transfer Market UI, subject to per-position slot limits and a virtual budget | Must |
| FR-03 | The system shall execute BNPL overdraft transfers for shortfalls of $0 < x ≤ $2.0M, automatically applying a −4 point penalty, and shall reject transfers a user already owns three players from the target club for | Must |
| FR-04 | The system shall expose a webhook endpoint that ingests simulated live match-event JSON payloads and rejects duplicate `eventId`s before broadcasting | Must |
| FR-05 | The system shall broadcast parsed score mutations to clients subscribed to the relevant gameweek room via Socket.io, without any client-initiated request | Must |
| FR-06 | The system shall apply a 2× point multiplier to the squad's designated captain | Must |
| FR-07 | The system shall maintain a real-time global leaderboard using a Redis Sorted Set, supporting top-50 queries and individual rank lookups | Must |
| FR-08 | The system shall execute a dynamic market-pricing adjustment via a daily cron job, based on 24-hour transaction demand | Should |
| FR-09 | The system shall provide a Gacha pack module executing a weighted-random drop algorithm computed exclusively server-side | Should |
| FR-10 | The system shall provide a Tactical Fit score for any player, computed server-side from that player's position and club-level tactical statistics | Should |
| FR-11 | The system shall allow a user to sell a player from their squad for a partial refund, crediting the server-authoritative balance | Should |
| FR-12 | The system shall allow a user with a complete starting eleven and a designated captain to run a one-shot gameweek summary calculation, deriving each starter's points from real recorded match statistics and locking the squad against further transfers for that gameweek | Should — *added after initial requirements elicitation; see Section 4.5, Algorithm 4 and Section 5.7* |

## 3.2 Non-Functional Requirements

**Table 3.2 — Non-Functional Requirements**

| ID | Category | Requirement | Verification Status |
|----|----------|-------------|---------------------|
| NFR-01 | Latency | End-to-end delivery from webhook ingestion to client is push-based (no client polling) | Structurally satisfied by architecture; not load-tested in this engineering pass (Section 6.5) |
| NFR-02 | Integrity | 100% of financial transfer operations are ACID-compliant; zero partial commits, zero double-spend under concurrent load | **Empirically verified** — Section 6.2 |
| NFR-03 | Performance | Localised Vue reactive updates avoid full-page re-render during live score events | Satisfied by design (proxy-based reactivity, per-player state mutation); not FPS-profiled in this pass |
| NFR-04 | Security | JWT tokens are signed and time-limited; financial endpoints require a valid token and re-derive server-side balance rather than trusting client-supplied values | Satisfied by design and code review (Section 5.4); not adversarially penetration-tested |
| NFR-05 | Availability | The WebSocket gateway broadcasts to gameweek-scoped rooms so cost scales with interested clients, not total connections | Implemented (Section 5.2); not load-tested at scale |

## 3.3 MoSCoW Prioritisation

**Table 3.3 — MoSCoW Prioritisation**

| Priority | Features |
|----------|----------|
| **Must have** | User authentication (JWT/bcrypt), transfer market with budget validation, BNPL overdraft engine with row-level locking, real-time WebSocket scoring with room-scoped broadcast, global leaderboard |
| **Should have** | Dynamic market pricing, Gacha pack system, Tactical Fit Analyzer, webhook idempotency, player sell/refund |
| **Could have** | Gameweek lock/deadline enforcement, audio effects, mobile-responsive layout |
| **Won't have** | Real-money payment gateway integration, Kubernetes auto-scaling, the full 2,500+ player registry (a paid data-provider tier is required — Section 5.5.3), OAuth2 social login |

## 3.4 Use Case Diagram

*(Insert UML Use Case Diagram here — recommended tools: Draw.io or Lucidchart)*

**Figure 3.1 — UML Use Case Diagram for Super League Pro**

Three actors interact with the system:

- **End-User (Fantasy Manager)** — the primary human actor. Core use cases: *Authenticate Account*, *Buy Player (incl. BNPL)*, *Sell Player*, *View Leaderboard*, *Open Gacha Pack*, *Compare Players (Tactical Fit)*.
- **External Data Provider (webhook actor)** — an automated external system that triggers the *Ingest Live Match Event* use case via HTTP POST.
- **System Cronjob (internal automated actor)** — triggers the *Execute Dynamic Market Price Adjustment* use case daily at 00:00 UTC.

## 3.5 Use Case Specifications

**Use Case UC-01: Execute BNPL Market Transfer**

| Field | Detail |
|-------|--------|
| Primary Actor | End-User (Fantasy Manager) |
| Goal | Acquire a player whose value exceeds the user's current virtual balance by drawing on the overdraft facility |
| Pre-conditions | User is authenticated; user does not already own three players from the target player's club |
| Post-conditions | Squad composition updated server-side; transactions logged to the ledger; penalty points incremented if BNPL was triggered |

*Main success scenario:* (1) the user selects a player to buy, optionally nominating a player to sell; (2) the backend locks the user's row (`SELECT ... FOR UPDATE`) inside a Prisma transaction; (3) the backend computes `netBudget = balance + sellPrice` (sellPrice = 0 if no sell is nominated) and `shortfall = buyPrice − netBudget`; (4) if `shortfall ≤ 0` the balance is debited directly; if `0 < shortfall ≤ $2.0M` the balance is set to $0 and a −4 penalty is applied; (5) a club-ownership check rejects the purchase if the user already owns three players from the target club; (6) `SquadPick` rows are created/updated and `Transaction` ledger rows are written; (7) the transaction commits and the new balance/penalty total is returned to the client, which updates its state from that response rather than local arithmetic.

*Exception flow — exceeds credit limit:* if `shortfall > $2.0M`, the transaction throws and rolls back entirely; no state is mutated; the client displays the server's error message.

**Use Case UC-02: Broadcast Real-Time Scoring Event**

| Field | Detail |
|-------|--------|
| Primary Actor | External Data Provider (webhook) |
| Goal | Process a live match event and deliver score mutations to clients subscribed to the relevant gameweek room |
| Pre-conditions | Node.js server is running; at least one client has joined the target gameweek room |
| Post-conditions | Subscribed clients' reactive state is updated; the event is recorded so a duplicate delivery is ignored |

*Main success scenario:* (1) the provider POSTs an event payload including an `eventId` and `gameweek`; (2) the backend checks the `eventId` against an in-memory TTL cache and discards the request if already seen; (3) the backend emits the event to the `gameweek_{n}` Socket.io room only; (4) each subscribed client's listener checks whether the affected player is in its active squad and, if so, mutates reactive state, applying the captain multiplier if applicable; (5) the Vue reactivity system re-renders only the affected player card.

## 3.6 Business Rules and Constraints

- A player may not be purchased if the acquiring user already owns three or more players from that player's club (mirrors real-world fantasy-football squad-diversity conventions).
- The BNPL overdraft facility is capped at a shortfall of $2.0M per transaction; the penalty for using it is a flat −4 points, applied every time the facility is used (the system does not track cumulative outstanding "debt" beyond the per-transaction cap — a deliberate scope simplification discussed further in Section 7.2).
- Market prices move by at most ±$0.3M per 24-hour window, computed from net buy/sell demand, to prevent runaway inflation from coordinated trading.
- A squad is scoped per gameweek (`UNIQUE(userId, gameweek)`); the MVP operates against a single default gameweek since no gameweek-switching UI exists yet.

## 3.7 Legal, Social, Ethical, and Professional Issues

- **Data protection.** Only a username, a bcrypt password hash, and gameplay state are stored per user; no payment or personally identifying information is collected, since the platform is explicitly a closed-loop virtual economy (Section 1.4).
- **Third-party data licensing.** Real player, team, and squad data used by the platform (Section 5.5) is sourced from third-party sports-data providers under their respective free-tier terms of service. This project uses that data for non-commercial academic demonstration only; any production deployment would need to review each provider's licensing terms for redistribution and commercial use.
- **Gambling-adjacency of the Gacha mechanic.** The weighted-random pack-opening system is structurally similar to loot-box mechanics that have drawn regulatory scrutiny in some jurisdictions. Because the platform's currency is closed-loop and non-withdrawable (no real-money purchase or cash-out path exists), it does not meet most jurisdictions' definitions of gambling, but this is flagged as a design consideration that would require formal legal review before any production launch with real-money elements.
- **Financial-education framing.** The BNPL mechanic is deliberately modelled on real-world buy-now-pay-later consumer credit products. Presenting overdraft usage with a visible points penalty (rather than hiding the cost) was a deliberate design choice to avoid normalising uncritical use of credit facilities, consistent with responsible design practice for any system that simulates financial leverage.

---

# 4. Design

## 4.1 System Architecture

Super League Pro uses a decoupled four-tier architecture:

- **Tier 1 — Presentation (client).** A Vue 3 single-page application. Application state is held in a Composition-API-style reactive store (`store.js`); the Virtual DOM handles reconciliation when that state changes.
- **Tier 2 — API Gateway and WebSocket Controller (server).** Node.js and Express handle REST traffic; Socket.io manages persistent connections for real-time broadcast and room membership.
- **Tier 3 — Business Logic and Data Access.** Domain services (`transferService.js`, `tacticalFitService.js`) sit here; all persistence goes through Prisma, which is also where the ACID transaction boundary and row lock for Algorithm 1 are declared.
- **Tier 4 — Persistence.** PostgreSQL holds all durable entities (users, transactions, squads, players, teams); Redis holds the derived, frequently-recomputed leaderboard state.

*(Insert N-Tier Architecture Diagram: Vue.js SPA → Node.js/Express → Prisma ORM → PostgreSQL + Redis, with a Socket.io channel alongside REST)*

**Figure 4.1 — N-Tier System Architecture**

## 4.2 Component and Service Design

**Table 4.1 — Component Responsibilities**

| Component | Type | Responsibility |
|-----------|------|-----------------|
| Vue 3 SPA | Library + custom code | Renders dashboard/market/analytics views; holds reactive client state |
| Socket.io client | Library + custom handlers | Joins the active gameweek room on connect; mutates local state on `LIVE_SCORE_UPDATE` |
| Express REST controllers | Custom code | Auth, transfer processing, market queries, tactical-fit lookups; JWT middleware |
| Socket.io gateway | Library + custom room logic | Room-based fan-out (`gameweek_{n}`) so broadcast cost scales with interested clients |
| `transferService.js` | Custom code | Validates and executes standard and BNPL transfers under an explicit row lock (Algorithm 1) |
| `tacticalFitService.js` | Custom code | Computes the 0–100 Tactical Fit score (Algorithm 3) |
| `scoringService.js` | Custom code | Pure-function gameweek point calculation per player (Algorithm 4, Section 5.7) |
| `matchdayService.js` | Custom code | Transactional, row-locked gameweek-run wrapper around `scoringService.js` (Section 5.7) |
| Prisma ORM | Library | Typed queries; hosts the `$transaction` boundary and `FOR UPDATE` raw query |
| PostgreSQL | External | Durable storage for User, Transaction, UserSquad, SquadPick, Team, Player |
| Redis (ZSET) | External | Global leaderboard |

## 4.3 Database Design

The schema is normalised to Third Normal Form (3NF). Core cardinalities: User (1)–(N) Transaction; User (1)–(1) UserSquad per gameweek; UserSquad (1)–(N) SquadPick; Player (1)–(N) SquadPick; Player (1)–(N) PlayerGameweekStat; Team (1)–(N) Player (soft reference — see rationale below).

**Table 4.2 — Core Entity Relationships**

| Relationship | Cardinality | Rationale |
|---------------|------------|-----------|
| User → Transaction | 1:N | Every buy, sell, and BNPL loan is logged as an append-only ledger row |
| User → UserSquad | 1:N | One squad record per user per gameweek (`UNIQUE(userId, gameweek)`) |
| UserSquad → SquadPick | 1:N | Each squad's picks |
| Player → SquadPick | 1:N | A single real-world player can be selected by many users' squads simultaneously |
| Player → PlayerGameweekStat | 1:N | One real-match performance record per player per gameweek (`UNIQUE(playerId, gameweek)`) — added in a later iteration to support gameweek summary scoring (Section 4.5, Algorithm 4) |
| Player → Team | N:1 (soft) | `teamId` is a plain integer, not a database foreign key — see Section 4.3.1 |

**Post-original-design schema extension.** Three fields and one entity were added after the schema described in the rest of this section had already been implemented and seeded, specifically to support the gameweek summary scoring feature documented in Section 4.5 (Algorithm 4) and Section 5.7: `SquadPick.points` (Int, default 0 — the points a given pick earned in its gameweek), `UserSquad.totalPoints` (Int, default 0 — the sum of its starting eleven's points), `UserSquad.isLocked` (Boolean, default false — set once a gameweek's scoring has been run, blocking further transfers for that gameweek) and `UserSquad.captainId` (nullable String — the `Player.id` of the squad's designated captain). Of these, `captainId` is the more interesting case: the column existed in the schema from an earlier iteration, but, as Section 5.8 documents in detail, no API endpoint ever wrote to it, meaning the captain multiplier described in FR-06 was silently inert until that gap was found and closed. The new `PlayerGameweekStat` entity (`playerId`, `gameweek`, `minutesPlayed`, `goals`, `assists`, `yellowCards`, `redCards`, `cleanSheet`, `saves`, unique on `(playerId, gameweek)`) holds the real per-match statistics Algorithm 4 consumes.

*(Insert Entity Relationship Diagram, generated from `schema.prisma` via Prisma Studio or modelled in Draw.io)*

**Figure 4.2 — Entity Relationship Diagram**

### 4.3.1 Deliberate Design Deviation: Player.teamId is not a hard foreign key

The original design intent (and most textbook 3NF guidance) would put a foreign-key constraint on `Player.teamId → Team.id`. This project deliberately does **not** enforce that constraint, because the real-player-data pipeline (Section 5.5) ingests player records from a public sports-data API whose team IDs are drawn from a much larger space than the ten clubs this project has hand-curated tactical statistics for. A hard FK would either reject every player belonging to an uncurated club, or require curating tactical statistics for all ~96 clubs represented in the dataset before any seeding could succeed. Instead, `teamId` is kept as a plain integer, and `tacticalFitService.js` falls back to league-average statistics (50/50/50/50) when no matching `Team` row exists. This is recorded here explicitly because it is a case where implementation reality diverged from idealised textbook schema design for a concrete, defensible engineering reason — exactly the kind of trade-off a Design chapter should make explicit rather than silently ignore.

**Key schema decisions:**

- `virtualBalance` uses `Decimal(5,1)`, preventing floating-point rounding errors in financial calculations.
- `UNIQUE(userId, gameweek)` on `UserSquad` is enforced at the database level.
- `Team` (`possessionRate`, `defensiveBlock`, `attackingPassing`, `counterAttack`) is a separate entity from `Player` specifically because these are club-level statistics that would otherwise be duplicated across every player row on that club, violating 3NF. Note `counterAttack` is present here even though it does not appear in early drafts of this schema — it is required by the Tactical Fit algorithm's `FWD` branch (Section 4.5, Algorithm 3) and was added when the algorithm was actually implemented (Section 5.3).

### 4.3.2 Physical File Structure

```
fantasy-backend/
├── server.js                  # Express + Socket.io entry point; room join/broadcast; webhook idempotency; cron
├── middleware/
│   └── authMiddleware.js      # JWT verification
├── services/
│   ├── transferService.js     # Algorithm 1 — row-locked BNPL buy/sell (Chapter 5)
│   ├── tacticalFitService.js  # Algorithm 3 — Tactical Fit scoring (Chapter 5)
│   ├── scoringService.js      # Algorithm 4 — CalculatePlayerMatchPoints, pure function (Section 5.7)
│   └── matchdayService.js     # Transactional gameweek-run wrapper around scoringService (Section 5.7)
├── routes/
│   ├── auth.js                # /api/auth/*
│   ├── transfers.js           # /api/transfers/* — thin controller over transferService
│   ├── squad.js                # /api/squad/* — GET squad, POST reset, POST captain (Section 5.8)
│   ├── matchday.js             # POST /api/matchday/run (Section 5.7)
│   └── leaderboard.js         # /api/leaderboard/* — Redis ZSET rankings
├── data/
│   └── backupPlayers.js       # Curated 60-player fallback dataset (shared across 3 consumers)
├── scripts/
│   ├── seed.js                 # Sportmonks-based full-registry seeder (works, but token is restricted — Section 5.5.1)
│   ├── seedCuratedPlayers.js   # Seeds the curated 60-player dataset into Postgres
│   ├── seedTeams.js            # Seeds 10 curated Team rows with tactical statistics
│   ├── seedFootballData.js     # football-data.org seeder (built, unused — Section 5.5.2)
│   ├── seedTop5Free.js         # API-Football free-tier seeder — the one actually used (Section 5.5.3)
│   └── seedGameweekStats.js    # Real Matchweek 1 PlayerGameweekStat seeder (Section 5.7)
├── tests/
│   └── bnpl.concurrency.test.js  # Chapter 6 — the concurrency-safety proof
└── prisma/
    └── schema.prisma

super-league-fantasy/
├── src/
│   ├── App.vue                 # Root shell, tab navigation
│   ├── store.js                 # Reactive state; auth-gated Socket.io lifecycle; server-authoritative buy/sell/captain/matchday (Section 5.8)
│   └── components/
│       ├── AuthModal.vue
│       ├── SquadPitch.vue       # Includes the "▶ Chạy Matchday" control (Section 5.7)
│       ├── TransferMarket.vue   # Calls the real backend transfer endpoint (Chapter 5)
│       ├── GachaPack.vue
│       └── PlayerComparison.vue # Displays the server-computed Tactical Fit score
```

## 4.4 UI Design

The interface follows a "data-first" design philosophy: minimise navigation depth and surface the highest-value information on the first screen. A dark-mode palette with a single neon accent colour was chosen to reduce eye strain during long sessions (Pierson et al., 2021), and colour-coded status badges let a user assess squad status at a glance.

**Table 4.3 — Application Site Map**

| Route / Tab | Component | Purpose |
|--------------|-----------|---------|
| Squad | `SquadPitch.vue` | Interactive tactical pitch, drag-and-drop substitutions |
| Market | `TransferMarket.vue` | Transfer hub: search, filter, sort, BNPL checkout |
| Analytics | `PlayerComparison.vue` | Head-to-head radar chart plus server-computed Tactical Fit score |
| Gacha | `GachaPack.vue` | Pack-opening gamification module |

*(Insert UI wireframes or screenshots)*

**Figure 4.3 — UI Wireframes / Screenshots (Squad, Market, Analytics, Gacha tabs)**

**Post-deployment visual identity extension.** A later iteration (Section 5.11) replaced the Transfer Market and Fixtures tabs' plain colour-coded text pills for club and league identity with real crest imagery, sourced from api-sports.io's public CDN and keyed directly by the `teamId`/league already stored on each record, at no additional API cost. The Transfer Market's player row was simultaneously redesigned — the low-information "Form" column was removed in favour of a larger player photo and larger club/league badges, based on the concrete observation that badge recognisability mattered more to a user scanning the market than a compressed win/draw/loss glyph. A new Leagues & Clubs tab (`LeaguesInfo.vue`) was also added, listing every club grouped by league with its crest, and made clickable: selecting a club opens a roster panel showing that club's players by photo, full name, and nationality only — a deliberate scope decision (Section 5.11) to keep that page a pure identity/reference view rather than duplicating the Transfer Market's price/stat data.

*(Insert screenshot: public deployment topology / architecture note — Vercel frontend calling the Render backend over HTTPS, Render backend talking to its managed PostgreSQL and to Upstash Redis over TLS)*

**Figure 4.4 — Public Deployment Topology (Vercel ↔ Render ↔ Upstash)**

*(Insert screenshot: Transfer Market tab showing player photo, club crest, and league crest for several rows)*

**Figure 4.5 — Transfer Market with Real Club and League Crests**

*(Insert screenshot: Fixtures tab showing both teams' crests per fixture and the new League filter dropdown next to the Gameweek dropdown)*

**Figure 4.6 — Fixtures Page with Club and League Crests and League Filter**

*(Insert screenshot: Leagues & Clubs tab with a club's roster panel open, showing player photos, names, and nationalities)*

**Figure 4.7 — Leagues & Clubs Page and Club Roster Panel (Photo, Name, Nationality)**

*(Insert screenshot: registration form with the live password-policy checklist visible, showing a mix of met (✓) and unmet (○) rules)*

**Figure 4.8 — Registration Password Policy Checklist**

*(Insert screenshot: the animated Welcome Modal shown immediately after a successful registration)*

**Figure 4.9 — Welcome Onboarding Modal**

## 4.5 Algorithm Design

**Algorithm 1 — BNPL Transfer Execution (as actually implemented).** The pseudocode below reflects the implementation in `services/transferService.js`, which generalises the original design (Section 3.5, UC-01) in two ways born out of implementation reality: `playerToSellId` is optional (most purchases in the actual UI are additive squad-building against budget, not a forced swap), and a club-ownership precondition is enforced before the financial computation.

```
ALGORITHM ExecuteBNPLTransfer(userId, playerToBuyId, playerToSellId?, useLock)
INPUT:  Authenticated userId, playerToBuyId, optional playerToSellId
OUTPUT: { virtualBalance, penaltyPoints } OR throws

BEGIN
  START PRISMA $transaction:
    IF useLock THEN
      EXECUTE RAW SQL: SELECT id FROM "User" WHERE id = userId FOR UPDATE
    END IF

    user       ← SELECT * FROM User   WHERE id = userId
    buyPlayer  ← SELECT * FROM Player WHERE id = playerToBuyId
    sellPlayer ← playerToSellId ? SELECT * FROM Player WHERE id = playerToSellId : NULL

    sameClubCount ← COUNT(current squad picks WHERE player.teamId = buyPlayer.teamId
                                                 AND playerId != playerToSellId)
    IF sameClubCount >= 3 THEN THROW ClubLimitError END IF

    netBudget ← user.virtualBalance + (sellPlayer ? sellPlayer.currentPrice : 0)
    shortfall ← buyPlayer.currentPrice - netBudget

    IF shortfall > 2.0 THEN THROW InsufficientFundsError END IF
    IF shortfall > 0 THEN
      SET user.virtualBalance ← 0; user.penaltyPoints += 4
      INSERT Transaction(type="BNPL_LOAN", amount=shortfall)
    ELSE
      SET user.virtualBalance ← netBudget - buyPlayer.currentPrice
    END IF

    INSERT Transaction(type="BUY", amount=buyPlayer.currentPrice)
    IF sellPlayer THEN INSERT Transaction(type="SELL", amount=sellPlayer.currentPrice) END IF

    squad ← current UserSquad OR lazily create one (gameweek=1)
    IF sellPlayer THEN UPDATE the matching SquadPick's playerId
    ELSE INSERT a new SquadPick END IF

    COMMIT
    RETURN { virtualBalance: user.virtualBalance, penaltyPoints: user.penaltyPoints }
END
```

The `useLock` flag exists because the same core logic is exercised two ways in this project: with the lock (`executeBnplTransfer`, used by every real HTTP route) and without it (`__unsafeExecuteForTesting`, used only by the concurrency test suite in Chapter 6 to reproduce the race condition as a documented failing baseline before proving the lock fixes it).

**Algorithm 2 — Weighted Random Pack Drop (Gacha System).** Unchanged from the original design: cumulative weighting over a rarity-tiered player pool, ensuring LEGENDARY-tier players remain rare regardless of pool size.

**Algorithm 3 — Tactical Fit Analyzer (as actually implemented).**

```
ALGORITHM CalculateTacticalFit(playerStats, teamStats, position)
INPUT:  playerStats (accepted but unused in the modifier — see note below), teamStats, position
OUTPUT: Integer score in [0, 100]

BEGIN
  baseScore ← 50
  modifier  ← 0
  IF teamStats is NULL THEN teamStats ← LEAGUE_AVERAGE  // {50,50,50,50} — Section 4.3.1
  SWITCH position DO
    CASE 'MID': modifier ← teamStats.possessionRate * 0.4 + teamStats.attackingPassing * 0.1
    CASE 'FWD': modifier ← teamStats.counterAttack * 0.3 + teamStats.attackingPassing * 0.2
    CASE 'DEF': modifier ← teamStats.defensiveBlock * 0.5
    // GK / unmatched position: modifier stays 0
  END SWITCH
  RETURN CLAMP(ROUND(baseScore + modifier), 0, 100)
END
```

*Note on fidelity:* the algorithm accepts a `playerStats` parameter but, matching the design's own specification, never reads it inside the modifier calculation — the score is purely a function of team tactical style and position. This was implemented exactly as specified rather than "corrected," since the goal of this implementation pass was design-to-code fidelity, not algorithm redesign.

**Algorithm 4 — Gameweek Match-Point Calculation (`CalculatePlayerMatchPoints`).** ⚠️ *Scope note:* this algorithm and the "Chạy Matchday" (Run Gameweek) feature it powers were designed and implemented **after** the rest of this report's design chapter had already been written and the system described through Section 4.6 was already working. The original design (Section 3.5, UC-02) specifies only *event-by-event* real-time scoring — a webhook fires, one player's score is nudged, and the client's WebSocket listener applies it live. Algorithm 4 is a different, complementary mode: a one-shot *gameweek summary* calculation, run on demand once a user has finalised a starting eleven and a captain, that derives every starter's points from their recorded match statistics in a single pass and locks the squad against further transfers for that gameweek. It is documented here, in the Design chapter, rather than silently left out of the report, precisely because the report's own stated purpose (Section 1.4) is to distinguish "verified" from "not attempted" — omitting a feature that exists and is exercised in the live demo would be the same kind of gap this report elsewhere goes to some length to correct (Section 5.6).

```
ALGORITHM CalculatePlayerMatchPoints(playerStats, position, isCaptain)
INPUT:  playerStats { minutesPlayed, goals, assists, yellowCards, redCards, cleanSheet, saves }
        position ∈ {'GK','DEF','MID','FWD'}, isCaptain (Boolean)
OUTPUT: Integer — total fantasy points for one player for one gameweek

BEGIN
  points ← 0

  // 1. Appearance points
  IF playerStats.minutesPlayed > 0  THEN points += 1  END IF
  IF playerStats.minutesPlayed ≥ 60 THEN points += 1  END IF

  // 2. Attacking points
  points += playerStats.assists × 3
  goalWeight ← { GK: 6, DEF: 6, MID: 5, FWD: 4 }[position]
  points += playerStats.goals × goalWeight

  // 3. Defensive points — only if the player played at least 60 minutes
  IF playerStats.cleanSheet AND playerStats.minutesPlayed ≥ 60 THEN
    IF position ∈ {'GK','DEF'} THEN points += 4
    ELSE IF position = 'MID'   THEN points += 1
    // FWD earns no clean-sheet bonus
  END IF
  IF position = 'GK' THEN points += FLOOR(playerStats.saves / 3) END IF

  // 4. Disciplinary deductions
  points -= playerStats.yellowCards × 1
  points -= playerStats.redCards × 3

  // 5. Captaincy multiplier
  IF isCaptain THEN points ×= 2 END IF

  RETURN points
END
```

The full gameweek run (`matchdayService.runMatchday`, Section 5.7) wraps this pure function in the same transactional pattern established by Algorithm 1: a Prisma `$transaction` locks the target `UserSquad` row (`SELECT id FROM "UserSquad" WHERE id = ... FOR UPDATE`) before reading its `isLocked` flag, so that a double-click on "Chạy Matchday" cannot score the same gameweek twice. It then requires exactly eleven starters and a non-null `captainId` — both preconditions that surfaced real implementation bugs of their own, documented in Section 5.8 — before computing each starter's points, persisting them to `SquadPick.points`, summing them into `UserSquad.totalPoints`, and setting `isLocked = true`.

## 4.6 API and Data Flow Design

The real-time data flow (Section 3.5, UC-02) is: webhook POST → `eventId` deduplication check (in-memory TTL cache) → point-value computation → `io.to('gameweek_{n}').emit('LIVE_SCORE_UPDATE', payload)` → client-side room membership filter (clients only receive events for gameweeks they have joined) → per-player reactive state mutation. The transactional data flow (Section 3.5, UC-01) is: authenticated POST to `/api/transfers/process` → row lock acquired → balance/club-limit validation → multi-table write inside the same transaction → commit or full rollback → server-authoritative response consumed by the client (the client never computes its own balance).

## 4.7 Security and Access Control Design

- **Authentication.** JWTs are signed with a server-held secret; the `authenticateToken` middleware rejects missing, expired, or forged tokens before a request reaches business logic. The token itself expires after 1 day (`JWT_EXPIRES_IN`, `routes/auth.js`), acting only as a safety ceiling — the actual session policy is enforced client-side (`super-league-fantasy/src/store.js`): closing or backgrounding the tab records a timestamp, and reopening more than 30 minutes after that timestamp clears the cached session and forces re-authentication, while a tab left open and active is never force-logged-out mid-session. This two-layer design was chosen so a determined client could not extend their own session past the 30-minute policy by tampering with `localStorage`, without also making the 1-day JWT itself the primary expiry mechanism (which would log out an actively-playing user mid-session).
- **Authorisation.** Every financial or squad-mutating endpoint re-derives the user's balance and squad state from the database inside the same transaction that performs the mutation — the server never trusts a balance or price supplied by the client. This is enforced concretely, not just as a design intention: the frontend's `buyPlayer`/`sellPlayer` methods (Section 5.2) only ever assign `store.budget` from the server's HTTP response.
- **Password storage.** Passwords are never stored or logged in plaintext. `routes/auth.js` hashes with `bcrypt` at a cost factor of 12 before the value ever reaches PostgreSQL, and `User.passwordHash` is nullable specifically so an OAuth-only account (Section 5.13) has no password field to leak in the first place, rather than storing an unusable placeholder value. "Hashed" and "encrypted" are deliberately treated as distinct in this project: a hash is one-way (there is no decrypt operation, by design), which is the correct property for credential storage.
- **Input validation.** Registration enforces username character-set and length constraints; the password policy was strengthened in a later iteration from a bare 8-character minimum to also require at least one uppercase letter, one lowercase letter, one digit, and rejection of a small deny-list of common weak passwords (`password123`, `qwerty123`, etc.) — enforced identically on both sides: `routes/auth.js`'s `passwordPolicyError()` is the authoritative check, and `AuthModal.vue` mirrors the exact same five rules as a live, per-keystroke checklist (Figure 4.8) so a user is never shown an all-green client-side state that the server would still reject. Login uses a constant-time dummy `bcrypt.compare` against non-existent usernames to resist username-enumeration timing attacks.
- **Delegated authentication (OAuth 2.0 + PKCE).** Google, Facebook, and X login (Section 5.13) use the Authorization Code flow with PKCE and a single-use, TTL-bound CSRF `state` value, so no third-party password is ever handled or stored by this application. Each provider identity is deliberately kept as its own `User` row, keyed by that provider's stable ID, rather than auto-linked to an existing local account sharing the same email — an explicit choice to avoid an account-takeover path via a spoofed or reused email address on a different provider.
- **Cross-origin session cookie configuration.** The refresh-token cookie is `httpOnly` (inaccessible to page JavaScript, mitigating XSS-driven token theft) and, in production, set with `secure: true` and `sameSite: 'none'` (Section 5.10) — a requirement specific to this project's deployment topology, since the Vercel frontend and Render backend are different origins and a stricter `sameSite` value would silently prevent the cookie from ever being sent.
- **SQL injection.** Structurally prevented by Prisma's parameterised query generation; the one raw SQL statement in the codebase (the `FOR UPDATE` lock query in `transferService.js`) uses Prisma's tagged-template `$queryRaw`, which parameterises interpolated values rather than string-concatenating them.
- **Least privilege.** The database role used by the running application does not need schema-alteration privileges at runtime in a production deployment; migrations should run under a separate, more privileged role never exposed to the application process (this project's local development setup, and its current Render deployment, both use a single role for convenience, which is explicitly flagged as unsuitable for a production system handling real funds in Section 7.2).

---

# 5. Implementation

This chapter documents how the system was actually built, including the technical problems encountered during this specific engineering pass and the solutions adopted — several of which only surfaced once the system was connected to a real, running PostgreSQL instance rather than assumed to work.

## 5.1 Development Environment

**Table 5.1 — Development Tooling**

| Tool | Purpose |
|------|---------|
| Git | Version control |
| PostgreSQL 18 (native Windows service) | Local relational database — see Section 5.6 for the environment problems encountered here |
| Prisma CLI (`npx prisma migrate dev`) | Schema synchronisation and migration generation |
| Jest + Supertest | Concurrency and HTTP integration testing (Chapter 6) |
| npm | Dependency management (backend and frontend) |

The local PostgreSQL instance runs as a native Windows service rather than in Docker; no `docker-compose.yml` exists in this project despite that being common practice, which is noted here as a documented deviation from typical setup rather than left implicit.

## 5.2 Real-Time Engine — Room-Scoped WebSocket Broadcasting

The webhook endpoint (`/api/webhook/simulate`) accepts a payload including `eventId` and `gameweek`. Before broadcasting, it is checked against an in-memory `Map<eventId, timestamp>` with a 10-minute TTL sweep:

```js
function isDuplicateEvent(eventId) {
  if (!eventId) return false;
  const now = Date.now();
  for (const [id, ts] of processedEvents) {
    if (now - ts > EVENT_DEDUP_TTL_MS) processedEvents.delete(id);
  }
  if (processedEvents.has(eventId)) return true;
  processedEvents.set(eventId, now);
  return false;
}
```

Broadcasts are then scoped to the relevant gameweek room rather than emitted globally:

```js
const room = `gameweek_${gameweek || 1}`;
io.to(room).emit('LIVE_SCORE_UPDATE', { playerId, message, pointsAdded: points });
```

Clients join their active gameweek's room on socket connect:

```js
socket.on('join_gameweek', (gameweek) => {
  socket.join(`gameweek_${gameweek || 1}`);
});
```

On the client, the socket connection itself was moved to be auth-gated: earlier in this project's history it connected unconditionally at module load, before login even completed, which meant an unauthenticated visitor's browser held an open WebSocket connection for no reason. `initRealtime()` is now called from `_setAuthSession()` (post-login) and once at start-up only if a saved session token exists, and `logout()` explicitly disconnects the socket.

## 5.3 Micro-Finance BNPL Engine — Prisma Transactions with Row Locking

Algorithm 1 (Section 4.5) is implemented in `services/transferService.js`. The row lock is issued as a raw parameterised query at the start of the transaction, before any read of the user's balance:

```js
if (useLock) {
  await tx.$queryRaw`SELECT id FROM "User" WHERE id = ${userId} FOR UPDATE`;
}
```

This is the single line of code responsible for NFR-02. Everything downstream of it — the balance read, the shortfall computation, the balance write — executes while holding an exclusive lock on that user's row, so a second concurrent transaction attempting the same lock blocks until the first commits or rolls back, and then re-reads the now-current balance rather than acting on a stale value. Chapter 6 documents the test that proves this concretely, including a deliberate control run with the lock disabled.

`routes/transfers.js` was reduced to a thin controller over this service — `POST /api/transfers/process` (buy, optionally with a linked sell) and `POST /api/transfers/sell` (standalone sell, crediting 90% of the player's current price) — so that the transactional logic has exactly one implementation, exercised identically whether reached via the real HTTP route or the test suite's direct service calls.

## 5.4 Tactical Fit Analyzer — Server-Side Scoring

Algorithm 3 did not exist as a server-side service prior to this implementation pass; the original codebase computed a radar chart entirely client-side from raw player statistics, with no `Team` entity and no `TacticalFitService` at all. Implementing it required: adding the `Team` model to `schema.prisma` (Section 4.3), seeding ten curated clubs with tactical statistics inferred from their real rosters, and exposing `GET /api/players/:id/tactical-fit`, which the frontend's `PlayerComparison.vue` now calls and renders alongside its existing client-built radar chart. As a concrete correctness check: for Mohamed Salah (Liverpool, position `MID`), the service computes `50 + (62 × 0.4) + (75 × 0.1) = 82`, which matches the value the live endpoint actually returned when queried — a small but genuine end-to-end verification, not just a unit-level assertion.

## 5.5 Real Player Data: A Three-Provider Evaluation

The original codebase shipped with a 60-player hand-curated array (`BACKUP_PLAYERS`) as its entire dataset, despite the design intent (Section 1.4) of drawing on real players across all five top European leagues. Closing this gap required evaluating three data-source options; two were tried and rejected, and the reasons matter as much as the final choice, because both rejections were discovered empirically rather than from documentation alone.

### 5.5.1 Rejected — Sportmonks (wrong league coverage on the configured token)

The project's `.env` was already pre-configured with a Sportmonks token and a `SPORTMONKS_TOP5_LEAGUE_IDS` variable naming the five target leagues. Querying that token's actual `/leagues` endpoint revealed it only had access to four leagues: the Danish Superliga, the Scottish Premiership, and their play-off variants — none of which are the top five European leagues the rest of the configuration assumed. This is an account-tier restriction, not a code bug; `scripts/seed.js` (which pulls from Sportmonks and is fully functional) was left in place since it would work correctly against a token with the right league entitlements, but was not used to populate the live dataset.

### 5.5.2 Rejected — football-data.org (free tier does not actually return squad data)

football-data.org's free tier nominally includes all five target leagues at its "TIER_ONE" access level. `scripts/seedFootballData.js` was built against its `/competitions/{code}/teams` and `/teams/{id}` endpoints. Live testing, however, showed every team's `squad` field returned empty (`[]`), with a `lastUpdated` timestamp from 2022–2024 rather than current — the free tier grants metadata access (team names, badges) but not the actual player-roster data this project needs. This was only discoverable by testing the data-bearing endpoint directly; checking that the leagues existed and were nominally "free-tier" was not sufficient, and this distinction (metadata access vs. data access) is recorded here as a genuine lesson (Section 7.4).

### 5.5.3 Used — API-Football / api-sports.io (free tier, with documented ceilings)

API-Football's free tier proved genuinely usable: 100 requests/day, all endpoints and leagues unlocked, and a bulk `/players?league={id}&season={year}` endpoint returning real squad data (20 players per page). `scripts/seedTop5Free.js` was built to consume this with two real constraints discovered during the actual seeding run, not anticipated in advance:

- **A hard pagination ceiling**, not a daily quota: the free plan rejects any request for page 4 or beyond with `"Free plans are limited to a maximum value of 3 for the Page parameter"` — capping every league at 60 players regardless of how many days one waits. The script's error handling was corrected mid-run to distinguish this permanent ceiling from genuine daily-quota exhaustion (a real HTTP 429), since the two failure modes look superficially similar but require different responses (stop entirely and move to the next league, vs. checkpoint and resume tomorrow).
- **Season restriction**: only seasons 2022–2024 are available on the free tier, not the live current season, so the dataset reflects recent-past squads rather than up-to-the-minute transfers.

The script is resumable (`scripts/.seedTop5Progress.json`, checkpointed after every page) and was run to completion across a single working session once the pagination-ceiling behaviour was understood. It seeded **297 real players** on top of the original 60 curated players, for **357 total**, spanning **94 of the 96 clubs** across the Premier League, La Liga, Bundesliga, Serie A, and Ligue 1 — verified live via the running `/api/players` endpoint. A separate, first-time-ever seed of the curated 60-player dataset into PostgreSQL (`scripts/seedCuratedPlayers.js`) was also required, because prior to this pass nothing ever loaded that array into the database; `/api/players` fell back to serving it directly from memory whenever the `Player` table was empty, which silently masked the fact that no persistence path for the curated set had ever existed.

**Known limitations of the resulting dataset**, stated plainly rather than left implicit: squads are thin (~3–4 players per club on average, not full ~25-player rosters, due to the page-3 ceiling); the season snapshot is 2024–25, not live; and player prices remain synthetic/randomised, since no evaluated provider exposes real market values on its free tier. A paid Sportmonks "Starter" plan (confirmed at €29/month, letting the subscriber pick exactly five leagues) or API-Football's $19/month tier would remove the pagination ceiling and reach full squad depth; this is recorded as required future work (Section 7.3) rather than attempted in this pass, since neither was purchased.

## 5.6 Technical Problems and Solutions

**Problem: the database was never actually configured.** `DATABASE_URL` in `.env` contained the literal unfilled placeholder `yourpassword`, and the target database (`fantasy_db`) had never been created — meaning no migration, seed script, or test in this project could ever have been run successfully before this pass, regardless of how correct the application code was. Diagnosing this required reading the PostgreSQL server log directly (`pg_ctl start` in the foreground surfaces the exact `FATAL` line, which the generic Windows-service error message does not) rather than trusting the connection-string syntax alone. Root cause was a typo (`scraam-sha-256` instead of `scram-sha-256`) introduced during a prior manual edit of `pg_hba.conf`. Resolution: a standard "forgot the Postgres password" recovery procedure — temporarily set `pg_hba.conf`'s local/host auth methods to `trust`, restart the server (via `pg_ctl` directly, since the Windows Service Control Manager requires administrator privileges that were not available in this environment), issue `ALTER USER postgres WITH PASSWORD ...`, then revert the config and restart again — followed by creating the missing database and running the project's first-ever `prisma migrate dev`.

**Problem: the concurrency test didn't actually create a race, even with locking correctly disabled.** The first version of the "unlocked" test case in Chapter 6 fired two concurrent unlocked transfer requests via `Promise.allSettled` and expected both to succeed (the lost-update anomaly). Instead, only one succeeded, and inspecting the rejection reason showed the second request had read the *already-updated* balance — meaning the two requests had run sequentially in practice, not concurrently, because Node's event loop and a fast local Postgres round-trip let the first transaction fully commit before the second one's first query even executed. The fix was to insert a small, test-only artificial delay (`raceDelayMs`) between the read and the write inside the unsafe code path, wide enough to guarantee genuine interleaving. This is recorded in detail in Section 7.4 as a genuine methodological lesson: naive `Promise.all`-based concurrency tests do not, by themselves, guarantee two operations actually overlap at the database level.

**Problem: test fixtures silently replaced the real player catalogue.** `/api/players` prefers the database over the static fallback the moment the `Player` table is non-empty. Early concurrency-test runs inserted synthetic fixture players (and one leftover from an ad-hoc diagnostic script under a different username prefix) directly into the same `Player` table the running application serves from, which meant the actual Transfer Market UI would have shown test data ("Test Striker A", "Race Target 3") instead of real players. This was caught by manually inspecting `/api/players`' live output after a test run, not by the test suite itself — the test suite's assertions were all still green while this was happening. The fix was twofold: proper `afterAll` teardown in the test suite (deleting fixture `Transaction`/`SquadPick`/`UserSquad`/`User`/`Player` rows by both the expected username prefix and, having learned from the leftover-diagnostic-script incident, by direct player-ID reference as a more robust fallback), and a one-off cleanup pass to remove pollution left by earlier ad-hoc runs before this fix existed.

## 5.7 Gameweek Summary Scoring — the "Chạy Matchday" Extension

As flagged in Section 4.5, this feature was designed and built in a later iteration than the rest of Chapter 5, once the base system (real-time scoring, BNPL transfers, tactical fit) was already working end-to-end. It was prompted by a concrete, practical requirement outside the original report scope: generating a realistic test fixture from actual Premier League Matchweek 1 (2025–26 season) results to validate the scoring algorithm against real data, and then wiring that validated algorithm into the live application rather than leaving it as a standalone script.

**`services/scoringService.js`** implements Algorithm 4 as a pure function with no database access, deliberately kept separable from the transactional code around it so it can be unit-tested in isolation. Hand-computed verification during development: a captained forward with 2 goals and a clean sheet over ≥60 minutes scores `(1 + 1) + (2 × 4) + 4 = 14`, doubled to `28` for the captaincy multiplier — later observed to be `20` live in Section 6.7 for a different fixture (Erling Haaland, 1 goal, clean sheet, `(1+1) + (1×4) + 4 = 10 → ×2 = 20`), matching the algorithm exactly.

**`services/matchdayService.js`** (`runMatchday`) is the transactional wrapper described in Section 4.5: it locks the `UserSquad` row, validates exactly eleven starters and a non-null captain, reads every starter's `PlayerGameweekStat` row for the target gameweek (falling back to an all-zero `EMPTY_STATS` object — and therefore zero points — for any player with no recorded row, a design choice whose consequences are discussed in Section 5.9), computes points via Algorithm 4, writes them to `SquadPick.points`, sums them into `UserSquad.totalPoints`, and sets `isLocked = true`. `routes/matchday.js` exposes this as `POST /api/matchday/run`, mapping the service's typed errors (`NotFoundError`, `SquadIncompleteError`, `AlreadyLockedError`) to 404/400/409 respectively, and additionally pushes the new total into the Redis leaderboard (`FR-07`) via `zAdd` so a completed gameweek is immediately reflected in global rankings.

**`scripts/seedGameweekStats.js`** loads the real match-data fixture: hand-sourced Matchweek 1 statistics (minutes played, goals, assists, cards, clean sheets, goalkeeper saves) for 34 curated players across six Premier League clubs actually competing that gameweek (Arsenal, Manchester City, Liverpool, Aston Villa, Newcastle, Chelsea), with a neutral placeholder (`90` minutes, zero events, no clean sheet) for every other seeded player — including, deliberately, players from clubs in leagues that were not playing a Premier League Matchweek 1 fixture at all (PSG, Barcelona, Real Madrid, Bayern Munich), so that a squad mixing curated and non-curated players still produces a coherent, non-crashing result rather than a missing-data error. One data point is worth recording as an example of the care this required: Alexander Isak (Newcastle) is seeded with an explicit all-zero stat line rather than the club-level fixture default, because he genuinely did not feature in Newcastle's real Matchweek 1 fixture — a reminder that "real data" seeding has to encode absence correctly, not just presence.

**Frontend integration.** `SquadPitch.vue` gained a "▶ Chạy Matchday" button, enabled only once `store.squad` contains exactly eleven starters and a captain is set (`canRunMatchday`, mirroring the same precondition the backend independently enforces — server-side validation is the source of truth, per NFR-04, but the client check avoids a pointless round trip for an obviously-incomplete squad). `store.runMatchday()` posts to the new endpoint and, on success, walks the returned per-player breakdown to populate each squad member's `livePoints`, a human-readable event badge (⚽×N, 🅰️×N, 🧤 clean sheet, card icons), and sets `squadLocked = true`, which in turn disables further buy/sell actions in `TransferMarket.vue` and drag-and-drop substitutions in `SquadPitch.vue` for that gameweek.

## 5.8 A Server-Authoritative Squad State Gap — the Missing Captain Endpoint

This section documents a bug found and fixed during the same implementation pass that added Algorithm 4, and it is recorded in some detail because it is a clean illustration of a failure mode this report's own design principles (Section 4.7: "the server never trusts a balance or price supplied by the client") are explicitly meant to prevent — and yet, for one specific piece of state, had not actually been applied.

**The bug.** `UserSquad.captainId` (Section 4.3) is not a new column; it existed in the schema from an earlier iteration. The frontend's `store.setCaptain(playerId)` method updated the client's local `captainId` and displayed a success toast ("Captain armband given to ...") — but never issued any network request. Because Algorithm 4's `matchdayService.runMatchday` reads `captainId` directly from the `UserSquad` row in PostgreSQL (Section 5.7), and no code path anywhere in the application had ever written a non-null value to that column, the database-side `captainId` was permanently `NULL` regardless of what a user selected in the UI. The practical consequence: clicking "Run Matchday" always failed with `SquadIncompleteError("You haven't picked a Captain for this squad.")` — a correct rejection of genuinely missing state, triggered by a UI that had already (incorrectly) confirmed the opposite to the user.

**Why this survived initial testing.** The bug is invisible to any test or manual check that stays entirely within the client, because the client's own state — the only thing a casual UI walkthrough inspects — was internally consistent and looked correct (the captain's armband badge rendered, the success toast fired). It was only caught during a full live browser-driven walkthrough (Section 6.7) that exercised the actual `POST /api/matchday/run` call end-to-end, which is itself the argument for that verification method's inclusion in this report rather than relying on component-level manual review alone.

**The fix.** A new endpoint, `POST /api/squad/captain`, was added to `routes/squad.js`, validating that the squad exists, is not already locked, and that the nominated player is a *starting* member of that squad (mirroring the same starting-eleven-only constraint the frontend already enforced cosmetically) before writing `captainId` to the database. `store.setCaptain()` was rewritten to call this endpoint and roll back its optimistic local update if the server rejects the change — consistent with the same "server response is the only source of truth" pattern already used by `buyPlayer`/`sellPlayer` (Section 4.7). Two supporting endpoints were added at the same time to close a related gap: `GET /api/squad` (returning a user's real, database-backed squad, so a page reload resynchronises client state from PostgreSQL rather than trusting a `localStorage` snapshot that may have drifted) and `POST /api/squad/reset` (so the frontend's existing "Reset Squad" button, which previously only cleared client-side state without touching the database, now actually deletes `SquadPick` rows and refunds the squad's current market value server-side).

## 5.9 Economic System Audit

Two independent user-facing reports of incorrect wallet balances during this implementation pass prompted a full audit of the transfer-and-balance code path, rather than a narrow patch to the specific symptom reported. This section records what the audit found, distinct from the concurrency-safety work in Section 5.3, which was already correct.

**Bug 1 — a stale default value on a changed price scale.** `User.virtualBalance` defaulted to `10.0` in `schema.prisma`, a value carried over from an earlier iteration of the project's economy before player prices were rescaled roughly ten-fold. A newly registered user's displayed balance (backed by a frontend heuristic that multiplied a suspiciously low balance by 10 purely for display) diverged from their real, unscaled database balance the moment any transaction occurred, since `buyPlayer`/`sellPlayer` always assign `store.budget` directly from the server's response (Section 4.7) rather than reapplying the display heuristic. Concretely: a user shown "$100.0M" who bought a $4.2M player would see their balance drop to "$0.8M" rather than "$95.8M", because the server had only ever actually granted them $10.0M. The fix was to correct the default at its source — `schema.prisma`'s `virtualBalance @default(100.0)`, a data migration scaling any existing balance at or below the old ceiling, and the same correction to the in-memory demo-mode fallback in `routes/auth.js` — and to delete the client-side scaling heuristic entirely rather than compensate for a wrong default with a display-layer patch.

**Bug 2 — a stale-value-priority bug in client state initialisation.** A second, subtler defect surfaced after the first fix: a user's displayed balance was still occasionally wrong on page reload, specifically because `store.js`'s initialisation logic preferred the `virtualBalance` snapshotted in `localStorage` at *login time* (`auth_user`) over the more recently persisted balance already cached in `localStorage` under a separate key from the *last transaction*. Every reload after at least one purchase would silently revert the displayed balance to its value as of login, until the next transaction overwrote it again. The fix reordered the priority so the most recently written value always wins, and — as defence in depth rather than a second patch on the same symptom — added `store.refreshProfile()` and `store.refreshSquad()`, both called on every app boot, which re-fetch balance, penalty points, and squad state directly from the server rather than trusting any client-cached value to have stayed correct.

**Bug 3 — business rules enforced only in the UI.** Consistent with this report's stated security posture (Section 4.7) but not, on audit, consistent with its actual implementation: the per-position squad limits (`GK ≤ 2, DEF ≤ 5, MID ≤ 5, FWD ≤ 3`, total ≤ 15) were checked only in `store.js`'s `canAddPlayer`, and were never re-validated inside `transferService.js`'s transaction. A request crafted directly against `POST /api/transfers/process` — bypassing the UI entirely — could accumulate an arbitrarily large or lopsided squad. The fix added the identical limits as an explicit check inside `_runTransfer`'s transaction, alongside the pre-existing club-ownership check (Section 4.5, Algorithm 1), so the same constraint is now enforced twice for defence in depth (fast client-side rejection for normal UI use; authoritative server-side rejection for anything else) rather than once, client-side only.

**Bug 4 — `isLocked` was declared but never checked.** `UserSquad.isLocked` (Section 4.3) existed before Algorithm 4 needed it, but nothing had ever set it to `true`, and `transferService.js` never checked it — meaning that once Algorithm 4 was implemented and did start setting it, buy/sell requests against an already-scored squad would have silently mutated `SquadPick` rows the matchday run had already scored, corrupting a result that should have been immutable. `_runTransfer` and `executeSell` were both updated to fetch the current squad without pre-filtering on `isLocked` (so a locked squad is found and explicitly rejected with `SquadLockedError`, rather than silently treated as "no squad, create a new one").

**Bug 5 — a misleading rejection message masking the real cause.** Distinct from the above server-side bugs, `TransferMarket.vue`'s client-side purchase handler determined *which* error message to show a user by inspecting only the user's budget shortfall — if the shortfall exceeded the BNPL cap, it always displayed "BNPL only allows loans up to $2.0M" and never actually contacted the backend, even when the true rejection reason (discovered live, Section 6.7) was a club or position limit that would have applied regardless of budget. The fix removed the client-side guess for that branch and delegated to the same `store.buyPlayer()` call the normal-affordability path already used, so the toast shown to the user always reflects the backend's actual, authoritative rejection reason rather than a client-side inference that happened to be wrong whenever more than one constraint was violated at once.

## 5.10 Public Deployment — Render, Vercel, and Upstash Redis

Every section up to this point describes a system verified against `localhost`. A final implementation pass moved Super League Pro to a public deployment, on the reasoning that a fantasy-sports platform's real-time and financial claims (Sections 5.2–5.3) are only fully meaningful once demonstrated across the network topology a real user would actually experience — separate origins, a managed database, and a managed Redis instance, rather than three processes on one machine trusting one shared `localhost`.

**Topology.** The Vue frontend (`super-league-fantasy`) is built and served as a static Vite bundle on Vercel; the Express/Socket.io backend (`fantasy-backend`) runs as a Render Web Service alongside a Render-managed PostgreSQL instance; Redis is provided by Upstash (a free-tier managed Redis reachable only over TLS, i.e. `rediss://`, not the plain `redis://` scheme `redisClient` had only ever been exercised against locally). A `render.yaml` Blueprint declares both the web service and the database together, wiring `DATABASE_URL` automatically via Prisma's `fromDatabase` reference rather than requiring it to be copied by hand, and every remaining secret (`JWT_SECRET`, `JWT_REFRESH_SECRET`, `REDIS_URL`, `FRONTEND_ORIGIN`) is declared with `sync: false` so it is entered once directly in the Render dashboard rather than committed to the repository. `server.js` gained `app.set('trust proxy', 1)` so `req.protocol` reports correctly behind Render's TLS-terminating reverse proxy, and a `GET /health` endpoint that checks both `prisma.$queryRaw\`SELECT 1\`` and `redisClient.isReady`, wired as the Blueprint's health-check path so Render only routes traffic to an instance that can actually reach both of its dependencies.

**A genuine pre-existing bug, found before it could affect a real user.** Reviewing the authentication path specifically for cross-origin correctness (rather than assuming code that worked on `localhost` would keep working once frontend and backend were different origins) surfaced that `tokenService.js`'s refresh-token cookie was hardcoded to `sameSite: 'strict'`:

```js
function refreshCookieOptions() {
  const isProd = process.env.NODE_ENV === 'production';
  return {
    httpOnly: true,
    secure: isProd,
    sameSite: isProd ? 'none' : 'lax',
    maxAge: REFRESH_TOKEN_MAX_AGE_MS,
    path: '/api/auth'
  };
}
```

A `sameSite: 'strict'` cookie is never sent on a cross-site request under any circumstance — meaning the moment the frontend and backend stopped sharing an origin, every `/api/auth/refresh` call would have silently failed to include the refresh token, breaking session persistence for every user, with no error message pointing at the cause (the request would simply look like an unauthenticated one). This was corrected to `sameSite: 'none'` (which requires `secure: true`, itself gated on `NODE_ENV === 'production'` so local HTTP development is unaffected) before the first real deployment, rather than being discovered later as a user-facing symptom — it is recorded here in the same evidence-first spirit as the rest of this report specifically *because* it was caught by deliberate review of a known cross-origin failure mode, not by accident.

**Two further deployment-specific gotchas, both operational rather than code defects, are recorded because they cost real debugging time and generalise beyond this project.** First, Vite inlines `import.meta.env.VITE_API_BASE` at *build* time, not at runtime — changing its value in the Vercel dashboard has no effect on an already-built bundle and requires a genuinely new deployment (a "Redeploy" of an old build reuses that build's already-inlined value). Second, Vercel's per-deployment preview URLs (containing a random hash, e.g. `...-rg4b1ibgr-....vercel.app`) are distinct from the stable Production domain shown under the project's Domains tab; `FRONTEND_ORIGIN` on the backend must match the latter, and using the former — an easy mistake, since both look like valid HTTPS URLs for the same site — produces a CORS rejection whose browser-console message correctly names the mismatched origin but gives no hint that a *different, stable* URL was the one actually expected.

**Data migration without re-spending a rate-limited quota.** Section 5.5.3's real player dataset was already seeded into the local PostgreSQL instance; re-running `seedTop5Free.js` against the new, empty Render database would have re-consumed API-Football's 100-requests/day free-tier quota for no benefit, since the data itself had not changed. Instead, `pg_dump --data-only --column-inserts` exported the existing local rows as portable `INSERT` statements, and `psql -f` replayed them directly against the Render database's connection string — a few minutes of work in place of the multi-day re-seed the original ingestion required.

## 5.11 Real Club and League Crests — Market, Fixtures, and Leagues & Clubs Redesign

The Transfer Market and Fixtures tabs originally represented a player's or fixture's club and league with plain coloured text pills (e.g. a solid-colour "ARS" badge), generated client-side from a hand-maintained colour lookup table. Stakeholder feedback requested real crest imagery instead. Rather than adding a new backend field or a fourth data-provider integration, this was solved by exploiting a property of the provider already in use: api-sports.io serves club and league crests at predictable, public CDN paths keyed by the same numeric IDs the dataset already stores —

```js
export function getClubBadgeUrl(teamId) {
  return teamId ? `https://media.api-sports.io/football/teams/${teamId}.png` : null;
}
export function getLeagueBadgeUrl(leagueName) {
  const id = LEAGUE_IDS[leagueName]; // the 5 hardcoded top-league IDs
  return id ? `https://media.api-sports.io/football/leagues/${id}.png` : null;
}
```

— meaning every crest renders directly from `Player.teamId` (already present on every seeded row, Section 4.3) with zero additional API requests and zero new database columns, sidestepping the exact rate-limit ceiling that constrained Section 5.5.3. Because a numeric ID has no contractual guarantee that a crest image exists behind it, every badge is wrapped in the same defensive pattern: a reactive `Set` of ids whose image previously 404'd, populated by an `@error` handler, and a `v-if` guard so a missing crest silently falls back (to a position badge for players, an initial-letter circle for clubs) rather than rendering a broken-image icon — reused identically across `TransferMarket.vue`, `GameweekFixtures.vue`, and `LeaguesInfo.vue`.

**Transfer Market.** The player row was redesigned alongside the badge addition: the "Form" column (a compressed W/D/L dot sequence) was removed, and the freed width went to a larger player photo and larger club/league badges — a deliberate trade-off, since the badges make a player's club instantly recognisable at a glance in a way the form column did not, and stakeholder feedback specifically asked for player and club identity over the form indicator.

**Fixtures.** Both teams in a fixture now show their club crest with their league crest overlaid as a small corner badge — necessary because `scripts/seedFixtures.js` pairs clubs for a mock schedule across *all five* leagues rather than within a single league (Section 4.5's mock-data rationale), so a single fixture can genuinely be, for example, SC Freiburg (Bundesliga) vs. Arsenal (Premier League), and each side needs its own league identity shown independently. A League filter dropdown was added next to the existing Gameweek dropdown, built from the same `teamId → leagueName` lookup already fetched for the badges; because fixtures can straddle two leagues, "filter by league" is defined as *either* side belonging to the selected league, not both, and this distinction is stated explicitly in the UI copy rather than left for a user to discover by trial and error.

**Leagues & Clubs and player nationality.** A new tab groups every seeded club under its league, each with its crest, and each club card is now clickable, opening a roster panel that lists that club's players by photo, full name, and nationality — deliberately excluding price, position, and stats, since stakeholder feedback specified this page as a pure club-identity reference rather than a second Transfer Market. Building this exposed a genuine data gap: `Player.nationality` did not exist as a column at all, even though API-Football's bulk `/players` endpoint (already the source for every other seeded field, Section 5.5.3) returns it on the exact same response `seedTop5Free.js` was already consuming — the field was simply never read. A migration added the nullable column, and `seedTop5Free.js` was updated to capture it going forward at no extra request cost. Retroactively populating it for the 357 players already seeded before the column existed is a separate concern, since nationality is only present on the `/players` response, not the lighter `/teams` endpoint the roster grouping itself uses — `scripts/backfillNationality.js` re-walks the same paginated `/players?league={id}&page={n}` calls as the original seed, subject to the same free-tier constraints documented in Section 5.5.3 (a hard page-3 ceiling per league, a 100-requests/day cap), meaning a full backfill takes the same multi-day, resumable-checkpoint pattern as the original dataset ingestion. Players not yet backfilled display "Nationality unknown" in the roster panel rather than a blank or broken field.

## 5.12 Registration Security UX and Onboarding

Two related but distinct UX gaps were closed once the underlying account-security work (bcrypt hashing, Section 4.7) was already in place but not visibly communicated to a user at the point they most needed it.

**Live password-policy checklist.** The registration form previously gave no indication of what makes a valid password beyond a generic server-side rejection after submission. `AuthModal.vue` gained a `passwordRules` computed property that duplicates the server's `passwordPolicyError()` rules from `routes/auth.js` exactly — length ≥ 8, at least one uppercase letter, one lowercase letter, one digit, and not a member of a small common-weak-password deny-list — rendered as a live per-keystroke checklist (✓/○ per rule, Figure 4.8) rather than a single pass/fail message:

```js
// AuthModal.vue — mirrors routes/auth.js's passwordPolicyError() exactly, so
// a password that looks "done" here is guaranteed to also pass the server's
// check — the user should never fill this checklist green and then still
// get rejected by the API on submit.
const passwordRules = computed(() => {
  const pwd = form.value.password;
  return [
    { label: 'At least 8 characters', met: pwd.length >= 8 },
    { label: 'One uppercase letter (A-Z)', met: /[A-Z]/.test(pwd) },
    { label: 'One lowercase letter (a-z)', met: /[a-z]/.test(pwd) },
    { label: 'One number (0-9)', met: /[0-9]/.test(pwd) },
    { label: 'Not a common password', met: pwd.length > 0 && !COMMON_WEAK_PASSWORDS.has(pwd.toLowerCase()) },
  ];
});
```

`isFormInvalid` additionally requires `passwordRules.value.every(r => r.met)` on the register tab, so the submit button itself stays disabled until every rule is satisfied — a second layer on top of the visual checklist, not a replacement for the server-side check, which remains authoritative. Keeping the two rule sets in exact correspondence was a deliberate implementation concern: a checklist that goes all-green on a password the server would still reject is worse than no checklist at all, since it actively misleads the user at the exact moment they are deciding the submission is ready.

**Welcome onboarding modal.** A newly registered account was previously dropped straight into the main application with no orientation. `WelcomeModal.vue` is a four-step animated carousel (Build Squad → Transfer Market → Captain & Vice-Captain → Run Matchday) shown once, immediately after a successful `register()` call — never after `login()`, so a returning user is never re-shown onboarding they have already seen — and is non-blocking: it can be dismissed or stepped through at the user's own pace rather than gating access to the rest of the interface behind forced completion, a deliberate choice among three onboarding design options considered (a forced tutorial flow and a redirect-to-guide page being the two rejected alternatives) on the basis that a skippable walkthrough respects a user who already understands fantasy-sports conventions while still orienting one who does not.

## 5.13 Social Login — OAuth 2.0 Authorization Code Flow with PKCE

"Continue with Google / Facebook / X" was implemented as one generic OAuth 2.0 Authorization Code (+ PKCE) handler (`routes/oauth.js`) parameterised by a small per-provider configuration object (`services/oauthProviders.js`), rather than three independently hand-written flows, since the redirect → token-exchange → profile-fetch shape is identical across providers and only the URLs and profile-response field names differ.

**Table 5.2 — OAuth 2.0 Provider Configuration**

| Provider | Client ID Env | Token Auth Style | PKCE | Notes |
|----------|---------------|-------------------|------|-------|
| Google | `GOOGLE_CLIENT_ID` | Body | Yes | Profile via `openidconnect.googleapis.com/v1/userinfo` |
| Facebook | `FACEBOOK_APP_ID` | Body | No | Facebook's OAuth 2.0 implementation does not support PKCE |
| X (Twitter) | `TWITTER_CLIENT_ID` | HTTP Basic | Yes (mandatory) | Requires the OAuth 2.0 Client ID/Secret, distinct from the legacy OAuth 1.0a API Key/Secret pair the same developer portal also issues |

**Flow.** `GET /api/auth/:provider` generates a single-use, TTL-bound (10-minute) CSRF `state` value and, for PKCE-capable providers, a `code_verifier`/`code_challenge` pair, stores the pending pair server-side in an in-memory map keyed by `state`, and redirects the browser to the provider's own consent screen — this is a real browser navigation, not an XHR call, because the user must authenticate on the provider's own domain:

```js
// routes/oauth.js — GET /api/auth/:provider
const clientId = process.env[provider.clientIdEnv];
if (!clientId) {
  return res.status(503).json({ success: false, error: `${provider.label} login is not configured on this server yet.` });
}

const state = crypto.randomBytes(24).toString('hex');
const codeVerifier = base64url(crypto.randomBytes(32));
pendingOAuthStates.set(state, { provider: providerName, codeVerifier, createdAt: Date.now() });

const params = new URLSearchParams({
  client_id: clientId,
  redirect_uri: callbackUrlFor(req, providerName),
  response_type: 'code',
  scope: provider.scope,
  state
});

if (provider.usesPkce) {
  const codeChallenge = base64url(crypto.createHash('sha256').update(codeVerifier).digest());
  params.set('code_challenge', codeChallenge);
  params.set('code_challenge_method', 'S256');
}

res.redirect(`${provider.authorizeUrl}?${params.toString()}`);
```

The `codeVerifier` is never sent to the provider at this stage — only its SHA-256 hash (`code_challenge`) is — and is only revealed in the later token-exchange request, which is what makes PKCE effective against an authorization-code-interception attack even without a client secret (relevant for a public client, though this project's server-side exchange also uses a confidential client secret as a second layer). `GET /api/auth/:provider/callback` receives the provider's redirect back, validates `state` against the stored pending entry (rejecting replay or forgery, and deleting it immediately so it is single-use), exchanges the authorization `code` plus the original `codeVerifier` for an access token, fetches the provider's profile endpoint, and either creates a new `User` row (keyed by that provider's stable ID in a dedicated column — `googleId`, `facebookId`, or `twitterId`, Section 4.7) or logs into the existing one. The resulting session is issued through the exact same `tokenService.js` mechanism as a password login (Section 4.7), so no other part of the application can distinguish an OAuth session from a password one.

**Configuration is checked, not assumed.** `GET /api/auth/:provider` explicitly checks `process.env[provider.clientIdEnv]` before attempting any redirect, and returns a clear `503 { error: "<Provider> login is not configured on this server yet." }` if the corresponding client ID has not been set — a deliberate design choice so an unconfigured provider fails loudly and specifically rather than redirecting into a broken flow or crashing. At the time of this report, real client ID/secret pairs had not yet been registered with all three providers (each requires its own developer-portal application, and Facebook and X additionally gate live login behind an app-review or Live-mode step, Section 7.2), so the full provider redirect round-trip is recorded as a remaining verification item rather than claimed as live-tested (Section 6.7).

## 5.14 A Template Composition Bug: Vue's `v-else` Binds to the Nearest `v-if` Sibling

This section documents a defect found via a live production bug report, not discovered by code review, and is recorded because its root cause is a general Vue templating hazard rather than a mistake specific to this project's business logic.

**The bug.** `App.vue`'s root template originally read:

```html
<AuthModal v-if="!store.isAuthenticated" />
<WelcomeModal v-if="store.isAuthenticated && store.showWelcomeModal" />
<template v-else>
  <!-- main authenticated application shell -->
</template>
```

Vue's compiler binds a `v-else` block to the *nearest preceding sibling element carrying `v-if` or `v-else-if`* — not to whichever `v-if` a reader might intend by visual proximity or intention. Here, that nearest sibling was `WelcomeModal`'s own `v-if`, not `AuthModal`'s. For a logged-out visitor, `store.isAuthenticated` is `false`, so `WelcomeModal`'s `v-if` condition (`isAuthenticated && showWelcomeModal`) is also `false` — which meant the `v-else` block (the entire main application shell) evaluated to `true` and rendered *in addition to* `AuthModal`, not instead of it. The shell's header immediately reads `store.currentUser.username`, and `store.currentUser` is `null` before login, producing `TypeError: Cannot read properties of null (reading 'username')` at mount — a fully blank page for every unauthenticated visitor, which is to say every first-time visitor to the public deployment.

**How it was found.** A user report of "the site shows nothing" was diagnosed by first ruling out a build/deploy failure (checking the dev server's terminal output), then reproducing it directly in a browser and reading the DevTools Console, whose stack trace named the exact property access and pinpointed `mount` as the failing phase — consistent with this report's stated preference (Section 6.6) for live, browser-driven diagnosis over guessing from source code alone when a defect's actual trigger condition (here, being logged out) was not the one most recently tested.

**The fix.** `WelcomeModal` was moved out of the `v-if`/`v-else` chain entirely, repositioned as an independent sibling rendered after the main `<template v-else>` block, with its own unrelated `v-if="store.isAuthenticated && store.showWelcomeModal"` condition — restoring `AuthModal`'s `v-if` and the shell's `template v-else` as an uninterrupted adjacent pair, and keeping `WelcomeModal`'s behaviour (an overlay shown only post-registration) unchanged. The general lesson — inserting *any* new `v-if` element between an existing `v-if`/`v-else` pair silently re-pairs the `v-else` to the new element instead — is carried forward to Section 7.4.

---

# 6. Testing and Evaluation

This chapter distinguishes what was **actually executed and empirically verified** against a live PostgreSQL instance in this engineering pass from what remains a **designed but unexecuted test plan** — a distinction the previous version of this report did not consistently make, and one this chapter deliberately corrects.

## 6.1 Testing Strategy

Testing in this pass focused specifically on the report's headline correctness claim (NFR-02, transactional integrity under concurrency), since that is the property most vulnerable to being asserted rather than demonstrated. A Jest + Supertest suite (`tests/bnpl.concurrency.test.js`) was written, run, debugged, and re-run against a real local PostgreSQL database until it passed for the right reasons (Section 5.6 documents the debugging process itself, which is as informative as the final result).

## 6.2 Concurrency Testing — Verified Results

Three test cases were executed. All three currently pass against a live database; the exact final run output is reproduced below rather than paraphrased, so the claim is checkable.

**Table 6.1 — Concurrency Test Cases (executed, results verified)**

| Test | Method | Result |
|------|--------|--------|
| Race reproduction (lock disabled) | Two concurrent `__unsafeExecuteForTesting` calls for the same user, targeting two different players whose combined cost cannot both be legitimately afforded | **Pass** — both requests succeed (the intended failure demonstration); final balance reflects only one of the two deductions, the classic lost-update anomaly |
| Race prevention (lock enabled) | Same scenario via `executeBnplTransfer` (the real, locked code path) | **Pass** — exactly one request succeeds, the other is rejected with an insufficient-funds error, and the final balance is correct and non-negative |
| TC-029 analogue — 10 concurrent requests, only 1 affordable | Ten concurrent `POST /api/transfers/process` HTTP requests (via Supertest against the real Express app, not a direct service call) for the same user, each targeting a different player priced such that only the very first can be financed even with BNPL | **Pass** — exactly one request succeeds; final balance is exactly $0; penalty points incremented exactly once (not ten times) |

```
PASS tests/bnpl.concurrency.test.js
  BNPL concurrency (Algorithm 1 row locking)
    √ WITHOUT the FOR UPDATE lock, concurrent buys double-spend (lost update) (124 ms)
    √ WITH the FOR UPDATE lock, only one of two concurrent buys succeeds (11 ms)
    √ 10 simultaneous BNPL requests for the same user, only 1 affordable (TC-029) (146 ms)

Test Suites: 1 passed, 1 total
Tests:       3 passed, 3 total
```

This is the concrete evidence behind NFR-02: not an architecture diagram claiming row-level locking prevents double-spending, but a test that reproduces double-spending when the lock is deliberately removed, and demonstrates its absence when the lock is present, against the same database, in the same run.

## 6.3 Data-Layer Verification

Beyond the concurrency suite, the following were manually verified against the live system rather than assumed:

- `/api/players` returns 357 real players (verified count) after the Section 5.5 seeding work, not the original 60-player static fallback.
- `GET /api/players/51/tactical-fit` (Erling Haaland, FWD, Manchester City) returns `score: 83`, matching the hand-computed value `50 + (50 × 0.3) + (90 × 0.2) = 83` from Algorithm 3 given Manchester City's seeded tactical statistics.
- `GET /api/players/31/tactical-fit` (Mohamed Salah, MID, Liverpool) returns `score: 82`, matching `50 + (62 × 0.4) + (75 × 0.1) = 82.3 → 82`.
- After the test suite's teardown fix (Section 5.6), re-running the suite and then querying `/api/players` confirms zero leftover fixture rows in the live catalogue.

## 6.4 Designed Test Plan (Not Executed in This Pass)

The following test categories represent good coverage practice and were part of the project's test design, but — unlike Section 6.2 — were **not executed against the running system in this engineering pass**. They are retained here as a test plan for future execution, deliberately not marked "Pass," to avoid the exact discrepancy between claimed and actual verification that motivated this report revision.

**Table 6.2 — Unit Test Plan**

| ID | Scenario | Expected Outcome |
|----|----------|-------------------|
| UT-01 | Gacha weighted-random selection over N=10,000 iterations | Observed frequency per rarity tier within a small margin (e.g. ±0.5%) of its configured weight |
| UT-02 | Tactical Fit score for every position (`GK`, `DEF`, `MID`, `FWD`) against a fixed team-stats fixture | Score matches hand-calculated expected value for each position branch |

**Table 6.3 — Integration Test Plan**

| ID | Endpoint | Scenario | Expected HTTP Status |
|----|----------|----------|-----------------------|
| IT-01 | `POST /api/auth/register` | Valid new credentials | 201 + JWT |
| IT-02 | `POST /api/auth/login` | Non-existent username | 401, constant-time response |
| IT-03 | `POST /api/transfers/process` | Buying a 4th player from the same club | 400, club-limit error |
| IT-04 | `POST /api/webhook/simulate` | Same `eventId` posted twice | Second request discarded, no duplicate point award |

**Table 6.4 — Security Test Plan**

| ID | Vulnerability | Method | Expected Result |
|----|----------------|--------|-------------------|
| ST-01 | SQL injection | Malicious payload in a search parameter | Blocked structurally by Prisma parameterised queries |
| ST-02 | JWT signature forgery | Manually crafted token with an invalid signature | 403 |
| ST-03 | Client-supplied balance tampering | Forged `newBalance` field in a transfer request body | Ignored — server recomputes from the database, never trusts client-supplied financial state |

## 6.5 Performance and Load Testing

Not performed in this engineering pass. NFR-01 (sub-second latency) and NFR-03 (60 FPS reactive rendering) remain structurally satisfied by the chosen architecture (push-based WebSocket delivery; proxy-based Vue reactivity) but were not empirically measured — no JMeter or browser-profiler run was executed against the live system. This is stated plainly here rather than presenting an assumed pass, and is carried forward as required future work (Section 7.3).

## 6.6 Live End-to-End Verification (Browser-Driven Walkthrough)

Sections 6.2–6.3 verify the system at the API and database layer. This section documents a complementary and, for the newly added features of Sections 5.7–5.9, more decisive verification method: driving the actual running application through a real Chrome browser, clicking through the same UI a real user would use, rather than calling endpoints directly. This method is what actually surfaced Bugs 3–5 of Section 5.9 and the captain-persistence defect of Section 5.8 — none of which a pure API-level test would necessarily have caught, since each was specifically a *client-server integration* gap (a UI that displayed one thing while the database held another) rather than a defect isolable to either side alone.

**Table 6.5 — Bugs Found by Live Browser-Driven Testing**

| # | Symptom observed live | Root cause | Section |
|---|------------------------|------------|---------|
| 1 | Registering and buying a $4.2M player against a shown $100.0M balance left a displayed $0.8M instead of $95.8M | Stale `virtualBalance` schema default on an old price scale | 5.9, Bug 1 |
| 2 | Balance reverted to its login-time value after a page reload following a purchase | `store.js` prioritised a stale `localStorage` snapshot over the freshest cached balance | 5.9, Bug 2 |
| 3 | A purchase blocked only by budget always showed "BNPL only allows loans up to $2.0M", even when the real blocker (verified by retrying the same purchase with a fabricated smaller shortfall) was a club or position limit | Client-side error-message selection never consulted the backend for the true rejection reason | 5.9, Bug 5 |
| 4 | Clicking "▶ Run Matchday" after visibly selecting a captain (armband badge rendered, success toast shown) still rejected with "You haven't picked a Captain for this squad" | `setCaptain()` never persisted `captainId` to the database | 5.8 |
| 5 | A freshly seeded gameweek run returned `Total points: 0` for every starter, including a captained forward known to have scored | `PlayerGameweekStat` had not yet been seeded on the target machine at the time of the first live run | 5.7 (data pipeline), operational rather than a code defect |

Each row was reproduced live, the corresponding code fix applied, and then re-verified live in the same session — not merely reasoned about — before being recorded as resolved. Row 5 is included for completeness even though it was ultimately a missing data-loading step rather than an application bug, because from the perspective of someone testing the running system, "everyone scores zero" was indistinguishable from a real defect until it was investigated.

**Confirmatory run.** After all five issues were addressed, a full walkthrough was repeated end-to-end on a freshly registered account: registration → an eleven-player squad built from real, gameweek-seeded Premier League players → a deliberately triggered club-limit rejection (attempting a fourth Arsenal player) → a deliberately triggered position-limit rejection (a sixth midfielder) → a BNPL loan correctly triggered and confirmed for a sub-$2.0M shortfall → a deliberately triggered insufficient-funds rejection for a shortfall above the BNPL cap, showing the server's exact computed figure → a player sale at the correct 90% resale rate → captain selection persisted correctly on retry → the Player Comparison and Gacha tabs confirmed to render without error → "Chạy Matchday" executed successfully, returning a **total of 69 points**, with the captained forward (Erling Haaland: 1 goal, clean sheet, ≥60 minutes) correctly scoring `(1+1) + (1×4) + 4 = 10`, doubled to `20` for the captaincy multiplier, exactly matching Algorithm 4's specification (Section 4.5) — and finally `GET /api/leaderboard` confirmed the same account ranked first in the Redis-backed global leaderboard with that score.

## 6.7 Production Deployment Verification

Sections 6.2–6.6 verify the system as run locally. This section documents verification specific to the public deployment (Section 5.10): defects that only exist, or only became visible, once the frontend and backend were genuinely separate origins talking over the public internet rather than processes sharing `localhost`.

**Table 6.6 — Defects and Configuration Issues Found During Public Deployment**

| # | Symptom | Root cause | Section | Found by |
|---|---------|------------|---------|----------|
| 1 | (Pre-empted before any user was affected) — would have manifested as silent, permanent session-refresh failure for every user | `tokenService.js`'s refresh cookie was hardcoded `sameSite: 'strict'`, which is never sent cross-site | 5.10 | Deliberate review of the auth path for cross-origin correctness ahead of launch |
| 2 | Registration failed with a generic "Failed to fetch" in the browser | `FRONTEND_ORIGIN` on the backend was set to a Vercel *preview* deployment URL (containing a random hash) rather than the stable Production domain | 5.10 | Live testing; confirmed via the exact origin named in the browser's CORS console error |
| 3 | Redis reported `WRONGPASS invalid username-password pair`, then `Socket closed unexpectedly` | A rotated Upstash password, then a `redis://` connection string used where TLS-only Upstash requires `rediss://` | 5.10 | Live testing against the deployed backend's own error logging |
| 4 | The entire application rendered a blank white page for a logged-out visitor | `WelcomeModal`'s `v-if` silently became the sibling `v-else` bound to, breaking the intended `AuthModal`/main-shell pairing (Section 5.14) | 5.14 | User bug report, reproduced live, root-caused via the browser DevTools Console stack trace |

Row 1 is included even though no user was ever actually affected by it, for the same reason Table 6.5 records a data-pipeline issue rather than only application bugs: from a verification standpoint, a defect caught by deliberate pre-launch review is still evidence that the review process itself works, and omitting it would understate how the cross-origin cookie requirement was actually discovered and addressed. Rows 2–3 are operational/configuration issues rather than application code defects, but are recorded in the same table as Row 4 (a genuine code defect) because, consistent with Section 5.6's treatment of the local-database-misconfiguration problem, this report's position is that a configuration failure that blocks the running system is worth documenting with the same rigour as a code bug, not silently excluded for being "merely" operational.

**What was, and was not, verified live.** The four rows above were each reproduced against the actual deployed system and confirmed fixed by re-testing the same failure path afterward — the sameSite cookie fix by exercising a full cross-origin login → refresh cycle after deployment; the CORS fix by re-attempting registration from the stable Production domain; the Redis fix by observing the backend's own startup log report a successful connection; and the blank-page fix by reloading the deployed frontend as a logged-out visitor and confirming both the auth screen and, separately, the authenticated shell after logging in, each render without error. The real club/league crest badges (Section 5.11) were confirmed rendering correctly for the large majority of clubs via direct visual inspection of the live Transfer Market, Fixtures, and Leagues & Clubs pages, with the documented exception of a small number of clubs whose crest is not present at api-sports.io's CDN path, correctly falling back to the initial-letter placeholder rather than a broken image. Not yet live-verified: the OAuth login round-trip (Section 5.13), since real provider client credentials had not yet been registered with Google, Facebook, or X at the time of this report — the server's own configuration check (returning a clear 503 rather than attempting a broken redirect) was confirmed to behave correctly in this not-yet-configured state, which is the one part of that feature currently checkable; and the nationality backfill (Section 5.11), which is a data-completeness item rather than a code-correctness one and is explicitly still in progress.

## 6.8 Evaluation Summary

The system's single most important correctness claim — that row-level locking makes BNPL double-spending structurally impossible rather than merely unlikely — is the one claim in this report backed by a reproducible, currently-passing automated test against a real database, including a deliberate demonstration of the failure mode it prevents. Data-layer claims (real player counts, tactical-fit scores) were spot-verified manually against the live API. The gameweek summary scoring extension (Algorithm 4, Section 5.7) and the server-authoritative squad-state fixes it exposed (Sections 5.8–5.9) were verified by a full live browser-driven walkthrough (Section 6.6) rather than API-level testing alone, precisely because the defects that mattered most there were integration gaps between client and server state, not defects isolable to either layer. The public deployment phase (Section 6.7) extended this same evidence-first standard beyond `localhost`, catching one defect before launch and one after, both fixed and re-verified against the live system rather than reasoned about in the abstract. Broader unit, integration, security, and performance coverage exists as a documented test plan rather than as executed and verified results, and is reported as such rather than inflated.

---

# 7. Conclusion, Lessons Learned, and Future Work

## 7.1 Project Summary and Objective Evaluation

**Table 7.1 — Objectives Achievement Matrix**

| ID | Objective | Status | Evidence |
|----|-----------|--------|---------|
| OBJ-01 | Latency eradication | Architecturally achieved | Room-scoped WebSocket push replaces polling entirely (Section 5.2); not load-tested (Section 6.5) |
| OBJ-02 | Transactional security | **Empirically verified** | Section 6.2 — passing concurrency suite against a live database, including a documented failing baseline |
| OBJ-03 | Reactive presentation | Architecturally achieved | Vue 3 proxy-based reactivity, per-player state mutation; not FPS-profiled |
| OBJ-04 | Algorithmic gamification | Achieved by design | Server-exclusive weighted-random selection; statistical distribution not re-verified in this pass |
| OBJ-05 | Performance leaderboard | Achieved by design | Redis ZSET O(log N) operations; not benchmarked at scale in this pass |
| OBJ-06 | Real player data | **Achieved, with documented limits** | 357 real players across all 5 top leagues, verified live (Section 5.5); not full squad depth |
| OBJ-07 *(added post-elicitation)* | Gameweek summary scoring | **Empirically verified** | Algorithm 4 (Section 4.5, 5.7) implemented and live-verified end-to-end (Section 6.6): a real 11-player squad scored a total of 69 points from seeded Matchweek 1 data, with the captaincy multiplier confirmed exact against hand-calculation |
| OBJ-08 *(added post-elicitation)* | Public deployment | **Achieved, with defects found and fixed post-launch** | Vercel + Render + Upstash deployment live (Section 5.10); one pre-existing defect (cross-origin session cookie) caught before launch and one (a Vue template composition bug) caught by a live user report after launch, both fixed and re-verified against the deployed system (Sections 5.10, 5.14, 6.7) |

## 7.2 System Limitations

1. **Squad depth, not squad breadth.** The real player dataset covers all five target leagues but at roughly 3–4 players per club rather than full rosters, a direct consequence of a free-tier API pagination ceiling (Section 5.5.3) rather than a design choice.
2. **BNPL does not track cumulative debt.** Algorithm 1 resets a user's balance to exactly $0 (never negative) each time the overdraft is used, and checks only the *current* transaction's shortfall against the $2.0M cap — not any running total. A user could, in principle, trigger the BNPL path repeatedly across separate purchases without the cap ever preventing a subsequent loan, since each transaction is evaluated independently. This is a genuine simplification in the algorithm as specified and implemented, not something this pass attempted to redesign (Section 4.5).
3. **Squad persistence gap, partially closed.** `GET /api/squad`, `POST /api/squad/reset`, and `POST /api/squad/captain` (Section 5.8) now give the squad's core state — picks, lock status, and captain — a real server-authoritative read/write path, closing the specific captain-persistence gap that Section 5.8 documents in detail. What remains open: minimum-formation validation (e.g. "at least three defenders must be selected before a squad counts as complete") described in early requirement drafts still has no dedicated backend check; a starting eleven is only validated for *count* (exactly 11) and *captain presence*, not tactical shape.
4. **Client-side state desync risk for pre-existing sessions.** Because squad/budget state used to be entirely `localStorage`-driven and is now server-authoritative (Section 5.2), any user session created before this implementation pass will reference players never recorded server-side and will see sell operations for those players fail. A clean re-login is required to exercise the corrected flow.
5. **Single-instance, single-region deployment.** No horizontal scaling, read replicas, or multi-region validation has been attempted.
6. **No production-grade least-privilege database role.** The local development database uses a single superuser role for both migrations and application queries (Section 4.7).
7. **Bench players never score.** Algorithm 4 (Section 4.5) awards points only to a squad's eleven starters; the MVP has no auto-substitution logic, so an unused bench player scores zero regardless of their real-world match performance — a deliberate scope simplification for this pass, not an oversight, but one that would need addressing before the feature could be considered feature-complete against how commercial fantasy platforms actually operate.
8. **Missing match-statistics data fails silently, not loudly.** `matchdayService.runMatchday` (Section 5.7) substitutes an all-zero stat line for any starter with no corresponding `PlayerGameweekStat` row for the target gameweek, rather than rejecting the run or flagging the player as unscored. This was the direct cause of Row 5 in Table 6.5 (a full squad scoring zero because the seed script had not yet been run) and, while defensible as a way to let a gameweek run complete even with partial data coverage, means a genuine data-coverage gap and a genuine zero-point performance are currently indistinguishable to the end user.
9. **Gameweek summary scoring is single-gameweek only.** Consistent with the rest of the application (Section 3.6), there is no gameweek-switching UI; `runMatchday` always targets gameweek 1 unless called with an explicit parameter that no client-side control currently exposes.
10. **Player nationality is incomplete for players seeded before the field existed.** Of 357 real players, only those seeded after `seedTop5Free.js`'s nationality capture was added (Section 5.11) have the field populated; the remaining players display "Nationality unknown" in the Leagues & Clubs roster panel until `scripts/backfillNationality.js` completes its multi-day, rate-limited re-fetch (Section 5.11).
11. **Fixtures are mock and cross-league by construction.** `scripts/seedFixtures.js` pairs clubs for a mock schedule irrespective of league (Section 5.11), so no real fixture in the app is guaranteed to have both teams in the same competition; the Fixtures page's League filter is consequently defined as "either side belongs to this league," a weaker guarantee than a real single-league fixture list would provide.
12. **Social login is implemented but not yet live-tested end-to-end.** Google, Facebook, and X login (Section 5.13) are fully implemented, including a correct "not configured" failure mode, but real provider credentials had not been registered by any of the three platforms at the time of this report, so the actual provider redirect → callback → account-creation round-trip remains unverified against a live provider (Section 6.7).
13. **Free-tier hosting introduces cold starts and no horizontal scale.** The Render backend sleeps after 15 minutes of inactivity on its free tier, adding roughly 30–60 seconds to the first request after idle — a real user-facing latency characteristic of the current deployment, distinct from the WebSocket-delivery latency NFR-01 is actually concerned with, but worth stating plainly since a live demo immediately after a period of inactivity will visibly exhibit it.
14. **No automated deployment gate.** Deploys to Render and Vercel are triggered automatically by a `git push` to the repository's default branch (via each platform's GitHub webhook), with no CI step that runs the Chapter 6 test suite before a deploy is allowed to proceed — meaning a regression in `tests/bnpl.concurrency.test.js` would not currently block a bad deploy from reaching the public URL.

## 7.3 Future Work

1. **Upgrade the data-provider plan** (Sportmonks Starter at €29/month, or API-Football's $19/month tier) to remove the page-3 ceiling and reach full squad depth across all five leagues.
2. **Implement cumulative BNPL debt tracking**, addressing the limitation in Section 7.2, so the overdraft cap reflects genuinely outstanding credit rather than resetting per transaction.
3. **Build a dedicated squad-save endpoint** with server-side formation validation (minimum defenders, valid starting XI size), closing the gap noted in Section 7.2.
4. **Load-test the WebSocket gateway and measure real end-to-end latency**, to move NFR-01 and NFR-05 from "architecturally achieved" to "empirically verified," matching the standard already met for NFR-02 in this pass.
5. **Horizontal scaling of the WebSocket tier** via a Redis-backed Socket.io adapter, so multiple Node.js instances can share room state.
6. **Independent security review** of the authentication and BNPL transaction paths before any move toward handling real user funds.
7. **Bench auto-substitution for Algorithm 4**, so a non-playing starter can be automatically replaced by an eligible bench player before gameweek scoring runs, addressing Limitation 7 (Section 7.2).
8. **Distinguish "genuinely zero points" from "no match data available"** in the gameweek summary scoring result (`matchdayService.runMatchday`, Section 5.7), addressing Limitation 8 (Section 7.2) — for example by surfacing the existing `hasMatchData` flag the service already computes internally but does not yet expose to the client.
9. **Server-side minimum-formation validation** (e.g. requiring at least three defenders in the starting eleven) before a squad can be locked in for gameweek scoring, closing the remaining part of Limitation 3 (Section 7.2).
10. **Register real OAuth credentials with Google, Facebook, and X** and complete a live end-to-end verification of the social-login round-trip, closing Limitation 12 (Section 7.2).
11. **Run `scripts/backfillNationality.js` to completion** across all five leagues, closing Limitation 10 (Section 7.2).
12. **Replace the mock, cross-league fixture generator with a real fixture-provider integration** once the real season resumes (both football-data.org and API-Football expose fixtures endpoints, and both tokens are already configured, Section 5.5), closing Limitation 11 (Section 7.2).
13. **Add a CI test gate before deploy**, so `tests/bnpl.concurrency.test.js` must pass before Render/Vercel's auto-deploy webhooks are allowed to publish a new build, closing Limitation 14 (Section 7.2).
14. **Move off free-tier hosting for any real demo or user-facing use**, removing the Render cold-start characteristic documented in Limitation 13 (Section 7.2).

## 7.4 Lessons Learned

This section records what was actually learned in the process of closing the gap between this report's earlier drafts and the running system, since the process itself is a legitimate engineering lesson.

- **A design diagram is not evidence.** The single most important correction made in this pass was recognising that "row-level locking prevents double-spending" had been stated as an architectural decision without ever being run against a real database. Writing the concurrency test and watching it fail on the first attempt — not because the lock didn't work, but because the *test itself* wasn't creating a genuine race — was more informative than any amount of design review would have been.
- **Naive concurrency tests can pass or fail for the wrong reason.** `Promise.all` starting two async operations does not guarantee they overlap at the database transaction level; a fast local database round-trip can let the first operation fully commit before the second one's first query is even sent. Proving a race condition exists (and that a fix resolves it) required deliberately widening the interleaving window in the test-only code path — a technique that generalises to any concurrency test on a fast local backend.
- **"Free tier" and "usable free tier" are different claims, and only one is checkable without running real requests.** Two of three evaluated sports-data providers looked viable from their pricing pages and even their metadata endpoints, and both turned out not to deliver the actual data needed once the data-bearing endpoint was queried live. The lesson generalises beyond this project: verify the specific endpoint you need, not just that the provider or the general category of endpoint is "free."
- **Environment configuration failures can silently invalidate everything downstream.** A single unfilled placeholder password meant no test, seed script, or migration in this project could ever have succeeded — and the failure mode (a generic Windows-service error) did not point at the real cause without reading the database's own log file directly.
- **Fixing a bug can introduce a smaller one.** Wiring the real backend into the frontend and adding a concurrency test suite fixed the report's central claim, but the test suite's own fixture data briefly corrupted the live player catalogue it was running against — a reminder that test isolation is itself a correctness requirement, not a formality, once tests run against a shared, non-ephemeral database.
- **A UI that "looks" correct is not the same claim as a UI that "is" correct.** The captain-persistence defect (Section 5.8) is the clearest example in this project of a bug that was completely invisible from the client alone: the armband badge rendered, the success toast fired, and nothing about the interface suggested anything was wrong. It only became visible by tracing the exact database column the next stage of the pipeline (`matchdayService.runMatchday`) actually read from, and confirming nothing had ever written to it — a reminder that "the UI updated" and "the server persisted it" are two separate claims, and a project that has stated its own principle as "the server never trusts the client" (Section 4.7) should periodically audit whether every piece of user-facing state actually follows that principle, not just the ones — like balance — where a wrong answer is immediately, visibly expensive.
- **An error message is part of the system's correctness surface, not just its UX polish.** Bug 5 in Section 5.9 did not corrupt any data — the backend's authoritative rejection logic was correct throughout — but the client displayed a confidently wrong *reason* for that rejection by guessing from a single signal (budget shortfall) instead of asking the server. A message that is wrong in a way that sounds plausible is arguably worse for a demo or a real user than a generic failure, because it actively misdirects debugging effort; this is recorded as a lesson distinct from the underlying data-correctness lessons above.
- **Live, browser-driven testing catches a category of bug that API-level and unit testing structurally cannot.** Every bug in Table 6.5 was a *gap between* two layers that were each individually reasonable in isolation — a database default that made sense until prices were rescaled, a `localStorage` priority order that made sense until two write paths could race, a client-side guess that made sense until more than one server-side rule could apply. None of them would necessarily fail an endpoint-level test asserting the endpoint's own contract, because each endpoint largely did what it claimed; the defect lived in the seam between components. This is the concrete justification, discovered rather than assumed in advance, for including Section 6.6 as its own verification method alongside the concurrency suite rather than treating it as redundant with API testing.
- **A codebase that only ever ran on one origin can hide an entire class of bug indefinitely.** The `sameSite: 'strict'` cookie (Section 5.10) was syntactically and functionally correct for every test this project ever ran against `localhost`, because a same-origin request satisfies `sameSite: 'strict'` trivially — the defect only exists relative to a deployment topology the project had not yet adopted when the code was written. This generalises: a correctness property that depends on the deployment environment (origin, network topology, TLS termination) cannot be verified by running the application locally, no matter how thoroughly, and needs its own explicit review pass the moment that environment is due to change, rather than being assumed to transfer.
- **A UI framework's structural rules can silently repurpose code that looks locally correct.** The `v-else`-binds-to-nearest-sibling defect (Section 5.14) is a case where every individual line of markup was valid Vue and did exactly what its own `v-if` condition said — the bug was entirely in an implicit structural relationship between two non-adjacent lines that a reader has to know to check for, not in any single expression's logic. The general caution this leaves for future work on this codebase (and any Vue codebase using `v-if`/`v-else` chains): inserting new conditional markup between an existing `v-if`/`v-else` pair is not a locally-reasoned-about change, and should prompt an explicit check of what the `v-else` is actually still paired with, not just whether the new element's own condition looks right in isolation.
- **A feature that fails loudly and specifically when unconfigured is safer to ship incomplete than to leave unbuilt.** OAuth login (Section 5.13) was implemented and merged before real provider credentials existed for any of the three platforms, on the basis that `GET /api/auth/:provider`'s explicit environment-variable check — returning a clear `503` naming the exact unconfigured provider, rather than attempting a redirect that would fail unpredictably partway through — makes the incomplete state itself a verifiable, correct behaviour rather than a landmine. This is recorded as a deliberate design pattern worth repeating: when a feature's full verification is blocked on an external dependency outside the project's control (here, third-party developer-portal approval), design its unconfigured state to be a tested, intentional outcome rather than an unhandled one.

---

## References

DataReportal (2024) *Digital 2024: Vietnam*. Available at: https://datareportal.com/reports/digital-2024-vietnam (Accessed: July 2026).

Fantasy Premier League (2024) *FPL Official Statistics*. Available at: https://fantasy.premierleague.com (Accessed: July 2026).

Fette, I. and Melnikov, A. (2011) *The WebSocket Protocol*, RFC 6455. Internet Engineering Task Force (IETF).

Grand View Research (2024) *Fantasy Sports Market Size, Share & Trends Analysis Report*, San Francisco: Grand View Research.

Kleppmann, M. (2017) *Designing Data-Intensive Applications*. Sebastopol: O'Reilly Media.

Nielsen, J. (1994) *Usability Engineering*. San Francisco: Morgan Kaufmann.

Pierson, T. et al. (2021) 'Dark Mode Reduces Eye Fatigue During Extended Screen Usage', *Human Factors: The Journal of the Human Factors and Ergonomics Society*, 63(5), pp. 890–901.

Pimentel, V. and Nickerson, B.G. (2012) 'Communicating and Displaying Real-Time Data with WebSocket', *IEEE Internet Computing*, 16(4), pp. 45–53.

Taivalsaari, A. and Mikkonen, T. (2021) 'The Web as a Software Platform: Ten Years Later', *Journal of Systems and Software*, 171, p. 110720.

Tilkov, S. and Vinoski, S. (2010) 'Node.js: Using JavaScript to Build High-Performance Network Programs', *IEEE Internet Computing*, 14(6), pp. 80–83.

---

## Appendices

- **Appendix A** — Full `schema.prisma` source.
- **Appendix B** — Full `tests/bnpl.concurrency.test.js` source and complete console output of the passing run.
- **Appendix C** — `scripts/seedTop5Free.js` source and the seeding run log (5 leagues, 357 players, club coverage).
- **Appendix D** — Screenshots of the running application (Squad, Market, Analytics, Gacha tabs). *(Insert screenshots.)*
- **Appendix E** — `services/scoringService.js` and `services/matchdayService.js` source (Algorithm 4, Section 5.7), and the live "Chạy Matchday" result screenshot referenced in Section 6.6 (total 69 points, captained forward scoring 20).
- **Appendix F** — Table 6.5's five live-testing bugs, cross-referenced to their exact code fixes (`routes/squad.js`'s new `POST /api/squad/captain`; `TransferMarket.vue`'s corrected `attemptBuy`; the `virtualBalance` default migration).
- **Appendix G** — `render.yaml` Blueprint and `DEPLOY.md` setup guide (Section 5.10); screenshots of the live Render and Vercel dashboards showing a successful deployment. *(Insert screenshots.)*
- **Appendix H** — `routes/oauth.js` and `services/oauthProviders.js` full source (Section 5.13, Table 5.2).
- **Appendix I** — Before/after screenshots of the Transfer Market, Fixtures, and Leagues & Clubs pages (Section 5.11), and the `App.vue` diff for the `v-else` template composition fix (Section 5.14). *(Insert screenshots.)*
