const db = require('./db');

function getVolumeMultiplier(qty) {
  if (qty < 40) return 1.00;
  if (qty < 60) return 0.95;
  if (qty < 80) return 0.90;
  if (qty < 90) return 0.85;
  return 0.80;
}

async function runTests() {
  console.log("====================================================");
  console.log("   RUNNING PRICE ENGINE INTEGRATION & UNIT TESTS");
  console.log("====================================================");

  try {
    // Test Case 1: 50 bags of Hipopótamo Acceleron for a 'Retener GOLD' client
    // 50 bags -> multiplier 0.95. base_usd = 62.10
    // Account tier discount = 115.00 MXN. TC = 18.70
    const prod = await db.get("SELECT * FROM productos WHERE producto = 'Hipopótamo Acceleron'");
    const cc = await db.get("SELECT * FROM cuentas_clave WHERE tier_name = 'Retener GOLD'");
    const season = await db.get("SELECT * FROM temporadas WHERE actividad = 'Precio JUL-SEP15'");

    console.log(`Product found: ${prod.producto} | Base USD: ${prod.base_usd}`);
    console.log(`Key Account Tier found: ${cc.tier_name} | Discount: ${cc.descuento_mxn} MXN`);

    const qty = 50;
    const volMultiplier = getVolumeMultiplier(qty);
    const usdPriceForTier = Math.round((prod.base_usd * volMultiplier) * 100) / 100;
    const mxnVolumePrice = Math.round(usdPriceForTier * 4.00 * 18.70);
    const netPrice = mxnVolumePrice - cc.descuento_mxn;
    const total = netPrice * qty;

    console.log(`Calculated Vol Multiplier: ${volMultiplier}`);
    console.log(`Calculated Tier USD Price: ${usdPriceForTier} USD`);
    console.log(`Calculated Volume MXN Price: ${mxnVolumePrice} MXN`);
    console.log(`Calculated Net Unit Price: ${netPrice} MXN (Expected: 4298.00)`);
    console.log(`Calculated Total Cost: ${total} MXN (Expected: 214900.00)`);

    if (netPrice === 4298.00 && total === 214900.00) {
      console.log("🟢 TEST CASE 1 PASSED!");
    } else {
      console.error("🔴 TEST CASE 1 FAILED!");
      process.exit(1);
    }

    // Test Case 2: 1 bag of A-7573 Acceleron in 'Precio JUL-SEP15' (12% off)
    const prod2 = await db.get("SELECT * FROM productos WHERE producto = 'A-7573 Acceleron'");
    console.log(`\nProduct 2 found: ${prod2.producto} | List Price: ${prod2.list_price_mxn}`);
    const discount = season.descuento_percentage !== undefined ? season.descuento_percentage : season.descuento_porcentaje;
    console.log(`Season: ${season.actividad} | Discount: ${discount}% | Action: ${season.estado_operacion}`);
    let seasonPrice = prod2.list_price_mxn;
    if (season.estado_operacion === 'Restar') {
      seasonPrice = prod2.list_price_mxn * (1 - discount / 100.0);
    } else {
      seasonPrice = prod2.list_price_mxn * (1 + discount / 100.0);
    }
    const netPrice2 = Math.round(seasonPrice);
    console.log(`Calculated Net Unit Price: ${netPrice2} MXN (Expected: 3051.00)`);

    if (netPrice2 === 3051.00) {
      console.log("🟢 TEST CASE 2 PASSED!");
    } else {
      console.error("🔴 TEST CASE 2 FAILED!");
      process.exit(1);
    }

    console.log("\n====================================================");
    console.log("   ALL TEST CASES PASSED SUCCESSFULLY!");
    console.log("====================================================");

  } catch (err) {
    console.error("Test execution encountered an error:", err);
    process.exit(1);
  }
}

runTests();
