import { createModel } from './model.js';
import { FoundationsError } from './errors.js';
import { checkOptions } from './schema.js';
export { loadPackage, parseJSON, digest } from './io.js';
export { FoundationsError } from './errors.js';

const unit = document => ({ document, file: '<memory>', dependencies: new Map(), locations: new Map() });
const toUnit = input => input && typeof input === 'object' && input.dependencies instanceof Map && Object.hasOwn(input, 'document') ? input : unit(input);
export function validate(input, options = {}) {
  try {
    checkOptions(options);
    const model = createModel(toUnit(input), options);
    model.checkContext(options);
    return { valid: true, errors: [], ...model.validateAll() };
  } catch (error) {
    if (!(error instanceof FoundationsError)) throw error;
    return { valid: false, errors: [error.toJSON()] };
  }
}
export function resolve(input, options = {}) {
  checkOptions(options);
  const model = createModel(toUnit(input), options);
  model.checkContext(options);
  model.validateAll();
  return model.resolve(options);
}
