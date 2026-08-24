(() => {
  const STORE_KEY = 'sscf-cart-v1';
  let storeConfigPromise = null;
  let successCartCleared = false;

  function getStoreConfigUrl() {
    return new URL('data/store-config.json', window.location.href).toString();
  }

  async function loadStoreConfig() {
    if (!storeConfigPromise) {
      storeConfigPromise = fetch(getStoreConfigUrl(), { cache: 'no-store' }).then((response) => {
        if (!response.ok) {
          throw new Error('Unable to load storefront configuration.');
        }

        return response.json();
      });
    }

    return storeConfigPromise;
  }

  function formatMoney(value, currency = 'GHS') {
    return `${currency} ${Number(value || 0).toFixed(2)}`;
  }

  function readCart() {
    try {
      return JSON.parse(window.localStorage.getItem(STORE_KEY) || '[]');
    } catch (error) {
      return [];
    }
  }

  function saveCart(cart) {
    window.localStorage.setItem(STORE_KEY, JSON.stringify(cart));
  }

  function clearCart() {
    window.localStorage.removeItem(STORE_KEY);
  }

  function addToCart(sku, quantity) {
    const cart = readCart();
    const existing = cart.find((item) => item.sku === sku);

    if (existing) {
      existing.quantity += quantity;
    } else {
      cart.push({ sku, quantity });
    }

    saveCart(cart);
    return cart;
  }

  function setCartItemQuantity(sku, quantity) {
    const cart = readCart().map((item) => (
      item.sku === sku
        ? { ...item, quantity: Math.max(1, Math.min(20, Number(quantity) || 1)) }
        : item
    ));
    saveCart(cart);
    return cart;
  }

  function removeFromCart(sku) {
    const cart = readCart().filter((item) => item.sku !== sku);
    saveCart(cart);
    return cart;
  }

  function normalizeCartWithConfig(cart, config) {
    const productMap = new Map((config.products || []).map((product) => [product.sku, product]));
    const normalized = cart
      .filter((item) => productMap.has(item.sku))
      .map((item) => ({
        sku: item.sku,
        quantity: Math.max(1, Math.min(20, Number(item.quantity) || 1)),
      }))
      .filter((item) => {
        const product = productMap.get(item.sku);
        return product && product.purchasable && !product.enquireOnly;
      });

    if (JSON.stringify(normalized) !== JSON.stringify(cart)) {
      saveCart(normalized);
    }

    return normalized;
  }

  function buildCartDetails(config) {
    const currency = config.currency || 'GHS';
    const products = new Map((config.products || []).map((product) => [product.sku, product]));
    const cart = normalizeCartWithConfig(readCart(), config);
    const items = cart.map((item) => {
      const product = products.get(item.sku);
      return {
        ...item,
        ...product,
        lineTotal: Number(product.price || 0) * item.quantity,
      };
    });
    const subtotal = items.reduce((sum, item) => sum + item.lineTotal, 0);
    const itemCount = items.reduce((sum, item) => sum + item.quantity, 0);
    return { cart, currency, itemCount, items, subtotal };
  }

  function hydrateShopCard(card, product, currency) {
    card.dataset.sku = product.sku;
    const heading = card.querySelector('h3');
    const description = card.querySelector('p');
    const image = card.querySelector('.shop-media img');
    const statusRow = card.querySelector('.shop-status-row');
    const actions = card.querySelector('.shop-actions');

    if (heading) {
      heading.textContent = product.name;
    }

    if (description) {
      description.textContent = product.description;
    }

    if (image) {
      image.alt = product.name;
      image.dataset.caption = product.name;
    }

    if (statusRow) {
      const badge = product.purchasable && !product.enquireOnly
        ? formatMoney(product.price, currency)
        : 'Enquire Only';
      statusRow.innerHTML = `<span class="shop-status muted">${badge}</span>`;
    }

    if (!actions) {
      return;
    }

    if (product.purchasable && !product.enquireOnly) {
      actions.innerHTML = `
        <div class="quantity-control" aria-label="Choose quantity for ${product.name}">
          <button type="button" class="qty-btn" data-qty-change="-1" aria-label="Reduce quantity">-</button>
          <input type="number" min="1" max="20" value="1" inputmode="numeric" aria-label="Quantity" data-qty-input />
          <button type="button" class="qty-btn" data-qty-change="1" aria-label="Increase quantity">+</button>
        </div>
        <button class="btn btn-primary" type="button" data-add-to-cart>Add To Cart</button>
        <a class="btn btn-ghost" href="contact.html">Enquire</a>
      `;

      const quantityInput = actions.querySelector('[data-qty-input]');
      actions.querySelectorAll('[data-qty-change]').forEach((button) => {
        button.addEventListener('click', () => {
          const delta = Number(button.dataset.qtyChange || '0');
          const nextValue = Math.max(1, Math.min(20, Number(quantityInput.value || '1') + delta));
          quantityInput.value = String(nextValue);
        });
      });

      quantityInput.addEventListener('change', () => {
        const safeValue = Math.max(1, Math.min(20, Number(quantityInput.value || '1')));
        quantityInput.value = String(safeValue);
      });

      const addButton = actions.querySelector('[data-add-to-cart]');
      addButton.addEventListener('click', async () => {
        const quantity = Math.max(1, Math.min(20, Number(quantityInput.value || '1')));
        addToCart(product.sku, quantity);
        quantityInput.value = '1';
        addButton.textContent = 'Added';
        addButton.disabled = true;
        await updateShopCartBanner();
        window.setTimeout(() => {
          addButton.textContent = 'Add To Cart';
          addButton.disabled = false;
        }, 1200);
      });
    } else {
      actions.innerHTML = `
        <a class="btn btn-ghost" href="contact.html">Enquire</a>
        <button class="btn btn-primary btn-disabled" type="button" disabled>Not Yet Available</button>
      `;
    }
  }

  async function updateShopCartBanner() {
    const banner = document.querySelector('[data-cart-banner]');
    if (!banner) {
      return;
    }

    const config = await loadStoreConfig();
    const cartDetails = buildCartDetails(config);
    const countNode = banner.querySelector('[data-cart-count]');
    const subtotalNode = banner.querySelector('[data-cart-subtotal]');
    const actionNode = banner.querySelector('[data-cart-action]');

    if (countNode) {
      countNode.textContent = `${cartDetails.itemCount} item${cartDetails.itemCount === 1 ? '' : 's'} in cart`;
    }

    if (subtotalNode) {
      subtotalNode.textContent = formatMoney(cartDetails.subtotal, cartDetails.currency);
    }

    if (actionNode) {
      actionNode.classList.toggle('btn-disabled', cartDetails.itemCount === 0);
      actionNode.setAttribute('aria-disabled', cartDetails.itemCount === 0 ? 'true' : 'false');
      actionNode.textContent = cartDetails.itemCount === 0 ? 'Cart Is Empty' : 'Proceed To Checkout';
      actionNode.href = cartDetails.itemCount === 0 ? 'shop.html' : 'checkout.html';
    }
  }

  async function initShopPage() {
    const grid = document.querySelector('[data-shop-grid]');
    if (!grid) {
      return;
    }

    const config = await loadStoreConfig();
    const cardMap = new Map(Array.from(grid.querySelectorAll('[data-product-card]')).map((card) => [card.dataset.sku, card]));
    (config.products || []).forEach((product) => {
      const card = cardMap.get(product.sku);
      if (card) {
        hydrateShopCard(card, product, config.currency);
      }
    });

    await updateShopCartBanner();
  }

  function renderLineItems(items, currency) {
    return items.map((item) => `
      <div class="order-line">
        <div>
          <strong>${item.name}</strong>
          <span>${formatMoney(item.price, currency)} each</span>
        </div>
        <div class="order-line-actions">
          <div class="mini-control">
            <button type="button" class="mini-btn" data-cart-adjust="${item.sku}" data-delta="-1" aria-label="Reduce quantity">-</button>
            <span>Qty ${item.quantity}</span>
            <button type="button" class="mini-btn" data-cart-adjust="${item.sku}" data-delta="1" aria-label="Increase quantity">+</button>
          </div>
          <button type="button" class="link-btn" data-cart-remove="${item.sku}">Remove</button>
          <strong>${formatMoney(item.lineTotal, currency)}</strong>
        </div>
      </div>
    `).join('');
  }

  function toggleDeliveryFields(form, showDelivery) {
    const deliveryFields = form.querySelector('[data-delivery-fields]');
    if (!deliveryFields) {
      return;
    }

    deliveryFields.hidden = !showDelivery;
    deliveryFields.querySelectorAll('select, textarea, input').forEach((field) => {
      if (field.dataset.deliveryRequired === 'true') {
        field.required = showDelivery;
      }
    });
  }

  async function initCheckoutPage() {
    const checkoutPage = document.querySelector('[data-checkout-page]');
    if (!checkoutPage) {
      return;
    }

    const config = await loadStoreConfig();
    let details = buildCartDetails(config);
    const summaryList = checkoutPage.querySelector('[data-checkout-items]');
    const subtotalNode = checkoutPage.querySelector('[data-subtotal]');
    const deliveryNode = checkoutPage.querySelector('[data-delivery-fee]');
    const totalNode = checkoutPage.querySelector('[data-total]');
    const emptyState = checkoutPage.querySelector('[data-checkout-empty]');
    const form = checkoutPage.querySelector('form');
    const areaSelect = checkoutPage.querySelector('#delivery-area');
    const methodInputs = checkoutPage.querySelectorAll('input[name="fulfillment-method"]');
    const submitButton = checkoutPage.querySelector('[data-checkout-submit]');
    const note = checkoutPage.querySelector('[data-checkout-note]');

    if (areaSelect) {
      areaSelect.innerHTML = '<option value="">Choose an area</option>' + (config.deliveryZones || []).map((zone) => (
        `<option value="${zone.code}">${zone.name} - ${formatMoney(zone.fee, config.currency)}</option>`
      )).join('');
    }

    const renderTotals = () => {
      const method = form.querySelector('input[name="fulfillment-method"]:checked')?.value || 'pickup';
      const zone = (config.deliveryZones || []).find((entry) => entry.code === areaSelect?.value);
      const deliveryFee = method === 'delivery' && zone ? Number(zone.fee || 0) : 0;
      const total = Number(details.subtotal || 0) + deliveryFee;

      if (summaryList) {
        summaryList.innerHTML = details.items.length
          ? renderLineItems(details.items, details.currency)
          : '<p class="muted-copy">Your cart is empty. Return to the shop to add products.</p>';
      }

      if (subtotalNode) {
        subtotalNode.textContent = formatMoney(details.subtotal, details.currency);
      }

      if (deliveryNode) {
        deliveryNode.textContent = formatMoney(deliveryFee, details.currency);
      }

      if (totalNode) {
        totalNode.textContent = formatMoney(total, details.currency);
      }

      if (emptyState) {
        emptyState.hidden = details.items.length > 0;
      }

      toggleDeliveryFields(form, method === 'delivery');

      if (submitButton) {
        submitButton.disabled = details.items.length === 0;
        submitButton.classList.toggle('btn-disabled', details.items.length === 0);
      }
    };

    if (summaryList) {
      summaryList.addEventListener('click', async (event) => {
        const adjustButton = event.target.closest('[data-cart-adjust]');
        const removeButton = event.target.closest('[data-cart-remove]');

        if (adjustButton) {
          const sku = adjustButton.dataset.cartAdjust;
          const delta = Number(adjustButton.dataset.delta || '0');
          const cartItem = readCart().find((item) => item.sku === sku);
          if (!cartItem) {
            return;
          }
          setCartItemQuantity(sku, Number(cartItem.quantity || 1) + delta);
          details = buildCartDetails(config);
          renderTotals();
          return;
        }

        if (removeButton) {
          removeFromCart(removeButton.dataset.cartRemove);
          details = buildCartDetails(config);
          renderTotals();
          return;
        }
      });
    }

    methodInputs.forEach((input) => input.addEventListener('change', renderTotals));
    if (areaSelect) {
      areaSelect.addEventListener('change', renderTotals);
    }
    renderTotals();

    form.addEventListener('submit', async (event) => {
      event.preventDefault();
      if (!details.items.length) {
        return;
      }

      const formData = new FormData(form);
      const payload = {
        cart: details.cart,
        customer: {
          name: String(formData.get('name') || '').trim(),
          email: String(formData.get('email') || '').trim(),
          phone: String(formData.get('phone') || '').trim(),
          fulfillmentMethod: String(formData.get('fulfillment-method') || 'pickup').trim(),
          deliveryZoneCode: String(formData.get('delivery-area') || '').trim(),
          address: String(formData.get('address') || '').trim(),
          notes: String(formData.get('notes') || '').trim(),
        },
      };

      if (!payload.customer.name || !payload.customer.email || !payload.customer.phone) {
        note.textContent = 'Please complete your name, email, and phone number before continuing.';
        return;
      }

      if (payload.customer.fulfillmentMethod === 'delivery' && (!payload.customer.deliveryZoneCode || !payload.customer.address)) {
        note.textContent = 'Please choose a delivery area and provide a delivery address.';
        return;
      }

      submitButton.disabled = true;
      submitButton.textContent = 'Redirecting...';
      note.textContent = 'Preparing your payment page...';

      try {
        const response = await fetch('/api/checkout/cart', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify(payload),
        });
        const result = await response.json();

        if (!response.ok || !result.ok) {
          throw new Error(result.error || 'Unable to start checkout.');
        }

        window.location.href = result.checkoutUrl;
      } catch (error) {
        submitButton.disabled = false;
        submitButton.textContent = 'Pay Securely';
        note.textContent = error.message || 'We could not start checkout. Please try again.';
      }
    });
  }

  async function initDonatePage() {
    const donatePage = document.querySelector('[data-donate-page]');
    if (!donatePage) {
      return;
    }

    const config = await loadStoreConfig();
    const form = donatePage.querySelector('form');
    const amountInput = donatePage.querySelector('#donation-amount');
    const note = donatePage.querySelector('[data-donation-note]');
    const submitButton = donatePage.querySelector('[data-donation-submit]');
    const minimumAmount = Number(config.donation?.minimumAmount || 10);

    if (amountInput) {
      amountInput.min = String(minimumAmount);
      amountInput.placeholder = `${minimumAmount}`;
    }

    form.addEventListener('submit', async (event) => {
      event.preventDefault();
      const formData = new FormData(form);
      const payload = {
        amount: Number(formData.get('amount') || 0),
        name: String(formData.get('name') || '').trim(),
        email: String(formData.get('email') || '').trim(),
        phone: String(formData.get('phone') || '').trim(),
        note: String(formData.get('note') || '').trim(),
      };

      if (!payload.name || !payload.email || !payload.phone) {
        note.textContent = 'Please share your name, email, and phone number before continuing.';
        return;
      }

      if (!Number.isFinite(payload.amount) || payload.amount < minimumAmount) {
        note.textContent = `Donation amount must be at least ${formatMoney(minimumAmount, config.currency)}.`;
        return;
      }

      submitButton.disabled = true;
      submitButton.textContent = 'Redirecting...';
      note.textContent = 'Preparing your donation payment page...';

      try {
        const response = await fetch('/api/checkout/donation', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify(payload),
        });
        const result = await response.json();

        if (!response.ok || !result.ok) {
          throw new Error(result.error || 'Unable to start the donation checkout.');
        }

        window.location.href = result.checkoutUrl;
      } catch (error) {
        submitButton.disabled = false;
        submitButton.textContent = 'Continue To Secure Payment';
        note.textContent = error.message || 'We could not start the donation checkout. Please try again.';
      }
    });
  }

  async function initPaymentStatusPage() {
    const statusShell = document.querySelector('[data-payment-status]');
    if (!statusShell) {
      return;
    }

    const params = new URLSearchParams(window.location.search);
    const reference = params.get('reference');
    const titleNode = statusShell.querySelector('[data-status-title]');
    const copyNode = statusShell.querySelector('[data-status-copy]');
    const listNode = statusShell.querySelector('[data-status-details]');
    const badgeNode = statusShell.querySelector('[data-status-badge]');

    if (!reference) {
      if (titleNode) titleNode.textContent = 'Payment details not found.';
      if (copyNode) copyNode.textContent = 'Please return to the shop or donate page and try again.';
      return;
    }

    if (copyNode) {
      copyNode.textContent = 'Checking your payment details...';
    }

    try {
      const response = await fetch(`/api/payments/status?reference=${encodeURIComponent(reference)}`);
      const result = await response.json();

      if (!response.ok || !result.ok) {
        throw new Error(result.error || 'Unable to confirm this payment right now.');
      }

      const payment = result.payment;
      if (badgeNode) {
        badgeNode.textContent = payment.status === 'paid' ? 'PAID' : payment.status === 'pending' ? 'PENDING' : 'NOT COMPLETED';
      }

      const isSuccessShell = statusShell.dataset.statusView === 'success';
      const isPaid = payment.status === 'paid';

      if (titleNode) {
        titleNode.textContent = isPaid
          ? 'Payment confirmed successfully.'
          : isSuccessShell
            ? 'Payment is still being confirmed.'
            : 'Payment was not completed.';
      }

      if (copyNode) {
        copyNode.textContent = isPaid
          ? 'Thank you. Your payment has been confirmed and our team has received your details.'
          : payment.status === 'pending'
            ? 'Your payment is still pending confirmation. If you have already paid, refresh this page shortly.'
            : 'No money will be captured unless the payment is confirmed successfully. You can safely try again.';
      }

      if (listNode) {
        const itemMarkup = payment.items.length
          ? `<div class="status-items">${payment.items.map((item) => `<div class="order-line"><div><strong>${item.title}</strong><span>Qty ${item.quantity}</span></div><div>${formatMoney(item.lineTotal, payment.currency)}</div></div>`).join('')}</div>`
          : '';

        listNode.innerHTML = `
          <div class="detail-card">
            <span>Reference</span>
            <strong>${payment.reference}</strong>
          </div>
          <div class="detail-card">
            <span>Total</span>
            <strong>${formatMoney(payment.total, payment.currency)}</strong>
          </div>
          <div class="detail-card">
            <span>Type</span>
            <strong>${payment.kind === 'donation' ? 'Donation' : 'Shop Order'}</strong>
          </div>
          <div class="detail-card">
            <span>Fulfilment</span>
            <strong>${payment.fulfillmentMethod || 'Donation'}</strong>
          </div>
          ${itemMarkup}
        `;
      }

      if (payment.kind === 'shop' && payment.status === 'paid' && !successCartCleared) {
        clearCart();
        successCartCleared = true;
      }
    } catch (error) {
      if (titleNode) titleNode.textContent = 'We could not load your payment details.';
      if (copyNode) copyNode.textContent = error.message || 'Please refresh or contact the team for help.';
    }
  }

  async function initStorefront() {
    try {
      await initShopPage();
      await initCheckoutPage();
      await initDonatePage();
      await initPaymentStatusPage();
    } catch (error) {
      console.error(error);
    }
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initStorefront, { once: true });
  } else {
    initStorefront();
  }
})();
