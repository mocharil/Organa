const fs = require('node:fs');
const path = require('node:path');
const {now} = require('./helpers');
const {markdownToDocx, markdownToCsv} = require('./export-formats');

const COLLECTIONS = ['northStars', 'goals', 'agents', 'projects', 'tasks', 'meetings', 'deliverables', 'approvals', 'events', 'standups', 'emails'];
const ISO = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(\.\d+)?Z$/;
const fail = (message, status = 400) => { throw Object.assign(new Error(message), {status}); };

function shiftDates(value, delta) {
  if (typeof value === 'string') return ISO.test(value) ? new Date(Date.parse(value) + delta).toISOString() : value;
  if (Array.isArray(value)) return value.map(item => shiftDates(item, delta));
  if (value && typeof value === 'object') return Object.fromEntries(Object.entries(value).map(([key, item]) => [key, shiftDates(item, delta)]));
  return value;
}
function latestTimestamp(value, best = 0) {
  if (typeof value === 'string') return ISO.test(value) ? Math.max(best, Date.parse(value)) : best;
  if (Array.isArray(value)) return value.reduce((acc, item) => latestTimestamp(item, acc), best);
  if (value && typeof value === 'object') return Object.values(value).reduce((acc, item) => latestTimestamp(item, acc), best);
  return best;
}

const list = value => (Array.isArray(value) ? value.filter(item => item !== null && item !== undefined && String(item).trim()) : []);
function deliverableToMarkdown(deliverable, state) {
  const version = (deliverable.versions || []).find(item => item.id === deliverable.currentVersionId) || (deliverable.versions || []).at(-1) || {};
  const company = (state.companies || []).find(item => item.id === deliverable.companyId);
  const author = (state.agents || []).find(agent => agent.id === deliverable.createdBy?.id);
  const goals = (state.goals || []).filter(goal => (deliverable.goalIds || []).includes(goal.id));
  const why = deliverable.why || {};
  const lines = [`# ${deliverable.title}`, ''];
  const meta = [company?.name, author ? `${author.displayName} (${author.role})` : null, new Date(deliverable.updatedAt || Date.now()).toISOString().slice(0, 10), deliverable.status].filter(Boolean);
  if (meta.length) lines.push(`_${meta.join(' · ')}_`, '');
  lines.push(String(version.content || '').trim() || '_No content._', '');
  const section = (title, items) => { const values = list(items); if (values.length) lines.push(`## ${title}`, '', ...values.map(item => `- ${item}`), ''); };
  if (why.decisionSummary) lines.push('## Decision summary', '', String(why.decisionSummary), '');
  section('Goals this supports', goals.map(goal => goal.title));
  section('Constraint checks', why.constraintChecks);
  section('Assumptions', why.assumptions);
  section('Open uncertainties', why.uncertainties);
  section('Evidence', why.evidenceRefs);
  lines.push('---', '_Exported from Organa. AI-generated draft; review before acting on it._', '');
  return lines.join('\n');
}

class WorkspaceService {
  constructor({stateManager, provider, runtime}) {
    Object.assign(this, {stateManager, provider, runtime});
    this.fixtureFile = path.join(__dirname, '..', 'data', 'demo-workspace.json');
  }

  get store() { return this.stateManager.store; }

  list() {
    const state = this.stateManager.get();
    return (state.companies || []).map(company => {
      const own = collection => (state[collection] || []).filter(item => item.companyId === company.id);
      const tasks = own('tasks');
      return {
        id: company.id, name: company.name, description: company.description || '', industry: company.industry || '',
        demo: Boolean(company.demo), active: company.id === state.activeCompanyId,
        counts: {agents: own('agents').filter(a => a.status !== 'archived').length, tasks: tasks.length, needsReview: tasks.filter(t => t.status === 'review').length, deliverables: own('deliverables').length},
      };
    });
  }

  async activate(companyId) {
    const state = this.stateManager.get();
    if (!(state.companies || []).some(company => company.id === companyId)) fail('Workspace not found.', 404);
    if (state.activeCompanyId !== companyId) {
      state.activeCompanyId = companyId;
      await this.stateManager.persist();
    }
    return this.list();
  }

  backupSoon(label) {
    try { return typeof this.store?.backup === 'function' ? this.store.backup(label) : null; } catch { return null; }
  }

