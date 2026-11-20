# Reliability Benchmarking for Evidence-Grounded AI

An AI assistant answers questions from documents it is given. When the answer is wrong, which part of
the system made it wrong — and can you tell from the answer alone?

That question is the whole content of this repository. It holds the write-up of two experiments, the
case definitions we used, and the measured tables. It does not hold code, customer data, or the
document corpus. Everything here is a record of what we measured and how we measured it.

---

## The two experiments

**Experiment 1** asked *where* errors come from in a working assistant over 683 FDA drug labels. The
short version: most of what our own dashboard counted as hallucination was produced by our own safety
code, and the one real model error turned out to be caused by the agent loop rather than the model.
→ [`experiment-1-where-the-errors-were.md`](experiment-1-where-the-errors-were.md)

**Experiment 2** asked whether the measurement apparatus survives being moved to a completely different
system — a parts distributor working from spreadsheets and customer emails. The short version: the
architecture of the benchmark transferred, none of the code did, and the tables it produced said
something an accuracy score could not.
→ [`experiment-2-what-survived-a-move.md`](experiment-2-what-survived-a-move.md)

What the inputs look like (examples only, invented) → [`examples.md`](examples.md)

---

## What we are claiming

1. **An error count is not a diagnosis.** A single "accuracy" number hides whether the model answered
   the wrong question, read the wrong document, or was overwritten by code. Split the count by layer
   and the same number means three different things.
2. **Safety code fails in the same way as the model.** Our strongest-sounding guard replaced correct
   answers with wrong ones, and the user could not tell the difference. A detector that fires is not
   evidence that the thing it detected happened.
3. **Cheap detectors lose to asking the model.** Four methods were compared on identical items; the
   model-as-judge was the only one with zero false positives, and it cost $0.000015 per call.
   A commercial grounding product blocked every supported claim we gave it.

## What we are not claiming

- Not that this generalises to every model. Two models from one family, one cloud account, English
  documents only.
- Not that the numbers are large samples. Experiment 1 ran 200 questions repeatedly and then hand-read
  78 answers; Experiment 2 is 42 cases, one model, one run each.
- Not that these are the best possible detectors. We measured four and stopped when they agreed.
- Not that the assistant is good. The interesting results here are about measurement, including
  measurements that told us our own system was worse than we thought.

## Design constraints that shaped it

The assistant answers only from retrieved label sections, cites the section it used, and is never
allowed to state a dose. Those are product decisions, and they matter for reading the results: a
"refusal to give a dose" is correct behaviour here, not a failure to answer.
