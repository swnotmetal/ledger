import test from 'node:test';
import assert from 'node:assert/strict';

import { askedSections, contentWords, coverage, isPlaceholderBody, triage } from './guard-triage.mjs';

/**
 * Every case below is a real incident, with the drug names changed. That is the point of the module:
 * the four ways a "does the document say X" check goes wrong are all in here, and three of them must
 * end with `assertable: false` no matter how confident the words look.
 */

const SECTIONS = ['Indications', 'Warnings and Precautions', 'Use in Specific Populations', 'Boxed Warning'];

test('content words drop the asking, keep the asked', () => {
  const words = contentWords('What does the label warn about for people with kidney problems?');
  assert.deepEqual(words, ['people', 'kidney', 'problems']);
});

test('the product name can be excluded when it contains ordinary words', () => {
  // "Are there warnings for Cold Relief Plus?" -- "cold" and "relief" are the product, not the topic.
  const words = contentWords('Are there warnings for Cold Relief Plus?', { extraStopwords: ['cold', 'relief', 'plus'] });
  assert.deepEqual(words, []);
});

test('placeholder bodies are recognised in the phrasings real corpora use', () => {
  assert.equal(isPlaceholderBody('No boxed warning present for this medication.'), true);
  assert.equal(isPlaceholderBody('Specific oral guidance not available in source'), true);
  assert.equal(isPlaceholderBody('None'), true);
  assert.equal(isPlaceholderBody('   '), true);
  assert.equal(isPlaceholderBody('Hepatic impairment requires dose adjustment.'), false);
});

test('coverage reports partial separately from full', () => {
  assert.equal(coverage(['prostate', 'cancer'], 'enlarged prostate, benign hyperplasia').level, 'partial');
  assert.equal(coverage(['prostate', 'cancer'], 'prostate cancer screening').level, 'full');
  assert.equal(coverage(['prostate', 'cancer'], 'hepatic impairment').level, 'none');
});

test('a request for a section that was never retrieved may be asserted', () => {
  const out = triage({
    question: 'Is there a boxed warning?',
    body: '',
    sectionNames: SECTIONS,
    availableSections: ['Indications', 'Warnings and Precautions', 'Use in Specific Populations'],
  });
  assert.equal(out.state, 'section_missing');
  assert.equal(out.assertable, true);
});

test('a placeholder section may be asserted: it holds no content either way', () => {
  const out = triage({
    question: 'Is there a boxed warning?',
    body: 'No boxed warning present for this medication.',
    sectionNames: SECTIONS,
    availableSections: SECTIONS,
  });
  assert.equal(out.state, 'section_is_placeholder');
  assert.equal(out.assertable, true);
});

test('a short body may not be asserted -- it cannot refute anything', () => {
  const out = triage({ question: 'Is it safe in pregnancy?', body: 'See section 8.', minBodyChars: 40 });
  assert.equal(out.state, 'body_too_short');
  assert.equal(out.assertable, false);
});

test('THE INCIDENT: absent words are not absent content', () => {
  // The deployed checker said "the retrieved text does not address dangerously low blood calcium"
  // about this body. It was wrong four times out of four on paraphrased questions.
  const out = triage({
    question: 'What does the label say about dangerously low blood calcium?',
    body:
      'SEVERE HYPOCALCEMIA. Patients are at risk of tetany, seizures and arrhythmias. Monitor closely ' +
      'and treat symptomatic hypocalcemia promptly.',
  });
  assert.deepEqual(out.topic, ['dangerously', 'low', 'blood', 'calcium']);
  assert.equal(out.state, 'topic_absent_by_words');
  assert.equal(out.assertable, false, 'the guard must surface the section instead of asserting absence');
});

test('a partial match is not verification either', () => {
  // "prostate" is in "enlarged prostate"; the label does not carry prostate cancer. Any-hit logic read
  // that as proof the section is present and turned a true denial into a false accusation.
  const out = triage({
    question: 'Does it treat prostate cancer?',
    body: 'Indicated for symptomatic benign prostatic hyperplasia with an enlarged prostate.',
  });
  assert.equal(out.state, 'topic_partial');
  assert.equal(out.assertable, false);
});

test('when every content word appears, the check has nothing to complain about', () => {
  const out = triage({
    question: 'What does it say about hepatic impairment?',
    body: 'Hepatic impairment: reduce the starting dose and monitor hepatic function every two weeks.',
  });
  assert.equal(out.state, 'topic_present');
  assert.equal(out.assertable, false);
});

test('asked sections are found by name, case-insensitively', () => {
  assert.deepEqual(askedSections('what does the boxed warning say?', SECTIONS), ['Boxed Warning']);
  assert.deepEqual(askedSections('tell me about it', SECTIONS), []);
});

test('the assertable states are exactly two', () => {
  const states = new Set();
  const bodies = [
    ['', []],
    ['No boxed warning present for this medication.', SECTIONS],
    ['See section 8.', []],
    ['', ['Indications']],
    ['Hepatic impairment requires caution and monitoring of liver function.', []],
    ['enlarged prostate', []],
    ['hepatic impairment and liver function monitoring', []],
  ];
  for (const [body, available] of bodies) {
    const out = triage({
      question: 'what does it say about hepatic impairment and boxed warning?',
      body,
      sectionNames: SECTIONS,
      availableSections: available,
    });
    if (out.assertable) states.add(out.state);
  }
  // section_missing is not in that set because every case with a populated available list has both
  // sections; the assertion is that no *other* state ever claims the right to assert.
  for (const s of states) assert.ok(['section_missing', 'section_is_placeholder'].includes(s), s);
});
