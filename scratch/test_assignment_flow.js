const http = require('http');
const db = require('../db');

const BASE_URL = 'http://localhost:3000';

function request(url, options = {}, body = null) {
  return new Promise((resolve, reject) => {
    const parsedUrl = new URL(url);
    const reqOptions = {
      hostname: parsedUrl.hostname,
      port: parsedUrl.port || 80,
      path: parsedUrl.pathname + parsedUrl.search,
      method: options.method || 'GET',
      headers: {
        'Content-Type': 'application/json',
        ...options.headers
      }
    };
    
    const req = http.request(reqOptions, (res) => {
      let data = '';
      res.on('data', (chunk) => data += chunk);
      res.on('end', () => {
        try {
          const parsed = data ? JSON.parse(data) : {};
          resolve({ status: res.statusCode, body: parsed });
        } catch (err) {
          resolve({ status: res.statusCode, body: data });
        }
      });
    });
    
    req.on('error', reject);
    if (body) {
      req.write(typeof body === 'string' ? body : JSON.stringify(body));
    }
    req.end();
  });
}

async function login(email, password) {
  const res = await request(`${BASE_URL}/api/auth/login`, { method: 'POST' }, { usernameOrEmail: email, password });
  if (res.status !== 200) {
    throw new Error(`Login failed for ${email}: ${JSON.stringify(res.body)}`);
  }
  return res.body.token;
}

