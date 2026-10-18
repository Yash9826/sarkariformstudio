/**
 * Error hierarchy for SarkariFormStudio.
 *
 * Every error carries:
 *  - `code`        a stable machine-readable identifier (useful in logs/tests)
 *  - `userMessage` a short, friendly sentence that is safe to show in the UI
 *  - `details`     optional structured data for logs (never shown to users)
 */
(function (root) {
  'use strict';
  const NS = (root.SarkariFormStudio = root.SarkariFormStudio || {});

  class SarkariFormStudioError extends Error {
    constructor(message, options = {}) {
      super(message);
      this.name = new.target.name;
      this.code = options.code || 'SARKARIFORMSTUDIO_ERROR';
      this.userMessage = options.userMessage || 'Something went wrong. Please try again.';
      this.details = options.details;
      if (options.cause) this.cause = options.cause;
    }

    /** Turns any thrown value into a SarkariFormStudioError so the UI can treat all errors the same way. */
    static wrap(error, fallbackUserMessage) {
      if (error instanceof SarkariFormStudioError) return error;
      const message = error && error.message ? error.message : String(error);
      return new SarkariFormStudioError(message, {
        code: 'UNEXPECTED',
        userMessage: fallbackUserMessage || 'An unexpected error occurred. Please try again.',
        cause: error,
      });
    }
  }

  /** Bad input typed by the user (e.g. negative width in the custom form). */
  class ValidationError extends SarkariFormStudioError {
    constructor(message, options = {}) {
      super(message, { code: 'INVALID_INPUT', ...options });
    }
  }

  /** Problems with the exam/rule data itself (developer-facing, but shown gracefully). */
  class RuleError extends SarkariFormStudioError {
    constructor(message, options = {}) {
      super(message, {
        code: 'INVALID_RULE',
        userMessage: 'These requirements look invalid. Please check the values you entered.',
        ...options,
      });
    }
  }

  /** The uploaded file could not be read or decoded. */
  class ImageLoadError extends SarkariFormStudioError {
    constructor(message, options = {}) {
      super(message, { code: 'IMAGE_LOAD_FAILED', ...options });
    }
  }

  /** The image could not be encoded within the required limits. */
  class CompressionError extends SarkariFormStudioError {
    constructor(message, options = {}) {
      super(message, { code: 'COMPRESSION_FAILED', ...options });
    }
  }

  /** Zip/file export problems. */
  class ExportError extends SarkariFormStudioError {
    constructor(message, options = {}) {
      super(message, {
        code: 'EXPORT_FAILED',
        userMessage: 'Could not prepare your download. Please try again.',
        ...options,
      });
    }
  }

  class ProcessingError extends SarkariFormStudioError {
    constructor(message, options = {}) {
      super(message, {
        code: 'STAGE_FAILED',
        userMessage: 'Your picture was not changed. Try turning that enhancement off.',
        ...options,
      });
    }
  }

  class ConversionError extends SarkariFormStudioError {
    constructor(message, options = {}) {
      super(message, {
        code: 'CONVERSION_FAILED',
        userMessage: 'Could not convert that file. Please check it and try again.',
        ...options,
      });
    }
  }

  class DependencyError extends SarkariFormStudioError {
    constructor(message, options = {}) {
      super(message, {
        code: 'DEPENDENCY_LOAD_FAILED',
        userMessage: 'Could not load the PDF engine. Reload the page and try again.',
        ...options,
      });
    }
  }

  class ModelError extends SarkariFormStudioError {
    constructor(message, options = {}) {
      const userMessages = {
        MODEL_DOWNLOAD_FAILED: 'Could not download the AI model. Check your connection and try again, or use basic mode.',
        MODEL_CORRUPT: 'The AI model file looks damaged. Please reload and try again.',
        WORKER_UNAVAILABLE: 'This browser cannot run the AI tool. Basic mode was used instead.',
        INFERENCE_TIMEOUT: 'This is taking too long. Try a smaller picture.',
        OUT_OF_MEMORY: 'Your device ran out of memory. Close other tabs or use a smaller picture.',
      };
      super(message, {
        code: 'MODEL_ERROR',
        userMessage: userMessages[options.code] || 'The AI model is unavailable. You can continue in basic mode.',
        ...options,
      });
    }
  }

  class FaceError extends SarkariFormStudioError {
    constructor(message, options = {}) {
      super(message, {
        code: 'FACE_ERROR',
        userMessage: 'Could not analyse the face. Adjust the framing manually.',
        ...options,
      });
    }
  }

  Object.assign(NS, {
    SarkariFormStudioError, ValidationError, RuleError, ImageLoadError, CompressionError, ExportError,
    ProcessingError, ConversionError, DependencyError, ModelError, FaceError,
  });
})(typeof window !== 'undefined' ? window : globalThis);
