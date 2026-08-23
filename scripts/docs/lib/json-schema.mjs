/**
 * A deterministic validator for the subset of JSON Schema the registries use.
 *
 * The repository takes no runtime dependency it does not need, and a schema
 * that nothing executes is decoration: it drifts from the data silently, which
 * is the exact failure this documentation work exists to prevent. The subset
 * below is closed and small, so owning it is cheaper than owning a dependency.
 *
 * Supported: type, enum, const, pattern, minLength, required, properties,
 * additionalProperties, propertyNames, items, minItems, maxItems, allOf,
 * if/then/else, and $ref limited to `#/$defs/<name>`.
 *
 * Anything else in a schema is ignored rather than silently treated as passing,
 * because `assertKnownKeywords` reports it. A typo in a schema is a defect in
 * the gate, not in the data.
 */

const ANNOTATIONS = new Set(['$schema', '$id', 'title', 'description', '$defs', 'default', 'examples']);
const KEYWORDS = new Set([
  'type', 'enum', 'const', 'pattern', 'minLength', 'required', 'properties',
  'additionalProperties', 'propertyNames', 'items', 'minItems', 'maxItems',
  'allOf', 'if', 'then', 'else', '$ref',
]);

function typeOf(value) {
  if (value === null) return 'null';
  if (Array.isArray(value)) return 'array';
  if (Number.isInteger(value)) return 'integer';
  return typeof value;
}

function matchesType(value, expected) {
  const actual = typeOf(value);
  if (expected === 'number') return actual === 'number' || actual === 'integer';
  if (expected === 'integer') return actual === 'integer';
  return actual === expected;
}

/** Report every schema keyword this validator would silently skip. */
export function assertKnownKeywords(schema, path = '#') {
  const unknown = [];
  const walk = (node, at) => {
    if (node === null || typeof node !== 'object') return;
    if (Array.isArray(node)) {
      node.forEach((child, i) => walk(child, `${at}/${i}`));
      return;
    }
    for (const [key, child] of Object.entries(node)) {
      if (ANNOTATIONS.has(key)) {
        // `$defs` maps definition NAMES to schemas, so its own keys are not
        // keywords. Walking it as an ordinary node would report every
        // definition name as an unknown keyword.
        if (key === '$defs') {
          for (const [name, sub] of Object.entries(child ?? {})) walk(sub, `${at}/$defs/${name}`);
        }
        continue;
      }
      if (!KEYWORDS.has(key)) {
        unknown.push(`${at}/${key}`);
        continue;
      }
      if (key === 'required' || key === 'enum' || key === 'const' || key === 'type') continue;
      if (key === 'properties' || key === 'propertyNames') {
        if (key === 'properties') {
          for (const [name, sub] of Object.entries(child ?? {})) walk(sub, `${at}/properties/${name}`);
        } else walk(child, `${at}/propertyNames`);
        continue;
      }
      walk(child, `${at}/${key}`);
    }
  };
  walk(schema, path);
  return unknown;
}

function resolve(schema, root) {
  if (!schema || typeof schema !== 'object' || !schema.$ref) return schema;
  const match = /^#\/\$defs\/([A-Za-z0-9_-]+)$/.exec(schema.$ref);
  if (!match) throw new Error(`unsupported $ref: ${schema.$ref}`);
  const target = root.$defs?.[match[1]];
  if (!target) throw new Error(`unresolved $ref: ${schema.$ref}`);
  return target;
}

function check(schema, value, path, root, errors) {
  const node = resolve(schema, root);
  if (node === true || node === undefined) return;
  if (node === false) {
    errors.push(`${path}: not permitted here`);
    return;
  }

  if (node.type !== undefined) {
    const expected = Array.isArray(node.type) ? node.type : [node.type];
    if (!expected.some((t) => matchesType(value, t))) {
      errors.push(`${path}: expected ${expected.join(' or ')}, got ${typeOf(value)}`);
      return; // Every keyword below assumes the type held.
    }
  }
  if (node.enum !== undefined && !node.enum.some((c) => JSON.stringify(c) === JSON.stringify(value))) {
    errors.push(`${path}: ${JSON.stringify(value)} is not one of ${node.enum.map((c) => JSON.stringify(c)).join(', ')}`);
  }
  if (node.const !== undefined && JSON.stringify(node.const) !== JSON.stringify(value)) {
    errors.push(`${path}: expected ${JSON.stringify(node.const)}`);
  }
  if (typeof value === 'string') {
    if (node.pattern !== undefined && !new RegExp(node.pattern).test(value)) {
      errors.push(`${path}: ${JSON.stringify(value)} does not match ${node.pattern}`);
    }
    if (node.minLength !== undefined && value.length < node.minLength) {
      errors.push(`${path}: shorter than ${node.minLength} characters`);
    }
  }
  if (Array.isArray(value)) {
    if (node.minItems !== undefined && value.length < node.minItems) {
      errors.push(`${path}: expected at least ${node.minItems} items, got ${value.length}`);
    }
    if (node.maxItems !== undefined && value.length > node.maxItems) {
      errors.push(`${path}: expected at most ${node.maxItems} items, got ${value.length}`);
    }
    if (node.items !== undefined) {
      value.forEach((item, i) => check(node.items, item, `${path}/${i}`, root, errors));
    }
  }
  if (value !== null && typeOf(value) === 'object') {
    for (const name of node.required ?? []) {
      if (!Object.hasOwn(value, name)) errors.push(`${path}: missing required property ${name}`);
    }
    const declared = node.properties ?? {};
    for (const [name, child] of Object.entries(value)) {
      if (node.propertyNames !== undefined) {
        check(node.propertyNames, name, `${path}/${name} (name)`, root, errors);
      }
      if (Object.hasOwn(declared, name)) {
        check(declared[name], child, `${path}/${name}`, root, errors);
        continue;
      }
      if (node.additionalProperties === false) {
        errors.push(`${path}: unexpected property ${name}`);
      } else if (node.additionalProperties !== undefined) {
        check(node.additionalProperties, child, `${path}/${name}`, root, errors);
      }
    }
  }
  for (const branch of node.allOf ?? []) check(branch, value, path, root, errors);
  if (node.if !== undefined) {
    const probe = [];
    check(node.if, value, path, root, probe);
    const taken = probe.length === 0 ? node.then : node.else;
    if (taken !== undefined) check(taken, value, path, root, errors);
  }
}

/** Validate `value` against `schema`. Returns a list of human-readable errors. */
export function validate(schema, value, path = '#') {
  const errors = [];
  check(schema, value, path, schema, errors);
  return errors;
}
