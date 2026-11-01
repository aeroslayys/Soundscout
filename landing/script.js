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

  const year = document.getElementById('year');
  if (year) year.textContent = new Date().getFullYear();
})();