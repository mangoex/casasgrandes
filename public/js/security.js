(function exposeSecurityUtils(root, factory) {
  const api = factory();
  if (typeof module === 'object' && module.exports) {
    module.exports = api;
  }
  if (root) {
    root.SecurityUtils = api;
    api.installInnerHtmlGuard();
  }
}(typeof window !== 'undefined' ? window : null, function createSecurityUtils() {
  function escapeHtml(value) {
    return String(value ?? '')
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#039;');
  }

  function renderSafeMarkdown(markdown) {
    if (!markdown) return '';
    let html = escapeHtml(markdown);
    html = html.replace(/^### (.*$)/gim, '<h5 style="margin-top:12px;margin-bottom:6px;font-size:15px;font-weight:600">$1</h5>');
    html = html.replace(/^## (.*$)/gim, '<h4 style="margin-top:16px;margin-bottom:8px;font-size:16px;font-weight:700">$1</h4>');
    html = html.replace(/^# (.*$)/gim, '<h3 style="margin-top:20px;margin-bottom:10px;font-size:18px;font-weight:800">$1</h3>');
    html = html.replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>');
    html = html.replace(/^\s*-\s*(.*$)/gim, '<li style="margin-left:20px;list-style-type:disc">$1</li>');
    return html.replace(/\n\n/g, '<br><br>');
  }

  const allowedHandlerFunctions = new Set([
    'addProductDirectlyToBuilder', 'assignClientDirectly', 'click', 'closeModal',
    'deleteCatalogClient', 'deleteCiclo', 'deleteCuentaClave', 'deleteEtapa',
    'deleteGlobalMeta', 'deletePlanActivity', 'deleteProducto',
    'desasociarCliente', 'disolverGrupoAsociados', 'editCatalogClient',
    'editEtapa', 'find', 'moveQuoteStatus', 'onDiscountSliderChange',
    'openAdminDecisionModal', 'openBidForm', 'openCompletePlanModal',
    'openEditAsesorModal', 'openEditCicloModal', 'openEditCuentaClaveModal',
    'openEditGlobalMetaModal', 'openEditMetaModal', 'openEditPlanModal',
    'openEditProductoModal', 'processBidDecision', 'querySelector',
    'recalculateEditQuoteTotal', 'removeEditQuoteItemRow', 'removeQuoteItemRow',
    'showAISuggestion', 'showQuoteDetails', 'toggleAsesorActiveStatus',
    'toggleAssociatedGroup', 'toggleCatalogClientSelection',
    'toggleClientBiddable', 'toggleKanbanQuoteSelection', 'toggleLogDetail',
    'toggleProductoActiveStatus', 'updateAssignBulkAction', 'viewQuoteInCRM'
  ]);

  function isAllowedHandler(value) {
    if (!value || /[<>\r\n`]|\b(?:alert|eval|Function|fetch|XMLHttpRequest|constructor|__proto__)\b/i.test(value)) {
      return false;
    }
    const calls = [...value.matchAll(/\b([A-Za-z_$][\w$]*)\s*\(/g)].map(match => match[1]);
    return calls.length > 0 && calls.every(name => allowedHandlerFunctions.has(name));
  }

  function isSafeUrl(value, attributeName) {
    const normalized = String(value || '').trim().replace(/[\u0000-\u001F\u007F\s]+/g, '');
    if (!normalized || normalized.startsWith('#') || normalized.startsWith('/')) return true;
    if (/^(?:https?:|mailto:|tel:)/i.test(normalized)) return true;
    return attributeName === 'src' && /^data:image\/(?:png|gif|jpe?g|webp);base64,/i.test(normalized);
  }

  function sanitizeFragment(container) {
    const blockedTags = 'script,iframe,object,embed,base,meta,link,svg,math,style';
    container.content.querySelectorAll(blockedTags).forEach(node => node.remove());
    container.content.querySelectorAll('*').forEach(element => {
      for (const attribute of [...element.attributes]) {
        const name = attribute.name.toLowerCase();
        if (name.startsWith('on')) {
          const eventAllowed = ['onclick', 'onchange', 'oninput'].includes(name);
          if (!eventAllowed || !isAllowedHandler(attribute.value)) element.removeAttribute(attribute.name);
          continue;
        }
        if (['href', 'src', 'action', 'formaction'].includes(name) && !isSafeUrl(attribute.value, name)) {
          element.removeAttribute(attribute.name);
          continue;
        }
        if (name === 'srcdoc') {
          element.removeAttribute(attribute.name);
          continue;
        }
        if (name === 'style' && /(?:url\s*\(|expression\s*\(|@import)/i.test(attribute.value)) {
          element.removeAttribute(attribute.name);
        }
      }
    });
  }

  function installInnerHtmlGuard() {
    if (typeof Element === 'undefined' || typeof document === 'undefined') return;
    const descriptor = Object.getOwnPropertyDescriptor(Element.prototype, 'innerHTML');
    if (!descriptor?.set || Element.prototype.__agriSafeInnerHtml) return;

    Object.defineProperty(Element.prototype, 'innerHTML', {
      configurable: descriptor.configurable,
      enumerable: descriptor.enumerable,
      get: descriptor.get,
      set(value) {
        const template = document.createElement('template');
        descriptor.set.call(template, String(value ?? ''));
        sanitizeFragment(template);
        descriptor.set.call(this, descriptor.get.call(template));
      }
    });
    Object.defineProperty(Element.prototype, '__agriSafeInnerHtml', { value: true });
  }

  return { escapeHtml, installInnerHtmlGuard, renderSafeMarkdown };
}));
