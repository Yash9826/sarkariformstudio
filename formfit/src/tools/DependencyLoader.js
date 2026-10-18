(function (root) {
  'use strict';
  const NS = (root.SarkariFormStudio = root.SarkariFormStudio || {});
  const { DependencyError, Logger, PerfTimer } = NS;

  class DependencyLoader {
    #log = Logger.for('DependencyLoader');
    #promises = new Map();
    #dependencies = Object.freeze({
      'pdf-lib': { file: 'vendor/pdf-lib.min.js', global: () => root.PDFLib },
      pdfjs: { file: 'vendor/pdf.min.js', global: () => root.pdfjsLib },
      heic2any: { file: 'vendor/heic2any.min.js', global: () => root.heic2any },
    });

    load(id) {
      if (this.#promises.has(id)) return this.#promises.get(id);
      const dependency = this.#dependencies[id];
      if (!dependency) return Promise.reject(new DependencyError(`Unknown dependency "${id}"`));
      const timer = new PerfTimer(`dependency-${id}`);
      const promise = new Promise((resolve, reject) => {
        const existing = dependency.global();
        if (existing) {
          resolve(existing);
          return;
        }
        const script = document.createElement('script');
        const timeout = setTimeout(() => {
          script.remove();
          reject(new DependencyError(`Timed out loading ${id}`, { code: 'DEPENDENCY_LOAD_FAILED' }));
        }, 15000);
        script.src = dependency.file;
        script.async = true;
        script.onload = () => {
          clearTimeout(timeout);
          const loaded = dependency.global();
          if (!loaded) {
            reject(new DependencyError(`${id} script did not expose its global`, { code: 'DEPENDENCY_LOAD_FAILED' }));
            return;
          }
          if (id === 'pdfjs') loaded.GlobalWorkerOptions.workerSrc = 'vendor/pdf.worker.min.js';
          resolve(loaded);
        };
        script.onerror = () => {
          clearTimeout(timeout);
          reject(new DependencyError(`Could not load ${id}`, { code: 'DEPENDENCY_LOAD_FAILED' }));
        };
        document.head.append(script);
      }).then((value) => {
        this.#log.info('Dependency loaded', { id, durationMs: Math.round(timer.finish()) });
        return value;
      }).catch((error) => {
        timer.finish();
        this.#promises.delete(id);
        throw error;
      });
      this.#promises.set(id, promise);
      return promise;
    }
  }

  NS.DependencyLoader = DependencyLoader;
})(typeof window !== 'undefined' ? window : globalThis);