async function run() {
  console.log("=========================================");
  console.log("TESTING CLIENT ASSIGNMENT & BIDDING FLOW");
  console.log("=========================================");
  
  let testClientId = null;
  
  try {
    // 1. Authenticate users
    console.log("\n1. Authenticating users...");
    const adminToken = await login('miguel.gonzalez@mobimuebles.com', 'password123');
    console.log("🟢 Admin logged in.");
    
    const advisor1Token = await login('christian.casasgrandes@gmail.com', 'password123');
    const advisor1Id = 2; // Christian Alcantar Nieblas
    console.log("🟢 Advisor 1 logged in.");
    
    const advisor2Token = await login('arcenio.casasgrandes@gmail.com', 'password123');
    const advisor2Id = 3; // Arcenio Sepulveda Valle
    console.log("🟢 Advisor 2 logged in.");
    
    // Clean up any old test data
    console.log("\nCleaning old test clients/bids...");
    await db.run("DELETE FROM crm_pujas WHERE justificacion LIKE '%TEST_ASSIGNMENT%'");
    await db.run("DELETE FROM clientes WHERE nombre = 'CLIENTE_TEST_ASSIGNMENT'");
    
    // 2. Create test client
    console.log("\n2. Inserting test client in database...");
    const clientRes = await db.run(`
      INSERT INTO clientes (nombre, contacto, ubicacion, activo, disponible_para_puja, asesor_id)
      VALUES ('CLIENTE_TEST_ASSIGNMENT', 'Contacto Test', 'Ubicacion Test', 1, 0, NULL)
    `);
    testClientId = clientRes.id;
    console.log(`🟢 Test client created with ID: ${testClientId}`);
    
    // 3. Fetch unassigned clients and verify our test client is listed
    console.log("\n3. Testing GET /api/asignacion/sin-asesor...");
    const unassignedRes = await request(`${BASE_URL}/api/asignacion/sin-asesor`, {
      headers: { 'Authorization': `Bearer ${adminToken}` }
    });
    
    if (unassignedRes.status !== 200) {
      throw new Error(`Failed to fetch unassigned: ${JSON.stringify(unassignedRes.body)}`);
    }
    
    const unassignedList = unassignedRes.body;
    const testClient = unassignedList.find(c => c.id === testClientId);
    if (!testClient) {
      throw new Error("Test client not found in /api/asignacion/sin-asesor response");
    }
    console.log("🟢 Test client found in unassigned list. disponible_para_puja =", testClient.disponible_para_puja);
    
    // 4. Toggle biddable status using admin
    console.log("\n4. Testing PUT /api/clientes/:id/puja-status to make client biddable...");
    const statusRes = await request(`${BASE_URL}/api/clientes/${testClientId}/puja-status`, {
      method: 'PUT',
      headers: { 'Authorization': `Bearer ${adminToken}` }
    }, { disponible_para_puja: true });
    
    if (statusRes.status !== 200) {
      throw new Error(`Failed to update puja-status: ${JSON.stringify(statusRes.body)}`);
    }
    console.log("🟢 Status updated. API Response:", statusRes.body);
    
    const clientDbCheck = await db.get("SELECT disponible_para_puja FROM clientes WHERE id = ?", [testClientId]);
    if (clientDbCheck.disponible_para_puja !== 1) {
      throw new Error("Client is not marked as biddable in DB!");
    }
    console.log("🟢 Verified biddable status in DB is 1.");
    
    // 5. Submit bid from Advisor 1
    console.log("\n5. Placing bid from Advisor 1...");
    const bid1Res = await request(`${BASE_URL}/api/asignacion/pujas`, {
      method: 'POST',
      headers: { 'Authorization': `Bearer ${advisor1Token}` }
    }, { cliente_id: testClientId, justificacion: 'Justificacion de Advisor 1 - TEST_ASSIGNMENT' });
    
    if (bid1Res.status !== 200) {
      throw new Error(`Failed to place bid 1: ${JSON.stringify(bid1Res.body)}`);
    }
    const bid1Id = bid1Res.body.bidId;
    console.log(`🟢 Bid 1 placed successfully, ID: ${bid1Id}`);
    
    // 6. Submit bid from Advisor 2
    console.log("\n6. Placing bid from Advisor 2...");
    const bid2Res = await request(`${BASE_URL}/api/asignacion/pujas`, {
      method: 'POST',
      headers: { 'Authorization': `Bearer ${advisor2Token}` }
    }, { cliente_id: testClientId, justificacion: 'Justificacion de Advisor 2 - TEST_ASSIGNMENT' });
    
    if (bid2Res.status !== 200) {
      throw new Error(`Failed to place bid 2: ${JSON.stringify(bid2Res.body)}`);
    }
    const bid2Id = bid2Res.body.bidId;
    console.log(`🟢 Bid 2 placed successfully, ID: ${bid2Id}`);
    
    // 7. Verify bid filtering
    console.log("\n7. Verifying /api/asignacion/pujas visibility...");
    const adminBidsRes = await request(`${BASE_URL}/api/asignacion/pujas`, {
      headers: { 'Authorization': `Bearer ${adminToken}` }
    });
    
    const adv1BidsRes = await request(`${BASE_URL}/api/asignacion/pujas`, {
      headers: { 'Authorization': `Bearer ${advisor1Token}` }
    });
    
    console.log(`Admin sees ${adminBidsRes.body.length} total bids.`);
    console.log(`Advisor 1 sees ${adv1BidsRes.body.length} bids.`);
    
    const adminHasBoth = adminBidsRes.body.some(b => b.id === bid1Id) && adminBidsRes.body.some(b => b.id === bid2Id);
    const adv1HasOnlyOwn = adv1BidsRes.body.some(b => b.id === bid1Id) && !adv1BidsRes.body.some(b => b.id === bid2Id);
    
    if (!adminHasBoth) {
      throw new Error("Admin did not see both bids!");
    }
    if (!adv1HasOnlyOwn) {
      throw new Error("Advisor 1 saw Advisor 2's bid or failed to see own bid!");
    }
    console.log("🟢 Bid visibility and filtering are correct.");
    
    // 8. Decide on bid (Admin approves Bid 1)
    console.log("\n8. Approving Advisor 1's bid as Admin...");
    const decisionRes = await request(`${BASE_URL}/api/asignacion/pujas/${bid1Id}/decision`, {
      method: 'POST',
      headers: { 'Authorization': `Bearer ${adminToken}` }
    }, { decision: 'Aprobada' });
    
    if (decisionRes.status !== 200) {
      throw new Error(`Failed to approve bid: ${JSON.stringify(decisionRes.body)}`);
    }
    console.log("🟢 Bid approved. API Response:", decisionRes.body);
    
    // Verify changes in DB
    const clientAfterBid = await db.get("SELECT asesor_id, disponible_para_puja FROM clientes WHERE id = ?", [testClientId]);
    const bid1After = await db.get("SELECT estatus FROM crm_pujas WHERE id = ?", [bid1Id]);
    const bid2After = await db.get("SELECT estatus FROM crm_pujas WHERE id = ?", [bid2Id]);
    
    console.log("Client assignment after bid decision:", clientAfterBid);
    console.log("Bid 1 status:", bid1After.estatus);
    console.log("Bid 2 status:", bid2After.estatus);
    
    if (clientAfterBid.asesor_id !== advisor1Id || clientAfterBid.disponible_para_puja !== 0) {
      throw new Error("Client was not correctly assigned or reset from biddable!");
    }
    if (bid1After.estatus !== 'Aprobada' || bid2After.estatus !== 'Rechazada') {
      throw new Error("Bids statuses were not correctly updated!");
    }
    console.log("🟢 Bid decision changes verified successfully in DB.");
    
    // 9. Reset client and test direct assignment
    console.log("\n9. Resetting client to test direct assignment...");
    await db.run("UPDATE clientes SET asesor_id = NULL WHERE id = ?", [testClientId]);
    
    const directRes = await request(`${BASE_URL}/api/asignacion/clientes/${testClientId}/asesor`, {
      method: 'PUT',
      headers: { 'Authorization': `Bearer ${adminToken}` }
    }, { asesor_id: advisor2Id });
    
    if (directRes.status !== 200) {
      throw new Error(`Direct assignment failed: ${JSON.stringify(directRes.body)}`);
    }
    console.log("🟢 Direct assignment response:", directRes.body);
    
    const clientAfterDirect = await db.get("SELECT asesor_id FROM clientes WHERE id = ?", [testClientId]);
    if (clientAfterDirect.asesor_id !== advisor2Id) {
      throw new Error("Client was not correctly assigned directly!");
    }
    console.log("🟢 Verified direct assignment in DB.");
    
    // 10. Clean up
    console.log("\nCleaning up test data...");
    await db.run("DELETE FROM crm_pujas WHERE id IN (?, ?)", [bid1Id, bid2Id]);
    await db.run("DELETE FROM clientes WHERE id = ?", [testClientId]);
    
    console.log("\n=========================================");
    console.log("   ALL INTEGRATION TESTS PASSED!");
    console.log("=========================================");
    process.exit(0);
  } catch (err) {
    console.error("❌ Test failed:", err);
    // Attempt cleanup if possible
    if (testClientId) {
      await db.run("DELETE FROM crm_pujas WHERE cliente_id = ?", [testClientId]).catch(() => {});
      await db.run("DELETE FROM clientes WHERE id = ?", [testClientId]).catch(() => {});
    }
    process.exit(1);
  }
}

run();
