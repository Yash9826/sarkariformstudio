/**
 * App composition root. Builds the objects, wires routes and global error handling.
 */
(function (root) {
  'use strict';
  const NS = (root.SarkariFormStudio = root.SarkariFormStudio || {});
  const {
    Logger, Notifier, ExamRegistry, SafeStorage, ExamPanel, GeneralPanel, CheckPanel, ToolsPanel,
    ConverterRegistry, ImageFormatConverter, HeicToJpgConverter, ImagesToPdfConverter,
    PdfMergeConverter, PdfSplitConverter, PdfOrganizeConverter, PdfToImagesConverter, PdfCompressConverter,
    ScanToPdfConverter,
    SarkariFormStudioError, dom,
  } = NS;

  class SarkariFormStudioApp {
    #log = Logger.for('App');
    #notifier;
    #panels = {};
    #navigation;
    #registryData;
    #pageContent;
    #breadcrumb;
    #footerLinks;

    start() {
      const $ = (id) => document.getElementById(id);
      this.#notifier = new Notifier($('toasts'));
      this.#registryData = NS.ToolRegistryData;
      this.#pageContent = $('page-content');
      this.#breadcrumb = $('breadcrumb');
      this.#footerLinks = $('footer-links');
      $('site-name').textContent = NS.SiteConfig.siteName;
      $('site-tagline').textContent = NS.SiteConfig.tagline;
      $('footer-disclaimer').textContent = NS.SiteConfig.footerDisclaimer;
      this.#renderFooterLinks();
      this.#installGlobalErrorHandlers();
      this.#log.info('SarkariFormStudio starting');

      let registry;
      try {
        registry = new ExamRegistry(NS.ExamData);
      } catch (error) {
        this.#showFatal(error);
        return;
      }
      const storage = new SafeStorage();
      this.#installThemeToggle(storage);
      const cutoutService = new NS.CutoutService({
        modelLoader: new NS.ModelLoader(NS.ModelManifest),
        workerClient: new NS.MatteWorkerClient(),
      });
      this.#panels.exam = new ExamPanel({ root: $('panel-exam'), registry, notifier: this.#notifier, storage });
      this.#panels.general = new GeneralPanel({ root: $('panel-general'), notifier: this.#notifier, storage });
      this.#panels.check = new CheckPanel({
        root: $('panel-check'),
        registry,
        notifier: this.#notifier,
        onFix: async (groupKey, kind, file) => {
          this.#navigate(this.#registryData.getById('exam-photo-resizer'));
          await this.#panels.exam.select(groupKey, kind, file);
        },
      });
      const converters = new ConverterRegistry();
      for (const converter of [
        new ImageFormatConverter(), new HeicToJpgConverter(), new ImagesToPdfConverter(),
        new PdfMergeConverter(), new PdfSplitConverter(), new PdfOrganizeConverter(),
        new PdfToImagesConverter(), new PdfCompressConverter(),
        new ScanToPdfConverter(),
      ]) converters.register(converter);
      this.#panels.tools = new ToolsPanel({ root: $('panel-tools'), registry: converters, notifier: this.#notifier, storage });
      this.#panels['photo-editor'] = new NS.BackgroundStudioPanel({
        root: $('panel-photo-editor'), notifier: this.#notifier, cutoutService, storage,
      });
      this.#navigation = new NS.SiteNavigation({
        host: $('navigation-host'),
        registry: this.#registryData,
        onNavigate: (entry, searchQuery) => this.#navigate(entry, searchQuery),
      });
      window.addEventListener('hashchange', () => this.#route());
      if (!location.hash || location.hash === '#') history.replaceState(null, '', `${location.pathname}${location.search}#/`);
      this.#route();
      this.#registerServiceWorker();
      this.#log.info('SarkariFormStudio ready');
    }

    #installThemeToggle(storage) {
      const button = document.getElementById('theme-toggle');
      const label = button.querySelector('.theme-label');
      const icon = button.querySelector('.theme-icon');
      const meta = document.querySelector('meta[name="theme-color"]');
      const apply = (theme) => {
        const light = theme === 'light';
        document.documentElement.dataset.theme = light ? 'light' : 'dark';
        button.setAttribute('aria-label', `Switch to ${light ? 'dark' : 'light'} theme`);
        button.title = `Switch to ${light ? 'dark' : 'light'} theme`;
        label.textContent = light ? 'Dark' : 'Light';
        icon.textContent = light ? '☾' : '☼';
        meta.content = light ? '#f8f8f5' : '#0a0a0a';
      };
      const saved = storage.get('theme');
      apply(saved === 'dark' ? 'dark' : 'light');
      button.addEventListener('click', () => {
        const theme = document.documentElement.dataset.theme === 'light' ? 'dark' : 'light';
        apply(theme);
        storage.set('theme', theme);
      });
    }

    #navigate(entry, searchQuery = '') {
      if (!entry) return;
      const route = `${NS.ToolRouter.href(entry)}${entry.id === 'exam-photo-resizer' && searchQuery
        ? `?search=${encodeURIComponent(searchQuery)}` : ''}`;
      if (location.hash === route) this.#route();
      else location.hash = route;
    }

    #route() {
      const entry = NS.ToolRouter.resolve(location.hash, this.#registryData);
      const hashQuery = location.hash.includes('?') ? location.hash.slice(location.hash.indexOf('?') + 1) : '';
      const searchQuery = new URLSearchParams(hashQuery).get('search') || '';
      const oldAliases = ['#exam', '#general', '#check', '#tools', '#background-studio', '#passport',
        '#/exam', '#/general', '#/check', '#/tools', '#/background-studio', '#/passport'];
      const routeHash = location.hash.split('?')[0];
      if (oldAliases.includes(routeHash) && entry) {
        const querySuffix = hashQuery ? `?${hashQuery}` : '';
        history.replaceState(null, '', `${location.pathname}${location.search}${entry.route}${querySuffix}`);
      }
      if (!entry && location.hash && location.hash !== '#' && location.hash !== '#/') {
        history.replaceState(null, '', `${location.pathname}${location.search}#/`);
      }
      this.#renderBreadcrumb(entry);
      this.#renderPageGuide(entry);
      this.#updateMetadata(entry);
      this.#navigation.setActive(entry);
      for (const panel of document.querySelectorAll('[data-app-panel]')) panel.hidden = true;
      if (!entry) return;
      if (entry.panel === 'information') return;
      const panel = document.getElementById(`panel-${entry.panel}`);
      if (panel) panel.hidden = false;
      if (entry.panel === 'exam') this.#panels.exam.setSearchQuery(searchQuery);
      if (entry.panel === 'tools' && entry.converterId) this.#panels.tools.open(entry.converterId);
    }

    #renderBreadcrumb(entry) {
      const home = dom.h('a', { href: '#/' , onClick: (event) => { event.preventDefault(); location.hash = '#/'; } }, 'Home');
      this.#breadcrumb.replaceChildren(home);
      if (!entry) return;
      const category = this.#registryData.categories.find((item) => item.id === entry.category);
      if (category) this.#breadcrumb.append(dom.h('span', { 'aria-hidden': 'true' }, '›'), dom.h('span', null, category.title));
      this.#breadcrumb.append(dom.h('span', { 'aria-hidden': 'true' }, '›'), dom.h('span', { 'aria-current': 'page' }, entry.title));
    }

    #renderPageGuide(entry) {
      this.#pageContent.replaceChildren();
      const canonical = document.getElementById('canonical-url');
      const canonicalUrl = NS.SiteConfig.domain
        ? `${NS.SiteConfig.domain}${location.pathname}${entry ? entry.route : '#/'}` : '';
      if (canonical) {
        if (canonicalUrl) canonical.href = canonicalUrl;
        else canonical.removeAttribute('href');
      }
      const ogUrl = document.querySelector('meta[property="og:url"]');
      if (ogUrl) ogUrl.content = canonicalUrl;
      if (!entry) {
        this.#structuredData(null);
        const cards = this.#registryData.tools.filter((item) => item.category !== 'footer');
        this.#pageContent.append(dom.h('section', { class: 'home-hero' },
          dom.h('p', { class: 'hero-kicker' }, 'LOCAL FILE TOOLS'),
          dom.h('h1', null, 'Your files, ready to go.'),
          dom.h('p', { class: 'hero-copy' }, 'Prepare exam photos, edit images, and work with PDFs. Files are processed in this browser.')));
        const [coreCategory, ...otherCategories] = this.#registryData.categories;
        if (coreCategory) {
          const coreTools = this.#registryData.tools.filter((item) =>
            item.category === coreCategory.id || (item.alsoIn || []).includes(coreCategory.id));
          this.#pageContent.append(dom.h('section', { class: 'home-section' },
            dom.h('h2', null, coreCategory.title),
            dom.h('div', { class: 'home-tool-grid' }, ...coreTools.map((item) => this.#toolCard(item)))));
        }
        this.#pageContent.append(dom.h('section', { class: 'home-section' },
          dom.h('h2', null, 'Popular tools'),
          dom.h('div', { class: 'home-tool-grid' }, ...cards.slice(0, 8).map((item) => this.#toolCard(item)))));
        for (const category of otherCategories) {
          const items = this.#registryData.tools.filter((item) =>
            item.category === category.id || (item.alsoIn || []).includes(category.id));
          this.#pageContent.append(dom.h('section', { class: 'home-section' },
            dom.h('h2', null, category.title),
            dom.h('div', { class: 'home-tool-grid' }, ...items.map((item) => this.#toolCard(item)))));
        }
        return;
      }
      const seo = entry.seo;
      this.#pageContent.append(dom.h('section', { class: 'route-heading' },
        dom.h('h1', null, seo.h1),
        dom.h('p', { class: 'hero-copy' }, entry.description)));
      if (entry.panel === 'information') {
        const body = {
          privacy: `Your selected files are read and processed in the browser. ${NS.SiteConfig.siteName} does not upload photos or documents. Only pinned AI model assets may be cached locally for offline use.`,
          help: 'Choose a tool from the header or search by its name. Each tool explains its accepted files, options, and limitations before you begin.',
          about: `${NS.SiteConfig.siteName} provides browser-based tools for preparing exam photos and everyday files.`,
          disclaimer: NS.SiteConfig.footerDisclaimer + ' Requirements are subject to change; check the destination service before submitting a file.',
        }[entry.id] || entry.description;
        this.#pageContent.append(dom.h('section', { class: 'route-info' }, dom.h('p', null, body)));
      }
      this.#pageContent.append(dom.h('section', { class: 'route-guide' },
        dom.h('h2', null, 'How to use this tool'),
        dom.h('ol', null, ...seo.howTo.map((line) => dom.h('li', null, line))),
        dom.h('p', { class: 'note' }, seo.note),
        dom.h('details', null,
          dom.h('summary', null, 'Questions and answers'),
          ...seo.faq.map(([question, answer]) => dom.h('div', { class: 'route-faq' }, dom.h('h3', null, question), dom.h('p', null, answer))))));
      const related = [];
      for (const candidate of [
        ...this.#registryData.tools.filter((item) => item.category === entry.category),
        ...this.#registryData.tools,
      ]) {
        if (candidate.id !== entry.id && !related.some((item) => item.id === candidate.id)) related.push(candidate);
        if (related.length === 4) break;
      }
      if (related.length) this.#pageContent.append(dom.h('nav', { class: 'related-tools', 'aria-label': 'Related tools' },
        dom.h('h2', null, 'Related tools'),
        ...related.map((item) => dom.h('a', { href: item.route, onClick: (event) => { event.preventDefault(); this.#navigate(item); } }, item.title))));
      this.#structuredData(entry);
    }

    #toolCard(entry) {
      return dom.h('a', { class: 'home-tool-card', href: entry.route, onClick: (event) => { event.preventDefault(); this.#navigate(entry); } },
        dom.h('strong', null, entry.title), dom.h('span', null, entry.description));
    }

    #updateMetadata(entry) {
      const title = entry ? entry.seo.title : `${NS.SiteConfig.siteName} | Photo, PDF and File Tools for Government Forms`;
      const description = entry ? entry.seo.description : `${NS.SiteConfig.siteName} — ${NS.SiteConfig.tagline}.`;
      document.title = title;
      const meta = document.querySelector('meta[name="description"]');
      if (meta) meta.content = description;
      const ogTitle = document.querySelector('meta[property="og:title"]');
      const ogDescription = document.querySelector('meta[property="og:description"]');
      const twitterTitle = document.querySelector('meta[name="twitter:title"]');
      const twitterDescription = document.querySelector('meta[name="twitter:description"]');
      if (ogTitle) ogTitle.content = title;
      if (ogDescription) ogDescription.content = description;
      if (twitterTitle) twitterTitle.content = title;
      if (twitterDescription) twitterDescription.content = description;
    }

    #structuredData(entry) {
      const host = document.getElementById('route-structured-data');
      if (!host) return;
      if (!entry) {
        host.textContent = '';
        return;
      }
      const documentData = {
        '@context': 'https://schema.org',
        '@type': 'SoftwareApplication',
        name: entry.title,
        applicationCategory: 'UtilitiesApplication',
        operatingSystem: 'Web browser',
        description: entry.seo.description,
      };
      const faqData = {
        '@context': 'https://schema.org',
        '@type': 'FAQPage',
        mainEntity: entry.seo.faq.map(([question, answer]) => ({
          '@type': 'Question',
          name: question,
          acceptedAnswer: { '@type': 'Answer', text: answer },
        })),
      };
      host.textContent = JSON.stringify([documentData, faqData]);
    }

    #installGlobalErrorHandlers() {
      window.addEventListener('error', (event) => {
        this.#log.error('Uncaught error', event.error || event.message);
        this.#notifier.error('An unexpected error occurred. Please try again.', 'Unexpected error');
      });
      window.addEventListener('unhandledrejection', (event) => {
        this.#log.error('Unhandled promise rejection', event.reason);
        this.#notifier.fromError(event.reason, 'Unexpected error');
      });
    }

    #renderFooterLinks() {
      const links = this.#registryData.tools.filter((entry) => entry.category === 'footer');
      this.#footerLinks.replaceChildren(...links.map((entry) =>
        dom.h('a', {
          href: entry.route,
          onClick: (event) => {
            event.preventDefault();
            this.#navigate(entry);
          },
        }, entry.title)));
    }

    #showFatal(error) {
      const err = SarkariFormStudioError.wrap(error, 'The app could not start.');
      this.#log.error('Fatal startup error', err);
      this.#pageContent.replaceChildren(
        dom.h('div', { class: 'fatal', role: 'alert' },
          dom.h('h2', null, `${NS.SiteConfig.siteName} could not start`),
          dom.h('p', null, err.userMessage),
          dom.h('p', { class: 'muted small' }, `Technical detail: ${err.message}`))
      );
    }

    #registerServiceWorker() {
      if (!('serviceWorker' in navigator) || !/^https?:$/.test(location.protocol)) return;
      navigator.serviceWorker.register('sw.js').then(
        () => this.#log.info('Offline support enabled'),
        (error) => this.#log.warn('Offline support unavailable', error)
      );
    }
  }

  NS.SarkariFormStudioApp = SarkariFormStudioApp;
})(typeof window !== 'undefined' ? window : globalThis);
