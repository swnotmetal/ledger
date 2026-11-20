# Experiment 2 — We moved the benchmark to a different system, and only the questions came with it

The point of this experiment was never accuracy. It was whether L.E.D.G.E.R's apparatus — fixed cases,
layer-by-layer attribution, deterministic scoring — is a property of the method or of the first domain.

## Why bother

A benchmark that only works on the system it was built for is a demo with a spreadsheet attached. The
honest test of an evaluation method is what happens when the domain changes: new data shape, new
failure modes, new architecture underneath.

So we took the apparatus from Experiment 1 — fixed cases, layer-by-layer attribution, deterministic
scoring — and pointed it at something with nothing in common with drug labels: **a spare-parts
distributor that answers from seven spreadsheets and thirty customer emails**. There is no document
corpus, no sections, no vector search. The system we were measuring is a graph of tool calls, not a
retrieval loop.

The question was not "is this system accurate". It was: **does the measurement survive the move, and
what has to be redesigned?**

## The two systems side by side

|  | Experiment 1 | Experiment 2 |
|---|---|---|
| input | 683 labels, 4 sections each, 2,604 pieces | 7 tables, ~100 rows, 30 emails |
| retrieval | vector search over sections | row lookup by item code and warehouse |
| structure | one document shape, repeated | many small tables that must be joined |
| "absent" means | the label does not discuss it — a property of the corpus, stable forever | no row matched *this query* — the item exists, this warehouse has no record of it |
| correct answer is sometimes | a refusal | a question back, or "your two instructions conflict" |
| noise | none — real regulatory text | deliberate — invented items, missing rows, contradictory emails |

That last row is the point of the second domain. Real business email is full of requests that cannot be
answered as written, and a benchmark that only scores answers against a clean table cannot see the
difference between "the model did not know" and "the request had no answer".

## The cases

42 cases. The expected value for every one is **computed from the spreadsheets when the case is built**,
so a case can never drift away from its own data.

| family | example | what a correct answer does |
|---|---|---|
| price and stock, exact and paraphrased | "how many of filter A10 in Helsinki?" | 5 |
| zero stock | filter A20, Helsinki | says **0** — the row exists and says zero |
| no row for that warehouse | filter A10, Ohio | says there is no record for that warehouse |
| confusable pair | the 24V relay in Ljubljana (the 12V is there) | keeps the two variants apart |
| availability with reservations | "how many available" with 15 held and 5 reserved | 10, not 15 |
| multi-warehouse total | all warehouses | 12 |
| not a stocked item | a software licence | says it is not shipped from stock |
| unit conversion | 5 boxes of 10; 10 dozen; 1 pallet | 50 vs 12 held, 120 vs 15, 100 vs 0 |
| ambiguous item name | "the standard relay", a bare "A10" | asks which one, naming both codes |
| request contradicts itself | 40 units asked, then 20 as a fallback | presents both, does not silently pick |

## Two architectures, identical cases

The system in place has three lookup tools and the model decides which to call. The obvious alternative
is to skip the tools and put every table in the prompt. Both were run over all 42 cases with
temperature 0.

| architecture | numeric cases | behavioural cases | total | cost per case |
|---|---|---|---|---|
| tools, model decides | 10/19 | 5/23 | 15/42 | $0.00019 |
| all tables in the prompt | 13/19 | 12/23 | 25/42 | $0.00023 |

At this size — seven tables, a hundred rows — **putting everything in the prompt wins**, and not
narrowly. The tool loop loses to its own queries: it looks up the wrong warehouse, or resolves a name to
the wrong code, and then answers confidently from the wrong row. That is a statement about this schema
at this size, not an argument against tool use; the same loop would be unavoidable at a thousand tables.

## The table that made the whole exercise worth it

Accuracy alone would say "the second architecture is better by ten cases" and stop. Scoring the same
answers on three axes says something else:

