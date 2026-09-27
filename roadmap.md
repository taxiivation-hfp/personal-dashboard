# Roadmap

**Goals** have a done state. **Non-goals** are continuous practice with no finish line — they still matter, they just can't be completed.

---

# GOALS

## 1. SQL
**Now → end of September, then 15 min/day forever**

- Finish LeetCode SQL 50.
- Then maintenance only. Don't add a second site.
- One pattern to have memorised cold: `ROW_NUMBER() OVER (PARTITION BY x ORDER BY y)`.

Later, if you want depth: PGExercises (recursive CTEs, window functions), and *Use The Index, Luke* for query plans.

## 2. Algorithms
**Now → end of January. 2/day now, heavier in Dec–Jan. Stop at 100.**

- NeetCode 150, in their order. Cap at 100 — the last 50 are hard DP and advanced graphs that don't come up at grad level.
- Python.
- 25 minutes, then read the solution. Redo from scratch three days later.
- Learn properly in week one: `Counter`, `defaultdict`, `deque`, `heapq`, `bisect`, `lru_cache`.
- Feb onward: 2/week maintenance.

## 3. AWS Solutions Architect – Associate (SAA-C03)
**Study late Nov → sit December. ~$150.**

Not DEA-C01 — that's a data product catalogue and it picks a lane for you. SAA covers compute, storage, networking, IAM, availability, cost, architecture trade-offs. Serves backend, data, platform and AI infra equally, and it's the cert recruiters recognise.

- AWS Skill Builder — free tier plus official practice exam. Start with the SAA-C03 Exam Guide for domain weightings.
- Maarek (faster, exam-focused) or Cantrill (slower, teaches more) on Udemy.
- Build something on the free tier. Don't pass it on video alone.

## 4. English test
**January–February 2027**

IELTS or PTE. Target 8.0 in every band. Must be taken within 12 months of your 485 lodgement, so a Jan–Feb test covers you through to early 2028.

---

# NON-GOALS

No done state. Ongoing.

## Projects
**December → ongoing**

Build whatever you want. The list below is what to incorporate — roughly in order, each one a thing you haven't had to deal with yet. Research the terms yourself.

One **ADR** per project. Half a page: what you chose, what you didn't, why. The value is that naming the rejected option forces you to have considered one.

### Incorporate next

**Persistence and durability** — write-ahead log, fsync, crash recovery, durability vs latency

**Concurrency** — race conditions, locks, optimistic vs pessimistic locking, transaction isolation levels, deadlock

**Async work** — message queue, worker pool, job scheduling, exponential backoff, dead-letter queue, at-least-once vs exactly-once delivery

**Failure handling** — timeouts, circuit breaker, bulkhead, graceful degradation, retry storm

**Caching** — cache invalidation, TTL, write-through vs write-behind, cache stampede, LRU eviction

**Blob handling** — object storage, presigned URLs, streaming uploads, multipart upload, CDN

**Real-time** — WebSockets, server-sent events, long polling, connection state, backpressure

**Observability** — structured logging, correlation IDs, metrics vs logs vs traces, p99 latency, distributed tracing, alerting on symptoms not causes

**Operating it** — deploy pipeline, rollback, secrets management, feature flags, incident postmortem, on-call

### One exception — build this from scratch
A key-value store. A weekend, no libraries doing the work. Get/set/delete, persistence to disk, recovery after `kill -9`, TTL, concurrent writers.

Teaches you why Redis exists, what durability actually costs, and what a cache is. Not an HTTP server — socket and header parsing won't inform a component choice.

### And one you keep alive
Deployed, real users even if it's ten, running for weeks rather than demoed once. This is the one you point at in interviews. Everything above is how you get good enough to make it.

## Reading
**Ongoing, indefinitely**

