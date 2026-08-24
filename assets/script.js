const initSite = () => {
  const toggle = document.querySelector('[data-menu-toggle]');
  const menu = document.querySelector('[data-menu]');

  if (toggle && menu) {
    const nav = toggle.closest('.nav');
    const volunteerLink = nav?.querySelector('.nav-cta .btn-ghost');

    if (volunteerLink && !menu.querySelector('.mobile-menu-action')) {
      const mobileVolunteerLink = volunteerLink.cloneNode(true);
      mobileVolunteerLink.classList.remove('btn', 'btn-ghost');
      mobileVolunteerLink.classList.add('mobile-menu-action');
      menu.appendChild(mobileVolunteerLink);
    }

    const closeMenu = () => {
      menu.classList.remove('open');
      toggle.setAttribute('aria-expanded', 'false');
      document.body.classList.remove('menu-open');
    };

    toggle.addEventListener('click', () => {
      const isOpen = menu.classList.toggle('open');
      toggle.setAttribute('aria-expanded', isOpen ? 'true' : 'false');
      document.body.classList.toggle('menu-open', isOpen);
    });

    menu.querySelectorAll('a').forEach((link) => {
      link.addEventListener('click', () => {
        if (!menu.classList.contains('open')) {
          return;
        }

        closeMenu();
      });
    });

    window.addEventListener('resize', () => {
      if (window.innerWidth > 860 && menu.classList.contains('open')) {
        closeMenu();
      }
    });

    document.addEventListener('click', (event) => {
      if (!menu.classList.contains('open')) {
        return;
      }

      if (menu.contains(event.target) || toggle.contains(event.target)) {
        return;
      }

      closeMenu();
    });

    document.addEventListener('keydown', (event) => {
      if (event.key !== 'Escape' || !menu.classList.contains('open')) {
        return;
      }

      closeMenu();
      toggle.focus();
    });
  }

  const revealTargets = Array.from(document.querySelectorAll(
    '.hero-card, .glow-panel, .card, .list-item, .timeline-item, .gallery-collection, .shop-card, .shop-banner, .contact-info, .contact-form, .cta-inner > div, .footer-top > div'
  ));

  if (revealTargets.length) {
    const getRevealTier = (element) => {
      if (element.matches('.hero-card, .glow-panel, .shop-banner, .cta-inner > div')) {
        return {
          className: 'reveal-strong',
          step: 120,
          cycle: 4,
        };
      }

      if (element.matches('.contact-info, .contact-form, .footer-top > div')) {
        return {
          className: 'reveal-soft',
          step: 65,
          cycle: 5,
        };
      }

      return {
        className: 'reveal-medium',
        step: 85,
        cycle: 6,
      };
    };

    revealTargets.forEach((element, index) => {
      element.classList.add('reveal-item');
      const tier = getRevealTier(element);
      element.classList.add(tier.className);
      element.style.setProperty('--reveal-delay', `${(index % tier.cycle) * tier.step}ms`);
    });

    if ('IntersectionObserver' in window) {
      const observer = new IntersectionObserver((entries) => {
        entries.forEach((entry) => {
          if (!entry.isIntersecting) {
            return;
          }

          entry.target.classList.add('is-visible');
          observer.unobserve(entry.target);
        });
      }, {
        threshold: 0.12,
        rootMargin: '0px 0px -8% 0px',
      });

      revealTargets.forEach((element) => observer.observe(element));
    } else {
      revealTargets.forEach((element) => element.classList.add('is-visible'));
    }
  }

  const lightbox = document.querySelector('[data-lightbox-modal]');

  if (!lightbox) {
    return;
  }

  const lightboxImage = lightbox.querySelector('[data-lightbox-image]') || lightbox.querySelector('img');
  const lightboxCaption = lightbox.querySelector('[data-lightbox-caption]');
  const lightboxCounter = lightbox.querySelector('[data-lightbox-counter]');
  const previousButton = lightbox.querySelector('[data-lightbox-prev]');
  const nextButton = lightbox.querySelector('[data-lightbox-next]');
  const galleryCollections = Array.from(document.querySelectorAll('.gallery-collection'));

  let activeCollection = null;
  let activeImageIndex = 0;

  const showPreview = (collectionState, nextIndex) => {
    collectionState.previewIndex = nextIndex;
    collectionState.thumbs.forEach((thumb, index) => {
      const isActive = index === nextIndex;
      thumb.classList.toggle('is-active', isActive);
      thumb.setAttribute('aria-hidden', isActive ? 'false' : 'true');
    });
  };

  const stopRotation = (collectionState) => {
    if (collectionState.intervalId) {
      window.clearInterval(collectionState.intervalId);
      collectionState.intervalId = null;
    }
  };

  const startRotation = (collectionState) => {
    if (collectionState.images.length < 2 || collectionState.intervalId) {
      return;
    }

    collectionState.intervalId = window.setInterval(() => {
      const nextIndex = (collectionState.previewIndex + 1) % collectionState.images.length;
      showPreview(collectionState, nextIndex);
    }, 3000);
  };

  const updateLightbox = () => {
    if (!activeCollection || !lightboxImage) {
      return;
    }

    const image = activeCollection.images[activeImageIndex];
    const hasMultipleImages = activeCollection.images.length > 1;

    lightboxImage.src = image.src;
    lightboxImage.alt = image.alt || activeCollection.title;

    if (lightboxCaption) {
      lightboxCaption.textContent = activeCollection.title;
    }

    if (lightboxCounter) {
      lightboxCounter.textContent = hasMultipleImages
        ? `${activeImageIndex + 1} of ${activeCollection.images.length}`
        : '';
    }

    [previousButton, nextButton].forEach((button) => {
      if (!button) {
        return;
      }

      button.hidden = !hasMultipleImages;
      button.disabled = !hasMultipleImages;
    });
  };

  const openCollection = (collectionState, startIndex = 0) => {
    activeCollection = collectionState;
    activeImageIndex = startIndex;
    updateLightbox();
    lightbox.classList.add('open');
    lightbox.setAttribute('aria-hidden', 'false');
    document.body.classList.add('lightbox-open');
  };

  const closeLightbox = () => {
    lightbox.classList.remove('open');
    lightbox.setAttribute('aria-hidden', 'true');
    document.body.classList.remove('lightbox-open');

    if (lightboxImage) {
      lightboxImage.src = '';
      lightboxImage.alt = '';
    }

    if (lightboxCounter) {
      lightboxCounter.textContent = '';
    }

    if (lightboxCaption) {
      lightboxCaption.textContent = '';
    }

    activeCollection = null;
    activeImageIndex = 0;
  };

  const changeLightboxImage = (direction) => {
    if (!activeCollection || activeCollection.images.length < 2) {
      return;
    }

    const totalImages = activeCollection.images.length;
    activeImageIndex = (activeImageIndex + direction + totalImages) % totalImages;
    updateLightbox();
  };

  if (galleryCollections.length) {
    galleryCollections.forEach((collection) => {
      const title = collection.querySelector('.gallery-collection-title')?.textContent?.trim() || 'Gallery collection';
      const thumbs = Array.from(collection.querySelectorAll('.gallery-thumb'));
      const images = thumbs
        .map((thumb) => {
          const image = thumb.querySelector('img');
          if (!image) {
            return null;
          }

          return {
            src: image.getAttribute('src') || '',
            alt: image.getAttribute('alt') || title,
          };
        })
        .filter(Boolean);

      if (!images.length) {
        return;
      }

      const collectionState = {
        element: collection,
        title,
        thumbs,
        images,
        intervalId: null,
        previewIndex: 0,
      };

      collection.dataset.imageCount = String(images.length);
      collection.tabIndex = 0;
      collection.setAttribute('role', 'button');
      collection.setAttribute('aria-label', `${title}. Open photo collection.`);

      thumbs.forEach((thumb, index) => {
        thumb.dataset.imageIndex = String(index);
        thumb.tabIndex = -1;
        thumb.setAttribute('aria-hidden', index === 0 ? 'false' : 'true');
      });

      showPreview(collectionState, 0);
      collection.classList.add('is-gallery-ready');
      startRotation(collectionState);

      collection.addEventListener('mouseenter', () => stopRotation(collectionState));
      collection.addEventListener('mouseleave', () => startRotation(collectionState));
      collection.addEventListener('focusin', () => stopRotation(collectionState));
      collection.addEventListener('focusout', () => startRotation(collectionState));

      collection.addEventListener('click', (event) => {
        event.preventDefault();
        const thumb = event.target.closest('.gallery-thumb');
        const selectedIndex = thumb ? Number(thumb.dataset.imageIndex || collectionState.previewIndex) : collectionState.previewIndex;
        openCollection(collectionState, selectedIndex);
      });

      collection.addEventListener('keydown', (event) => {
        if (event.key === 'Enter' || event.key === ' ') {
          event.preventDefault();
          openCollection(collectionState, collectionState.previewIndex);
        }
      });
    });
  }

  document.addEventListener('click', (event) => {
    const target = event.target.closest('[data-lightbox="true"]');
    if (!target || target.closest('.gallery-collection')) {
      return;
    }

    event.preventDefault();
    const singleImageCollection = {
      title: target.dataset.caption || target.getAttribute('alt') || 'Gallery image',
      images: [
        {
          src: target.getAttribute('src') || '',
          alt: target.getAttribute('alt') || 'Gallery image',
        },
      ],
    };

    openCollection(singleImageCollection, 0);
  });

  if (previousButton) {
    previousButton.addEventListener('click', (event) => {
      event.stopPropagation();
      changeLightboxImage(-1);
    });
  }

  if (nextButton) {
    nextButton.addEventListener('click', (event) => {
      event.stopPropagation();
      changeLightboxImage(1);
    });
  }

  lightbox.addEventListener('click', (event) => {
    if (event.target === lightbox || event.target.closest('[data-lightbox-close]')) {
      closeLightbox();
    }
  });

  document.addEventListener('keydown', (event) => {
    if (!lightbox.classList.contains('open')) {
      return;
    }

    if (event.key === 'Escape') {
      closeLightbox();
    }

    if (event.key === 'ArrowLeft') {
      changeLightboxImage(-1);
    }

    if (event.key === 'ArrowRight') {
      changeLightboxImage(1);
    }
  });
};

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', initSite, { once: true });
} else {
  initSite();
}
