(function (root) {
  'use strict';
  const NS = (root.SarkariFormStudio = root.SarkariFormStudio || {});
  const { h } = NS.dom;

  class SiteNavigation {
    #host;
    #registry;
    #onNavigate;
    #openMenu = null;
    #search;
    #results;
    #clearSearch;
    #drawer;
    #trigger;
    #hoverTimer = null;

    constructor({ host, registry, onNavigate }) {
      this.#host = host;
      this.#registry = registry;
      this.#onNavigate = onNavigate;
      this.#build();
    }

    #build() {
      const menu = h('nav', { class: 'primary-nav', 'aria-label': 'Main navigation' });
      for (const category of this.#registry.categories) {
        const entries = this.#registry.tools.filter((item) =>
          item.category === category.id || (item.alsoIn || []).includes(category.id));
        const trigger = h('button', {
          class: 'nav-menu-trigger',
          type: 'button',
          'aria-haspopup': 'true',
          'aria-expanded': 'false',
          onClick: () => this.#toggleMenu(category.id, trigger),
        }, category.title);
        const panel = h('div', { class: 'nav-menu-panel', role: 'menu', hidden: true });
        const groups = new Map();
        for (const entry of entries) {
          const group = entry.group;
          if (!groups.has(group)) groups.set(group, []);
          groups.get(group).push(entry);
        }
        for (const [group, tools] of groups) {
          panel.append(h('section', { class: 'nav-menu-group' },
            h('h3', null, group),
            ...tools.map((entry) => this.#link(entry, true))));
        }
        const item = h('div', { class: 'nav-menu', dataset: { category: category.id } }, trigger, panel);
        trigger._menuPanel = panel;
        trigger.addEventListener('keydown', (event) => this.#menuKeydown(event, trigger));
        item.addEventListener('pointerenter', (event) => {
          if (event.pointerType === 'mouse') {
            clearTimeout(this.#hoverTimer);
            this.#hoverTimer = setTimeout(() => this.#toggleMenu(category.id, trigger), 140);
          }
        });
        item.addEventListener('pointerleave', (event) => {
          if (event.pointerType === 'mouse') clearTimeout(this.#hoverTimer);
        });
        menu.append(item);
      }

      this.#search = h('input', {
        class: 'tool-search',
        type: 'search',
        role: 'combobox',
        'aria-label': 'Search tools',
        'aria-autocomplete': 'list',
        'aria-controls': 'tool-search-results',
        'aria-expanded': 'false',
        placeholder: 'Find a tool (press / to search)',
        onInput: () => this.#renderResults(),
        onKeydown: (event) => this.#searchKeydown(event),
      });
      this.#clearSearch = h('button', {
        class: 'search-clear',
        type: 'button',
        'aria-label': 'Clear search',
        hidden: true,
        onClick: () => {
          this.#search.value = '';
          this.#renderResults();
          this.#search.focus();
        },
      }, '×');
      this.#results = h('div', { class: 'search-results', id: 'tool-search-results', role: 'listbox', hidden: true });
      const searchBox = h('div', { class: 'tool-search-wrap' },
        h('span', { class: 'search-icon', 'aria-hidden': 'true' }, '⌕'),
        this.#search, this.#clearSearch, this.#results);
      this.#trigger = h('button', {
        class: 'nav-drawer-trigger',
        type: 'button',
        'aria-expanded': 'false',
        'aria-controls': 'mobile-navigation',
        onClick: () => this.#toggleDrawer(),
      }, 'Menu');
      this.#drawer = h('div', { class: 'mobile-navigation', id: 'mobile-navigation', hidden: true });
      const drawerGroups = h('div', { class: 'mobile-navigation-groups' });
      for (const category of this.#registry.categories) {
        const entries = this.#registry.tools.filter((item) =>
          item.category === category.id || (item.alsoIn || []).includes(category.id));
        drawerGroups.append(h('details', { class: 'mobile-nav-category' },
          h('summary', null, category.title),
          h('div', { class: 'mobile-nav-links' }, ...entries.map((entry) => this.#link(entry, false)))));
      }
      this.#drawer.append(drawerGroups);
      this.#host.append(this.#trigger, menu, searchBox, this.#drawer);
      this.#results.addEventListener('keydown', (event) => this.#resultKeydown(event));
      menu.addEventListener('keydown', (event) => this.#resultKeydown(event));

      document.addEventListener('click', (event) => {
        if (!this.#host.contains(event.target)) this.#closeMenus();
      });
      document.addEventListener('keydown', (event) => {
        if (event.key === 'Escape') {
          if (!this.#drawer.hidden) { this.#toggleDrawer(false); this.#trigger.focus(); }
          else {
            const activeTrigger = event.target.closest('.nav-menu')?.querySelector('.nav-menu-trigger');
            this.#closeMenus();
            if (activeTrigger) activeTrigger.focus();
          }
        }
        if (event.key === '/' && !this.#isTextEntry(event.target)) {
          event.preventDefault();
          this.#search.focus();
        }
      });
    }

    #link(entry, menuItem) {
      return h('a', {
        class: menuItem ? 'nav-menu-link' : 'mobile-nav-link',
        href: entry.route,
        role: menuItem ? 'menuitem' : null,
        dataset: { route: entry.route },
        onClick: (event) => {
          event.preventDefault();
          this.#toggleDrawer(false);
          this.#closeMenus();
          this.#onNavigate(entry);
        },
      }, entry.title);
    }

    setActive(entry) {
      for (const item of this.#host.querySelectorAll('.nav-menu')) {
        const active = Boolean(entry && (entry.category === item.dataset.category
          || (entry.alsoIn || []).includes(item.dataset.category)));
        item.classList.toggle('active', active);
      }
      for (const link of this.#host.querySelectorAll('[data-route]')) {
        if (entry && link.dataset.route === entry.route) link.setAttribute('aria-current', 'page');
        else link.removeAttribute('aria-current');
      }
    }

    #toggleMenu(id, trigger) {
      if (this.#openMenu === id) { this.#closeMenus(); return; }
      this.#closeMenus();
      trigger.setAttribute('aria-expanded', 'true');
      trigger._menuPanel.hidden = false;
      this.#openMenu = id;
    }

    #closeMenus() {
      for (const trigger of this.#host.querySelectorAll('.nav-menu-trigger')) {
        trigger.setAttribute('aria-expanded', 'false');
        if (trigger._menuPanel) trigger._menuPanel.hidden = true;
      }
      this.#openMenu = null;
      this.#results.hidden = true;
      this.#search.setAttribute('aria-expanded', 'false');
      clearTimeout(this.#hoverTimer);
    }

    #toggleDrawer(force) {
      const wasOpen = !this.#drawer.hidden;
      const open = force == null ? this.#drawer.hidden : Boolean(force);
      this.#drawer.hidden = !open;
      this.#trigger.setAttribute('aria-expanded', String(open));
      if (open) this.#drawer.querySelector('summary')?.focus();
      else if (wasOpen) this.#trigger.focus();
    }

    #renderResults() {
      const results = this.#registry.search(this.#search.value).slice(0, 8);
      this.#results.replaceChildren();
      this.#clearSearch.hidden = !this.#search.value.trim();
      if (!this.#search.value.trim()) {
        this.#results.hidden = true;
        this.#search.setAttribute('aria-expanded', 'false');
        return;
      }
      if (!results.length) this.#results.append(h('p', { class: 'muted small search-empty' }, 'No tool found, try another word.'));
      else for (const entry of results) {
        this.#results.append(h('a', {
          class: 'search-result',
          href: entry.route,
          role: 'option',
          onClick: (event) => {
            event.preventDefault();
            this.#onNavigate(entry, entry.searchQuery || '');
            this.#search.value = '';
            this.#closeMenus();
          },
        }, entry.title, h('small', null, entry.description)));
      }
      this.#results.hidden = false;
      this.#search.setAttribute('aria-expanded', 'true');
    }

    #searchKeydown(event) {
      if (event.key === 'Escape') {
        event.preventDefault();
        this.#search.value = '';
        this.#renderResults();
      } else if (event.key === 'ArrowDown') {
        event.preventDefault();
        this.#results.querySelector('a')?.focus();
      } else if (event.key === 'Enter') {
        const first = this.#results.querySelector('a');
        if (first) { event.preventDefault(); first.click(); }
      }
    }

    #menuKeydown(event, trigger) {
      if (event.key === 'ArrowDown' || event.key === 'Enter' || event.key === ' ') {
        event.preventDefault();
        if (trigger.getAttribute('aria-expanded') !== 'true') this.#toggleMenu(trigger.parentElement.dataset.category, trigger);
        trigger._menuPanel.querySelector('[role="menuitem"]')?.focus();
      }
    }

    #resultKeydown(event) {
      if (!['ArrowDown', 'ArrowUp'].includes(event.key)) return;
      const links = [...event.currentTarget.querySelectorAll('[role="menuitem"],[role="option"]')];
      if (!links.length) return;
      event.preventDefault();
      const index = links.indexOf(document.activeElement);
      const delta = event.key === 'ArrowDown' ? 1 : -1;
      links[(index + delta + links.length) % links.length].focus();
    }

    #isTextEntry(element) {
      return element && (element.isContentEditable || ['INPUT', 'TEXTAREA', 'SELECT'].includes(element.tagName));
    }
  }

  NS.SiteNavigation = SiteNavigation;
})(typeof window !== 'undefined' ? window : globalThis);
