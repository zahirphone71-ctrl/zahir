(function () {
  try {
    var theme = localStorage.getItem('zctrl_global_app_theme') || 'classic_sapphire';
    document.documentElement.setAttribute('data-app-theme', theme);
    if (theme === 'clean_pearl') {
      document.documentElement.classList.add('light-mode');
    } else {
      document.documentElement.classList.remove('light-mode');
    }
  } catch (e) {
    // Storage access may be restricted in sandboxed contexts
  }
})();
