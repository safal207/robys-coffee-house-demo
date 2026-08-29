import { fail, ok, text } from "./causal-refactoring-core.mjs";

export const DEFAULT_SHAPE_SCHEMA = "qa/causal-refactoring/robys-fcr-v0.1.schema.json";
export const JSON_SCHEMA_DRAFT = "https://json-schema.org/draft/2020-12/schema";

const SUPPORTED_KEYWORDS = new Set([
  "$schema", "$id", "$ref", "$defs", "title", "description",
  "type", "const", "enum", "additionalProperties", "required",
  "properties", "minItems", "maxItems", "uniqueItems", "items",
  "allOf", "contains", "minLength"
]);
const SUPPORTED_TYPES = new Set([
  "object", "array", "string", "boolean", "number", "integer", "null"
]);

function isObject(value) {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function canonicalJson(value) {
  if (value === null || typeof value === "string" || typeof value === "boolean") {
    return JSON.stringify(value);
  }
  if (typeof value === "number") {
    ok(Number.isFinite(value), "schema values must be valid JSON numbers");
    return JSON.stringify(value);
  }
  if (Array.isArray(value)) {
    return `[${value.map((item) => canonicalJson(item)).join(",")}]`;
  }
  if (isObject(value)) {
    return `{${Object.keys(value).sort().map((key) => (
      `${JSON.stringify(key)}:${canonicalJson(value[key])}`
    )).join(",")}}`;
  }
  fail("schema values must be valid JSON");
}

function deepEqual(left, right) {
  return canonicalJson(left) === canonicalJson(right);
}

function childPath(parent, key) {
  return /^[A-Za-z_$][A-Za-z0-9_$]*$/u.test(key)
    ? `${parent}.${key}`
    : `${parent}[${JSON.stringify(key)}]`;
}

function decodePointerToken(token) {
  return token.replaceAll("~1", "/").replaceAll("~0", "~");
}

function resolveLocalReference(root, reference, label) {
  ok(
    typeof reference === "string" && reference.startsWith("#/"),
    `${label} must be a local JSON Pointer beginning with #/`
  );
  let current = root;
  for (const token of reference.slice(2).split("/").map(decodePointerToken)) {
    ok(
      (isObject(current) || Array.isArray(current)) && Object.hasOwn(current, token),
      `${label} cannot resolve ${reference}`
    );
    current = current[token];
  }
  ok(isObject(current), `${label} must resolve to a schema object`);
  return current;
}

function nonNegativeInteger(value, label) {
  ok(Number.isInteger(value) && value >= 0, `${label} must be a non-negative integer`);
}

function uniqueStringArray(value, label, { allowEmpty = true } = {}) {
  ok(Array.isArray(value), `${label} must be an array`);
  if (!allowEmpty) ok(value.length > 0, `${label} must not be empty`);
  const seen = new Set();
  value.forEach((item, index) => {
    text(item, `${label}[${index}]`);
    ok(!seen.has(item), `${label} contains duplicate ${item}`);
    seen.add(item);
  });
  return seen;
}

function inspectSchemaNode(node, label, root, inspectedReferences) {
  ok(isObject(node), `${label} must be a schema object`);

  for (const keyword of Object.keys(node)) {
    ok(
      SUPPORTED_KEYWORDS.has(keyword),
      `${label} uses unsupported JSON Schema keyword ${keyword}`
    );
  }

  if (Object.hasOwn(node, "$schema")) text(node.$schema, `${label}.$schema`);
  if (Object.hasOwn(node, "$id")) text(node.$id, `${label}.$id`);
  if (Object.hasOwn(node, "title")) text(node.title, `${label}.title`);
  if (Object.hasOwn(node, "description")) text(node.description, `${label}.description`);

  if (Object.hasOwn(node, "type")) {
    ok(
      typeof node.type === "string" && SUPPORTED_TYPES.has(node.type),
      `${label}.type is unsupported: ${node.type}`
    );
  }

  if (Object.hasOwn(node, "enum")) {
    ok(Array.isArray(node.enum) && node.enum.length > 0, `${label}.enum must be a non-empty array`);
    const canonicalValues = node.enum.map(canonicalJson);
    ok(new Set(canonicalValues).size === canonicalValues.length, `${label}.enum contains duplicate values`);
  }

  if (Object.hasOwn(node, "additionalProperties")) {
    ok(
      typeof node.additionalProperties === "boolean",
      `${label}.additionalProperties must be boolean in the supported subset`
    );
  }

  let required = new Set();
  if (Object.hasOwn(node, "required")) {
    required = uniqueStringArray(node.required, `${label}.required`);
  }

  if (Object.hasOwn(node, "properties")) {
    ok(isObject(node.properties), `${label}.properties must be an object`);
    for (const [key, child] of Object.entries(node.properties)) {
      inspectSchemaNode(child, `${label}.properties[${JSON.stringify(key)}]`, root, inspectedReferences);
    }
    for (const key of required) {
      ok(Object.hasOwn(node.properties, key), `${label}.required references undeclared property ${key}`);
    }
  } else {
    ok(required.size === 0, `${label}.required requires a properties object`);
  }

  if (Object.hasOwn(node, "$defs")) {
    ok(isObject(node.$defs), `${label}.$defs must be an object`);
    for (const [key, child] of Object.entries(node.$defs)) {
      inspectSchemaNode(child, `${label}.$defs[${JSON.stringify(key)}]`, root, inspectedReferences);
    }
  }

  if (Object.hasOwn(node, "items")) {
    inspectSchemaNode(node.items, `${label}.items`, root, inspectedReferences);
  }
  if (Object.hasOwn(node, "contains")) {
    inspectSchemaNode(node.contains, `${label}.contains`, root, inspectedReferences);
  }
  if (Object.hasOwn(node, "allOf")) {
    ok(Array.isArray(node.allOf) && node.allOf.length > 0, `${label}.allOf must be a non-empty array`);
    node.allOf.forEach((child, index) => (
      inspectSchemaNode(child, `${label}.allOf[${index}]`, root, inspectedReferences)
    ));
  }

  if (Object.hasOwn(node, "minItems")) nonNegativeInteger(node.minItems, `${label}.minItems`);
  if (Object.hasOwn(node, "maxItems")) nonNegativeInteger(node.maxItems, `${label}.maxItems`);
  if (Object.hasOwn(node, "minItems") && Object.hasOwn(node, "maxItems")) {
    ok(node.minItems <= node.maxItems, `${label}.minItems must not exceed maxItems`);
  }
  if (Object.hasOwn(node, "uniqueItems")) {
    ok(typeof node.uniqueItems === "boolean", `${label}.uniqueItems must be boolean`);
  }
  if (Object.hasOwn(node, "minLength")) nonNegativeInteger(node.minLength, `${label}.minLength`);

  if (Object.hasOwn(node, "$ref")) {
    const reference = node.$ref;
    const target = resolveLocalReference(root, reference, `${label}.$ref`);
    if (!inspectedReferences.has(reference)) {
      inspectedReferences.add(reference);
      inspectSchemaNode(target, `${label}.$ref(${reference})`, root, inspectedReferences);
    }
  }
}

export function parseJsonDocument(source, label) {
  text(source, `${label} source`);
  try {
    return JSON.parse(source);
  } catch (error) {
    fail(`${label} is not valid JSON: ${error.message}`);
  }
}

export function validateSchemaDocument(schema) {
  ok(isObject(schema), "shape schema must be an object");
  ok(schema.$schema === JSON_SCHEMA_DRAFT, `shape schema $schema must equal ${JSON_SCHEMA_DRAFT}`);
  text(schema.$id, "shape schema $id");
  ok(schema.type === "object", "shape schema root type must be object");
  inspectSchemaNode(schema, "shape schema", schema, new Set());
  return {
    schema_id: schema.$id,
    draft: schema.$schema,
    validator: "dependency-free-supported-subset"
  };
}

function matchesType(value, type) {
  if (type === "object") return isObject(value);
  if (type === "array") return Array.isArray(value);
  if (type === "string") return typeof value === "string";
  if (type === "boolean") return typeof value === "boolean";
  if (type === "number") return typeof value === "number" && Number.isFinite(value);
  if (type === "integer") return Number.isInteger(value);
  if (type === "null") return value === null;
  return false;
}

function collectValidationErrors(node, value, instancePath, root, referenceStack = []) {
  const errors = [];

  if (Object.hasOwn(node, "$ref")) {
    const reference = node.$ref;
    if (referenceStack.includes(reference)) {
      errors.push(`${instancePath}: cyclic $ref ${reference} is not supported`);
    } else {
      const target = resolveLocalReference(root, reference, `${instancePath} schema $ref`);
      errors.push(...collectValidationErrors(
        target,
        value,
        instancePath,
        root,
        [...referenceStack, reference]
      ));
    }
  }

  if (Object.hasOwn(node, "allOf")) {
    node.allOf.forEach((child) => {
      errors.push(...collectValidationErrors(child, value, instancePath, root, referenceStack));
    });
  }

  if (Object.hasOwn(node, "const") && !deepEqual(value, node.const)) {
    errors.push(`${instancePath}: value must equal const ${canonicalJson(node.const)}`);
  }
  if (Object.hasOwn(node, "enum") && !node.enum.some((candidate) => deepEqual(value, candidate))) {
    errors.push(`${instancePath}: value is not in enum`);
  }

  if (Object.hasOwn(node, "type") && !matchesType(value, node.type)) {
    errors.push(`${instancePath}: expected type ${node.type}`);
    return errors;
  }

  if (isObject(value)) {
    for (const requiredKey of node.required ?? []) {
      if (!Object.hasOwn(value, requiredKey)) {
        errors.push(`${childPath(instancePath, requiredKey)}: required property is missing`);
      }
    }

    const properties = node.properties ?? {};
    for (const [key, child] of Object.entries(properties)) {
      if (Object.hasOwn(value, key)) {
        errors.push(...collectValidationErrors(
          child,
          value[key],
          childPath(instancePath, key),
          root,
          referenceStack
        ));
      }
    }

    if (node.additionalProperties === false) {
      for (const key of Object.keys(value)) {
        if (!Object.hasOwn(properties, key)) {
          errors.push(`${childPath(instancePath, key)}: additional property is not allowed`);
        }
      }
    }
  }

  if (Array.isArray(value)) {
    if (Object.hasOwn(node, "minItems") && value.length < node.minItems) {
      errors.push(`${instancePath}: expected at least ${node.minItems} item(s)`);
    }
    if (Object.hasOwn(node, "maxItems") && value.length > node.maxItems) {
      errors.push(`${instancePath}: expected at most ${node.maxItems} item(s)`);
    }
    if (node.uniqueItems === true) {
      const canonicalItems = value.map(canonicalJson);
      if (new Set(canonicalItems).size !== canonicalItems.length) {
        errors.push(`${instancePath}: items must be unique`);
      }
    }
    if (node.items) {
      value.forEach((item, index) => {
        errors.push(...collectValidationErrors(
          node.items,
          item,
          `${instancePath}[${index}]`,
          root,
          referenceStack
        ));
      });
    }
    if (node.contains) {
      const containsMatch = value.some((item, index) => (
        collectValidationErrors(
          node.contains,
          item,
          `${instancePath}[${index}]`,
          root,
          referenceStack
        ).length === 0
      ));
      if (!containsMatch) errors.push(`${instancePath}: no item satisfies contains`);
    }
  }

  if (typeof value === "string" && Object.hasOwn(node, "minLength")) {
    if ([...value].length < node.minLength) {
      errors.push(`${instancePath}: string length must be at least ${node.minLength}`);
    }
  }

  return errors;
}

export function validateInstanceAgainstSchema(schema, instance) {
  const metadata = validateSchemaDocument(schema);
  const errors = collectValidationErrors(schema, instance, "$", schema);
  if (errors.length > 0) {
    fail(`shape schema validation failed (${errors.length}): ${errors.slice(0, 8).join("; ")}`);
  }
  return { ...metadata, result: "PASS" };
}
