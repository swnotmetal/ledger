// Four real incidents, run through the rules. `node demo.mjs`
//
// This is the whole argument for the module in one screen: three of these look like "the document
// does not say it", and only one of them is something code is allowed to say out loud.
import { triage } from './guard-triage.mjs';

const SECTIONS = ['Indications', 'Warnings and Precautions', 'Use in Specific Populations', 'Boxed Warning'];

const cases = [
  {
    name: 'a section that was never retrieved',
    question: 'Is there a boxed warning?',
    body: '',
    availableSections: ['Indications', 'Warnings and Precautions', 'Use in Specific Populations'],
  },
  {
    name: 'a section that exists and says nothing',
    question: 'Is there a boxed warning?',
    body: 'No boxed warning present for this medication.',
    availableSections: SECTIONS,
  },
  {
    name: 'the paraphrase we accused wrongly',
    question: 'What does the label say about dangerously low blood calcium?',
    body:
      'SEVERE HYPOCALCEMIA. Patients are at risk of tetany, seizures and arrhythmias. Monitor closely ' +
      'and treat symptomatic hypocalcemia promptly.',
  },
  {
    name: 'the partial match that read as verification',
    question: 'Does it treat prostate cancer?',
    body: 'Indicated for symptomatic benign prostatic hyperplasia with an enlarged prostate.',
  },
];

for (const c of cases) {
  const out = triage({ ...c, sectionNames: SECTIONS });
  const verdict = out.assertable ? 'code may say it' : 'code may NOT say it';
  console.log(`\n${c.name}`);
  console.log(`  state      ${out.state}`);
  console.log(`  verdict    ${verdict}`);
  console.log(`  reason     ${out.reason}`);
  if (out.topic.length) console.log(`  topic      ${out.topic.join(' ')}`);
}
