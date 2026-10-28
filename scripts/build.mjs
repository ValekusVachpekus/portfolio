import { readFile, writeFile, mkdir, cp, rm, access } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { join, dirname } from 'node:path';
import { languages, localize, escapeHtml as e, projectDate, sortedProjects, orderedGroups, safeUrl } from './lib.mjs';

const root = fileURLToPath(new URL('../', import.meta.url));
const read = async file => JSON.parse(await readFile(join(root, 'content', file), 'utf8'));
const [profile, projects, groups, achievements] = await Promise.all(['profile.json', 'projects.json', 'groups.json', 'achievements.json'].map(read));
let metadata = {};
try { metadata = await read('github.json'); } catch (error) { if (error.code !== 'ENOENT') throw error; }
const output = join(root, 'dist');
const sorted = sortedProjects(projects, metadata);
const featured = profile.featuredProjects.map(id => {
  const project = projects.find(project => project.id === id);
  if (!project) throw new Error(`Unknown featured project: ${id}`);
  return project;
});
const achievementIds = new Set();
for (const item of achievements) {
  if (!item.id || achievementIds.has(item.id)) throw new Error('Achievement IDs must be present and unique');
  achievementIds.add(item.id);
  if (!item.title?.ru || !item.title?.en || !item.issuer?.ru || !item.issuer?.en) throw new Error(`Bilingual title and issuer required: ${item.id}`);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(item.date) || Number.isNaN(Date.parse(item.date))) throw new Error(`Invalid achievement date: ${item.id}`);
  for (const value of [item.file, item.preview].filter(Boolean)) {
    safeUrl(value, { local: true });
    if (!value.startsWith('documents/')) throw new Error(`Use local documents for achievements: ${item.id}`);
    await access(join(root, 'public', value));
  }
  if (!item.file || !/\.(pdf|png|jpe?g|webp|avif)$/i.test(item.file)) throw new Error(`Unsupported document: ${item.id}`);
  if (item.preview && !/\.(png|jpe?g|webp|avif)$/i.test(item.preview)) throw new Error(`Unsupported preview: ${item.id}`);
}
const text = {
  ru: {
    home: 'Главная', projects: 'Проекты', achievements: 'Достижения', contact: 'Связаться', skip: 'Перейти к содержимому',
    portfolio: 'Портфолио разработчика', selected: 'Избранные проекты', all: 'Все проекты', about: 'Обо мне',
    aboutTitle: 'Идея. Код. Результат.', skills: 'Технологии в проектах', education: 'Образование', focus: 'Направления',
    focusValue: 'Приложения / Веб / Автоматизация', based: 'Университет Иннополис', github: 'Код на GitHub',
    projectsIntro: 'Приложения, инструменты и эксперименты. Самостоятельные проекты и командная работа.',
    achievementsIntro: 'Дипломы, сертификаты и другие результаты за пределами репозиториев.',
    count: 'В репозиториях', solo: 'Самостоятельная разработка', lead: 'Team Lead · Frontend', client: 'Заказчик',
    role: 'Роль и вклад', code: 'Исходный код', demo: 'Открыть сервис', release: 'Релиз', created: 'Создан',
    noDate: 'Дата не указана', search: 'Найти проект', searchPlaceholder: 'Название, описание или технология',
    noResults: 'По этому запросу ничего не найдено.', reset: 'Сбросить поиск', found: 'Найдено проектов:',
    emptyTitle: 'Достижения — впереди.', emptyText: 'Этот раздел пополнится дипломами, сертификатами и результатами соревнований.',
    write: 'Обсудим вашу задачу?', writeText: 'Открыт к разговору о разработке и совместных проектах.', email: 'Написать на почту',
    document: 'Открыть документ', close: 'Закрыть просмотр', missing: 'Страница не найдена', back: 'На главную',
    footer: 'Приложения, веб-сервисы и автоматизация.', index: 'Индекс проектов', section: 'Раздел',
  },
  en: {
    home: 'About', projects: 'Projects', achievements: 'Achievements', contact: 'Get in touch', skip: 'Skip to content',
    portfolio: 'Developer portfolio', selected: 'Selected projects', all: 'All projects', about: 'About me',
    aboutTitle: 'Idea. Code. Outcome.', skills: 'Technologies in my projects', education: 'Education', focus: 'Focus',
    focusValue: 'Applications / Web / Automation', based: 'Innopolis University', github: 'Code on GitHub',
    projectsIntro: 'Applications, tools, and experiments. Independent projects and collaborative work.',
    achievementsIntro: 'Diplomas, certificates, and milestones beyond the repositories.',
    count: 'Repositories', solo: 'Independent developer', lead: 'Team Lead · Frontend', client: 'Client',
    role: 'Role & contribution', code: 'Source code', demo: 'Visit service', release: 'Released', created: 'Created',
    noDate: 'Date not specified', search: 'Find a project', searchPlaceholder: 'Name, description, or technology',
    noResults: 'No projects match your search.', reset: 'Clear search', found: 'Projects found:',
    emptyTitle: 'More milestones to come.', emptyText: 'This section will collect diplomas, certificates, and competition results.',
    write: 'Have something in mind?', writeText: 'Let’s talk about software and building something together.', email: 'Send an email',
    document: 'View document', close: 'Close preview', missing: 'Page not found', back: 'Back to home',
    footer: 'Applications, web services, and automation.', index: 'Project index', section: 'Section',
  },
};
const arrow = '<span aria-hidden="true">↗</span>';
const external = (url, label, cls = '') => `<a class="${cls}" href="${e(safeUrl(url))}" target="_blank" rel="noopener noreferrer">${label} ${arrow}</a>`;
const pageFile = page => page === 'home' ? 'index.html' : `${page}.html`;

