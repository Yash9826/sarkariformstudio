# SarkariFormStudio

Private, browser-based tools for preparing photos and working with image and PDF files. Files selected in the app are processed on your device.

## Run locally

From this folder, serve the static files over HTTP (required for the AI worker and PDF rendering):

```bash
npm run serve
# open http://localhost:8080
```

Opening `index.html` directly supports the non-worker image tools; AI background removal falls back to basic mode, and PDF rendering tools explain that they need HTTP. No bundler or framework is used.

## Navigation and routes

The responsive header is generated from `data/tool-registry.js`. It provides grouped dropdowns, an expanding search field (`/` focuses search), a mobile accordion drawer, breadcrumbs, and hash routes (`#/tools/<slug>`). Older tab hashes continue to route to their replacement tools. The light theme is the default; the header toggle switches to dark mode. About, Privacy, Help, and Disclaimer links are in the footer. Site name, tagline, domain, and footer line are configured in `data/site-config.js`; set `domain` when deploying to enable canonical URLs.

## Available tools

- **Exam Photos:** exam resizer, custom-size cropper, and file checker.
- **Photo Editor:** local background cut-out/replacement, edge controls, opt-in mask-only touch-up with undo/redo, and generic output size presets. Custom output pixel dimensions can be entered directly or derived from mm/cm/in and DPI. The presets are starting sizes, not a statement about a destination's requirements.
- **Convert / PDF Tools:** image format conversion, HEIC to JPG, images to PDF, PDF merge/split/organize, PDF to images, and scan photos to PDF.
- **Compress:** PDF compression. Image conversion includes JPEG quality and size controls.
- **Image Tools:** image resize/convert.
- **Footer:** privacy, help, about, and disclaimer pages.

The registry intentionally lists only tools implemented in this app. Office conversions, archives, audio/video, OCR, and other tools from the migration wishlist are not available. PDF rendering and compression use local PDF libraries and require an HTTP origin. This app does not use a third-party conversion API, analytics, or a CDN.

## Core feature: Exam Photos (SSC, banking, railways, UPSC, NTA...)

Exam Photo Resizer, Custom Size Cropper, and Check My File are core site features. Their requirements live together in `data/exam-data.js`; shared validation, crop, compression, and ZIP logic lives in `src/domain/`, `src/image/`, and `src/export/`, while the routed screens are in `src/ui/ExamPanel.js`, `GeneralPanel.js`, `CheckPanel.js`, and `Workspace.js`. Run `npm test` to exercise the rules, exam groups, crop geometry, compression, and export safeguards. The regression tests also protect the Exam Photos menu, all listed exams, expected groups, and resizer route.

## Photo Editor notes

The editor reuses the locally bundled MODNet cut-out model, refines its alpha mask, and composites a transparent, solid, gradient, blurred, or user-selected image background. Touch-up is off by default; when enabled, pointer drags alter only the mask. A fallback mode is available if the AI worker/model cannot run. Images are not saved by the app; downloaded output is named `<original-name>-edited.<ext>`.

Current output sizing preserves the source image's aspect ratio inside the requested pixel dimensions; it does not yet provide a draggable crop, full adjustment/text-bar controls, or a global undo history. The separate print-sheet flow has been removed. Verify the downloaded image's dimensions, size, and format against the destination's current requirements.

## Development

```bash
npm test
```

Tests use Node's built-in test runner. Vendor libraries are pinned in `package.json`; the build-free app loads only local assets. See `docs/MIGRATION_NOTES.md` for the migration inventory, implemented scope, and limitations.

## Structure

- `data/site-config.js`, `data/tool-registry.js`, and `data/photo-presets.js`: site metadata, routed tool catalogue, generic editor size presets.
- `src/ui/App.js`, `SiteNavigation.js`, and `ToolRouter.js`: app composition, generated menus/search, and routes.
- `src/ui/BackgroundStudioPanel.js`: consolidated Photo Editor surface.
- `src/tools/`: converter contracts and local image/PDF converters.
- `src/ai/`: mask, compositor, model and worker services.
- `sw.js`: static-shell cache. Model files use a separate cache; the service worker migrates its previous cache on update.
