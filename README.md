# L.E.D.G.E.R

**L**abel **E**vidence & **D**eterministic **G**rounding **E**rror **R**outer. The name comes from the
first domain below; the measurement work kept it when the second domain arrived, because the failure
classes did not change as much as the data did.

An AI assistant answers questions from documents it is given. When the answer is wrong, which part of
the system made it wrong — and can you tell from the answer alone?

That question is the whole content of this repository. It is the benchmarking and evaluation half of
the project: the write-up of two experiments, the case definitions, and the measured tables. It holds
no product code, no customer data, and no document corpus.

It does hold **one module**, [`detector/`](detector/): the rules that decide whether an automated check
is allowed to say "the document does not cover this". About a hundred lines, no dependencies, no
corpus, and a test file where every case is a mistake we actually made. A rule that cannot be run
cannot be checked, so this part is executable.

The project has three layers, and only the first two are published here:

| layer | what it is | in this repo |
|---|---|---|
| **benchmark** | fixed cases with ground truth, and the labels for what a correct answer is | yes — [`examples.md`](examples.md) shows the shape |
| **evaluation** | how a verdict is decided, and how a wrong answer is attributed to a layer | yes — both experiment write-ups are about this |
| **implementation** | the assistant itself, on AWS: retrieval, model, guards | no — the reference implementation is not published |

Only one piece crosses that line: the absence-triage rules in [`detector/`](detector/), because they are
the part of the evaluation that other people can run against their own documents.

---

## A detector you can run

[`detector/guard-triage.mjs`](detector/guard-triage.mjs) answers one question: **may code state that a
document does not cover something?** It says yes for exactly two situations — the section was never
retrieved, or the section exists and says nothing — and no for everything else, including "the words
are absent", which is the case that cost us four wrong accusations on paraphrased questions.

```bash
node detector/demo.mjs                  # four real incidents, and what the rules say about each
node detector/guard-triage.test.mjs     # 12 tests, every one of them a mistake we made
```

```js
import { triage } from './guard-triage.mjs';

const out = triage({
  question: 'what does it say about dangerously low blood calcium?',
  body: 'SEVERE HYPOCALCEMIA. Monitor closely and treat symptomatic hypocalcemia promptly.',
  sectionNames: ['Indications', 'Warnings and Precautions', 'Boxed Warning'],
  availableSections: ['Warnings and Precautions'],
});

// out.state      'topic_absent_by_words'
// out.assertable false  -> surface the section, or ask the model. Do not write the denial.
```

The contract is the point: `assertable` is `true` in two states out of six. The rest are findings for a
model or a person, which is exactly what the write-ups above argue at length.

> **The assistant is running here: <https://ledger.swbuilds.workers.dev>**
> It answers from retrieved label sections, names the label, and refuses to state a dose — including
> when the label does. Five questions per ten minutes, thirty a day, which is enough to see how it
> behaves and not enough to use it for anything. It is a demonstration of the contract described
> above, not a medical tool.

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

## Licence

Text and tables in this repository are licensed [CC BY 4.0](LICENSE). Attribution: L.E.D.G.E.R,
https://github.com/swnotmetal/ledger.

If you cite a number, cite the experiment it came from rather than the repository as a whole. The two
experiments were run on different corpora and their numbers are not comparable with each other.
