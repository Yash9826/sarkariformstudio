# Migration status

## App structure

- The project is a static site using classic scripts in `index.html` and `window.SarkariFormStudio`; no framework, bundler, or runtime dependency was added.
- `src/ui/App.js` composes the exam resizer, custom cropper, file checker, converter hub, and one Photo Editor.
- `data/site-config.js`, `data/tool-registry.js`, `src/ui/SiteNavigation.js`, and `src/ui/ToolRouter.js` provide shared metadata, generated menus/search, and hash routes.
- The former passport-specific panel and preset data have been removed/replaced with generic size presets. The standalone print-sheet flow is not loaded or exposed.
- `BackgroundStudioPanel.js` remains the implementation module name for the consolidated Photo Editor. Touch-up is opt-in and pointer input edits only `BrushMask`; it cannot draw onto image pixels.
- `sw.js` precaches the current app shell and migrates the previous model cache when updating.

## Implemented catalogue

The shared registry exposes the working exam/photo panels, image format conversion, HEIC to JPG, images to PDF, PDF merge/split/organize, PDF to images, PDF compression, scan-to-PDF, and information pages. Search, home cards, category menus, breadcrumbs, metadata, and routed panels use those same registry entries.

PDF rendering and compression need an HTTP origin because their worker cannot run from `file://`. The service worker handles the static app assets; the photo model is cached separately. The configured domain is intentionally blank until deployment chooses a real domain, so the app does not publish a fabricated canonical URL.

## Dependencies and model

The pinned packages in `package.json` are `pdf-lib` 1.17.1 (MIT), `pdfjs-dist` 3.11.174 (Apache-2.0), `heic2any` 0.0.4 (MIT), and `onnxruntime-web` 1.30.0 (MIT). Runtime files are vendored locally with notices in `vendor/`. The Photo Editor uses the existing MODNet model, fetched from its pinned source and verified by the local model loader against `vendor/models/manifest.json`. The unused face-analysis runtime/model is no longer loaded, cached, or fetched by the app.

No new third-party package, font, API, or remote conversion service was introduced. Generic editor dimensions are mathematical starting points; exam-specific requirements remain in Exam Photos.

## Remaining scope

This migration is an incremental release, not the full wishlist in the supplied specification. The Photo Editor still needs draggable crop/rotate/flip, non-destructive adjustments, a name/date text bar, output compression/target-size controls, and a global history covering all settings. The current output-size controls preserve aspect ratio within the chosen canvas dimensions.

The registry only includes converters already implemented in the project. Word/PDF text conversion, office formats, archives, SVG, broader PDF utilities, unit/time converters, GIF tools, and other wishlist items have not been added. Static per-tool HTML generation, sitemap/robots, a browser E2E suite, and full screen-reader/mobile verification also remain to be done. They are intentionally not presented as available features.
