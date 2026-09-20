# Roadmap — grouped by item

Each item has a duration, not a calendar slot. Run them in parallel.

---

## 1. SQL
**Now → end of September, then 15 min/day forever**

- Finish LeetCode SQL 50.
- Then maintenance only. Don't add a second site.
- One pattern to have memorised cold: `ROW_NUMBER() OVER (PARTITION BY x ORDER BY y)`.

Later, if you want depth: PGExercises (recursive CTEs, window functions), and *Use The Index, Luke* for query plans.

---

## 2. Algorithms
**Now → end of January. 2/day now, heavier in Dec–Jan. Stop at 100.**

- NeetCode 150, in their order. Cap at 100 — the last 50 are hard DP and advanced graphs that don't come up at grad level.
- Python.
- 25 minutes, then read the solution. Redo from scratch three days later.
- Learn properly in week one: `Counter`, `defaultdict`, `deque`, `heapq`, `bisect`, `lru_cache`.
- Feb onward: 2/week maintenance.

---

## 3. Systems depth
**Now → ongoing, indefinitely**

- **A Philosophy of Software Design** (Ousterhout) — ~190 pages. Read this first, this phase. Complexity, abstraction, interface design.
- **Designing Data-Intensive Applications** (Kleppmann) — one chapter a week, forever. Start December.
- **System Design Primer** (github.com/donnemartin/system-design-primer) — one section a week.
- **Hussein Nasser** (youtube.com/channel/UC_ML5xP23TOWKUcc-oAE_Eg) — meal-length, backend and database internals.

---

## 4. Data modelling
**One weekend, anytime before January**

- **The Data Warehouse Toolkit** (Kimball), chapters 1–3 only.
- Facts and dimensions, slowly changing dimensions, normalisation trade-offs, why a schema that reads well writes badly.

---

## 5. Builds
**December → January, and continuing**

Many small builds. You pick what. The point is coverage — each build should force you into a decision you haven't made before. If you reach for Postgres and REST every time, you've built one project five times.

**One ADR per build.** Half a page: what you decided, what the options were, what you picked, why, what it costs. The value is that writing down the rejected option forces you to have considered one. Twenty minutes.

### Coverage checklist

Tick these off across builds. The ones you've already hit are marked.

- [x] **Data modelling** — schema design, normalised or not, read vs write cost *(dashboard)*
- [x] **Auth** — who are you, what can you touch *(dashboard)*
- [x] **Testing** — what you verify and what you deliberately don't *(dashboard)*
- [x] **Scheduled work** — runs on a clock. Missed runs, overlapping runs *(Retention Router)*
- [x] **External integration** — someone else's API, their rate limits, schema changes, downtime *(Retention Router)*
- [x] **Idempotency** — same operation arrives twice. Does it double-charge *(Retention Router)*
- [x] **Config and deployment** — how it ships, where secrets live, changing behaviour without redeploying *(Retention Router)*
- [ ] **State and persistence** — where data lives, what survives a crash, what durability costs
- [ ] **Concurrency** — two things at once, and what breaks when they touch the same data
- [ ] **Asynchrony** — work longer than a request. Queues. What the user sees while waiting
- [ ] **Failure and retry** — the thing you call is down. Retry policy, backoff, what stops you making it worse
- [ ] **Caching and invalidation** — what's expensive enough to cache, how you know it's stale
- [ ] **Observability** — answering "what happened at 2am" six weeks later. **Biggest gap.**
- [ ] **Real-time** — pushing to the client instead of the client asking. Websockets vs polling
- [ ] **Blob handling** — uploads, storage, things too big for the database

### One from-scratch build
**A weekend, once.**

Write a small key-value store. Not an HTTP server — socket handling and header parsing won't inform a component choice. A KV store teaches you why Redis exists, what persistence costs, and what a cache actually is. That transfers, because "do I need a cache here" is a real decision.

Reference: **Build Your Own X** (github.com/codecrafters-io/build-your-own-x).

---

## 6. One operated system
**January → ongoing**

Separate from the small builds. One thing that runs, that people use, that can break at 3am.

- Real users, even ten.
- Stateful and concurrent — the interesting failures live where two things happen at once.
- Observable — logs and metrics you'd actually use during an incident.
- **Operated.** You kept it up. You know what fell over and why.
- One decision you can defend for ten minutes, with the alternative you rejected.

This is the thing you point at in interviews. The small builds are how you get good enough to make it.

---

