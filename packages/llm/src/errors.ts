/**
 * Named LLM failure modes.
 *
 * The analyzer must not swallow LLM failures silently. Each distinct failure
 * mode raises its own error class (with a stable `code`) so callers can decide
 * whether to retry, degrade, or surface the failure to the operator — and so
 * observability tooling can count each mode independently.
 */

export class LlmError extends Error {
  readonly code: string;

  constructor(message: string, code: string) {
    super(message);
    this.name = new.target.name;
    this.code = code;
  }
}

/** The model returned empty or whitespace-only content. */
export class LlmEmptyResponseError extends LlmError {
  constructor() {
    super('LLM returned an empty response', 'llm_empty_response');
  }
}

/** The model returned content that is not valid JSON (hallucinated or malformed). */
export class LlmMalformedJsonError extends LlmError {
  constructor() {
    super('LLM returned malformed JSON', 'llm_malformed_json');
  }
}

/** The model refused the request (safety refusal, finishReason=error, or refusal text). */
export class LlmRefusalError extends LlmError {
  constructor() {
    super('LLM refused the request', 'llm_refusal');
  }
}