- **A Philosophy of Software Design** (Ousterhout) — ~190 pages. Read first. Complexity, abstraction, interface design.
- **Designing Data-Intensive Applications** (Kleppmann) — one chapter a week, forever. Start December.
- **The Data Warehouse Toolkit** (Kimball) — chapters 1–3 only. Facts and dimensions, normalisation trade-offs, why a schema that reads well writes badly.
- **System Design Primer** (github.com/donnemartin/system-design-primer) — one section a week.

## YouTube
**Meals and commutes. Supplement, never substitute.**

- **Hussein Nasser** (youtube.com/channel/UC_ML5xP23TOWKUcc-oAE_Eg) — backend and database internals. Best free source for the depth you're after.
- **ByteByteGo** (youtube.com/@ByteByteGo) — system design patterns, 6–12 min.
- **CodeAesthetic** (youtube.com/@CodeAesthetic) — abstraction and naming, short.
- **ArjanCodes** (youtube.com/@ArjanCodes) — the **Code Roasts** series is direct practice at reviewing code you didn't write.
- **StatQuest** (youtube.com/@statquest) — statistics, useful for your current units.

Don't watch SQL videos instead of writing SQL. Don't watch LeetCode solutions before attempting the problem.

## Verification
**Every project, forever**

Catching the model being confidently wrong. Not prompting.

- **pytest** — test the invariants that must hold, not coverage theatre.
- **Hypothesis** (property-based testing) — finds the cases you didn't think to write, which is exactly where AI-generated code fails.
- Habit: specs first, drive the agent, review every change. Keep the specs.

## Meetups and industry events
**Weekly, ongoing**

The sponsorship pipeline. Applications produced silence; the one live thing came from a room you were in.

Same group four times beats four groups once — recognition is the whole mechanism. Stay for the after, not just the talk. Have an answer to "what are you working on" that names a problem, not a degree. Ask about their work rather than for a job. Follow up within 48 hours referencing what you actually discussed; most people don't, which is why it works. Track who you met and what you said you'd send, then send it.

Speak at one eventually. Lightning talks are under-subscribed and organisers want volunteers. Ten minutes on something you built inverts the dynamic — people approach you afterwards. You have a decade of content experience and no camera fear. Most engineers have neither. Almost nobody uses this.

Range across backend, cloud, database, AI/LLM and language-specific groups. Different rooms, different companies hiring. Conferences and one-day events have a higher density of senior people than a monthly meetup.

Sponsorship is a decision a person makes about someone they trust. Months of showing up, not one good conversation.

## Technical interview practice
**February → June, ongoing**

- **Live coding out loud.** The hard part isn't the algorithm, it's narrating while you think. Solve NeetCode problems talking to an empty room, or record yourself. Most common failure, most underestimated.
- **System design.** Structure: clarify requirements, sketch components, name the bottleneck, state the trade-off. ByteByteGo plus the Primer is enough.
- **The AI question.** Every interviewer asks it. Don't say "it makes me faster" — everyone does. Have a concrete example of catching it being wrong.
- **Defending a build.** Someone will go deep on one decision. The ADRs are this.
- **Online assessments** vary — Codility, HackerRank, CodeSignal, Coderbyte. One timed mock on whatever platform the invite names, before the real thing.

---

# DEADLINES

| When | What |
|---|---|
| Late Oct 2026 | Research scholarship outcome |
| Jan–Feb 2027 | Sit IELTS/PTE |
| Feb–May 2027 | Grad program applications |
| Jun 2027 | NAATI CCL Indonesian |
| 1–22 Jul 2027 | Deloitte graduate window (2026 dates — verify) |
| Jul 2027 | Request completion letter the day it exists |
| Early Aug 2027 | **Lodge 485.** Student visa expires 30/08/2027 |
| Aug 2027 | Book health exam immediately |
| Feb 2028 | Professional Year decision point (only if no skilled job) |
| Jul 2028 | ACS assessment — nominate three ANZSCO codes, one fee |

Detail in `pr-roadmap-v2.md` and `pr-roadmap.ics`.