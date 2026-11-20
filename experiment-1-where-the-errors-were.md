# Experiment 1 — 683 drug labels, 200 questions, and the discovery that most of our "hallucinations" were ours

## The question we actually had

Not *"can a chatbot answer questions about drug labels?"* — that is easy to demo and hard to trust.
The question was:

> When an answer is wrong, which part of the system made it wrong?

To answer it we needed something most benchmarks skip: a way to attribute a wrong answer to a layer.
So every answer was recorded with the retrieved sections, the answer the model wrote, what the code
changed afterwards, and what the user finally saw. That recording is what made the rest of this
possible — everything below was re-scored later from those records, without paying for the model again.

## The system being measured

- 683 drug labels, split into four sections each: indications, warnings and precautions, use in
  specific populations, and boxed warning.
- Retrieval returns whole sections, not fixed-size chunks, so "the label does not contain X" can be a
  statement about the label rather than about a window of text.
- The assistant must cite the section it used, and it is not allowed to state a dose under any
  circumstances. Both rules are enforced in code, not in the prompt.

## The first number that mattered

Over 200 questions, one category stood out: **false absence** — the answer says the label does not
contain something that it does contain. That is the most dangerous error for this use case, because a
denial is indistinguishable from a confident correct answer to a reader.

Our first readings looked like a real model problem. Two runs of the same configuration differed by up
to four turns on that category, which suggested something unstable in the model.

## Then we read the answers

Reading them changed the conclusion.

In **7 runs, 22 distinct questions produced all 77 false-absence events**. The same questions, every
time. That is not model noise; that is a decision procedure. And when we looked at the text the user
received, most of it was not the model's sentence at all — it was the guard's.

The mechanism, in a concrete case: the question asks about gastroparesis. The label has no
gastroparesis section. The model correctly says so. The code then notices that the answer *mentions*
the relevant section name and concludes the model denied something that exists, so it replaces the
answer with a sentence beginning *"the label text does contain an Indications section…"* followed by
unrelated text. It reads like a yes. The model was right and the product was wrong.

The same question asked of a small local open-weights model, given the same section, was denied
correctly 18 times out of 22. So this was never a model-specific weakness.

## The corpus had a role too

**439 of the 644 boxed warning sections are the same placeholder sentence**: "No boxed warning present
for this medication." Around 460 other sections say the specific guidance "is not available in
source".

A placeholder cannot refute anything, and cannot confirm anything either. Any check that treats "the
section exists" as "the section says something" is measuring the file layout, not the medicine.

## Fixing the guard, and what it cost to fix it properly

The guard now has to find, inside the section body, the thing the question asked about. That splits the
label into two honest categories:

| what happened | how many (final 200-question run) |
|---|---|
| the question asks for something the label genuinely does not say | 8 |
| the section is a placeholder, so it can neither confirm nor deny | 6 |
| the model denied a section that really does address the question | **0** |

The third row is the one that had been 77 events. It is now zero, and it is zero because the check can
distinguish "these words are absent" from "this content is absent" — the first is decidable by a string,
the second is not.

## The fair test: same meaning, different words

If the fix works, then the remaining question is whether the *check itself* is any good. So we built 13
items whose evidence was fixed and only the wording varied — seven where the label carries the
attribute under different words, six where it truly does not carry it.

| method | correct | what went wrong |
|---|---|---|
| word matching | 8/13 | called 5 of 7 present attributes absent — right answer, wrong reason |
| embedding similarity | 10/13 | present scores ranged 0.401–0.98, absent 0.85–0.95: **the ranges overlap**, no threshold separates them |
| the model, asked directly | **26/26** | identical on both repeats |

That third row is uncomfortable for anyone building detectors: on this task the model was not the weak
link. Our own deployed guard was. It was prepending *"the retrieved label text does not address
dangerously low blood calcium"* to answers that had found a warning titled SEVERE HYPOCALCEMIA.

## Four ways to answer "is this claim supported by the text?"

24 items, eight attributes each in three forms: the exact term, a synonym, and a confusable neighbour
the label does not carry (ketoacidosis vs lactic acidosis, prostate cancer vs benign prostatic
hyperplasia). The third form exists because it is where a method that matches topics instead of
meanings gives itself away.

| method | accuracy | missed unsupported | blocked supported | separation (AUROC) | latency | cost per call |
|---|---|---|---|---|---|---|
| word matching | 67% | 31% | 37% | 0.79 | 0 ms | $0 |
| embeddings | 83% | 13% | 25% | 0.88 | 39 ms | $0 |
| commercial grounding guardrail | 67% | **0%** | **100%** | 0.63 | 595 ms | $0.00018 |
| model as judge | **100%** | 0% | 0% | 1.00 | 622 ms | $0.000015 |

