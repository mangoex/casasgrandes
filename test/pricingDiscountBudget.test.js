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

test('TDD-TC-057: Programación rechaza reducción superior al tope antes de persistir', () => {
  const rows = Array.from({ length: 12 }, (_, index) => ({
    mes: index + 1,
    precio: index === 7 ? 800 : 1000,
    promo_dinero: index === 7 ? 150 : 0,
    promo_porcentaje: 0
  }));
  assert.throws(
    () => validateMonthlyPricingRows(rows, 1000),
    error => error instanceof PricingDomainError
      && error.code === 'monthly_discount_exceeds_promotion_cap'
  );
});

test('TDD-TC-066: acepta representaciones equivalentes y rechaza discrepancias', () => {
  assert.equal(calculateDiscountBudget({
    catalog_price: 7015,
    monthly_price: 5926,
    promo_money: 1089,
    promo_percent: 15.5239
  }).total_promotion_cap, '1089.00');

  assert.throws(
    () => calculateDiscountBudget({
      catalog_price: 7015,
      monthly_price: 5926,
      promo_money: 1089,
      promo_percent: 15
    }),
    error => error instanceof PricingDomainError
      && error.code === 'inconsistent_monthly_promotion'
  );
});

test('TDD-TC-058: resolvedor devuelve mensual, reducción, tope y saldo', async () => {
  const store = {
    async get() {
      return { precio: 6300, promo_dinero: 1089, promo_porcentaje: 0 };
    }
  };
  const result = await resolveMonthlyProductPricing(store, {
    id: 7,
    list_price_mxn: 7015,
    producto: 'Hipopótamo'
  }, 8);

  assert.equal(result.catalogPrice, 7015);
  assert.equal(result.listPrice, 6300);
  assert.equal(result.embeddedDiscountMxn, 715);
  assert.equal(result.totalPromotionCapMxn, 1089);
  assert.equal(result.advisorDiscountAvailableMxn, 374);
  assert.equal(result.product.list_price_mxn, 6300);
});

test('TDD-TC-058: servidor rechaza descuento que excede el saldo', () => {
  assert.equal(validateAdvisorDiscount(374, 374), 374);
  assert.throws(
    () => validateAdvisorDiscount(375, 374),
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

test('TDD-TC-061: frontend muestra contrato y usa el máximo del servidor', () => {
  const frontend = fs.readFileSync(path.join(__dirname, '..', 'public/js/app.js'), 'utf8');
  assert.match(frontend, /Descuento incluido por programación/);
  assert.match(frontend, /Descuento adicional disponible/);
  assert.match(frontend, /max_discount_mxn/);
});

test('TDD-TC-058: fecha contractual conserva su mes y runtime usa Mazatlán', () => {
  assert.equal(getContractMonth('2026-08-31'), 8);
  assert.equal(getContractMonth('2026-09-01'), 9);
  assert.equal(getContractMonth(new Date('2026-09-01T05:30:00.000Z')), 8);
  assert.equal(getContractDate(new Date('2026-09-01T05:30:00.000Z')), '2026-08-31');
});
