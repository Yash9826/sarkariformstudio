/**
 * Notifier (toasts) and ProgressIndicator (inline progress bar).
 * These are the app's single channel for telling the user what happened.
 */
(function (root) {
  'use strict';
  const NS = (root.SarkariFormStudio = root.SarkariFormStudio || {});
  const { h } = NS.dom;

  class Notifier {
    static TIMEOUTS = { info: 4500, success: 5000, warn: 8000, error: 10000 };
    static ICONS = { info: 'ℹ', success: '✓', warn: '!', error: '✕' };

    #host;
    #log;

    constructor(host, logger = NS.Logger.for('Notifier')) {
      this.#host = host;
      this.#log = logger;
    }

    info(message, title) {
      return this.#show('info', message, title);
    }
    success(message, title) {
      return this.#show('success', message, title);
    }
    warn(message, title) {
      return this.#show('warn', message, title);
    }
    error(message, title = 'Something went wrong') {
      return this.#show('error', message, title);
    }

    /** Show any thrown value as a friendly error toast and log the technical details. */
    fromError(error, title) {
      const err = NS.SarkariFormStudioError.wrap(error);
      this.#log.error(`${err.code}: ${err.message}`, err);
      if (err.code === 'HEIC_UNSUPPORTED') {
        const suffix = 'or use our HEIC to JPG tool.';
        const message = err.userMessage.endsWith(suffix)
          ? h('span', null, err.userMessage.slice(0, -suffix.length), 'or use ',
            h('a', { href: '#/tools/heic-to-jpg' }, 'our HEIC to JPG tool'), '.')
          : err.userMessage;
        return this.#show('error', message, title);
      }
      return this.error(err.userMessage, title);
    }

    #show(type, message, title) {
      this.#log.debug(`toast:${type}`, message);
      const close = () => toast.remove();
      const toast = h(
        'div',
        { class: `toast toast-${type}`, role: type === 'error' ? 'alert' : 'status' },
        h('span', { class: 'toast-icon', 'aria-hidden': 'true' }, Notifier.ICONS[type]),
        h('div', { class: 'toast-body' }, title ? h('strong', null, title) : null,
          message && message.nodeType ? message : h('span', null, message)),
        h('button', { class: 'toast-close', type: 'button', 'aria-label': 'Dismiss', onClick: close }, '×')
      );
      this.#host.append(toast);
      while (this.#host.children.length > 4) this.#host.firstChild.remove();
      setTimeout(close, Notifier.TIMEOUTS[type]);
      return toast;
    }
  }

  class ProgressIndicator {
    #el;
    #bar;
    #label;
    #fill;

    constructor(el) {
      this.#el = el;
      this.#el.hidden = true;
      this.#el.setAttribute('role', 'progressbar');
      this.#el.setAttribute('aria-valuemin', '0');
      this.#el.setAttribute('aria-valuemax', '100');
      this.#label = h('span', { class: 'progress-label' });
      this.#fill = h('div', { class: 'progress-fill' });
      this.#bar = h('div', { class: 'progress-track' }, this.#fill);
      this.#el.append(this.#bar, this.#label);
    }

    /** @param {number|null} percent null shows an "indeterminate" animation */
    update(percent, label) {
      this.#el.hidden = false;
      this.#label.textContent = label || '';
      if (percent == null) {
        this.#el.classList.add('indeterminate');
        this.#el.removeAttribute('aria-valuenow');
        this.#fill.style.width = '';
      } else {
        this.#el.classList.remove('indeterminate');
        const p = Math.max(0, Math.min(100, Math.round(percent)));
        this.#fill.style.width = `${p}%`;
        this.#el.setAttribute('aria-valuenow', String(p));
      }
    }

    hide() {
      this.#el.hidden = true;
    }
  }

  Object.assign(NS, { Notifier, ProgressIndicator });
})(typeof window !== 'undefined' ? window : globalThis);
