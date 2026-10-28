import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile, stat, mkdtemp, cp, writeFile, rm } from 'node:fs/promises';
import { resolve, dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';
import { tmpdir } from 'node:os';
import { runInNewContext } from 'node:vm';
import { sortedProjects, orderedGroups, projectDate, safeUrl } from '../scripts/lib.mjs';

const root = fileURLToPath(new URL('../', import.meta.url));
const result = spawnSync(process.execPath, ['scripts/build.mjs'], { cwd: root, encoding: 'utf8' });
assert.equal(result.status, 0, result.stderr);
const content = async name => JSON.parse(await readFile(join(root, 'content', `${name}.json`), 'utf8'));
const projects = await content('projects');
const groups = await content('groups');
const pages = ['index.html', 'projects.html', 'achievements.html', 'en/index.html', 'en/projects.html', 'en/achievements.html'];

test('homepage showcases Diskclean, PDn Control, and Chess CLI without Amazing projects in both languages', async () => {
  for (const page of ['index.html', 'en/index.html']) {
    const html = await readFile(join(root, 'dist', page), 'utf8');
    const ids = [...html.matchAll(/class="project-row compact" id="([^"]+)"/g)].map(match => match[1]);
    assert.deepEqual(ids, ['diskclean', 'pdn-control', 'chess-cli']);
    assert.ok(ids.every(id => projects.find(project => project.id === id).group !== 'amazing'));
  }
});

test('all 17 selected repositories appear exactly once in each project page', async () => {
  assert.equal(projects.length, 17);
  assert.equal(new Set(projects.map(p => p.id)).size, 17);
  assert.equal(projects.filter(p => p.role !== 'solo').length, 1);
  assert.equal(projects.find(p => p.repo === 'pdn-control').client, 'Neurolife');
  for (const page of ['projects.html', 'en/projects.html']) {
    const html = await readFile(join(root, 'dist', page), 'utf8');
    assert.equal((html.match(/data-project /g) ?? []).length, 17);
    for (const p of projects) assert.equal((html.match(new RegExp(`id="${p.id}"`, 'g')) ?? []).length, 1);
  }
});
test('relative navigation and assets resolve under both root and repository hosting', async () => {
  for (const base of ['https://example.test/', 'https://example.test/portfolio/']) {
    for (const page of pages) {
      const html = await readFile(join(root, 'dist', page), 'utf8');
      for (const match of html.matchAll(/(?:href|src)="([^"]+)"/g)) {
        if (/^(https:|mailto:|#)/.test(match[1])) continue;
        const target = new URL(match[1], base + page);
        assert.ok(target.href.startsWith(base));
        const path = decodeURIComponent(target.pathname.slice(new URL(base).pathname.length));
        assert.ok((await stat(join(root, 'dist', path))).isFile(), `${page}: ${match[1]}`);
      }
    }
  }
});
test('Russian and English pages preserve language, current page, and reciprocal switches', async () => {
  for (const page of pages) {
    const html = await readFile(join(root, 'dist', page), 'utf8');
    assert.ok(html.includes(`<html lang="${page.startsWith('en/') ? 'en' : 'ru'}">`));
    assert.equal((html.match(/aria-current="page"/g) ?? []).length, 1);
    const other = page.startsWith('en/') ? '../' + page.slice(3) : 'en/' + page;
    assert.ok(html.includes(`class="language-switch" href="${other}"`));
  }
});
test('release overrides, missing dates, and stable chronological ordering', () => {
  const a = { repo: 'a', date: '2025-10-01' };
  const b = { repo: 'b', date: '2026-02-01' };
  const c = { repo: 'c', date: null };
  assert.deepEqual(sortedProjects([a, c, b]), [b, a, c]);
  assert.deepEqual(sortedProjects([a, b, c], { c: { releasedAt: '2026-10-01' } }), [c, b, a]);
  assert.equal(projectDate(a, { a: { releasedAt: '2027-01-01' } }).value, a.date);
  assert.equal(projectDate(c), null);
  assert.equal(projectDate(c, { c: { createdAt: '2024-01-01' } }).kind, 'created');
});
test('Amazing remains last regardless of dates; other groups sort by latest project', () => {
  const fixture = [{ repo: '1', group: 'amazing', date: '2030-01-01' }, { repo: '2', group: 'parsers', date: '2028-01-01' }, { repo: '3', group: 'products', date: '2026-01-01' }];
  const ordered = orderedGroups(groups, fixture);
  assert.equal(ordered[0].id, 'parsers');
  assert.equal(ordered.at(-1).id, 'amazing');
});
test('no invented achievements and a usable empty state in both languages', async () => {
  assert.deepEqual(await content('achievements'), []);
  for (const page of ['achievements.html', 'en/achievements.html']) {
    const html = await readFile(join(root, 'dist', page), 'utf8');
    assert.ok(html.includes('class="empty-state"'));
    assert.ok(!html.includes('class="achievement"'));
  }
});
test('document paths and external URLs cannot execute scripts or escape assets', () => {
  assert.equal(safeUrl('documents/diploma.pdf', { local: true }), 'documents/diploma.pdf');
  assert.throws(() => safeUrl('javascript:alert(1)'));
  assert.throws(() => safeUrl('documents/../../secret', { local: true }));
  assert.throws(() => safeUrl('//attacker.test/file', { local: true }));
});
test('every project has bilingual descriptions and a valid group', () => {
  for (const p of projects) {
    assert.ok(p.description.ru && p.description.en);
    assert.ok(groups.some(g => g.id === p.group));
    assert.ok(p.repo);
    if (p.date) assert.ok(!Number.isNaN(Date.parse(p.date)));
  }
});
test('adding real PDF and image achievements produces localized previews in date order', async () => {
  const fixture = await mkdtemp(join(tmpdir(), 'portfolio-test-'));
  try {
    for (const folder of ['scripts', 'content', 'public', 'assets']) await cp(join(root, folder), join(fixture, folder), { recursive: true });
    const items = [
      { id: 'pdf', date: '2025-01-01', title: { ru: 'Диплом', en: 'Diploma' }, issuer: { ru: 'Университет', en: 'University' }, file: 'documents/diploma.pdf' },
      { id: 'image', date: '2026-01-01', title: { ru: 'Сертификат', en: 'Certificate' }, issuer: { ru: 'Организатор', en: 'Organizer' }, file: 'documents/certificate.png' },
    ];
    await writeFile(join(fixture, 'content/achievements.json'), JSON.stringify(items));
    await writeFile(join(fixture, 'public/documents/diploma.pdf'), '%PDF-1.4\n');
    await writeFile(join(fixture, 'public/documents/certificate.png'), Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+aV1cAAAAASUVORK5CYII=', 'base64'));
    const build = spawnSync(process.execPath, ['scripts/build.mjs'], { cwd: fixture, encoding: 'utf8' });
    assert.equal(build.status, 0, build.stderr);
    for (const [page, imageTitle, pdfTitle] of [['achievements.html', 'Сертификат', 'Диплом'], ['en/achievements.html', 'Certificate', 'Diploma']]) {
      const html = await readFile(join(fixture, 'dist', page), 'utf8');
      assert.ok(html.indexOf(`<h2>${imageTitle}</h2>`) < html.indexOf(`<h2>${pdfTitle}</h2>`));
      assert.ok(html.includes('data-document-image='));
      assert.ok(html.includes(`href="${page.startsWith('en/') ? '../' : ''}documents/diploma.pdf"`));
    }
    items[0].file = 'documents/missing.pdf';
    await writeFile(join(fixture, 'content/achievements.json'), JSON.stringify(items));
    assert.notEqual(spawnSync(process.execPath, ['scripts/build.mjs'], { cwd: fixture }).status, 0, 'missing diploma must stop a broken deployment');
  } finally { await rm(fixture, { recursive: true, force: true }); }
});
test('search filters projects, reveals collapsed matches, reports no results, and resets', async () => {
  const element = props => ({ hidden: false, addEventListener(event, callback) { this[event] = callback; }, ...props });
  const rows = [element({ dataset: { search: 'diskclean rust' } }), element({ dataset: { search: 'pdn control react neurolife' } })];
  const groups = rows.map(row => element({ open: false, querySelectorAll: () => [row] }));
  const input = element({ value: '', focus() {} });
  const status = element({ dataset: { label: 'Found:' }, textContent: '' });
  const empty = element({});
  const clear = element({});
  const selectors = { '[data-search-input]': input, '[data-search-status]': status, '[data-no-results]': empty, '[data-clear-search]': clear };
  const document = { documentElement: { lang: 'en' }, querySelector: name => selectors[name] ?? null, querySelectorAll: name => name === '[data-project]' ? rows : name === '[data-group]' ? groups : [] };
  runInNewContext(await readFile(join(root, 'assets/app.js'), 'utf8'), { document });
  input.value = 'RUST'; input.input();
  assert.deepEqual(rows.map(row => row.hidden), [false, true]);
  assert.equal(groups[0].open, true);
  assert.equal(status.textContent, 'Found: 1');
  input.value = 'nonexistent'; input.input();
  assert.equal(empty.hidden, false);
  assert.equal(status.textContent, 'Found: 0');
  clear.click();
  assert.deepEqual(rows.map(row => row.hidden), [false, false]);
  assert.deepEqual(groups.map(group => group.open), [false, false]);
  assert.equal(empty.hidden, true);
});
