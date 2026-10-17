(function () {
  'use strict';

  document.addEventListener('click', (event) => {
    const button = event.target && event.target.closest
      ? event.target.closest('#toggle-password, #toggle-confirm-password')
      : null;
    if (!button) return;
    event.preventDefault();
    event.stopImmediatePropagation();
    const confirm = button.id === 'toggle-confirm-password';
    const field = document.getElementById(confirm ? 'auth-confirm-password' : 'auth-password');
    if (!field) return;
    const visible = field.type === 'password';
    field.type = visible ? 'text' : 'password';
    button.textContent = visible ? 'Hide' : 'Show';
    button.setAttribute('aria-label', `${visible ? 'Hide' : 'Show'} ${confirm ? 'confirm password' : 'password'}`);
    button.setAttribute('aria-pressed', String(visible));
  }, true);

  document.querySelectorAll('[data-auth-mode]').forEach((button) => {
    button.addEventListener('click', () => {
      if (button.dataset.authMode !== 'signin') return;
      const field = document.getElementById('auth-confirm-password');
      const toggle = document.getElementById('toggle-confirm-password');
      if (field) field.type = 'password';
      if (toggle) {
        toggle.textContent = 'Show';
        toggle.setAttribute('aria-label', 'Show confirm password');
        toggle.setAttribute('aria-pressed', 'false');
      }
    }, true);
  });
})();