  async loadDemo() {
    const state = this.stateManager.get();
    const existing = (state.companies || []).find(company => company.demo);
    if (existing) { await this.activate(existing.id); return {created: false, companyId: existing.id}; }
    let fixture;
    try { fixture = JSON.parse(fs.readFileSync(this.fixtureFile, 'utf8')); } catch { fail('The demo workspace file is missing from this install.', 500); }
    const delta = Date.now() - (latestTimestamp(fixture) || Date.now());
    const data = shiftDates(fixture, delta);
    if (!data.company?.id || (state.companies || []).some(company => company.id === data.company.id)) fail('The demo workspace could not be loaded.', 409);
    this.backupSoon('predemo');
    state.companies.push({...data.company, demo: true});
    for (const key of COLLECTIONS) { state[key] ||= []; state[key].push(...(data[key] || [])); }
    state.activeCompanyId = data.company.id;
    await this.stateManager.persist();
    return {created: true, companyId: data.company.id};
  }

  async removeDemo() {
    const state = this.stateManager.get();
    const demo = (state.companies || []).find(company => company.demo);
    if (!demo) fail('There is no demo workspace to remove.', 404);
    const others = state.companies.filter(company => company.id !== demo.id);
    if (!others.length) fail('Create your own workspace before removing the demo.', 409);
    this.backupSoon('predemo');
    for (const key of [...COLLECTIONS, 'usage', 'bootstrapProposals']) state[key] = (state[key] || []).filter(item => item.companyId !== demo.id);
    state.companies = others;
    if (state.activeCompanyId === demo.id) state.activeCompanyId = others[0].id;
    await this.stateManager.persist();
    return this.list();
  }

  backups() { return typeof this.store?.listBackups === 'function' ? this.store.listBackups() : []; }

  async backupNow() {
    if (typeof this.store?.backup !== 'function') fail('Backups are available with local JSON storage only.', 409);
    await this.stateManager.persist();
    return {name: this.store.backup('manual')};
  }

  async restore(name) {
    if (typeof this.store?.readBackup !== 'function') fail('Backups are available with local JSON storage only.', 409);
    const restored = this.store.readBackup(name);
    this.store.backup('prerestore');
    const llm = this.stateManager.get().settings?.llm;
    restored.settings = {...(restored.settings || {}), ...(llm ? {llm: {...llm}} : {})};
    for (const key of [...COLLECTIONS, 'companies', 'usage', 'bootstrapProposals']) if (!Array.isArray(restored[key])) restored[key] = [];
    if (!restored.companies.some(company => company.id === restored.activeCompanyId)) restored.activeCompanyId = restored.companies[0]?.id || null;
    restored.schemaVersion = 2;
    await this.stateManager.replace(restored);
    this.provider.refresh?.();
    this.runtime?.taskWorker?.busy?.clear?.();
    return {restored: name, workspaces: this.list(), restoredAt: now()};
  }

  // format: md (default), docx (Word / Google Docs) or csv (Excel / Google Sheets).
  exportDeliverable(deliverableId, format = 'md') {
    const state = this.stateManager.get();
    const deliverable = (state.deliverables || []).find(item => item.companyId === state.activeCompanyId && item.id === deliverableId);
    if (!deliverable) fail('Deliverable not found.', 404);
    const kind = String(format || 'md').toLowerCase();
    if (!['md', 'docx', 'csv'].includes(kind)) fail('Export format must be md, docx or csv.', 400);
    const base = String(deliverable.title || 'deliverable').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 60) || 'deliverable';
    const markdown = deliverableToMarkdown(deliverable, state);
    if (kind === 'docx') return {filename: `${base}.docx`, contentType: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document', body: markdownToDocx(markdown, deliverable.title)};
    if (kind === 'csv') {
      const version = (deliverable.versions || []).find(item => item.id === deliverable.currentVersionId) || (deliverable.versions || []).at(-1) || {};
      return {filename: `${base}.csv`, contentType: 'text/csv; charset=utf-8', body: `﻿${markdownToCsv(String(version.content || ''))}`};
    }
    return {filename: `${base}.md`, contentType: 'text/markdown; charset=utf-8', body: markdown};
  }
}

module.exports = {WorkspaceService, deliverableToMarkdown, shiftDates};
