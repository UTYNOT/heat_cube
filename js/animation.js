(function() {
  function addSwirlClassIfMissing(root) {
    if (!root) return;
    var path = root.querySelector('svg path[stroke]');
    if (path && !path.classList.contains('swirl-path')) {
      path.classList.add('swirl-path');
    }
  }

  function configureSwirlLengths() {
    var paths = document.querySelectorAll('.swirl-path');
    paths.forEach(function(p) {
      try {
        var len = p.getTotalLength ? p.getTotalLength() : 1200;
        p.style.setProperty('--swirl-length', String(len));
        p.style.strokeDasharray = len;
        p.style.strokeDashoffset = len;
      } catch (e) {
        // no-op
      }
    });
  }

  function restartSwirlAnimation() {
    configureSwirlLengths();
    var paths = document.querySelectorAll('.swirl-path');
    paths.forEach(function(p) {
      try {
        p.style.animation = 'none';
        void p.offsetWidth;
        p.style.animation = '';
      } catch (e) {
        // no-op
      }
    });
  }

  window.restartSwirlAnimation = restartSwirlAnimation;

  document.addEventListener('DOMContentLoaded', function() {
    addSwirlClassIfMissing(document.querySelector('.landing-overlay .logo'));
    addSwirlClassIfMissing(document.querySelector('.viz-header .viz-logo'));
    // Ensure home page logo also gets tagged
    addSwirlClassIfMissing(document.querySelector('.landing .logo'));
    restartSwirlAnimation();
  });
})();