| architecture | lookup found the right rows | answer addressed the ask | numbers match the data | wrong answers caused by lookup | wrong answers caused by the model |
|---|---|---|---|---|---|
| tools | 7 of 11 checkable | 20/42 | 15/36 | **4** | 2 |
| all tables in prompt | 42/42 (everything is in the prompt) | 29/42 | 20/36 | 0 | **17** |

The second architecture cannot have a retrieval failure, so every one of its misses is a generation
failure. The first gets fewer answers right but its errors are spread across two layers, and in this
domain a lookup failure is usually cheaper to fix — it is a missing join, not a reasoning problem.

**If you tune only for accuracy you will pick the architecture whose errors you can least explain.**

## Three things the spreadsheets exposed

1. **Zero is not absence.** "No record of that item in that warehouse" and "we have zero" look the same
   in a chat reply and are completely different to a customer. Both architectures failed this one case
   the same way.
2. **Reserved stock is invisible unless you ask.** The system reported 15 units as available when 5 were
   already committed elsewhere — arithmetic across two tables that no single row contains.
3. **A quantity promised is not a quantity held.** Two answers offered to fulfil an order of 50 against
   12 in stock, one of them after correctly converting boxes into units. The conversion happened; the
   comparison never did.

## What survived the move, and what did not

This is the actual result of the experiment, and it is not about accuracy.

| component from Experiment 1 | verdict | evidence |
|---|---|---|
| **data interface** | **did not transfer** | Experiment 1's interface is "a label is four named sections"; this domain has no sections at all. The two evaluators share zero lines of code. |
| **step trace** | **concept only** | Recording "which layer decided this" was the most valuable idea from Experiment 1 and we **forgot to build it** in the first version here — the initial evaluator recorded right/wrong and nothing else. Adding it afterwards required new predicates, not new wiring. |
| **evaluation framework** | **shape transferred, code did not** | fixed cases → adapter → deterministic scoring → per-family report. Because the cases talk to an adapter, the same 42 cases ran two different architectures unchanged. That is the part worth copying. |
| **failure attribution** | **concept transferred, implementation rewritten** | three axes in both experiments, not one predicate in common: text patterns over document sections became row lookups and arithmetic over numbers. |

**The architecture of the benchmark transferred; the code did not.**

## We then found our own scorer inflating the results

Publishing the first numbers would have been wrong, so this belongs in the write-up.

The behavioural scoring had two defects:

- When a case's expectation was a map of nulls ("these items must not be found"), the check silently
  returned *correct* without ever running — an empty list of numbers satisfies "all numbers present".
  Six of the tool architecture's passes were cases that never read the answer.
- Numbers were extracted from part codes, so a case expecting 12 was satisfied by the existence of a
  part called `RM-12`.

Both defects favoured the architecture that produces more intermediate output. Corrected, on exactly
the same recorded answers: 19/42 → **15/42** for the tool architecture, 25/42 → **25/42** for the
prompt architecture. The conclusion got stronger, not weaker — but only after we stopped trusting the
first table.

The opposite mistake also happened: our first corrected pass failed two correct answers because the
pattern for "we do not currently carry this" was missing. A strict check fails good answers, a loose
check passes bad ones, and neither announces itself. The only thing that caught both was reading the
raw text.

## What someone else should take away

- **Write the layer into the record from the first run.** Retrofitting attribution onto saved answers
  works, but only if the answers, the tool calls and the retrieved rows were kept. Ours were kept by
  luck of an earlier habit.
- **Make the case expectation computable from the data.** Hand-written expected values rot; computed
  ones cannot.
- **Run two architectures over the same cases.** It is the cheapest way to find out whether your metric
  is measuring quality or just the shape of the system.
- **Expect your scorer to be wrong in both directions.** Budget one reading pass over raw answers per
  publication.

## Limits of this experiment

42 cases, one model, one run each. The tables say *where* errors come from, not *how often* they occur;
a rate needs many runs, and these are single samples. The corpus is small and entirely fictional, which
makes it legally safe to publish and unrepresentative of a real distributor's data. Nothing here should
be compared with Experiment 1's numbers: different corpus, different noise, different unit of work.