## 7. AWS Solutions Architect – Associate (SAA-C03)
**Study late Nov → sit December. ~$150.**

Not DEA-C01 — that's a data product catalogue and it picks a lane for you. SAA covers compute, storage, networking, IAM, availability, cost, architecture trade-offs. Serves backend, data, platform and AI infra equally, and it's the cert recruiters recognise.

- AWS Skill Builder (free tier + official practice exam), starting with the SAA-C03 Exam Guide for domain weightings.
- Maarek (faster, exam-focused) or Cantrill (slower, teaches more) on Udemy.
- AWS Free Tier — build something. Don't pass it on video alone.

---

## 8. Verification
**December → ongoing**

The actual "managing AI" skill. Not prompting — catching the model being confidently wrong.

- **pytest** — test the invariants that must hold, not coverage theatre.
- **Hypothesis** (property-based testing) — highest-leverage technique against AI-generated code, because it finds the cases you didn't think to write.
- **ArjanCodes Code Roasts** (youtube.com/@ArjanCodes) — direct practice at reviewing code you didn't write.
- Habit: specs first, then drive the agent, then review every change. Keep the specs.

---

## 9. Meetups and industry events
**Now → ongoing. Weekly.**

This is the sponsorship pipeline. Applications have produced silence; the one live thing came from a room you were in.

**The mechanic:**
- **Same group, four times.** Recognition is the entire point. Four visits to one group beats one visit to four.
- **Go to the talk, stay for the after.** The talk is content. The 40 minutes after is the reason you came.
- **Have an answer to "what are you working on."** Not "I'm a student." Name the thing you're building and one problem in it. That's what makes someone ask a follow-up.
- **Ask about their work, not for a job.** A question only someone who has built the thing would ask. That's a conversation between engineers.
- **Follow up within 48 hours.** LinkedIn, one line referencing what you actually talked about. Most people don't, which is why it works.
- **Track it.** Who, where, what they work on, what you said you'd send. Send it.

**Speak eventually.** Lightning talks at meetups are usually under-subscribed and organisers want volunteers. Ten minutes on something you built puts every person in the room in a position to remember you, and it inverts the dynamic — people approach you afterwards. You have a decade of content experience and you're not scared of a camera. Most engineers are. This is your unfair advantage and almost nobody uses it.

**Range matters.** Backend, cloud, database, AI/LLM, and language-specific groups. Different rooms, different companies hiring. Conferences and one-day events too — higher density of senior people than a monthly meetup.

**The thing to internalise:** sponsorship is a decision a person makes about someone they trust. You're not collecting contacts, you're becoming someone a few people would vouch for. That takes months of showing up, not one good conversation.

---

## 10. Technical interviews
**February → June**

- **Live coding out loud.** The hard part isn't the algorithm, it's narrating while you think. Practise by solving NeetCode problems talking to an empty room, or record yourself. Everyone underestimates this and it's the most common failure.
- **System design.** You won't get a full round as a grad, but "how would you build X" comes up constantly and most candidates flail. ByteByteGo plus the System Design Primer is enough. Structure: clarify requirements, sketch components, name the bottleneck, state the trade-off.
- **The AI question.** Every interviewer in 2027 asks how you use AI tools. Don't say "it makes me faster" — everyone says that. Have a concrete example of catching it being confidently wrong.
- **Defending your build.** Someone will go deep on one decision. Know the alternative you rejected and why. The ADRs are this.
- **Online assessments** vary: Codility, HackerRank, CodeSignal, Coderbyte. Do one timed mock on whatever platform the invite names before the real thing.

---

## 11. Deadlines

| When | What |
|---|---|
| Late Oct 2026 | Research scholarship outcome |
| Jan–Feb 2027 | Sit IELTS/PTE. 8.0 every band. Must be within 12 months of 485 lodgement |
| Feb–May 2027 | Grad program applications |
| 1–22 Jul 2027 | Deloitte graduate window (2026 dates — verify) |
| Jun 2027 | NAATI CCL Indonesian |
| Jul 2027 | Request completion letter the day it exists |
| Early Aug 2027 | **Lodge 485.** Student visa expires 30/08/2027 |
| Aug 2027 | Book health exam immediately |
| Feb 2028 | Professional Year decision point (only if no skilled job) |
| Jul 2028 | ACS skills assessment — nominate three ANZSCO codes, one fee |

Full detail in `pr-roadmap-v2.md` and `pr-roadmap.ics`.
