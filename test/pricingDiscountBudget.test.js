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
  assert.match(frontend, /Descuento incluido por programación/);
  assert.match(frontend, /Límite configurado del mes/);
  assert.match(frontend, /max_discount_mxn/);
});

test('TDD-TC-073: frontend convierte la barra acumulada a descuento adicional', () => {
  const frontend = fs.readFileSync(path.join(__dirname, '..', 'public/js/app.js'), 'utf8');
  const index = fs.readFileSync(path.join(__dirname, '..', 'public/index.html'), 'utf8');
  assert.match(frontend, /data-discount-floor/);
  assert.match(frontend, /sliderTotal\s*-\s*discountFloor/);
  assert.match(frontend, /slider\.disabled\s*=\s*sliderMaxTotal\s*<=\s*embeddedDiscount/);
  assert.match(index, /app\.js\?v=20260901-chg012/);
  assert.match(index, /style\.css\?v=20260901-chg012/);
});

test('TDD-TC-074: esquema y endpoints conservan un tope independiente', () => {
  const dbSource = fs.readFileSync(path.join(__dirname, '..', 'db.js'), 'utf8');
  const serverSource = fs.readFileSync(path.join(__dirname, '..', 'server.js'), 'utf8');
  assert.match(dbSource, /tope_descuento_mxn/);
  assert.match(serverSource, /tope_descuento_mxn/);
});

test('TDD-TC-058: fecha contractual conserva su mes y runtime usa Mazatlán', () => {
  assert.equal(getContractMonth('2026-08-31'), 8);
  assert.equal(getContractMonth('2026-09-01'), 9);
  assert.equal(getContractMonth(new Date('2026-09-01T05:30:00.000Z')), 8);
  assert.equal(getContractDate(new Date('2026-09-01T05:30:00.000Z')), '2026-08-31');
});
