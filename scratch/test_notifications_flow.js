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
  const res = await request(
    `${BASE_URL}/api/auth/login`,
    { method: 'POST', headers: { 'X-Auth-Mode': 'bearer' } },
    { usernameOrEmail: email, password }
  );
  if (res.status !== 200) {
    throw new Error(`Login failed for ${email}: ${JSON.stringify(res.body)}`);
  }
  return res.body.token;
}

async function run() {
  console.log("=========================================");
  console.log("TESTING NOTIFICATIONS & ADVISOR FLOW");
  console.log("=========================================");
  
  let testClientId = null;
  
  try {
    // 1. Authenticate users
    console.log("\n1. Authenticating users...");
    const adminToken = await login('miguel.gonzalez@mobimuebles.com', 'password123');
    const advisorToken = await login('christian.casasgrandes@gmail.com', 'password123');
    const advisorId = 2; // Christian Alcantar Nieblas
    console.log("🟢 Admin and Advisor logged in.");
    
    // Clean up old notifications and clients
    console.log("\nCleaning old test clients/notifications...");
    await db.run("DELETE FROM crm_notificaciones WHERE mensaje LIKE '%TEST_NOTIF%'");
    await db.run("DELETE FROM crm_pujas WHERE justificacion LIKE '%TEST_NOTIF%'");
    await db.run("DELETE FROM clientes WHERE nombre = 'CLIENTE_TEST_NOTIF'");
    
    // 2. Create client and assign to Advisor
    console.log("\n2. Inserting test client and assigning to advisor via API...");
    const clientRes = await db.run(`
      INSERT INTO clientes (nombre, contacto, ubicacion, activo, disponible_para_puja, asesor_id)
      VALUES ('CLIENTE_TEST_NOTIF', 'Contacto Test', 'Ubicacion Test', 1, 0, NULL)
    `);
    testClientId = clientRes.id;
    console.log(`🟢 Client created with ID: ${testClientId}`);
    
    // Direct assign client to advisor
    console.log("\n3. Testing direct assignment notifications...");
    const assignRes = await request(`${BASE_URL}/api/asignacion/clientes/${testClientId}/asesor`, {
      method: 'PUT',
      headers: { 'Authorization': `Bearer ${adminToken}` }
    }, { asesor_id: advisorId });
    
    if (assignRes.status !== 200) {
      throw new Error(`Failed to assign: ${JSON.stringify(assignRes.body)}`);
    }
    console.log("🟢 Assigned directly via API.");
    
    // Verify notification was created
    const notifs = await db.all("SELECT * FROM crm_notificaciones WHERE asesor_id = ?", [advisorId]);
    console.log("Notifications in DB for advisor:", notifs);
    const hasAssignNotif = notifs.some(n => n.mensaje.includes('Se te ha asignado al agricultor: CLIENTE_TEST_NOTIF'));
    if (!hasAssignNotif) {
      throw new Error("Assign notification was not found in DB!");
    }
    console.log("🟢 Assignment notification verified successfully.");
    
    // 4. Test fetch notifications endpoint
    console.log("\n4. Testing GET /api/notificaciones...");
    const notifRes = await request(`${BASE_URL}/api/notificaciones`, {
      headers: { 'Authorization': `Bearer ${advisorToken}` }
    });
    
    if (notifRes.status !== 200) {
      throw new Error(`Failed to fetch notifications: ${JSON.stringify(notifRes.body)}`);
    }
    console.log(`🟢 Advisor retrieved ${notifRes.body.length} notifications.`);
    const matchedNotif = notifRes.body.find(n => n.mensaje.includes('Se te ha asignado al agricultor: CLIENTE_TEST_NOTIF'));
    if (!matchedNotif) {
      throw new Error("Notification not returned by API endpoint!");
    }
    console.log(`🟢 Notification verified in API response. leido = ${matchedNotif.leido}`);
    
    // 5. Mark notifications as read
    console.log("\n5. Testing POST /api/notificaciones/leido...");
    const markRes = await request(`${BASE_URL}/api/notificaciones/leido`, {
      method: 'POST',
      headers: { 'Authorization': `Bearer ${advisorToken}` }
    });
    
    if (markRes.status !== 200) {
      throw new Error(`Failed to mark read: ${JSON.stringify(markRes.body)}`);
    }
    console.log("🟢 Notifications marked read.");
    
    const notifAfter = await db.get("SELECT leido FROM crm_notificaciones WHERE id = ?", [matchedNotif.id]);
    if (notifAfter.leido !== 1) {
      throw new Error("Notification leido was not updated to 1!");
    }
    console.log("🟢 Verified leido status = 1 in DB.");
    
    // Clean up
    console.log("\nCleaning up test data...");
    await db.run("DELETE FROM crm_notificaciones WHERE id = ?", [matchedNotif.id]);
    await db.run("DELETE FROM clientes WHERE id = ?", [testClientId]);
    
    console.log("\n=========================================");
    console.log("   ALL NOTIFICATION TESTS PASSED!");
    console.log("=========================================");
    process.exit(0);
  } catch (err) {
    console.error("❌ Test failed:", err);
    if (testClientId) {
      await db.run("DELETE FROM clientes WHERE id = ?", [testClientId]).catch(() => {});
    }
    process.exit(1);
  }
}

run();
