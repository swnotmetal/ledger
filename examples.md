# What the inputs look like

Examples only. Every drug, item, company and number below is invented for illustration; no real label
text, customer data or corpus is published here.

---

## 1. A retrieved section, as the assistant sees it

Retrieval returns a whole named section rather than a fixed-size chunk. The header tells the assistant
which label and section it is looking at; the section list lets it say "this label does not have that
section" as a statement about the label, and not about the piece of text it happened to receive.

```
Drug: TESTOMAB (invented)
Section: Warnings and Precautions
Label sections present: Indications | Warnings and Precautions | Use in Specific Populations

Patients with severe hepatic impairment should be monitored for signs of accumulation.
Concomitant use with strong inhibitors of the example pathway may increase exposure.
```

A placeholder section is a real thing in real corpora, so the benchmark has to handle it. This is what
one looks like:

```
Drug: TESTOMAB (invented)
Section: Boxed Warning
Label sections present: Indications | Warnings and Precautions | Boxed Warning

No boxed warning present for this medication.
```

A section like that can neither confirm nor deny anything, and any check that treats "the section
exists" as "the section says something" is measuring the file layout.

## 2. A case, Experiment 1

Cases are questions with a hand-written expectation, plus the attribute the question names — because
that attribute is what makes a silent substitution detectable.

```json
{
  "id": "premise-not-in-label-03",
  "drug": "TESTOMAB (invented)",
  "section": "Warnings and Precautions",
  "question": "What does the label say about hair loss?",
  "attribute_asked": "hair loss",
  "attribute_in_body": false,
  "expected": "says the section does not cover hair loss",
  "what_wrong_looks_like": "answers with the section's real content and never mentions hair loss"
}
```

The `expected` field is a sentence rather than a keyword on purpose. A keyword would score the wrong
answer as correct whenever it happened to contain the word — which is how the guard that caused the
original problem worked.

## 3. The second domain's tables

Seven small tables that have to be joined. Two of them, with invented contents:

`items` — the catalogue

| Item_Code | Description | Unit_Price | Pack_Size | Is_Stock_Item |
|---|---|---|---|---|
| PART-001 | Example Valve, 12V | 12.50 | 10 | 1 |
| PART-002 | Example Valve, 24V | 14.00 | 10 | 1 |
| LIC-001 | Example Software Licence | 99.00 | 1 | 0 |

`inventory_bins` — where the stock is, and how much of it is already promised

| Item_Code | Warehouse | Actual_Qty | Reserved_Qty |
|---|---|---|---|
| PART-001 | Helsinki | 15 | 5 |
| PART-001 | Ljubljana | 7 | 0 |
| PART-002 | Ljubljana | 24 | 4 |

Three different "not available" answers live in those five rows, and only one of them is a zero:

- `PART-001` in Helsinki: 15 on hand, 5 promised → **10 available**
- `PART-001` in Ohio: no row → **no record for that warehouse**
- `LIC-001`: exists in the catalogue, `Is_Stock_Item = 0` → **not shipped from stock**

## 4. A case, Experiment 2

The expected values are computed from the tables above at build time, so the case cannot drift away
from its own data.

```json
{
  "id": "stock-reserved-001",
  "family": "availability_with_reservations",
  "question": "How many PART-001 can you ship from Helsinki this week?",
  "expect": {
    "value": { "available": 10, "on_hand": 15, "reserved": 5 },
    "must_say": "the difference between stock and availability"
  },
  "verdict": "value",
  "note": "15 is the number written on the shelf; 10 is the number that can be promised"
}
```

`verdict` selects which check runs: a numeric comparison, or one of the behavioural checks such as
"asks which variant", "reports the shortfall", or "says there is no record". A case with a verdict and
no number to check is treated as a mistake in the case, not a pass.

## 5. What a wrong answer looks like

For reference, since the interesting part of both experiments is the shape of the failures:

| question | answer given | why it is wrong |
|---|---|---|
| how many available in Helsinki | "15 units available" | 15 is on the shelf; 5 are promised elsewhere |
| how many in Helsinki | "65 units" | 65 is the number for a different warehouse |
| can you fulfil 80 | "we can quote for 80 units" | 40 are already committed |
| 5 boxes of 10, need 35 | "we can fulfil your request… 12 in stock" | 50 were asked for and 12 exist |
| how many PART-002 in Helsinki | "no record of PART-002 in Helsinki" | correct — but the same wording was used for a row that exists and says zero |
