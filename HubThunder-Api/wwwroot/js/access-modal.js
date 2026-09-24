(() => {
  const accessModal = document.querySelector('[data-access-modal]');
  const uploadModal = document.querySelector('[data-upload-modal]');
  const discordUploadModal = document.querySelector('[data-discord-upload-modal]');
  const config = window.hubAccess || {};
  const texts = config.texts || {};
  const loginUrl = `/auth/discord/login?returnUrl=${encodeURIComponent(config.returnUrl || '/')}`;
  let discordSubmissionStarted = false;
  const markDiscordUploadPending = () => document.querySelectorAll('[data-discord-upload]').forEach(trigger => {
    trigger.classList.add('is-loading');
    trigger.setAttribute('aria-busy', 'true');
    trigger.setAttribute('aria-disabled', 'true');
  });
  const closeOnBackdrop = (dialog, close) => dialog?.addEventListener('click', event => { if (event.target === dialog) close(); });
  const openAccess = type => {
    if (!accessModal) return;
    const premium = type === 'PREMIUM';
    accessModal.classList.toggle('is-premium-modal', premium);
    accessModal.querySelector('[data-access-label]').textContent = premium ? texts.premium : 'NSFW';
    accessModal.querySelector('[data-access-heading]').textContent = premium ? texts.premium : texts.nsfw;
    accessModal.querySelector('[data-access-copy]').textContent = premium ? texts.premiumDescription : (config.authenticated ? texts.member : texts.nsfwGuest);
    const steps = accessModal.querySelector('[data-access-steps]');
    steps.hidden = premium;
    steps.replaceChildren();
    const values = premium ? (texts.premiumSteps || []) : (config.authenticated ? [] : texts.nsfwSteps || []);
    values.forEach(value => { const item = document.createElement('li'); item.textContent = value; steps.append(item); });
    const benefits = accessModal.querySelector('[data-access-benefits]');
    benefits.replaceChildren(); benefits.hidden = !premium;
    if (premium) (texts.premiumBenefits || []).forEach(value => { const item = document.createElement('li'); item.textContent = value; benefits.append(item); });
    const login = accessModal.querySelector('[data-access-login]');
    login.textContent = config.authenticated ? texts.check : texts.register;
    login.href = loginUrl;
    // Checkout supplies its own sign-in action for unauthenticated buyers.
    login.hidden = premium;
    accessModal.querySelector('[data-access-discord]')?.toggleAttribute('hidden', premium);
    accessModal.querySelector('[data-premium-methods]')?.classList.toggle('premium-modal-compact', premium);
    accessModal.querySelector('[data-premium-methods]').hidden = !premium;
    let guide = accessModal.querySelector('[data-premium-guide]');
    if (!guide) {
      guide = document.createElement('a'); guide.className = 'guide-link'; guide.dataset.premiumGuide = '';
      guide.href = '/guides/unlock-premium';
      guide.textContent = document.documentElement.lang?.startsWith('ru') ? 'Руководство по Premium' : 'Premium guide';
      accessModal.querySelector('[data-premium-methods]').after(guide);
    }
    guide.hidden = !premium;
    accessModal.showModal();
  };
  window.hubOpenPremium = () => openAccess('PREMIUM');
  const openUpload = type => {
    const camouflage = type === 'Camouflage';
    if (config.authenticated) { location.href = camouflage ? '/upload?type=camouflage' : '/upload?type=sight'; return; }
    if (!uploadModal) return;
    uploadModal.querySelector('[data-upload-heading]').textContent = type === 'Camouflage' ? texts.uploadCamouflage : texts.uploadSight;
    uploadModal.querySelector('[data-upload-copy]').textContent = texts.uploadCopy;
    uploadModal.querySelector('[data-upload-moderation]').textContent = camouflage ? texts.uploadCamouflageModeration : texts.uploadSightModeration;
    uploadModal.querySelector('[data-upload-login]').href = loginUrl;
    uploadModal.showModal();
  };
  const openDiscordUpload = () => {
    if (config.authenticated) {
      if (discordSubmissionStarted) return;
      discordSubmissionStarted = true;
      markDiscordUploadPending();
      window.location.assign(config.discordSubmissionUrl);
      return;
    }
    if (!discordUploadModal) return;
    discordUploadModal.querySelector('[data-discord-upload-login]').href = loginUrl;
    discordUploadModal.showModal();
  };
  document.addEventListener('click', event => {
    const download = event.target.closest('[data-register-download="true"]');
    if (download) {
      event.preventDefault();
      const dialog = document.querySelector('[data-download-registration]');
      dialog.querySelector('[data-download-register-login]').href = download.href;
      dialog.showModal();
      try { window.umami?.track?.('registration_prompt_from_download'); } catch (_) { }
      return;
    }
    const accessTrigger = event.target.closest('[data-access-type]');
    if (accessTrigger?.dataset.accessType) { event.preventDefault(); openAccess(accessTrigger.dataset.accessType); return; }
    const uploadTrigger = event.target.closest('[data-upload-type]');
    if (uploadTrigger) { event.preventDefault(); openUpload(uploadTrigger.dataset.uploadType); }
    const discordUploadTrigger = event.target.closest('[data-discord-upload]');
    if (discordUploadTrigger) { event.preventDefault(); openDiscordUpload(); }
  });
  accessModal?.querySelector('[data-modal-close]')?.addEventListener('click', () => accessModal.close());
  uploadModal?.querySelector('[data-upload-close]')?.addEventListener('click', () => uploadModal.close());
  discordUploadModal?.querySelector('[data-discord-upload-close]')?.addEventListener('click', () => discordUploadModal.close());
  closeOnBackdrop(accessModal, () => accessModal.close());
  closeOnBackdrop(uploadModal, () => uploadModal.close());
  closeOnBackdrop(discordUploadModal, () => discordUploadModal.close());
  const registration = document.querySelector('[data-download-registration]');
  registration?.querySelector('[data-download-register-close]').addEventListener('click', () => registration.close());
  closeOnBackdrop(registration, () => registration.close());
})();
