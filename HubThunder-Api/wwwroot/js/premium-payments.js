(() => {
  let checkoutPending = false;
  document.addEventListener('submit', async event => {
    const form = event.target.closest('[data-premium-buy]');
    if (!form) return;
    event.preventDefault();
    if (checkoutPending) return;
    checkoutPending = true;
    const panel = form.closest('[data-premium-checkout]');
    const message = panel.querySelector('[data-payment-message]');
    const button = form.querySelector('button');
    const original = button.textContent;
    button.disabled = true;
    button.setAttribute('aria-busy', 'true');
    button.textContent = panel.dataset.loading;
    message.textContent = '';
    form.dataset.requestId ||= crypto.randomUUID();
    try {
      const response = await fetch('/api/payments/nowpayments/create', {
        method: 'POST', credentials: 'same-origin',
        headers: {
          'Content-Type': 'application/json',
          RequestVerificationToken: form.querySelector('[name="__RequestVerificationToken"]').value
        },
        body: JSON.stringify({ requestId: form.dataset.requestId })
      });
      if (response.status === 401) {
        window.location.assign('/auth/discord/login?returnUrl=%2Fguides%2Funlock-premium');
        return;
      }
      const result = await response.json().catch(() => null);
      if (!response.ok) {
        const code = result?.error;
        const copy = code === 'discord_membership_required' ? panel.dataset.membershipError
          : code === 'discord_mapping_required' ? panel.dataset.mappingError
          : ['payment_unavailable', 'payment_storage_unavailable', 'provider_authentication_failed'].includes(code) ? panel.dataset.unavailableError
          : ['provider_rate_limited', 'provider_rejected_payment', 'payment_creation_failed', 'provider_timeout', 'provider_network_error', 'provider_invalid_response', 'provider_unavailable'].includes(code) ? panel.dataset.providerError
          : response.status === 400 ? panel.dataset.sessionError
          : [404, 405].includes(response.status) ? panel.dataset.routingError : panel.dataset.error;
        message.textContent = copy;
        const reference = [code, result?.traceId].filter(value => typeof value === 'string' && /^[a-zA-Z0-9_.:-]{1,100}$/.test(value)).join(' / ');
        if (reference) message.textContent += ` (${reference})`;
        delete form.dataset.requestId;
        return;
      }
      if (!result?.orderId) throw new Error('Invalid checkout response');
      if (result.status === 'activated') {
        window.location.assign(`/profile?paymentOrder=${encodeURIComponent(result.orderId)}`);
        return;
      }
      if (!result.paymentUrl) {
        window.location.assign(`/profile?paymentOrder=${encodeURIComponent(result.orderId)}`);
        return;
      }
      const address = new URL(result.paymentUrl);
      if (address.origin !== 'https://nowpayments.io' || address.pathname.replace(/\/$/, '') !== '/payment' || !address.searchParams.get('iid')) {
        throw new Error('Invalid payment destination');
      }
      window.location.assign(address.href);
    } catch {
      message.textContent = panel.dataset.error;
      delete form.dataset.requestId;
    } finally {
      checkoutPending = false;
      button.disabled = false;
      button.removeAttribute('aria-busy');
      button.textContent = original;
    }
  });

  const status = document.querySelector('[data-premium-payment-status]');
  if (!status) return;
  const heading = status.querySelector('h2');
  const detail = status.querySelector('[data-payment-detail]');
  let attempts = 0;
  const poll = async () => {
    if (!document.contains(status)) return;
    try {
      const response = await fetch(`/api/payments/nowpayments/orders/${encodeURIComponent(status.dataset.orderId)}`, {
        credentials: 'same-origin', cache: 'no-store'
      });
      if (!response.ok) {
        detail.textContent = status.dataset.unavailable;
        if (response.status === 401 || response.status === 404) return;
      } else {
        const result = await response.json();
        heading.textContent = result.status === 'activated' ? status.dataset.activated
          : result.status === 'failed' ? status.dataset.failed
          : result.status === 'review' ? status.dataset.review : status.dataset.processing;
        detail.textContent = result.status === 'activated' && result.roleSyncStatus !== 'synced' && result.roleSyncStatus !== 'external'
          ? status.dataset.rolePending : '';
        if (result.status === 'activated' || result.status === 'failed') return;
      }
    } catch { detail.textContent = status.dataset.unavailable; }
    if (++attempts < 120) window.setTimeout(poll, 5000);
  };
  poll();
})();
