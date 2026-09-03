const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const fixtures = JSON.parse(fs.readFileSync(
  path.join(__dirname, 'fixtures', 'pricing_discount_budget.json'),
  'utf8'
));

const {
  PricingDomainError,
  calculateDiscountBudget,
  validateAdvisorDiscount
} = require('../utils/pricing');
const {
  getContractDate,
  getContractMonth,
  resolveMonthlyProductPricing,
  validateMonthlyPricingRows
} = require('../utils/monthlyPricing');

test('TDD-TC-056: motor JS coincide con casos dorados de Python', () => {
  for (const fixture of fixtures) {
    if (fixture.error) {
      assert.throws(
        () => calculateDiscountBudget(fixture.input),
        error => error instanceof PricingDomainError && error.code === fixture.error,
        fixture.name
      );
      continue;
    }
    assert.deepEqual(calculateDiscountBudget(fixture.input), fixture.expected, fixture.name);
  }
});

test('TDD-TC-071: el descuento incorporado consume un tope independiente', () => {
  const rows = Array.from({ length: 12 }, (_, index) => ({
    mes: index + 1,
    precio: index === 7 ? 911 : 1000,
    promo_dinero: index === 7 ? 89 : 0,
    promo_porcentaje: index === 7 ? 8.9 : 0,
    tope_descuento_mxn: index === 7 ? 150 : 0
  }));
  const validated = validateMonthlyPricingRows(rows, 1000);
  assert.equal(validated.get(8).precio, 911);
  assert.equal(calculateDiscountBudget({
    catalog_price: 1000,
    monthly_price: 911,
    promo_money: 89,
    promo_percent: 8.9,
    promotion_cap: 150
  }).advisor_discount_available, '61.00');
  assert.equal(calculateDiscountBudget({
    catalog_price: 7015,
    monthly_price: 5926,
    promo_money: 1089,
    promo_percent: 15.5239,
    promotion_cap: 1089
  }).advisor_discount_available, '0.00');
});

test('TDD-TC-066: acepta representaciones equivalentes y rechaza discrepancias', () => {
  assert.equal(calculateDiscountBudget({
    catalog_price: 7015,
    monthly_price: 5926,
    promo_money: 1089,
    promo_percent: 15.5239,
    promotion_cap: 1089
  }).total_promotion_cap, '1089.00');

  assert.throws(
    () => calculateDiscountBudget({
      catalog_price: 7015,
      monthly_price: 5926,
      promo_money: 1089,
      promo_percent: 15,
      promotion_cap: 1089
    }),
    error => error instanceof PricingDomainError
      && error.code === 'inconsistent_monthly_promotion'
  );
});

test('TDD-TC-071: resolvedor devuelve mensual, reducción, tope y saldo restante', async () => {
  const store = {
    async get() {
      return { precio: 6926, promo_dinero: 89, promo_porcentaje: 1.2687, tope_descuento_mxn: 1089 };
    }
  };
  const result = await resolveMonthlyProductPricing(store, {
    id: 7,
    list_price_mxn: 7015,
    producto: 'Hipopótamo'
  }, 8);

  assert.equal(result.catalogPrice, 7015);
  assert.equal(result.listPrice, 6926);
  assert.equal(result.embeddedDiscountMxn, 89);
  assert.equal(result.totalPromotionCapMxn, 1089);
  assert.equal(result.advisorDiscountAvailableMxn, 1000);
  assert.equal(result.product.list_price_mxn, 6926);
});

test('TDD-TC-071: servidor acepta solo el saldo adicional y rechaza excederlo', () => {
  assert.equal(validateAdvisorDiscount(1000, 1000), 1000);
  assert.throws(
    () => validateAdvisorDiscount(1000.01, 1000),
    error => error instanceof PricingDomainError
      && error.code === 'advisor_discount_exceeds_available'
  );
});

test('TDD-TC-059/060: todos los canales usan resolvedor y persisten snapshot', () => {
  const serverSource = fs.readFileSync(path.join(__dirname, '..', 'server.js'), 'utf8');
  const agentsSource = fs.readFileSync(path.join(__dirname, '..', 'agentsService.js'), 'utf8');
  const dbSource = fs.readFileSync(path.join(__dirname, '..', 'db.js'), 'utf8');

  assert.ok((serverSource.match(/resolveMonthlyProductPricing/g) || []).length >= 4);
  assert.match(agentsSource, /resolveMonthlyProductPricing/);
  assert.match(serverSource, /precio_catalogo_unitario/);
  assert.match(serverSource, /descuento_asesor_unitario/);
  assert.match(agentsSource, /precio_mensual_unitario/);
  assert.match(dbSource, /contrato_precio_version/);
});

test('TDD-TC-070: frontend muestra el límite mensual y usa el máximo del servidor', () => {
  const frontend = fs.readFileSync(path.join(__dirname, '..', 'public/js/app.js'), 'utf8');
  assert.match(frontend, /Descuento incluido en precio del mes/);
  assert.match(frontend, /Disponible para el asesor/);
  assert.match(frontend, /max_discount_mxn/);
});

test('TDD-TC-073: frontend convierte la barra acumulada a descuento adicional', () => {
  const frontend = fs.readFileSync(path.join(__dirname, '..', 'public/js/app.js'), 'utf8');
  const index = fs.readFileSync(path.join(__dirname, '..', 'public/index.html'), 'utf8');
  assert.match(frontend, /data-discount-floor/);
  assert.match(frontend, /sliderTotal\s*-\s*discountFloor/);
  assert.match(index, /app\.js\?v=2026090[13]-chg01[57]/);
  assert.match(index, /style\.css\?v=2026090[13]-chg01[57]/);
});

