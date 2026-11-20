/**
 * Absence triage for retrieval-grounded answers.
 *
 * The problem this solves, in one sentence: a guard that decides "the document does not say X" is
 * allowed to *assert* that only when it can tell "the words are absent" from "the content is absent",
 * and those are not the same question.
 *
 * We learned this the expensive way. A deployed checker prepended
 *
 *     "the retrieved text does not address dangerously low blood calcium"
 *
 * to an answer that had found a warning titled SEVERE HYPOCALCEMIA. The words really were absent; the
 * content was right there. Over seven runs that guard produced 77 "hallucinations" that were ours.
 *
 * So this module does not answer "is this supported". It answers a smaller, decidable question, and it
 * refuses to let the caller confuse the two:
 *
 *     triage({ question, body, availableSections })
 *       -> { state, assertable, topic, coverage, reason }
 *
 * `assertable: true` is the only case where code may state an absence without asking a model or a
 * human:
 *
 *     section_missing       the requested section is not in what was retrieved at all
 *     section_is_placeholder  the section exists and says nothing ("No boxed warning present")
 *
 * Everything else is a finding for a model or a person, including `topic_absent_by_words` -- which is
 * the trap above, and the reason this module exists.
 *
 * No dependencies, no corpus, no network. Works on any set of documents that have a name and a body:
 * label sections, contract clauses, policy articles, support articles.
 */

/** Function words. Nothing here is ever evidence about content. */
const STOP = new Set(
  `a an and are as at be been being but by can could did do does doing for from had has have having
   how i if in into is it its may might must of on or our should so some such than that the their
   them then there these they this those to was were what when where which who why will with would
   you your about does`
    .split(/\s+/)
    .filter(Boolean),
);

/** Words that name the act of asking rather than the thing asked about. */
const FORM = new Set(
  `label labels section sections text document says say said saying tell tells mention mentions
   warn warns warning warnings describe describes describe precaution precautions indication
   indications question questions ask asks asking`
    .split(/\s+/)
    .filter(Boolean),
);

/** Canned text that means "there is nothing here", in the phrasings real corpora use. */
const PLACEHOLDER_PATTERNS = [
  /no boxed warning present/i,
  /not available in source/i,
  /^\s*(none|n\/?a|not applicable|no data)\s*[.;]?\s*$/i,
  /^\s*(none|n\/?a|not applicable)\b/i,
  /this (?:section|information) (?:is )?not (?:provided|available)/i,
  /^\s*\W*$/,
];

/**
 * Content words of a question: lowercased, de-duplicated, stopwords and form words removed.
 *
 * Deliberately dumb. It splits on non-alphanumerics and drops words under three characters, so it is
 * ASCII-only and does no stemming. Both limits are the reason the result must never be treated as a
 * verdict -- see `triage`.
 *
 * @param {string} text
 * @param {{extraStopwords?: string[]}} [options]
 * @returns {string[]}
 */
export function contentWords(text, { extraStopwords = [] } = {}) {
  const extra = new Set(extraStopwords.map((w) => String(w).toLowerCase()));
  const seen = new Set();
  const out = [];
  for (const raw of String(text ?? '').toLowerCase().split(/[^a-z0-9]+/)) {
    if (raw.length < 3) continue;
    if (STOP.has(raw) || FORM.has(raw) || extra.has(raw)) continue;
    if (seen.has(raw)) continue;
    seen.add(raw);
    out.push(raw);
  }
  return out;
}

/**
 * Is this body a placeholder -- text that exists but carries no content?
 *
 * A placeholder can neither confirm nor deny anything. In one public corpus 439 of 644 boxed-warning
 * sections held the same sentence: "No boxed warning present for this medication." Any check that
 * reads "the section exists" as "the section says something" is measuring the file layout.
 *
 * @param {string} body
 * @returns {boolean}
 */
export function isPlaceholderBody(body) {
  const text = String(body ?? '').trim();
  if (!text) return true;
  return PLACEHOLDER_PATTERNS.some((re) => re.test(text));
}