function dateMarkup(project, lang) {
  const date = projectDate(project, metadata);
  if (!date) return '';
  const formatted = new Intl.DateTimeFormat(lang, { month: 'short', year: 'numeric', timeZone: 'UTC' }).format(new Date(date.value));
  return `<span class="project-date">${text[lang][date.kind]} <time datetime="${e(date.value)}">${e(formatted)}</time></span>`;
}

function projectRow(project, index, lang, compact = false) {
  const t = text[lang];
  const name = localize(project.name, lang);
  const technologies = project.technologies.length ? project.technologies : metadata[project.repo]?.languages ?? [];
  const searchText = `${name} ${localize(project.description, lang)} ${technologies.join(' ')} ${project.client ?? ''} ${project.role === 'solo' ? t.solo : t.lead}`;
  return `<article class="project-row${compact ? ' compact' : ''}" id="${e(project.id)}" data-project data-search="${e(searchText.toLocaleLowerCase(lang))}">
    <span class="project-number" aria-hidden="true">${String(index + 1).padStart(2, '0')}</span>
    <div class="project-main"><div class="project-heading"><h3>${e(name)}</h3>${dateMarkup(project, lang)}</div>
      <p class="project-description">${e(localize(project.description, lang))}</p>
      ${technologies.length ? `<ul class="technology-list" aria-label="${t.skills}">${technologies.map(tech => `<li>${e(tech)}</li>`).join('')}</ul>` : ''}
    </div>
    <div class="project-side"><p class="meta-label">${t.role}</p><p class="project-role">${project.role === 'solo' ? t.solo : t.lead}</p>
      ${project.client ? `<p class="client">${t.client}: ${e(project.client)}</p>` : ''}
      ${project.contribution && !compact ? `<p class="contribution">${e(localize(project.contribution, lang))}</p>` : ''}
      <div class="project-links">${external(`https://github.com/ValekusVachpekus/${project.repo}`, t.code)}${project.demo ? external(project.demo, t.demo) : ''}</div>
    </div>
  </article>`;
}

function home(lang) {
  const t = text[lang];
  return `<section class="hero" aria-labelledby="hero-title">
    <div class="hero-copy"><p class="eyebrow"><span class="square" aria-hidden="true"></span> ${t.portfolio}</p>
      <h1 id="hero-title">${e(localize(profile.firstName, lang))}<br><span>${e(localize(profile.lastName, lang))}.</span></h1>
      <p class="hero-title">${e(localize(profile.title, lang))}</p><p class="hero-intro">${e(localize(profile.intro, lang))}</p>
      <div class="hero-actions"><a class="button" href="projects.html">${t.projects} <span aria-hidden="true">↗</span></a><a class="text-link" href="#contact">${t.contact} <span aria-hidden="true">↗</span></a></div>
    </div>
    <aside class="hero-aside" aria-label="${t.about}"><div class="monogram" aria-hidden="true"><span class="monogram-top">ILIA / SHCHETKOV</span><span class="monogram-letters">is<span class="monogram-dot">.</span></span><div class="monogram-bottom"><span>SOFTWARE<br>DEVELOPER</span><span>CODE &<br>CRAFT</span></div></div>
      <dl class="hero-facts"><div><dt>${t.education}</dt><dd>${e(localize(profile.education, lang))}</dd></div><div><dt>${t.focus}</dt><dd>${t.focusValue}</dd></div></dl>
    </aside>
  </section>
  <section class="about-section" aria-labelledby="about-title"><p class="section-marker">01 / ${t.about}</p><div><h2 id="about-title">${t.aboutTitle}</h2><p class="about-copy">${e(localize(profile.about, lang))}</p><p class="meta-label">${t.skills}</p><ul class="skills-list">${profile.skills.map(skill => `<li>${e(skill)}</li>`).join('')}</ul></div></section>
  <section class="selected-section" aria-labelledby="selected-title"><div class="section-heading"><div><p class="section-marker">02 / ${t.projects}</p><h2 id="selected-title">${t.selected}<span class="heading-dot">.</span></h2></div><a class="text-link" href="projects.html">${t.all} <span aria-hidden="true">↗</span></a></div>${featured.map((p, i) => projectRow(p, i, lang, true)).join('')}</section>`;
}

function projectPage(lang) {
  const t = text[lang];
  const ordered = orderedGroups(groups, projects, metadata);
  return `<header class="page-heading"><p class="eyebrow">01 / ${t.index}</p><h1>${t.projects}<span class="heading-dot">.</span><sup>${String(projects.length).padStart(2, '0')}</sup></h1><p class="page-intro">${t.projectsIntro}</p></header>
  <div class="project-toolbar"><nav class="group-index" aria-label="${t.section}">${ordered.map(group => `<a href="#group-${group.id}">${e(localize(group.name, lang))}<span>${projects.filter(p => p.group === group.id).length}</span></a>`).join('')}</nav><div class="search-field"><label for="project-search">${t.search}</label><input id="project-search" type="search" placeholder="${t.searchPlaceholder}" autocomplete="off" data-search-input><span class="search-icon" aria-hidden="true">⌕</span></div></div>
  <p class="search-status" data-search-status role="status" aria-live="polite" data-label="${t.found}"></p>
  <div class="project-groups">${ordered.map((group, i) => `<details class="project-group" id="group-${group.id}" data-group open><summary><span class="folder-icon" aria-hidden="true"></span><span class="group-title">${e(localize(group.name, lang))}</span><span class="group-count">${String(projects.filter(p => p.group === group.id).length).padStart(2, '0')}</span><span class="group-toggle" aria-hidden="true"></span></summary><p class="group-description">${e(localize(group.description, lang))}</p><div>${sorted.filter(p => p.group === group.id).map((p, j) => projectRow(p, j, lang)).join('')}</div></details>`).join('')}</div>
  <div class="no-results" data-no-results hidden><p>${t.noResults}</p><button class="text-link" type="button" data-clear-search>${t.reset} ↗</button></div>`;
}

function achievementsPage(lang) {
  const t = text[lang];
  const prefix = lang === 'en' ? '../' : '';
  return `<header class="page-heading"><p class="eyebrow">02 / ${t.achievements}</p><h1>${t.achievements}<span class="heading-dot">.</span></h1><p class="page-intro">${t.achievementsIntro}</p></header>
  ${achievements.length ? `<div class="achievement-list">${[...achievements].sort((a, b) => b.date.localeCompare(a.date)).map(item => {
    const title = e(localize(item.title, lang));
    const file = `${prefix}${safeUrl(item.file, { local: true })}`;
    const preview = item.preview ? `${prefix}${safeUrl(item.preview, { local: true })}` : null;
    const image = /\.(png|jpe?g|webp|avif)$/i.test(item.file);
    return `<article class="achievement"><div class="achievement-image">${preview || image ? `<img src="${e(preview ?? file)}" alt="${title}" loading="lazy">` : '<span aria-hidden="true">PDF</span>'}</div><div><p class="eyebrow"><time datetime="${e(item.date)}">${e(new Intl.DateTimeFormat(lang, { year: 'numeric', month: 'long', timeZone: 'UTC' }).format(new Date(item.date)))}</time></p><h2>${title}</h2><p>${e(localize(item.issuer, lang))}</p>${item.description ? `<p>${e(localize(item.description, lang))}</p>` : ''}<a class="text-link" href="${e(file)}" target="_blank" rel="noopener noreferrer" ${image ? `data-document-image="${e(file)}" data-document-title="${title}"` : ''}>${t.document} ${arrow}</a></div></article>`;
  }).join('')}</div>` : `<section class="empty-state"><div class="document-symbol" aria-hidden="true"><span></span><span></span><span></span></div><p class="eyebrow">${t.achievements}</p><h2>${t.emptyTitle}</h2><p>${t.emptyText}</p><a class="text-link" href="projects.html">${t.projects} ${arrow}</a></section>`}
  <dialog class="document-dialog" aria-label="${t.document}"><button type="button" data-close-dialog aria-label="${t.close}">×</button><img alt=""><p></p></dialog>`;
}

function shell(content, lang, page) {
  const t = text[lang];
  const prefix = lang === 'en' ? '../' : '';
  const other = lang === 'ru' ? 'en' : 'ru';
  const alternate = lang === 'en' ? `../${pageFile(page)}` : `en/${pageFile(page)}`;
  const name = localize(profile.name, lang);
  const title = `${page === 'home' ? localize(profile.title, lang) : t[page] ?? t.missing} — ${name}`;
  return `<!doctype html>
<html lang="${lang}"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><meta name="color-scheme" content="light"><title>${e(title)}</title><meta name="description" content="${e(localize(profile.intro, lang))}"><meta property="og:title" content="${e(title)}"><meta property="og:description" content="${e(localize(profile.intro, lang))}"><meta property="og:type" content="website"><meta property="og:locale" content="${lang === 'ru' ? 'ru_RU' : 'en_US'}"><meta name="theme-color" content="#f7f7f2"><link rel="icon" href="${prefix}assets/favicon.svg" type="image/svg+xml"><link rel="stylesheet" href="${prefix}assets/style.css"><link rel="alternate" hreflang="${other}" href="${alternate}"><script src="${prefix}assets/app.js" defer></script></head>
<body data-page="${page}"><a class="skip-link" href="#main">${t.skip}</a><div class="site-shell"><header class="site-header"><a class="brand" href="index.html" aria-label="${e(name)} — ${t.home}">is<span>.</span></a><nav class="main-nav" aria-label="${lang === 'ru' ? 'Основная навигация' : 'Main navigation'}">${['home', 'projects', 'achievements'].map(key => `<a href="${pageFile(key)}" ${page === key ? 'aria-current="page"' : ''}>${t[key]}</a>`).join('')}</nav><div class="header-end"><a class="language-switch" href="${alternate}" lang="${other}" hreflang="${other}" aria-label="${other === 'en' ? 'Switch to English' : 'Переключить на русский'}">${other.toUpperCase()}</a><a class="header-contact" href="#contact">${t.contact} ${arrow}</a></div></header>
<main id="main">${content}</main>
<section class="contact-section" id="contact" aria-labelledby="contact-title"><div><p class="section-marker">03 / ${t.contact}</p><h2 id="contact-title">${t.write}</h2><p>${t.writeText}</p></div><div class="contact-links"><a class="contact-email" href="mailto:${e(profile.email)}">${e(profile.email)} ${arrow}</a><div>${external(profile.telegram, 'Telegram')}${external(profile.github, 'GitHub')}</div></div></section>
<footer class="site-footer"><span>© ${new Date().getUTCFullYear()} ${e(name)}</span><span>${t.footer}</span><a href="#main" aria-label="${lang === 'ru' ? 'Наверх' : 'Back to top'}">↑</a></footer></div></body></html>`;
}

await rm(output, { recursive: true, force: true });
await mkdir(join(output, 'en'), { recursive: true });
await cp(join(root, 'assets'), join(output, 'assets'), { recursive: true });
await cp(join(root, 'public'), output, { recursive: true });
for (const lang of languages) {
  for (const [page, render] of Object.entries({ home, projects: projectPage, achievements: achievementsPage })) {
    const target = join(output, lang === 'en' ? 'en' : '', pageFile(page));
    await mkdir(dirname(target), { recursive: true });
    await writeFile(target, shell(render(lang), lang, page));
  }
}
await writeFile(join(output, '404.html'), shell(`<section class="page-heading"><p class="eyebrow">404</p><h1>${text.ru.missing}<span class="heading-dot">.</span></h1><a class="text-link" href="index.html">${text.ru.back} ↗</a></section>`, 'ru', '404'));
// Relative links in a GitHub Pages 404 must resolve from the configured site root.
let base = process.env.BASE_PATH || '/';
base = '/' + base.split('/').filter(Boolean).join('/') + (base === '/' ? '' : '/');
const notFoundPath = join(output, '404.html');
await writeFile(notFoundPath, (await readFile(notFoundPath, 'utf8')).replace('<head>', `<head><base href="${e(base)}">`));
await writeFile(join(output, '.nojekyll'), '');
console.log(`Built 6 pages + 404 in ${output}`);
