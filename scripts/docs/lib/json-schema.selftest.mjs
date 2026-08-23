#!/usr/bin/env node
/**
 * Prove the subset validator rejects what it claims to reject.
 *
 * A validator that never returns an error is indistinguishable from no
 * validator at all, and the repository has already shipped one gate whose only
 * failure mode was reporting success. Each case below feeds a known-bad value
 * to a schema built from the same keywords the registries use, and asserts that
 * the error surfaces.
 */
import { validate, assertKnownKeywords } from './json-schema.mjs';

let failures = 0;

function check(name, schema, value, { expect, mentions }) {
  const errors = validate(schema, value);
  const ok = expect === 'valid' ? errors.length === 0 : errors.length > 0;
  const mentioned = !mentions || errors.some((e) => e.includes(mentions));
  if (ok && mentioned) {
    console.log(`  ok  ${name}`);
    return;
  }
  failures += 1;
  console.error(`  FAIL  ${name}`);
  console.error(`        expected ${expect}${mentions ? ` mentioning ${JSON.stringify(mentions)}` : ''}`);
  console.error(`        errors: ${errors.length ? errors.join(' | ') : '(none)'}`);
}

console.log('json-schema subset validator');

check('a wrong scalar type is reported',
  { type: 'object', properties: { n: { type: 'integer' } } }, { n: 'two' },
  { expect: 'invalid', mentions: 'expected integer' });

check('a missing required property is reported',
  { type: 'object', required: ['id'] }, {},
  { expect: 'invalid', mentions: 'missing required property id' });

check('an undeclared property is reported when additionalProperties is false',
  { type: 'object', additionalProperties: false, properties: { id: { type: 'string' } } },
  { id: 'a', stray: 1 },
  { expect: 'invalid', mentions: 'unexpected property stray' });

check('a value outside an enum is reported',
  { enum: ['implemented', 'partial'] }, 'shipped',
  { expect: 'invalid', mentions: 'is not one of' });

check('a string failing its pattern is reported',
  { type: 'string', pattern: '^(FR|NFR)(-[A-Z]{2,4})?-[0-9]{3}$' }, 'FR-12',
  { expect: 'invalid', mentions: 'does not match' });

check('a canonical identifier passes the same pattern',
  { type: 'string', pattern: '^(FR|NFR)(-[A-Z]{2,4})?-[0-9]{3}$' }, 'FR-RES-009',
  { expect: 'valid' });

check('an empty string is reported against minLength',
  { type: 'string', minLength: 1 }, '',
  { expect: 'invalid', mentions: 'shorter than 1' });

check('a bad array item is reported with its index',
  { type: 'array', items: { type: 'string' } }, ['a', 7],
  { expect: 'invalid', mentions: '#/1' });

check('minItems and maxItems are both enforced',
  { type: 'array', minItems: 1, maxItems: 0 }, [],
  { expect: 'invalid', mentions: 'at least 1' });

check('a bad property NAME is reported by propertyNames',
  { type: 'object', propertyNames: { pattern: '^[A-Z]+$' }, additionalProperties: true },
  { lower: 1 },
  { expect: 'invalid', mentions: '(name)' });

// The registries lean on if/then to make a status word actually constrain the
// row: an unrecoverable requirement must carry a null statement. A validator
// that ignored `if` would accept the contradiction without a word.
const conditional = {
  type: 'object',
  properties: { provenance: { enum: ['reconstructed', 'unrecoverable'] }, statement: { type: ['string', 'null'] } },
  allOf: [{
    if: { properties: { provenance: { const: 'unrecoverable' } } },
    then: { properties: { statement: { type: 'null' } } },
  }],
};
check('if/then catches a statement on an unrecoverable row',
  conditional, { provenance: 'unrecoverable', statement: 'invented' },
  { expect: 'invalid', mentions: 'expected null' });

check('if/then leaves a reconstructed row alone',
  conditional, { provenance: 'reconstructed', statement: 'recovered' },
  { expect: 'valid' });

check('a $ref into $defs is resolved',
  { $defs: { row: { type: 'object', required: ['id'] } }, type: 'array', items: { $ref: '#/$defs/row' } },
  [{}],
  { expect: 'invalid', mentions: 'missing required property id' });

const unknown = assertKnownKeywords({ type: 'object', properties: { a: { multipleOf: 2 } } });
if (unknown.length === 1 && unknown[0] === '#/properties/a/multipleOf') {
  console.log('  ok  an unsupported keyword is reported rather than ignored');
} else {
  failures += 1;
  console.error(`  FAIL  an unsupported keyword is reported rather than ignored: got ${JSON.stringify(unknown)}`);
}

if (failures) {
  console.error(`\njson-schema selftest: ${failures} case(s) failed`);
  process.exit(1);
}
console.log('json-schema selftest: ok');
