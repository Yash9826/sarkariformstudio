(function (root) {
  'use strict';
  const NS = (root.SarkariFormStudio = root.SarkariFormStudio || {});
  const { FaceError, Logger } = NS;

  class FaceAnalyzer {
    #modelLoader;
    #landmarker = null;
    #loading = null;
    #log = Logger.for('FaceAnalyzer');

    constructor({ modelLoader }) {
      this.#modelLoader = modelLoader;
    }

    /** Detects up to three faces in a decoded local image. */
    async analyze(image, width, height, { signal, onProgress = () => {} } = {}) {
      if (!image || !(width > 0) || !(height > 0)) throw new FaceError('Face analysis requires a decoded image');
      if (signal && signal.aborted) throw this.#cancelled();
      try {
        await this.#ensureLoaded({ signal, onProgress });
        if (signal && signal.aborted) throw this.#cancelled();
        const canvas = root.document.createElement('canvas');
        canvas.width = width;
        canvas.height = height;
        let result;
        try {
          canvas.getContext('2d').putImageData(image, 0, 0);
          result = this.#landmarker.detect(canvas);
        } finally {
          canvas.width = canvas.height = 0;
        }
        const faces = result.faceLandmarks.map((landmarks) => FaceAnalyzer.metrics(landmarks, width, height)).filter(Boolean);
        this.#log.info('Face analysis finished', { faceCount: faces.length });
        return { faceCount: faces.length, faces };
      } catch (cause) {
        if (cause && cause.code === 'CANCELLED') throw cause;
        this.#log.warn('Face analysis unavailable; manual framing remains available', { message: cause && cause.message });
        throw new FaceError(`Face analysis failed: ${cause && cause.message ? cause.message : cause}`, {
          code: 'FACE_ANALYSIS_FAILED',
          userMessage: 'Could not analyse the face. Adjust the framing manually.',
          cause,
        });
      }
    }

    close() {
      if (this.#landmarker) this.#landmarker.close();
      this.#landmarker = null;
      this.#loading = null;
    }

    static metrics(landmarks, width, height) {
      if (!Array.isArray(landmarks) || landmarks.length <= 362) return null;
      const pixel = (index) => ({ x: landmarks[index].x * width, y: landmarks[index].y * height });
      const midpoint = (first, second) => ({ x: (first.x + second.x) / 2, y: (first.y + second.y) / 2 });
      const leftEye = midpoint(pixel(33), pixel(133));
      const rightEye = midpoint(pixel(263), pixel(362));
      const noseTip = pixel(1);
      const chin = pixel(152);
      const faceLeft = Math.min(...landmarks.map((point) => point.x)) * width;
      const faceRight = Math.max(...landmarks.map((point) => point.x)) * width;
      const top = Math.min(...landmarks.map((point) => point.y)) * height;
      const bottom = Math.max(...landmarks.map((point) => point.y)) * height;
      const eyeLeft = leftEye.x <= rightEye.x ? leftEye : rightEye;
      const eyeRight = leftEye.x <= rightEye.x ? rightEye : leftEye;
      return {
        chinY: chin.y,
        eyeLeft,
        eyeRight,
        noseTip,
        faceCentreX: (eyeLeft.x + eyeRight.x + noseTip.x) / 3,
        headTopY: top,
        width: faceRight - faceLeft,
        area: Math.max(0, (faceRight - faceLeft) * (bottom - top)),
        rollDeg: Math.atan2(eyeRight.y - eyeLeft.y, eyeRight.x - eyeLeft.x) * 180 / Math.PI,
      };
    }

    async #ensureLoaded({ signal, onProgress }) {
      if (this.#landmarker) return;
      if (!this.#loading) {
        this.#loading = (async () => {
          if (!root.Vision || !root.Vision.FilesetResolver || !root.Vision.FaceLandmarker) {
            throw new FaceError('MediaPipe Vision bundle is unavailable', {
              code: 'WORKER_UNAVAILABLE',
              userMessage: 'Could not analyse the face. Adjust the framing manually.',
            });
          }
          const wasmRoot = new URL('vendor/mediapipe/wasm/', root.location.href).href;
          const wasmFileset = await root.Vision.FilesetResolver.forVisionTasks(wasmRoot);
          const buffer = await this.#modelLoader.load({ signal, onProgress });
          if (signal && signal.aborted) throw this.#cancelled();
          this.#landmarker = await root.Vision.FaceLandmarker.createFromOptions(wasmFileset, {
            baseOptions: { modelAssetBuffer: new Uint8Array(buffer) },
            runningMode: 'IMAGE',
            numFaces: 3,
            minFaceDetectionConfidence: 0.5,
            minFacePresenceConfidence: 0.5,
          });
        })().finally(() => { this.#loading = null; });
      }
      await this.#loading;
    }

    #cancelled() {
      return new FaceError('Face analysis was cancelled', {
        code: 'CANCELLED',
        userMessage: 'Cancelled. Nothing was changed.',
      });
    }
  }

  NS.FaceAnalyzer = FaceAnalyzer;
})(typeof window !== 'undefined' ? window : globalThis);