test('TDD-TC-074: esquema y endpoints conservan un tope independiente', () => {
  const dbSource = fs.readFileSync(path.join(__dirname, '..', 'db.js'), 'utf8');
  const serverSource = fs.readFileSync(path.join(__dirname, '..', 'server.js'), 'utf8');
  assert.match(dbSource, /tope_descuento_mxn/);
  assert.match(serverSource, /tope_descuento_mxn/);
});

test('TDD-TC-078: Programación y Cotizador muestran el nuevo contrato comercial', () => {
  const frontend = fs.readFileSync(path.join(__dirname, '..', 'public/js/app.js'), 'utf8');
  const index = fs.readFileSync(path.join(__dirname, '..', 'public/index.html'), 'utf8');
  assert.match(index, /id="programacion-product-base"/);
  assert.match(index, />Precio del mes \(\$\)</);
  assert.match(index, />Descuento del mes \(\$\)</);
  assert.match(index, />Asesor \(\$\)</);
  assert.doesNotMatch(index, />Promoción \(%\)</);
  assert.match(frontend, /<label>Precio base<\/label>/);
  assert.match(frontend, /calcItem\.precio_catalogo/);
  assert.match(frontend, /data-field="asesor_dinero"/);
});

test('TDD-TC-058: fecha contractual conserva su mes y runtime usa Mazatlán', () => {
  assert.equal(getContractMonth('2026-08-31'), 8);
  assert.equal(getContractMonth('2026-09-01'), 9);
  assert.equal(getContractMonth(new Date('2026-09-01T05:30:00.000Z')), 8);
  assert.equal(getContractDate(new Date('2026-09-01T05:30:00.000Z')), '2026-08-31');
});

test('TDD-TC-087: Cotizador usa paso entero y sincroniza bidireccionalmente el precio final', () => {
  const frontend = fs.readFileSync(path.join(__dirname, '..', 'public/js/app.js'), 'utf8');
  // 1. La barra de descuento debe usar step="1"
  assert.match(frontend, /class="discount-slider[^"]*item-discount-slider"[^>]*step="1"/);
  assert.match(frontend, /slider\.step\s*=\s*['"]1['"]/);

  // 2. Campo editable de precio final y handlers bidireccionales
  assert.match(frontend, /item-final-price-input/);
  assert.match(frontend, /onFinalPriceInputChange/);
  assert.match(frontend, /onFinalPriceInputBlur/);
  assert.match(frontend, /finalInput\.min\s*=\s*String\(minAllowedPrice\)/);
  assert.match(frontend, /item-final-price-min-val/);
  assert.match(frontend, /onchange="onFinalPriceInputBlur\(this\)"/);

  // 3. Simulación de la lógica bidireccional con restricción de precio mínimo
  const calculateBidirectional = ({ basePrice, nucleDiscount = 0, discountFloor = 0, maxAdditionalDiscount, targetPrice }) => {
    const minAllowedPrice = Math.round(Math.max((basePrice - nucleDiscount) - maxAdditionalDiscount, 0));
    const maxAllowedPrice = Math.round(Math.max(basePrice - nucleDiscount, 0));

    let sanitizedPrice = targetPrice;
    if (sanitizedPrice < minAllowedPrice) {
      sanitizedPrice = minAllowedPrice;
    } else if (sanitizedPrice > maxAllowedPrice) {
      sanitizedPrice = maxAllowedPrice;
    }

    const rawAdditional = (basePrice - nucleDiscount) - sanitizedPrice;
    const clampedAdditional = Math.max(0, Math.min(rawAdditional, maxAdditionalDiscount));
    const sliderTotal = discountFloor + clampedAdditional;
    const effectiveFinalPrice = Math.max((basePrice - clampedAdditional - nucleDiscount), 0);
    return { clampedAdditional, sliderTotal, effectiveFinalPrice, minAllowedPrice };
  };

  // Precio dentro del rango autorizado (ej: base 6826, asesor disponible 1000, piso 89)
  const inRange = calculateBidirectional({
    basePrice: 6826,
    nucleDiscount: 0,
    discountFloor: 89,
    maxAdditionalDiscount: 1000,
    targetPrice: 6000
  });
  assert.equal(inRange.clampedAdditional, 826);
  assert.equal(inRange.sliderTotal, 915);
  assert.equal(inRange.effectiveFinalPrice, 6000);

  // Precio por debajo del mínimo permitido (no puede ser menor a la condición autorizada)
  const belowMin = calculateBidirectional({
    basePrice: 6826,
    nucleDiscount: 0,
    discountFloor: 89,
    maxAdditionalDiscount: 1000,
    targetPrice: 4000
  });
  assert.equal(belowMin.minAllowedPrice, 5826);
  assert.equal(belowMin.clampedAdditional, 1000); // Acotado al máximo disponible
  assert.equal(belowMin.sliderTotal, 1089);
  assert.equal(belowMin.effectiveFinalPrice, 5826); // No baja de 5826 bajo ninguna condición

  // Precio por encima del base
  const aboveBase = calculateBidirectional({
    basePrice: 6826,
    nucleDiscount: 0,
    discountFloor: 89,
    maxAdditionalDiscount: 1000,
    targetPrice: 7500
  });
  assert.equal(aboveBase.clampedAdditional, 0);
  assert.equal(aboveBase.sliderTotal, 89);
  assert.equal(aboveBase.effectiveFinalPrice, 6826);
});
