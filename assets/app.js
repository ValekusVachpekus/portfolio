const search = document.querySelector('[data-search-input]');
if (search) {
  const rows = [...document.querySelectorAll('[data-project]')];
  const groups = [...document.querySelectorAll('[data-group]')];
  const status = document.querySelector('[data-search-status]');
  const empty = document.querySelector('[data-no-results]');
  const originalOpen = new Map();
  let searching = false;
  function filter() {
    const query = search.value.trim().toLocaleLowerCase(document.documentElement.lang);
    if (query && !searching) groups.forEach(group => originalOpen.set(group, group.open));
    rows.forEach(row => { row.hidden = !row.dataset.search.includes(query); });
    groups.forEach(group => {
      group.hidden = ![...group.querySelectorAll('[data-project]')].some(row => !row.hidden);
      if (query && !group.hidden) group.open = true;
      if (!query && searching) group.open = originalOpen.get(group) ?? true;
    });
    const count = rows.filter(row => !row.hidden).length;
    status.textContent = query ? `${status.dataset.label} ${count}` : '';
    empty.hidden = count > 0;
    searching = Boolean(query);
  }
  search.addEventListener('input', filter);
  document.querySelector('[data-clear-search]').addEventListener('click', () => { search.value = ''; filter(); search.focus(); });
  document.querySelectorAll('.group-index a').forEach(link => link.addEventListener('click', () => {
    const group = document.getElementById(link.hash.slice(1));
    if (group) { search.value = ''; filter(); group.open = true; }
  }));
}
const dialog = document.querySelector('.document-dialog');
if (dialog && typeof dialog.showModal === 'function') {
  document.querySelectorAll('[data-document-image]').forEach(link => link.addEventListener('click', event => {
    event.preventDefault();
    const image = dialog.querySelector('img');
    image.src = link.dataset.documentImage;
    image.alt = link.dataset.documentTitle;
    dialog.querySelector('p').textContent = link.dataset.documentTitle;
    dialog.showModal();
  }));
  dialog.querySelector('[data-close-dialog]').addEventListener('click', () => dialog.close());
  dialog.addEventListener('click', event => { if (event.target === dialog) dialog.close(); });
}
