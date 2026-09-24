document.querySelectorAll('[data-mod-gallery]').forEach((gallery) => {
  const thumbnails = [...gallery.querySelectorAll('[data-gallery-thumbnail]')];
  const mainImage = gallery.querySelector('.gallery-main-image img');
  const lightbox = gallery.querySelector('[data-gallery-lightbox]');
  const lightboxImage = gallery.querySelector('[data-gallery-lightbox-image]');
  let index = 0;

  const show = (next) => {
    index = (next + thumbnails.length) % thumbnails.length;
    const thumbnail = thumbnails[index];
    const src = thumbnail.dataset.gallerySrc;
    const alt = thumbnail.dataset.galleryAlt;
    mainImage.src = src;
    mainImage.alt = alt;
    lightboxImage.src = src;
    lightboxImage.alt = alt;
    gallery.querySelectorAll('[data-gallery-counter]').forEach((counter) => { counter.textContent = `${index + 1} / ${thumbnails.length}`; });
    thumbnails.forEach((item, itemIndex) => item.classList.toggle('is-active', itemIndex === index));
  };

  thumbnails.forEach((thumbnail) => thumbnail.addEventListener('click', () => show(Number(thumbnail.dataset.galleryIndex))));
  gallery.querySelectorAll('[data-gallery-prev]').forEach((button) => button.addEventListener('click', () => show(index - 1)));
  gallery.querySelectorAll('[data-gallery-next]').forEach((button) => button.addEventListener('click', () => show(index + 1)));
  gallery.querySelector('[data-gallery-open]').addEventListener('click', () => lightbox.showModal());
  gallery.querySelector('[data-gallery-close]').addEventListener('click', () => lightbox.close());
  lightbox.addEventListener('click', (event) => { if (event.target === lightbox) lightbox.close(); });
  lightbox.addEventListener('keydown', (event) => {
    if (event.key === 'ArrowLeft') { event.preventDefault(); show(index - 1); }
    if (event.key === 'ArrowRight') { event.preventDefault(); show(index + 1); }
  });
});
