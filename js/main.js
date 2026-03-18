document.addEventListener('DOMContentLoaded', () => {

  // ========== FAQ CAROUSEL ==========
  const faqSection = document.querySelector('.faq');
  if (faqSection) {
    const track = faqSection.querySelector('.faq__track');
    const allCards = Array.from(track.querySelectorAll('.faq__card'));
    const prevBtn = faqSection.querySelector('.faq__nav--prev');
    const nextBtn = faqSection.querySelector('.faq__nav--next');
    const searchInput = faqSection.querySelector('.faq__search-input');

    let visibleCards = [...allCards];
    let currentIndex = 0;
    let debounceTimer = null;

    function getVisibleCount() {
      const w = window.innerWidth;
      if (w >= 1024) return 4;
      if (w >= 768) return 2;
      return 1;
    }

    function getMaxIndex() {
      return Math.max(0, visibleCards.length - getVisibleCount());
    }

    function updateNav() {
      prevBtn.disabled = currentIndex <= 0;
      nextBtn.disabled = currentIndex >= getMaxIndex();
    }

    function goTo(index) {
      const max = getMaxIndex();
      if (index < 0) index = 0;
      if (index > max) index = max;
      currentIndex = index;

      if (visibleCards.length > 0 && visibleCards[currentIndex]) {
        const offset = visibleCards[currentIndex].offsetLeft - track.offsetLeft;
        track.style.transform = `translateX(-${offset}px)`;
      } else {
        track.style.transform = 'translateX(0)';
      }

      updateNav();
    }

    function next() {
      goTo(currentIndex + 1);
    }

    function prev() {
      goTo(currentIndex - 1);
    }

    function filterCards(query) {
      const q = query.trim().toLowerCase();

      allCards.forEach(card => {
        const match = !q || card.getAttribute('data-question').includes(q);
        card.style.display = match ? '' : 'none';
      });

      visibleCards = allCards.filter(card => card.style.display !== 'none');
      currentIndex = 0;

      if (visibleCards.length > 0) {
        goTo(0);
      } else {
        track.style.transform = 'translateX(0)';
      }

      updateNav();
    }

    // Event listeners
    prevBtn.addEventListener('click', prev);
    nextBtn.addEventListener('click', next);

    searchInput.addEventListener('input', () => {
      clearTimeout(debounceTimer);
      debounceTimer = setTimeout(() => filterCards(searchInput.value), 200);
    });

    faqSection.addEventListener('keydown', (e) => {
      if (e.key === 'ArrowLeft') { prev(); e.preventDefault(); }
      if (e.key === 'ArrowRight') { next(); e.preventDefault(); }
    });

    let resizeTimer = null;
    window.addEventListener('resize', () => {
      clearTimeout(resizeTimer);
      resizeTimer = setTimeout(() => {
        goTo(Math.min(currentIndex, getMaxIndex()));
      }, 150);
    });

    // Initialize
    updateNav();
  }

  // ========== SCROLL ANIMATIONS ==========
  const revealSections = document.querySelectorAll('.reveal');

  if (revealSections.length > 0 && !window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
    const revealObserver = new IntersectionObserver((entries) => {
      entries.forEach(entry => {
        if (entry.isIntersecting) {
          entry.target.classList.add('reveal--visible');
          revealObserver.unobserve(entry.target);
        }
      });
    }, {
      threshold: 0.15,
      rootMargin: '-50px'
    });

    revealSections.forEach(section => revealObserver.observe(section));
  } else {
    // If reduced motion or no sections, show everything immediately
    revealSections.forEach(section => section.classList.add('reveal--visible'));
  }

});
