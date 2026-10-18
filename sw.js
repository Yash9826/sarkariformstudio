/* Offline cache. Bump CACHE_VERSION whenever any file changes. */
const CACHE_VERSION = 'sarkariformstudio-v3';
const MODEL_CACHE = 'sarkariformstudio-model-v1';
const ASSETS = [
  './', 'index.html', 'manifest.webmanifest', 'assets/icon.svg', 'css/styles.css',
  'data/exam-data.js', 'data/background-colors.js', 'data/photo-presets.js', 'data/site-config.js', 'data/tool-registry.js', 'data/model-manifest.js',
  'src/core/Errors.js', 'src/core/Logger.js', 'src/core/PerfTimer.js', 'src/core/Units.js', 'src/core/SafeStorage.js',
  'src/domain/RuleProfile.js', 'src/domain/ExamRegistry.js', 'src/domain/RuleValidator.js',
  'src/image/CropSession.js', 'src/image/EnhanceOptions.js', 'src/image/ColorMath.js', 'src/image/LevelsAdjuster.js',
  'src/image/BoxBlur.js', 'src/image/MorphologyOps.js', 'src/image/InkExtractor.js',
  'src/image/BackgroundMasker.js', 'src/image/DateFormatter.js',
  'src/image/stages/ImageStage.js', 'src/image/stages/AdjustStage.js', 'src/image/stages/BackgroundStage.js',
  'src/image/stages/SignatureCleanupStage.js', 'src/image/stages/DateStampStage.js',
  'src/image/ProcessingPipeline.js',
  'src/image/ImageLoader.js', 'src/image/ImageProcessor.js',
  'src/image/JpegPadder.js', 'src/image/JpegCompressor.js', 'src/export/ZipBuilder.js',
  'src/ai/GuidedFilter.js', 'src/ai/AlphaRefiner.js', 'src/ai/BrushMask.js', 'src/ai/Compositor.js', 'src/ai/CutoutCache.js',
  'src/ai/ModelLoader.js', 'src/ai/OrtRuntimeConfig.js', 'src/ai/MatteWorkerClient.js', 'src/ai/CutoutService.js',
  'src/ai/matte.worker.js', 'vendor/ort/ort.min.js',
  'src/tools/ByteSize.js', 'src/tools/PageRangeParser.js', 'src/tools/Converter.js', 'src/tools/ConverterRegistry.js',
  'src/tools/DependencyLoader.js', 'src/tools/PdfEngine.js', 'src/tools/PdfBuilder.js', 'src/tools/PdfCompressionSearch.js',
  'src/tools/ConverterUtils.js',
  'src/tools/converters/ImageFormatConverter.js', 'src/tools/converters/HeicToJpgConverter.js',
  'src/tools/converters/ImagesToPdfConverter.js', 'src/tools/converters/PdfMergeConverter.js',
  'src/tools/converters/PdfSplitConverter.js', 'src/tools/converters/PdfOrganizeConverter.js',
  'src/tools/converters/PdfToImagesConverter.js', 'src/tools/converters/PdfCompressConverter.js',
  'src/tools/converters/ScanToPdfConverter.js',
  'src/ui/dom.js', 'src/ui/ConverterForm.js', 'src/ui/FileListView.js', 'src/ui/ToolsPanel.js',
  'vendor/ort/ort-wasm-simd-threaded.mjs',
  'vendor/ort/ort-wasm-simd-threaded.wasm',
  'vendor/pdf-lib.min.js', 'vendor/pdf-lib.LICENSE.md', 'vendor/pdf.min.js', 'vendor/pdf.worker.min.js',
  'vendor/pdfjs-dist.LICENSE', 'vendor/heic2any.min.js', 'vendor/heic2any.LICENSE.md',
  'src/ui/Notifier.js', 'src/ui/CropperView.js', 'src/ui/Workspace.js',
  'src/ui/EnhancePanel.js', 'src/ui/PreviewRenderer.js', 'src/ui/ExamPanel.js', 'src/ui/GeneralPanel.js',
  'src/ui/CheckPanel.js', 'src/ui/App.js', 'src/main.js',
  'src/ui/BackgroundStudioPanel.js', 'src/ui/ToolRouter.js', 'src/ui/SiteNavigation.js',
];

self.addEventListener('install', (event) => {
  event.waitUntil(caches.open(CACHE_VERSION).then((cache) => cache.addAll(ASSETS)).then(() => self.skipWaiting()));
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    (async () => {
      const keys = await caches.keys();
      if (keys.includes('formfit-model-v1')) {
        const previous = await caches.open('formfit-model-v1');
        const current = await caches.open(MODEL_CACHE);
        for (const request of await previous.keys()) {
          if (!(await current.match(request))) await current.put(request, await previous.match(request));
        }
      }
      const updatedKeys = await caches.keys();
      await Promise.all(updatedKeys
        .filter((key) => key !== CACHE_VERSION && key !== MODEL_CACHE)
        .map((key) => caches.delete(key)));
      await self.clients.claim();
    })()
  );
});

// Network first (so updates show up), falling back to cache when offline.
self.addEventListener('fetch', (event) => {
  if (event.request.method !== 'GET') return;
  const requestUrl = new URL(event.request.url);
  const cacheable = ASSETS.some((asset) => new URL(asset, self.location.href).href === requestUrl.href);
  if (!cacheable) {
    event.respondWith(fetch(event.request));
    return;
  }
  const fixAssetType = (response) => {
    if (!response) return response;
    const isModule = requestUrl.pathname.endsWith('.mjs');
    const isWasm = requestUrl.pathname.endsWith('.wasm');
    if (!isModule && !isWasm) return response;
    const headers = new Headers(response.headers);
    headers.set('Content-Type', isWasm ? 'application/wasm' : 'text/javascript; charset=utf-8');
    return new Response(response.body, { status: response.status, statusText: response.statusText, headers });
  };
  event.respondWith(fetch(event.request).then((response) => {
    const fixed = fixAssetType(response);
    caches.open(CACHE_VERSION).then((cache) => cache.put(event.request, fixed.clone()));
    return fixed;
  }).catch(async () => fixAssetType(await caches.match(event.request))));
});