/**
 * How much of the asked topic appears in the body, by words alone.
 *
 * @param {string[]} topic
 * @param {string} body
 * @returns {{level: 'full'|'partial'|'none'|'empty', hits: string[], missing: string[]}}
 */
export function coverage(topic, body) {
  if (!topic.length) return { level: 'empty', hits: [], missing: [] };
  const words = new Set(String(body ?? '').toLowerCase().split(/[^a-z0-9]+/));
  const hits = topic.filter((w) => words.has(w));
  const missing = topic.filter((w) => !words.has(w));
  if (!hits.length) return { level: 'none', hits, missing };
  if (!missing.length) return { level: 'full', hits, missing };
  return { level: 'partial', hits, missing };
}

/**
 * Which of the caller's known section names the question is asking about.
 *
 * @param {string} question
 * @param {string[]} sectionNames   the names this corpus uses, e.g. ['Indications', 'Boxed Warning']
 * @returns {string[]}
 */
export function askedSections(question, sectionNames = []) {
  const q = String(question ?? '').toLowerCase();
  const hits = [];
  for (const name of sectionNames) {
    const n = String(name).toLowerCase();
    if (n && q.includes(n)) hits.push(name);
    continue;
  }
  return hits;
}

/**
 * The single entry point. Classifies what a guard is looking at, and says whether it may assert.
 *
 * @param {object} input
 * @param {string} input.question
 * @param {string} input.body            the retrieved section body, or '' if none was retrieved
 * @param {string[]} [input.sectionNames] names this corpus uses
 * @param {string[]} [input.availableSections] section names actually present in the retrieved text
 * @param {number} [input.minBodyChars]  below this a body cannot refute anything
 * @param {string[]} [input.extraStopwords] e.g. the drug or product name in the question
 * @returns {{state: string, assertable: boolean, topic: string[], coverage: object, reason: string}}
 */
export function triage({
  question,
  body = '',
  sectionNames = [],
  availableSections = [],
  minBodyChars = 40,
  extraStopwords = [],
}) {
  const topic = contentWords(question, { extraStopwords });
  const asked = askedSections(question, sectionNames);
  const requested = asked.filter((s) => !availableSections.includes(s));

  if (requested.length) {
    return {
      state: 'section_missing',
      assertable: true,
      topic,
      coverage: { level: 'empty', hits: [], missing: topic },
      reason: `the retrieved text carries no ${requested.join(', ')} section`,
    };
  }

  const text = String(body ?? '').trim();
  if (isPlaceholderBody(text)) {
    return {
      state: 'section_is_placeholder',
      assertable: true,
      topic,
      coverage: { level: 'empty', hits: [], missing: topic },
      reason: 'the section exists and holds no content, so it neither confirms nor denies anything',
    };
  }

  if (text.length < minBodyChars) {
    return {
      state: 'body_too_short',
      assertable: false,
      topic,
      coverage: coverage(topic, text),
      reason: `the body is ${text.length} characters, too short to refute anything`,
    };
  }

  if (!topic.length) {
    return {
      state: 'no_topic',
      assertable: false,
      topic,
      coverage: { level: 'empty', hits: [], missing: [] },
      reason: 'the question names no attribute to look for',
    };
  }

  const cov = coverage(topic, text);
  if (cov.level === 'full') {
    return {
      state: 'topic_present',
      assertable: false,
      topic,
      coverage: cov,
      reason: 'every content word of the question appears in the body',
    };
  }
  if (cov.level === 'partial') {
    // Partial match is the subtler trap: "prostate" is in "enlarged prostate", so a check that reads
    // any hit as verification turns a true denial into an accusation. Only full coverage counts.
    return {
      state: 'topic_partial',
      assertable: false,
      topic,
      coverage: cov,
      reason: `some of the question's words appear (${cov.hits.join(', ')}) but not all`,
    };
  }
  return {
    state: 'topic_absent_by_words',
    assertable: false,
    topic,
    coverage: cov,
    reason: 'the words are absent. That is not the same as the content being absent',
  };
}
