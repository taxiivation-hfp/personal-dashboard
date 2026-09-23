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

## 5. Projects
**December → ongoing**

One **ADR** per project. Half a page: what you decided, the options, what you picked, why, what it costs. The value is that writing down the rejected option forces you to have considered one. Twenty minutes.

Features listed are the point of each project — they're the decisions you haven't had to make yet. What you actually build around them is yours.

### Project V — from scratch
*A weekend. Write a key-value store, no libraries doing the work.*

- In-memory store with get/set/delete
- Persistence to disk, and recovery after a `kill -9`
- Concurrent clients writing to the same key
- TTL and expiry

*Why this one: teaches you why Redis exists, what durability costs, and what a cache actually is. Not an HTTP server — socket and header parsing won't inform a component choice.*

### Project VI — work that outlives the request
- A background job queue
- Work that takes longer than a user will wait
- Retry with exponential backoff
- Dead-letter handling for jobs that keep failing
- Status visible to the user while they wait

### Project VII — expensive things and big things
- File or media upload
- Blob storage separate from the database
- A cache layer with a deliberate invalidation strategy
- Before/after measurement proving the cache earned its place

### Project VIII — push, not pull
- Server pushing to the client rather than the client asking
- Connection and presence state
- Reconnection after a dropped connection
- A written comparison against just polling, and why you chose what you chose

### Project IX — operated, not just built
*This is the one you point at in interviews. The others are how you get good enough to make it.*

- Deployed, with real users — ten is enough
- Structured logging and metrics you'd actually open during an incident
- Something broke and you can narrate what and why
- One decision you can defend for ten minutes
- Kept alive over weeks, not demoed once

---

# NON-GOALS

No done state. Ongoing.

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