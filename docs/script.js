(() => {
  const root = document.documentElement;
  const themeButton = document.getElementById('themeToggle');
  const storedTheme = (() => { try { return localStorage.getItem('soundscout_theme'); } catch (_) { return null; } })();
  if (storedTheme === 'dark' || storedTheme === 'light') root.dataset.theme = storedTheme;

  themeButton?.addEventListener('click', () => {
    const next = root.dataset.theme === 'dark' ? 'light' : 'dark';
    root.dataset.theme = next;
    try { localStorage.setItem('soundscout_theme', next); } catch (_) {}
  });

  const tabs = [...document.querySelectorAll('.nav-tab')];
  const panels = [...document.querySelectorAll('.tab-panel')];
  function activateTab(id) {
    tabs.forEach(tab => {
      const active = tab.dataset.tab === id;
      tab.classList.toggle('active', active);
      tab.setAttribute('aria-selected', String(active));
    });
    panels.forEach(panel => {
      const active = panel.id === id;
      panel.hidden = !active;
      panel.classList.toggle('active', active);
    });
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }
  tabs.forEach(tab => tab.addEventListener('click', () => activateTab(tab.dataset.tab)));

  let rating = 0;
  const ratingButtons = [...document.querySelectorAll('[data-rating]')];
  ratingButtons.forEach(button => button.addEventListener('click', () => {
    rating = Number(button.dataset.rating);
    ratingButtons.forEach(item => item.classList.toggle('selected', Number(item.dataset.rating) <= rating));
  }));

  document.getElementById('feedbackForm')?.addEventListener('submit', event => {
    event.preventDefault();
    const type = document.getElementById('feedbackType').value;
    const message = document.getElementById('feedbackMessage').value.trim();
    if (!message) return;
    const body = [
      '## Feedback',
      '',
      message,
      '',
      rating ? '**Experience rating:** ' + rating + '/5' : '',
      '',
      'Submitted from the SoundScout landing page.'
    ].filter(Boolean).join('\n');
    const url = 'https://github.com/aeroslayys/Soundscout/issues/new?title=' +
      encodeURIComponent('[Feedback] ' + type) + '&body=' + encodeURIComponent(body);
    window.open(url, '_blank', 'noopener,noreferrer');
  });

  const releaseNotesRoot = document.getElementById('publicReleaseNotes');
  if (releaseNotesRoot) {
    const apiBase = 'https://jellyfin-server.tail0a3780.ts.net/api';
    const escapeHtml = value => String(value ?? '').replace(/[&<>"']/g, char => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[char]));
    fetch(apiBase + '/release-notes?limit=8')
      .then(response => { if (!response.ok) throw new Error('Could not load updates.'); return response.json(); })
      .then(data => {
        const items = data.items || [];
        releaseNotesRoot.innerHTML = items.length ? items.map(item => '<article class="release-note-card"><div class="release-note-meta"><span>v' + escapeHtml(item.version) + '</span><time datetime="' + escapeHtml(item.published_at) + '">' + escapeHtml(new Date(item.published_at).toLocaleDateString(undefined, {year:"numeric",month:"short",day:"numeric"})) + '</time></div><h2>' + escapeHtml(item.title) + '</h2><p>' + escapeHtml(item.summary) + '</p><ul>' + (item.changes || []).map(change => '<li>' + escapeHtml(change) + '</li>').join('') + '</ul></article>').join('') : '<p class="release-notes-empty">No release notes yet. Check back soon.</p>';
      })
      .catch(() => { releaseNotesRoot.innerHTML = '<p class="release-notes-empty">Release notes are temporarily unavailable.</p>'; });
  }

  const year = document.getElementById('year');
  if (year) year.textContent = new Date().getFullYear();
})();