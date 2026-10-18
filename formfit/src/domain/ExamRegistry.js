/**
 * Exam, ExamGroup and ExamRegistry.
 *
 * ExamRegistry loads plain data (data/exam-data.js), validates it, and exposes
 * ExamGroups: exams whose requirements are identical are merged into one group
 * so the user sees "SSC CGL / SSC CHSL / SSC MTS ..." as a single choice.
 */
(function (root) {
  'use strict';
  const NS = (root.SarkariFormStudio = root.SarkariFormStudio || {});
  const { RuleError, RuleProfile, Logger } = NS;

  const KIND_ORDER = ['photo', 'signature', 'thumb', 'declaration'];

  class Exam {
    constructor(spec, rulesById) {
      const where = `Exam "${spec && spec.id}"`;
      if (!spec || typeof spec.id !== 'string' || typeof spec.name !== 'string') {
        throw new RuleError(`${where}: id and name are required`);
      }
      if (!spec.rules || !Object.keys(spec.rules).length) throw new RuleError(`${where}: needs at least one rule`);

      this.id = spec.id;
      this.name = spec.name;
      this.body = spec.body || '';
      this.keywords = Object.freeze((spec.keywords || []).map((k) => String(k).toLowerCase()));
      this.source = spec.source || '';
      this.lastVerified = spec.lastVerified || '';
      this.confidence = spec.confidence || 'secondary';
      this.note = spec.note || '';

      const rules = {};
      for (const [kind, ruleId] of Object.entries(spec.rules)) {
        const rule = rulesById.get(ruleId);
        if (!rule) throw new RuleError(`${where}: unknown rule "${ruleId}" for ${kind}`);
        if (rule.kind !== kind) throw new RuleError(`${where}: rule "${ruleId}" is a ${rule.kind} rule, not ${kind}`);
        rules[kind] = rule;
      }
      this.rules = Object.freeze(rules);
      Object.freeze(this);
    }

    ruleFor(kind) {
      return this.rules[kind] || null;
    }
  }

  class ExamGroup {
    constructor(key, exams) {
      this.key = key;
      this.exams = Object.freeze(exams);
      Object.freeze(this);
    }

    /** Rules are identical across the group, so the first exam speaks for all. */
    get rules() {
      return this.exams[0].rules;
    }
    get kinds() {
      return KIND_ORDER.filter((k) => this.rules[k]);
    }
    get label() {
      return this.exams.map((e) => e.name).join(' / ');
    }
    get bodies() {
      return [...new Set(this.exams.map((e) => e.body).filter(Boolean))];
    }
    get sources() {
      return [...new Set(this.exams.map((e) => e.source).filter(Boolean))];
    }
    get lastVerified() {
      return this.exams.map((e) => e.lastVerified).sort().pop() || '';
    }
    get confidence() {
      return this.exams.some((e) => e.confidence !== 'official') ? 'secondary' : 'official';
    }
    get note() {
      return this.exams[0].note;
    }
    get slug() {
      return this.exams[0].id;
    }

    ruleFor(kind) {
      return this.rules[kind] || null;
    }

    matches(tokens) {
      if (!tokens.length) return true;
      const hay = this.exams
        .flatMap((e) => [e.name, e.body, e.id, ...e.keywords])
        .join(' ')
        .toLowerCase();
      return tokens.every((t) => hay.includes(t));
    }
  }

  class ExamRegistry {
    #rules = new Map();
    #exams = new Map();
    #groups = [];
    #log;

    constructor(data, logger = Logger.for('ExamRegistry')) {
      this.#log = logger;
      if (!data || !Array.isArray(data.rules) || !Array.isArray(data.exams)) {
        throw new RuleError('Exam data must contain "rules" and "exams" arrays', {
          userMessage: 'The exam list could not be loaded.',
        });
      }
      for (const spec of data.rules) {
        const rule = new RuleProfile(spec);
        if (this.#rules.has(rule.id)) throw new RuleError(`Duplicate rule id "${rule.id}"`);
        this.#rules.set(rule.id, rule);
      }
      for (const spec of data.exams) {
        const exam = new Exam(spec, this.#rules);
        if (this.#exams.has(exam.id)) throw new RuleError(`Duplicate exam id "${exam.id}"`);
        this.#exams.set(exam.id, exam);
      }
      this.#groups = this.#buildGroups();
      this.#log.info(`Loaded ${this.#exams.size} exams into ${this.#groups.length} rule groups`);
    }

    get exams() {
      return [...this.#exams.values()];
    }
    get groups() {
      return this.#groups.slice();
    }

    getExam(id) {
      return this.#exams.get(id) || null;
    }
    getGroup(key) {
      return this.#groups.find((g) => g.key === key) || null;
    }

    /** Case-insensitive search; every word typed must match something about the group. */
    search(query) {
      const tokens = String(query || '').toLowerCase().split(/\s+/).filter(Boolean);
      return this.#groups.filter((g) => g.matches(tokens));
    }

    #buildGroups() {
      const buckets = new Map();
      for (const exam of this.#exams.values()) {
        const key = Object.keys(exam.rules)
          .sort()
          .map((kind) => exam.rules[kind].signature())
          .join('||');
        if (!buckets.has(key)) buckets.set(key, []);
        buckets.get(key).push(exam);
      }
      return [...buckets.entries()]
        .map(([signature, exams]) => new ExamGroup(ExamRegistry.#hash(signature), exams))
        .sort((a, b) => a.label.localeCompare(b.label));
    }

    /** Stable short id derived from the rules, so a saved selection survives list re-ordering. */
    static #hash(text) {
      let hash = 5381;
      for (let i = 0; i < text.length; i++) hash = ((hash << 5) + hash + text.charCodeAt(i)) >>> 0;
      return `g${hash.toString(36)}`;
    }
  }

  Object.assign(NS, { Exam, ExamGroup, ExamRegistry });
})(typeof window !== 'undefined' ? window : globalThis);
