'use strict';

const path = require('node:path');
const SwaggerParser = require('@apidevtools/swagger-parser');
const Ajv2020 = require('ajv/dist/2020');
const addFormats = require('ajv-formats');

const defaultSpecPath = path.join(__dirname, '..', '..', 'docs', 'api', 'bot-v1.yaml');

async function loadOpenApi(specPath = defaultSpecPath) {
  const api = await SwaggerParser.validate(specPath);
  const dereferenced = await SwaggerParser.dereference(specPath);
  return { api, dereferenced };
}

function responseSchema(document, { requestPath, method, status }) {
  const pathItem = document.paths?.[requestPath];
  const operation = pathItem?.[String(method || 'get').toLowerCase()];
  if (!operation) {
    throw new Error(`El contrato no define ${method} ${requestPath}.`);
  }
  const response = operation.responses?.[String(status)];
  const schema = response?.content?.['application/json']?.schema;
  if (!schema) {
    throw new Error(`El contrato no define JSON para ${method} ${requestPath} ${status}.`);
  }
  return schema;
}

function compileSchema(schema) {
  const ajv = new Ajv2020({ allErrors: true, strict: false });
  addFormats(ajv);
  return ajv.compile(schema);
}

async function validateResponse({ specPath, requestPath, method, status, body }) {
  const { dereferenced } = await loadOpenApi(specPath);
  const validate = compileSchema(responseSchema(dereferenced, { requestPath, method, status }));
  const valid = validate(body);
  return { valid, errors: validate.errors || [] };
}

module.exports = {
  defaultSpecPath,
  loadOpenApi,
  validateResponse
};
