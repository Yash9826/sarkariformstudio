(function (root) {
  'use strict';
  const NS = (root.SarkariFormStudio = root.SarkariFormStudio || {});
  const { ProcessingError, Logger, PerfTimer } = NS;

  class ProcessingPipeline {
    #stages;
    #log = Logger.for('ProcessingPipeline');

    constructor(stages = []) {
      if (!Array.isArray(stages) || stages.some((stage) => !stage || typeof stage.apply !== 'function' || typeof stage.isEnabled !== 'function')) {
        throw new TypeError('Pipeline stages must implement isEnabled and apply');
      }
      this.#stages = Object.freeze([...stages]);
    }

    async run(canvas, context = {}, onProgress = () => {}) {
      const enabled = this.#stages.filter((stage) => stage.isEnabled(context.options, context));
      let output = canvas;
      this.#log.info('Processing started', { stages: enabled.map((stage) => stage.id) });
      for (let i = 0; i < enabled.length; i++) {
        const stage = enabled[i];
        const timer = new PerfTimer(stage.id);
        onProgress(enabled.length ? Math.round((i / enabled.length) * 100) : 100, `Enhancing: ${stage.label}…`);
        try {
          output = await stage.apply(output, context.options || {}, context);
          if (!output) {
            throw new TypeError('Stage did not return an image canvas');
          }
          const durationMs = Math.round(timer.finish());
          this.#log.info('Stage complete', { id: stage.id, durationMs });
        } catch (error) {
          timer.finish();
          this.#log.error('Stage failed', { id: stage.id, error });
          throw new ProcessingError(`Stage "${stage.id}" failed: ${error.message || error}`, {
            details: { stageId: stage.id },
            cause: error,
            userMessage: `Could not apply ${stage.label.toLowerCase()}. Your picture was not changed. Try turning that option off.`,
          });
        }
      }
      onProgress(100, 'Enhancements complete');
      return output;
    }
  }

  NS.ProcessingPipeline = ProcessingPipeline;
})(typeof window !== 'undefined' ? window : globalThis);