The guardrail row is the one worth sitting with. It blocked **every** supported claim we gave it. Its
own scores for supported claims were 0.81–0.98 and for unsupported claims 0.85–0.95 — overlapping, so
no threshold would have rescued it. It answers "are these about the same thing?", which is not the
question being asked.

## Does any of this actually help the product?

Detection is only worth its cost if it changes delivered answers. So we froze 33 real answers once —
the model's own text, before any repair — and ran seven configurations over exactly the same input.

| configuration | correct | repaired | damaged | cost per turn |
|---|---|---|---|---|
| A no checking | 30/33 | – | – | $0 |
| B simple code rules | 30/33 | 0 | 0 | $0 |
| J judge, neutral note | 30/33 | 0 | 0 | $0.00009 |
| **J\* judge, willing to assert** | **32/33** | **3** | **1** | $0.00009 |
| G guardrail only | 30/33 | 0 | 0 | $0.00064 |
| JG\* both must agree | 30/33 | 0 | 0 | $0.00073 |

Three things fell out of this table:

- The model was wrong on 3 of 33. Everything else was already correct, so any checking layer had at
  most three repairs available and 30 opportunities to do damage.
- A **neutral** note cannot repair a wrong answer. Only a sentence that commits — "the section does not
  cover this" — changes the outcome. Committing is also what causes the one false block.
- Requiring the permissive cheap layer to agree silently disabled the judge: the configuration with two
  checks scored the same as having none.

## The experiment that ended the line of work

Before scaling J\*, we replicated it on a fresh set: 39 items, two models, one-shot (section and
question given directly, no agent), 10 exact / 10 synonym / 10 confusable / 9 absent-and-unrelated,
every item a different drug.

| model | no checking | judge | judge + assertion |
|---|---|---|---|
| small model | 38/39 | 38/39 | 38/39 |
| larger model | 39/39 | 39/39 | 39/39 |

The judge repaired nothing because there was nothing to repair. **The earlier +2 was repairing errors
our own pipeline had introduced**, not errors either model makes when asked plainly. That is the point
at which we stopped adding detection layers: the stop rule we had written down in advance was "no new
layer unless it beats this on a larger set and a second model", and it did not.

## Same items, through the real pipeline

The same 39 items then went through the actual assistant — retrieval loop, tool prompt, long context —
with every answer frozen before repair and hand-labelled.

| model | no checking | judge + assertion | what its one error was |
|---|---|---|---|
| small model | 38/39 | **39/39** (1 repaired, 0 damaged) | answered an adjacent question — a generation error |
| larger model | 38/39 | 38/39 (0 repaired) | the retrieved section was the wrong one, and the model correctly said the boxed warning was absent |

Two answers, both "38/39", with opposite causes. No text-level checker can fix the second one, and the
judge correctly left it alone.

## Where the errors actually live

Each turn was then scored on three independent axes: was the retrieved evidence sufficient, did the
answer address what was asked, and were its claims grounded.

| model | retrieval sufficient | of the "absent" answers, denied for the wrong reason |
|---|---|---|
| small model | 39/39 | – |
| larger model | **29/39** | **8 of 19** |

The larger model's 38/39 was not the smaller model's 38/39. Ten of its turns were missing the section
the question needed, and eight of its denials said "the retrieved text does not cover this" — a claim
about our retrieval, which a reader would take as a claim about the label.

The first version of this axis had a defect of its own: it read the label's own "sections present"
line, so a warnings section counted as carrying the boxed warning. Checking the section *body* instead
found ten turns that had been scored as normal.

## The one fix that survived

The evidence was rarely missing from the corpus — the query just didn't name the section. Re-asking
with the section name recovered the missing section **11 times out of 11**. In the product, recovery
now fires when evidence is incomplete, and where it fired the evidence was complete 7 times out of 7.

That is the shape of every result here: the failures that turned out to be fixable were ours, and the
ones that were not ours were in the model's behaviour only when the pipeline was complex enough to
invite them.

## Rules we now hold, and the incident behind each

- **A mechanism label is a detector, not a verdict.** 77 "model hallucinations" were one guard firing.
- **A guard may only assert what its verifier can decide.** A string check can decide that words are
  absent; it cannot decide that content is absent.
- **Never delete the stimulus to make a mechanism disappear.** Removing the citation line would have
  made the broken-citation category read zero.
- **Record enough that a run can be re-scored offline.** Otherwise every rubric correction costs money
  and every mistake is permanent.
- **Read the delivered answers before trusting a category.** Every wrong conclusion in this document
  was caught by reading text, not by a number.

## Limits of this experiment

One cloud account, one label corpus, two models from the same family, English only. 683 labels is a
small corpus. The judgment of "does this answer address the question" is ultimately ours, and we
labelled 78 answers by hand — enough to find mechanism, not enough for a confidence interval on a rate.
