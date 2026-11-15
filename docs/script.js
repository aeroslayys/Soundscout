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
        const formatDate = value => value ? new Date(value).toLocaleDateString(undefined, {year:"numeric",month:"short",day:"numeric"}) : '';
        releaseNotesRoot.innerHTML = items.length ? items.map((item, index) => {
          const changes = Array.isArray(item.changes) ? item.changes : [];
          return '<article class="release-note-card" role="button" tabindex="0" data-release-index="' + index + '" aria-label="Read release notes: ' + escapeHtml(item.title) + '">' +
            '<div class="release-note-meta"><span>v' + escapeHtml(item.version) + '</span><time datetime="' + escapeHtml(item.published_at) + '">' + escapeHtml(formatDate(item.published_at)) + '</time></div>' +
            '<h2>' + escapeHtml(item.title) + '</h2><p>' + escapeHtml(item.summary) + '</p>' +
            '<div class="release-note-card-footer"><span>' + changes.length + ' update' + (changes.length === 1 ? '' : 's') + '</span><span class="release-note-read">Read release notes <span aria-hidden="true">↗</span></span></div></article>';
        }).join('') : '<p class="release-notes-empty">No release notes yet. Check back soon.</p>';

        let releaseDialog = document.getElementById('releaseNoteDialog');
        if (!releaseDialog) {
          releaseDialog = document.createElement('dialog');
          releaseDialog.id = 'releaseNoteDialog';
          releaseDialog.className = 'release-note-dialog';
          releaseDialog.innerHTML = '<div class="release-note-dialog-inner"><form method="dialog"><button class="release-note-close" aria-label="Close release notes">×</button></form><div class="release-note-dialog-content"></div></div>';
          document.body.appendChild(releaseDialog);
          releaseDialog.addEventListener('click', event => {
            if (event.target === releaseDialog) releaseDialog.close();
          });
        }
        const openReleaseNote = index => {
          const item = items[index];
          if (!item) return;
          const changes = Array.isArray(item.changes) ? item.changes : [];
          releaseDialog.querySelector('.release-note-dialog-content').innerHTML =
            '<div class="release-note-meta"><span>v' + escapeHtml(item.version) + '</span><time>' + escapeHtml(formatDate(item.published_at)) + '</time></div>' +
            '<h2>' + escapeHtml(item.title) + '</h2><p class="release-note-dialog-summary">' + escapeHtml(item.summary) + '</p>' +
            (changes.length ? '<h3>What changed</h3><ul>' + changes.map(change => '<li>' + escapeHtml(change) + '</li>').join('') + '</ul>' : '');
          if (typeof releaseDialog.showModal === 'function') releaseDialog.showModal();
          else releaseDialog.setAttribute('open', '');
        };
        releaseNotesRoot.addEventListener('click', event => {
          const card = event.target.closest('[data-release-index]');
          if (card) openReleaseNote(Number(card.dataset.releaseIndex));
        });
        releaseNotesRoot.addEventListener('keydown', event => {
          const card = event.target.closest('[data-release-index]');
          if (card && (event.key === 'Enter' || event.key === ' ')) {
            event.preventDefault();
            openReleaseNote(Number(card.dataset.releaseIndex));
          }
        });
      })
      .catch(() => { releaseNotesRoot.innerHTML = '<p class="release-notes-empty">Release notes are temporarily unavailable.</p>'; });
  }

  const year = document.getElementById('year');
  if (year) year.textContent = new Date().getFullYear();
})();