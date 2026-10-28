export const languages = ['ru', 'en'];
export const localize = (value, lang) => typeof value === 'string' ? value : value?.[lang] ?? '';
export const escapeHtml = value => String(value ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);
export function projectDate(project, metadata = {}) {
  if (project.date) return { value: project.date, kind: 'release' };
  if (metadata[project.repo]?.releasedAt) return { value: metadata[project.repo].releasedAt, kind: 'release' };
  if (metadata[project.repo]?.createdAt) return { value: metadata[project.repo].createdAt, kind: 'created' };
  return null;
}
export function sortedProjects(projects, metadata = {}) {
  return [...projects].sort((a, b) => (projectDate(b, metadata)?.value ?? '').localeCompare(projectDate(a, metadata)?.value ?? ''));
}
export function orderedGroups(groups, projects, metadata = {}) {
  const newest = group => sortedProjects(projects.filter(p => p.group === group.id), metadata)[0];
  return [...groups].sort((a, b) => {
    if (a.id === 'amazing') return 1;
    if (b.id === 'amazing') return -1;
    return (projectDate(newest(b) ?? {}, metadata)?.value ?? '').localeCompare(projectDate(newest(a) ?? {}, metadata)?.value ?? '');
  });
}
export function safeUrl(value, { local = false } = {}) {
  if (local && /^documents\/[a-zA-Z0-9_./-]+$/.test(value) && !value.split('/').includes('..')) return value;
  const url = new URL(value);
  if (!['https:', 'mailto:'].includes(url.protocol)) throw new Error(`Unsupported URL: ${value}`);
  return value;
}
