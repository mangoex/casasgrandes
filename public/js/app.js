// API Base URL
const API_URL = ''; // Relative path since served on same host

// State Variables
let token = localStorage.getItem('token');
let user = JSON.parse(localStorage.getItem('user'));

// Global fetch interceptor for handling session expiration (401/403)
const originalFetch = window.fetch;
window.fetch = async function(...args) {
  try {
    const response = await originalFetch.apply(window, args);
    if (response.status === 401 || response.status === 403) {
      const resource = args[0];
      const urlStr = typeof resource === 'string' ? resource : (resource.url || '');
      if (!urlStr.includes('/api/auth/login')) {
        console.warn('Session expired or unauthorized. Redirecting to login...', urlStr);
        token = null;
        user = null;
        localStorage.removeItem('token');
        localStorage.removeItem('user');
        showLoginView();
        throw new Error('Session expired or unauthorized');
      }
    }
    return response;
  } catch (error) {
    if (error.message === 'Session expired or unauthorized') {
      throw error;
    }
    throw error;
  }
};

let activeClientId = null;
let quoteItemsCount = 0;
let allQuotes = [];
let allClients = [];
let allProducts = [];
let allSeasons = [];
let currentPlanList = [];
let currentCycleMetaMxn = 0;
let currentCycleMetaBags = 0;

// On Page Load
document.addEventListener('DOMContentLoaded', () => {
  initApp();
  setupPlanningSelectionListeners();
});

function setupPlanningSelectionListeners() {
  for (let i = 1; i <= 5; i++) {
    const cb = document.querySelector(`.day-select-checkbox[data-day="${i}"]`);
    if (cb) {
      cb.addEventListener('change', (e) => {
        toggleDaySelection(i, e.target.checked);
      });
    }
  }
}

// Initialize App Check Auth
function initApp() {
  if (token && user) {
    showAppView();
  } else {
    showLoginView();
  }
}

// Show/Hide Main Sections
function showLoginView() {
  document.getElementById('login-view').style.display = 'flex';
  document.getElementById('app-view').style.display = 'none';
}

function showAppView() {
  document.getElementById('login-view').style.display = 'none';
  document.getElementById('app-view').style.display = 'grid';
  
  // Set User Profile Display
  document.getElementById('user-display-name').textContent = user.nombre;
  document.getElementById('user-display-role').textContent = user.nivel_rol;
  
  // Handle Admin Sidebar Visibility
  if (user.nivel_rol === 'Administrador') {
    document.querySelectorAll('.admin-only').forEach(el => el.style.display = 'block');
  } else {
    document.querySelectorAll('.admin-only').forEach(el => el.style.display = 'none');
  }

  // Handle Admin or Coordinator Visibility
  if (user.nivel_rol === 'Administrador' || user.nivel_rol === 'Coordinador') {
    document.querySelectorAll('.admin-or-coordinator-only').forEach(el => {
      // If it is select dropdown, display it inline-block or block
      if (el.tagName === 'SELECT') {
        el.style.display = 'inline-block';
      } else {
        el.style.display = 'block';
      }
    });
  } else {
    document.querySelectorAll('.admin-or-coordinator-only').forEach(el => el.style.display = 'none');
  }

  // Handle production tab visibility
  const canProduce = ['Administrador', 'Almacen'].includes(user.nivel_rol);
  const tabProd = document.getElementById('tab-produccion');
  if (tabProd) {
    tabProd.style.display = canProduce ? 'block' : 'none';
  }

  // Adjust movement form visibility
  const showMovementForm = ['Administrador', 'Almacen', 'Acopio'].includes(user.nivel_rol);
  const formCard = document.getElementById('add-movement-form')?.closest('.card');
  if (formCard) {
    formCard.style.display = showMovementForm ? 'block' : 'none';
    const parentGrid = formCard.parentElement;
    if (parentGrid) {
      parentGrid.style.gridTemplateColumns = showMovementForm ? '1fr 1.5fr' : '1fr';
    }
  }
  
  // Bind Nav Links
  const navItems = document.querySelectorAll('.nav-links .nav-item');
  navItems.forEach(item => {
    item.addEventListener('click', (e) => {
      e.preventDefault();
      navItems.forEach(i => i.classList.remove('active'));
      item.classList.add('active');
      
      const target = item.getAttribute('data-target');
      const title = item.innerText.trim().replace(/^[^\s]+\s+/, '');
      
      // Sync with mobile bottom nav if it's one of the tabs
      const mobileNavItems = document.querySelectorAll('.mobile-bottom-nav .mobile-nav-item');
      mobileNavItems.forEach(mn => {
        mn.classList.remove('active');
        if (mn.getAttribute('data-target') === target) {
          mn.classList.add('active');
        }
      });
      
      switchView(target, title);
    });
  });

  // Bind Mobile Bottom Nav Links
  const mobileNavItems = document.querySelectorAll('.mobile-bottom-nav .mobile-nav-item');
  mobileNavItems.forEach(item => {
    item.addEventListener('click', (e) => {
      e.preventDefault();
      const target = item.getAttribute('data-target');
      
      // Update sidebar nav state
      navItems.forEach(i => {
        i.classList.remove('active');
        if (i.getAttribute('data-target') === target) {
          i.classList.add('active');
        }
      });
      
      // Update bottom nav state
      mobileNavItems.forEach(i => i.classList.remove('active'));
      item.classList.add('active');
      
      // Map targets to titles
      const titles = {
        'dashboard-view': 'Tablero General',
        'crm-view': 'Canal de Ventas',
        'planeacion-view': 'Planificación',
        'cotizador-view': 'Cotizador',
        'catalog-view': 'Catálogo de Productos'
      };
      
      switchView(target, titles[target] || 'AgriSales Pro');
    });
  });

  // Mobile drawer controls
  const mobileMenuBtn = document.getElementById('mobile-menu-btn');
  const sidebar = document.querySelector('aside');
  const backdrop = document.getElementById('sidebar-backdrop');
  
  if (mobileMenuBtn && sidebar && backdrop) {
    // Clone nodes to clear previous listener binds
    const newMobileMenuBtn = mobileMenuBtn.cloneNode(true);
    mobileMenuBtn.parentNode.replaceChild(newMobileMenuBtn, mobileMenuBtn);
    
    const newBackdrop = backdrop.cloneNode(true);
    backdrop.parentNode.replaceChild(newBackdrop, backdrop);
    
    const toggleSidebar = () => {
      sidebar.classList.toggle('active');
      newBackdrop.classList.toggle('active');
    };
    
    newMobileMenuBtn.addEventListener('click', toggleSidebar);
    newBackdrop.addEventListener('click', toggleSidebar);
    
    // Also, when a sidebar link is clicked on mobile, close the sidebar drawer
    const sidebarLinks = document.querySelectorAll('.nav-links .nav-item a');
    sidebarLinks.forEach(link => {
      link.addEventListener('click', () => {
        if (window.innerWidth <= 600) {
          sidebar.classList.remove('active');
          newBackdrop.classList.remove('active');
        }
      });
    });
  }
  
  // Load Default Dashboard View
  switchView('dashboard-view', 'Tablero General');
}

// Navigation Router
function switchView(viewId, title) {
  document.getElementById('view-title').textContent = title;
  
  const sections = document.querySelectorAll('.view-section');
  sections.forEach(sec => sec.classList.remove('active'));
  
  document.getElementById(viewId).classList.add('active');
  
  // Refresh specific views data
  if (viewId === 'dashboard-view') {
    loadDashboardData();
  } else if (viewId === 'crm-view') {
    loadCRMBoardData();
  } else if (viewId === 'clientes-view') {
    loadClientesCatalog();
  } else if (viewId === 'cotizador-view') {
    loadCotizadorConfig();
  } else if (viewId === 'catalog-view') {
    loadCatalogData();
  } else if (viewId === 'almacen-view') {
    loadAlmacenData();
  } else if (viewId === 'admin-view') {
    loadAdminData();
  } else if (viewId === 'planeacion-view') {
    loadPlaneacionView();
  }
}

// Helper headers loader
function getHeaders() {
  return {
    'Content-Type': 'application/json',
    'Authorization': `Bearer ${token}`
  };
}

// -------------------------------------------------------------
// LOGIN / LOGOUT LOGIC
// -------------------------------------------------------------
document.getElementById('login-form').addEventListener('submit', async (e) => {
  e.preventDefault();
  const usernameOrEmail = document.getElementById('login-username').value;
  const password = document.getElementById('login-password').value;
  const errorBox = document.getElementById('login-error');
  
  errorBox.style.display = 'none';
  
  try {
    const res = await fetch(`${API_URL}/api/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ usernameOrEmail, password })
    });
    
    const data = await res.json();
    if (!res.ok) {
      throw new Error(data.error || 'Login failed');
    }
    
    // Save login credentials
    token = data.token;
    user = data.user;
    localStorage.setItem('token', token);
    localStorage.setItem('user', JSON.stringify(user));
    
    showAppView();
  } catch (err) {
    errorBox.textContent = err.message;
    errorBox.style.display = 'block';
  }
});

// LOG OUT
document.getElementById('logout-btn').addEventListener('click', (e) => {
  e.preventDefault();
  token = null;
  user = null;
  localStorage.removeItem('token');
  localStorage.removeItem('user');
  showLoginView();
});

// -------------------------------------------------------------
// DASHBOARD LOGIC
// -------------------------------------------------------------
async function loadDashboardData() {
  try {
    const res = await fetch(`${API_URL}/api/dashboard/stats`, { headers: getHeaders() });
    const stats = await res.json();
    
    document.getElementById('stat-clients').textContent = stats.total_clients;
    document.getElementById('stat-quotes').textContent = stats.active_quotes;
    
    // Format total sales
    const salesVal = Number(stats.total_sales_mxn) || 0.0;
    document.getElementById('stat-sales').textContent = `$${salesVal.toLocaleString('es-MX', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} MXN`;
    
    // Fetch all quotes to render dynamic SVG chart
    const quotesRes = await fetch(`${API_URL}/api/cotizaciones`, { headers: getHeaders() });
    const quotes = await quotesRes.json();
    
    // RENDER SVG MONTHLY SALES CHART
    const monthNames = ['ENE', 'FEB', 'MAR', 'ABR', 'MAY', 'JUN', 'JUL', 'AGO', 'SEP', 'OCT', 'NOV', 'DIC'];
    const monthlySales = Array(12).fill(0);
    
    quotes.forEach(q => {
      if (q.estatus === 'Vendido' || q.estatus === 'Entregado') {
        let dateObj = new Date(q.fecha_creacion);
        if (isNaN(dateObj.getTime()) && typeof q.fecha_creacion === 'string') {
          const parts = q.fecha_creacion.split('/');
          if (parts.length === 3) {
            dateObj = new Date(parts[2], parts[1] - 1, parts[0]);
          }
        }
        const monthIndex = dateObj.getMonth();
        if (monthIndex >= 0 && monthIndex < 12) {
          monthlySales[monthIndex] += q.total_mxn;
        }
      }
    });
    
    const maxVal = Math.max(...monthlySales, 50000);
    const chartDiv = document.getElementById('dashboard-sales-chart');
    const width = 800;
    const height = 180;
    const padding = 25;
    
    const points = monthlySales.map((val, idx) => {
      const x = padding + (idx * (width - padding * 2) / 11);
      const y = height - padding - (val * (height - padding * 2) / maxVal);
      return { x, y, val, month: monthNames[idx] };
    });
    
    const dPath = points.map((p, idx) => `${idx === 0 ? 'M' : 'L'} ${p.x} ${p.y}`).join(' ');
    const dArea = `${dPath} L ${points[11].x} ${height - padding} L ${points[0].x} ${height - padding} Z`;
    
    let gridLines = '';
    for (let i = 0; i <= 4; i++) {
      const y = padding + i * (height - padding * 2) / 4;
      gridLines += `<line x1="${padding}" y1="${y}" x2="${width - padding}" y2="${y}" class="chart-grid-line" />`;
    }
    
    let dots = '';
    let labels = '';
    points.forEach(p => {
      dots += `<circle cx="${p.x}" cy="${p.y}" r="4.5" class="chart-dot" title="${p.month}: $${p.val.toLocaleString()}" />`;
      labels += `<text x="${p.x}" y="${height - 6}" text-anchor="middle" font-size="9" fill="var(--text-light)" font-weight="600">${p.month}</text>`;
    });
    
    chartDiv.innerHTML = `
      <svg viewBox="0 0 ${width} ${height}" class="chart-svg">
        <defs>
          <linearGradient id="chart-gradient" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stop-color="var(--primary)" stop-opacity="0.25"></stop>
            <stop offset="100%" stop-color="var(--primary)" stop-opacity="0.00"></stop>
          </linearGradient>
        </defs>
        ${gridLines}
        <path d="${dArea}" class="chart-area" />
        <path d="${dPath}" class="chart-line" />
        ${dots}
        ${labels}
      </svg>
    `;
    
    // Toggle Advisor column header in recent orders table based on role
    const thAsesor = document.getElementById('th-asesor');
    if (thAsesor) {
      thAsesor.style.display = user.nivel_rol === 'Asesor' ? 'none' : '';
    }

    // Load recent orders table
    const ordersTbody = document.getElementById('recent-orders-tbody');
    ordersTbody.innerHTML = '';
    
    if (quotes.length === 0) {
      const colspan = user.nivel_rol === 'Asesor' ? 4 : 5;
      ordersTbody.innerHTML = `<tr><td colspan="${colspan}" style="text-align: center; color: var(--text-light);">No hay cotizaciones registradas.</td></tr>`;
    } else {
      quotes.slice(0, 8).forEach(q => {
        let badgeClass = 'badge-info';
        if (q.estatus === 'Vendido') badgeClass = 'badge-warning';
        if (q.estatus === 'Cancelado') badgeClass = 'badge-danger';
        if (q.estatus === 'Autorizada') badgeClass = 'badge-info';
        if (q.estatus === 'Entregado') badgeClass = 'badge-success';
        
        ordersTbody.innerHTML += `
          <tr>
            <td><strong>${q.folio_cotizacion}</strong></td>
            <td>${q.cliente_nombre}</td>
            ${user.nivel_rol !== 'Asesor' ? `<td>${q.asesor_nombre}</td>` : ''}
            <td>$${q.total_mxn.toLocaleString('es-MX', { minimumFractionDigits: 2 })}</td>
            <td><span class="badge ${badgeClass}">${q.estatus}</span></td>
          </tr>
        `;
      });
    }
    
    // Load adviser visits ranking or personal agenda timeline depending on user role
    const visitsTitle = document.getElementById('dashboard-visits-title');
    const visitsContainer = document.getElementById('dashboard-visits-container');
    
    if (user.nivel_rol === 'Asesor') {
      // Set title with quick ver agenda button
      visitsTitle.innerHTML = `
        <div style="display: flex; justify-content: space-between; align-items: center; width: 100%;">
          <span>Mi Agenda de la Semana</span>
          <button class="btn btn-secondary" style="width: auto; padding: 5px 12px; font-size: 11px; margin: 0; line-height: 1.2;" onclick="document.querySelector('.nav-links [data-target=\\'planeacion-view\\']').click()">📅 Ver Agenda</button>
        </div>
      `;
      
      // Fetch current week schedule for this specific advisor
      const weekStr = getCurrentWeekString();
      const range = getWeekDateRange(weekStr);
      const planRes = await fetch(`${API_URL}/api/planificacion?fecha_inicio=${range.monday}&fecha_fin=${range.sunday}&asesor_id=${user.id}`, { headers: getHeaders() });
      const weeklyPlans = await planRes.json();
      
      let countPendientes = weeklyPlans.filter(p => p.realizada === 0).length;
      let countRealizadas = weeklyPlans.filter(p => p.realizada === 1).length;
      let countVencidas = weeklyPlans.filter(p => p.realizada === 3).length;
      
      let timelineHtml = `
        <div class="db-agenda-summary">
          <div class="db-agenda-stat pending">
            <span class="db-agenda-stat-val" style="color: var(--info);">${countPendientes}</span>
            <span class="db-agenda-stat-label">Pendientes</span>
          </div>
          <div class="db-agenda-stat success">
            <span class="db-agenda-stat-val" style="color: var(--success);">${countRealizadas}</span>
            <span class="db-agenda-stat-label">Atendidas</span>
          </div>
          <div class="db-agenda-stat danger">
            <span class="db-agenda-stat-val" style="color: var(--danger);">${countVencidas}</span>
            <span class="db-agenda-stat-label">Vencidas</span>
          </div>
        </div>
      `;
      
      if (weeklyPlans.length === 0) {
        timelineHtml += `
          <div style="text-align: center; color: var(--text-light); padding: 30px; font-size: 14px; border: 1px dashed var(--border); border-radius: var(--radius);">
            No tienes visitas agendadas para esta semana.<br>
            <button class="btn btn-primary" style="width: auto; margin-top: 15px; padding: 8px 16px; font-size: 12px;" onclick="document.querySelector('.nav-links [data-target=\\'planeacion-view\\']').click()">📅 Programar Actividad</button>
          </div>
        `;
      } else {
        timelineHtml += `<div class="db-timeline">`;
        
        const dayNamesEs = ["Domingo", "Lunes", "Martes", "Miércoles", "Jueves", "Viernes", "Sábado"];
        const todayIso = new Date().toISOString().slice(0, 10);
        
        // Sort plans by date
        weeklyPlans.sort((a, b) => a.fecha_programada.localeCompare(b.fecha_programada));
        
        weeklyPlans.forEach(p => {
          const dObj = new Date(p.fecha_programada + 'T00:00:00');
          const dayLabel = dayNamesEs[dObj.getDay()];
          const isToday = p.fecha_programada === todayIso;
          
          const dayBadgeClass = isToday ? 'db-timeline-day-badge today' : 'db-timeline-day-badge';
          const dayText = isToday ? `${dayLabel}<br><span style="font-size: 9px; font-weight: 800; color: var(--primary);">HOY</span>` : dayLabel;
          
          let statusLabel = 'Pendiente';
          let badgeClass = 'badge-info';
          if (p.realizada === 1) {
            statusLabel = 'Atendida';
            badgeClass = 'badge-success';
          } else if (p.realizada === 2) {
            statusLabel = 'Cancelada';
            badgeClass = 'badge-secondary';
          } else if (p.realizada === 3) {
            statusLabel = 'Vencida';
            badgeClass = 'badge-danger';
          }
          
          const forecastParts = [];
          if (p.pronostico_bolsas > 0) forecastParts.push(`📦 ${p.pronostico_bolsas} b.`);
          if (p.pronostico_monto_mxn > 0) forecastParts.push(`💰 $${p.pronostico_monto_mxn.toLocaleString('es-MX', {maximumFractionDigits: 0})}`);
          const forecastText = forecastParts.join(' | ') || 'Sin pronóstico';
          
          timelineHtml += `
            <div class="db-timeline-item">
              <div class="${dayBadgeClass}">
                ${dayText}
              </div>
              <div class="db-timeline-info">
                <div class="db-timeline-title">${p.cliente_nombre}</div>
                <div class="db-timeline-objective">"${p.objetivo_visita || 'Sin objetivo'}"</div>
                <div class="db-timeline-forecast">${forecastText}</div>
              </div>
              <div class="db-timeline-status">
                <span class="badge ${badgeClass}">${statusLabel}</span>
              </div>
            </div>
          `;
        });
        
        timelineHtml += `</div>`;
      }
      
      visitsContainer.innerHTML = timelineHtml;
      
    } else {
      // Admin or Coordinator: show ranking table
      visitsTitle.textContent = 'Seguimiento y Visitas por Asesor';
      
      let tableHtml = `
        <table>
          <thead>
            <tr>
              <th>Asesor</th>
              <th style="text-align: right;">Visitas en Campo</th>
            </tr>
          </thead>
          <tbody id="adviser-visits-tbody">
      `;
      
      if (!stats.advisers_visits || stats.advisers_visits.length === 0) {
        tableHtml += `<tr><td colspan="2" style="text-align: center; color: var(--text-light);">No hay visitas registradas.</td></tr>`;
      } else {
        stats.advisers_visits.forEach(v => {
          tableHtml += `
            <tr>
              <td><strong>${v.adviser}</strong></td>
              <td style="text-align: right; font-weight: 600; color: var(--primary);">${v.count}</td>
            </tr>
          `;
        });
      }
      
      tableHtml += `
          </tbody>
        </table>
      `;
      
      visitsContainer.innerHTML = tableHtml;
    }
    
  } catch (err) {
    console.error('Failed to load dashboard statistics:', err);
  }
}

// -------------------------------------------------------------
// KANBAN CRM LOGIC
// -------------------------------------------------------------

// Drag and drop helper functions for HTML5 API
window.allowDrop = function(ev) {
  ev.preventDefault();
  const col = ev.currentTarget;
  if (!col.classList.contains('drag-over')) {
    col.classList.add('drag-over');
  }
};

window.drag = function(ev, quoteId) {
  ev.dataTransfer.setData("text/plain", quoteId);
};

// Remove hover border on drag leave
document.querySelectorAll('.kanban-column').forEach(col => {
  col.addEventListener('dragleave', () => col.classList.remove('drag-over'));
  col.addEventListener('drop', () => col.classList.remove('drag-over'));
});

window.drop = async function(ev, targetStatus) {
  ev.preventDefault();
  const quoteId = ev.dataTransfer.getData("text/plain");
  if (!quoteId) return;
  
  try {
    const res = await fetch(`${API_URL}/api/cotizaciones/${quoteId}/status`, {
      method: 'PUT',
      headers: getHeaders(),
      body: JSON.stringify({ estatus: targetStatus })
    });
    
    if (!res.ok) {
      const errData = await res.json();
      throw new Error(errData.error || 'Failed to update quote status');
    }
    
    // Reload board
    await loadCRMBoardData();
  } catch (err) {
    alert(`Error: ${err.message}`);
  }
};

window.moveQuoteStatus = async function(quoteId, currentStatus, direction, event) {
  if (event) {
    event.stopPropagation();
    event.preventDefault();
  }
  
  const statuses = ['Borrador', 'Autorizada', 'Vendido', 'Entregado'];
  const currentIndex = statuses.indexOf(currentStatus);
  if (currentIndex === -1) return;
  
  let newIndex = currentIndex + (direction === 'down' ? 1 : -1);
  if (newIndex < 0 || newIndex >= statuses.length) return;
  
  const targetStatus = statuses[newIndex];
  
  try {
    const res = await fetch(`${API_URL}/api/cotizaciones/${quoteId}/status`, {
      method: 'PUT',
      headers: getHeaders(),
      body: JSON.stringify({ estatus: targetStatus })
    });
    
    if (!res.ok) {
      const errData = await res.json();
      throw new Error(errData.error || 'Failed to update quote status');
    }
    
    // Reload board
    await loadCRMBoardData();
  } catch (err) {
    alert(`Error: ${err.message}`);
  }
};

// Modal helpers
window.openModal = function(modalId) {
  document.getElementById(modalId).classList.add('active');
};

window.closeModal = function(modalId) {
  document.getElementById(modalId).classList.remove('active');
};

// Bind Open Add Client Modal
document.getElementById('btn-open-client-modal').addEventListener('click', () => {
  document.getElementById('client-modal-title').textContent = 'Registrar Nuevo Cliente';
  document.getElementById('client-form-id').value = '';
  document.getElementById('client-submit-btn').textContent = 'Registrar Cliente';
  document.getElementById('add-client-form').reset();
  loadCRMClientFormConfig();
  openModal('add-client-modal');
});

// Bind Catalog View Registrar Cliente Button
if (document.getElementById('btn-catalog-open-client-modal')) {
  document.getElementById('btn-catalog-open-client-modal').addEventListener('click', () => {
    document.getElementById('client-modal-title').textContent = 'Registrar Nuevo Cliente';
    document.getElementById('client-form-id').value = '';
    document.getElementById('client-submit-btn').textContent = 'Registrar Cliente';
    document.getElementById('add-client-form').reset();
    loadCRMClientFormConfig();
    openModal('add-client-modal');
  });
}

async function loadCRMClientFormConfig(selectedCCId = null, selectedAsesorId = null) {
  try {
    const ccRes = await fetch(`${API_URL}/api/cuentas-clave`, { headers: getHeaders() });
    const tiers = await ccRes.json();
    
    const ccSelect = document.getElementById('client-cc');
    ccSelect.innerHTML = '';
    tiers.forEach(t => {
      ccSelect.innerHTML += `<option value="${t.id}">${t.tier_name}</option>`;
    });
    
    if (selectedCCId) {
      ccSelect.value = selectedCCId;
    }

    const aRes = await fetch(`${API_URL}/api/asesores`, { headers: getHeaders() });
    const advisers = await aRes.json();
    
    const aSelect = document.getElementById('client-asesor');
    if (aSelect) {
      aSelect.innerHTML = '<option value="">-- Sin Asesor --</option>';
      advisers.forEach(a => {
        if (a.activo === 1) {
          aSelect.innerHTML += `<option value="${a.id}">${a.nombre}</option>`;
        }
      });
      
      if (selectedAsesorId !== null && selectedAsesorId !== undefined) {
        aSelect.value = selectedAsesorId;
      } else if (user && user.nivel_rol === 'Asesor') {
        aSelect.value = user.id;
      } else {
        aSelect.value = '';
      }
    }
  } catch (err) {
    console.error(err);
  }
}

// Add/Edit Client Submit handler
document.getElementById('add-client-form').addEventListener('submit', async (e) => {
  e.preventDefault();
  
  const clientId = document.getElementById('client-form-id').value;
  const asesorVal = document.getElementById('client-asesor') ? document.getElementById('client-asesor').value : '';
  const payload = {
    nombre: document.getElementById('client-name').value.trim(),
    contacto: document.getElementById('client-contacto').value.trim(),
    telefono: document.getElementById('client-telefono').value.trim(),
    correo: document.getElementById('client-correo').value.trim(),
    cuenta_clave_id: Number(document.getElementById('client-cc').value),
    ubicacion: document.getElementById('client-ubicacion').value.trim(),
    superficie_text: document.getElementById('client-superficie').value.trim(),
    asesor_id: asesorVal ? Number(asesorVal) : null
  };
  
  const url = clientId ? `${API_URL}/api/clientes/${clientId}` : `${API_URL}/api/clientes`;
  const method = clientId ? 'PUT' : 'POST';
  
  try {
    const res = await fetch(url, {
      method: method,
      headers: getHeaders(),
      body: JSON.stringify(payload)
    });
    
    if (!res.ok) {
      const data = await res.json();
      throw new Error(data.error || 'Failed to save client');
    }
    
    closeModal('add-client-modal');
    document.getElementById('add-client-form').reset();
    
    // Refresh the active view
    const activeView = document.querySelector('.view-section.active');
    if (activeView && activeView.id === 'clientes-view') {
      await loadClientesCatalog();
    } else {
      await loadCRMBoardData();
    }
    
    alert(clientId ? 'Cliente actualizado con éxito' : 'Cliente registrado con éxito');
  } catch (err) {
    alert(err.message);
  }
});

// Load advisor options for supervisor filter dropdown
async function loadKanbanAdvisorOptions() {
  const filterSelect = document.getElementById('kanban-advisor-filter');
  if (!filterSelect) return;
  
  try {
    const res = await fetch(`${API_URL}/api/asesores`, { headers: getHeaders() });
    const advisers = await res.json();
    
    const currentValue = filterSelect.value || 'ALL';
    
    filterSelect.innerHTML = '<option value="ALL">Todos los Asesores</option>';
    advisers.forEach(a => {
      if (a.activo === 1) {
        filterSelect.innerHTML += `<option value="${a.id}">${a.nombre}</option>`;
      }
    });
    
    filterSelect.value = currentValue;
  } catch (err) {
    console.error('Failed to load advisor options for Kanban:', err);
  }
}

// Load Kanban Data
async function loadCRMBoardData() {
  try {
    // Load clients for references
    const cRes = await fetch(`${API_URL}/api/clientes`, { headers: getHeaders() });
    allClients = await cRes.json();
    
    // Load quotes/deals
    const qRes = await fetch(`${API_URL}/api/cotizaciones`, { headers: getHeaders() });
    allQuotes = await qRes.json();
    
    if (user.nivel_rol === 'Administrador' || user.nivel_rol === 'Coordinador') {
      await loadKanbanAdvisorOptions();
    }
    
    filterAndRenderKanban();
  } catch (err) {
    console.error('Failed to load Sales Pipeline Board:', err);
  }
}

function renderKanbanBoard(quotesList) {
  const columns = {
    'Borrador': { el: document.getElementById('cards-prospecto'), countEl: document.getElementById('count-prospecto'), count: 0 },
    'Autorizada': { el: document.getElementById('cards-cotizado'), countEl: document.getElementById('count-cotizado'), count: 0 },
    'Vendido': { el: document.getElementById('cards-cobrado'), countEl: document.getElementById('count-cobrado'), count: 0 },
    'Entregado': { el: document.getElementById('cards-entregado'), countEl: document.getElementById('count-entregado'), count: 0 }
  };
  
  // Clear columns
  Object.values(columns).forEach(col => col.el.innerHTML = '');
  
  quotesList.forEach(q => {
    // Determine target column (map fallback statuses)
    let status = q.estatus;
    if (status === 'Pendiente Autorización') status = 'Borrador';
    if (status === 'Cancelado') return; // Hide canceled quotes from board
    
    const col = columns[status];
    if (!col) return;
    
    col.count++;
    
    // Create card element
    const card = document.createElement('div');
    card.className = 'kanban-card';
    card.id = `quote-card-${q.id}`;
    card.draggable = true;
    card.addEventListener('dragstart', (e) => drag(e, q.id));
    
    // double click to view detail modal
    card.addEventListener('dblclick', () => loadClientCRMDetails(q.cliente_id));
    
    // Build items summary label
    const itemsSummary = q.items.map(i => `${i.producto_nombre.split(' ')[0]} (x${i.cantidad})`).join(', ') || 'Sin productos';
    
    const prevLabels = {
      'Autorizada': 'Prospecto',
      'Vendido': 'Cotizado',
      'Entregado': 'Cobrado'
    };
    const nextLabels = {
      'Borrador': 'Cotizado',
      'Autorizada': 'Cobrado',
      'Vendido': 'Entregado'
    };
    
    const prevLabel = prevLabels[status] || '';
    const nextLabel = nextLabels[status] || '';
    
    card.innerHTML = `
      <div class="kanban-card-title">
        <span>${q.cliente_nombre}</span>
        <button style="background:none; border:none; cursor:pointer; font-size:12px;" onclick="loadClientCRMDetails(${q.cliente_id})">👁️</button>
      </div>
      <div class="kanban-card-desc">${itemsSummary}</div>
      <div style="font-size:11px; color:var(--text-light); font-weight: 500;">Folio: ${q.folio_cotizacion}</div>
      <div class="kanban-card-meta">
        <span style="font-size: 11px; color: var(--text-light);">👤 ${q.asesor_nombre.split(' ')[0]}</span>
        <span class="kanban-card-price">$${q.total_mxn.toLocaleString('es-MX', { maximumFractionDigits: 0 })}</span>
      </div>
      <div class="kanban-card-mobile-arrows">
        ${status !== 'Borrador' ? `<button class="kanban-arrow-btn prev-stage" onclick="moveQuoteStatus(${q.id}, '${status}', 'up', event)">▲ ${prevLabel}</button>` : ''}
        ${status !== 'Entregado' ? `<button class="kanban-arrow-btn next-stage" onclick="moveQuoteStatus(${q.id}, '${status}', 'down', event)">▼ ${nextLabel}</button>` : ''}
      </div>
    `;
    
    col.el.appendChild(card);
  });
  
  // Render count badges
  Object.keys(columns).forEach(k => {
    columns[k].countEl.textContent = columns[k].count;
  });
}

// Unified Kanban Filter & Render
window.filterAndRenderKanban = function() {
  const searchInput = document.getElementById('kanban-search');
  const advisorSelect = document.getElementById('kanban-advisor-filter');
  
  const term = searchInput ? searchInput.value.toLowerCase().trim() : '';
  const advisorId = advisorSelect ? advisorSelect.value : 'ALL';
  
  let filtered = allQuotes;
  
  if (advisorId && advisorId !== 'ALL') {
    filtered = filtered.filter(q => q.asesor_id === Number(advisorId));
  }
  
  if (term) {
    filtered = filtered.filter(q => 
      q.cliente_nombre.toLowerCase().includes(term) ||
      q.folio_cotizacion.toLowerCase().includes(term) ||
      q.asesor_nombre.toLowerCase().includes(term) ||
      q.items.some(i => i.producto_nombre.toLowerCase().includes(term))
    );
  }
  
  renderKanbanBoard(filtered);
};

// Search Filter on Kanban Board
document.getElementById('kanban-search').addEventListener('input', () => {
  filterAndRenderKanban();
});

// Advisor Filter on Kanban Board
document.getElementById('kanban-advisor-filter').addEventListener('change', () => {
  filterAndRenderKanban();
});

// Load Client Details and visits history in modal
async function loadClientCRMDetails(clientId) {
  activeClientId = clientId;
  
  try {
    const client = allClients.find(c => c.id === clientId);
    if (!client) return;
    
    // Render text values
    document.getElementById('crm-detail-name').textContent = client.nombre;
    document.getElementById('crm-detail-cc').textContent = client.cuenta_clave_nombre || 'Ninguno';
    document.getElementById('crm-detail-status').textContent = client.estado_status;
    document.getElementById('crm-detail-contacto').textContent = client.contacto || '-';
    document.getElementById('crm-detail-telefono').textContent = client.telefono || '-';
    document.getElementById('crm-detail-ubicacion').textContent = client.ubicacion || '-';
    document.getElementById('crm-detail-superficie').textContent = client.superficie_text || '-';
    document.getElementById('crm-detail-asesor').textContent = client.asesor_nombre || '-';
    document.getElementById('crm-detail-correo').textContent = client.correo || '-';
    
    // Status Badge classes
    const statusBadge = document.getElementById('crm-detail-status');
    statusBadge.className = 'badge';
    statusBadge.classList.add(client.estado_status === 'Cliente' ? 'badge-success' : 'badge-warning');
    
    // Load visit log entries
    await loadClientVisits(clientId);
    
    // Open Detail Modal
    openModal('client-detail-modal');
  } catch (err) {
    console.error('Failed to load client details:', err);
  }
}

async function loadClientVisits(clientId) {
  try {
    const res = await fetch(`${API_URL}/api/clientes/${clientId}/visitas`, { headers: getHeaders() });
    const visits = await res.json();
    
    const container = document.getElementById('visitas-container');
    container.innerHTML = '';
    
    if (visits.length === 0) {
      container.innerHTML = `<div style="text-align: center; color: var(--text-light); font-size: 14px; padding: 20px;">No hay registros de visitas de campo aún.</div>`;
      return;
    }
    
    visits.forEach(v => {
      const nextDateStr = v.proxima_cita ? `<span class="visita-next">🗓️ Próxima Cita: ${v.proxima_cita}</span>` : '';
      container.innerHTML += `
        <div class="visita-card">
          <div class="visita-header">
            <span>👤 ${v.asesor_nombre}</span>
            <span>📅 ${v.fecha_visita}</span>
          </div>
          <div class="visita-content">${v.comentarios_bitacora}</div>
          ${nextDateStr}
        </div>
      `;
    });
  } catch (err) {
    console.error(err);
  }
}

// Log visit form submission (CRM Modal)
document.getElementById('add-visit-form').addEventListener('submit', async (e) => {
  e.preventDefault();
  if (!activeClientId) return;
  
  const comments = document.getElementById('visit-comentarios').value.trim();
  const nextDate = document.getElementById('visit-next-date').value;
  
  try {
    const res = await fetch(`${API_URL}/api/clientes/${activeClientId}/visitas`, {
      method: 'POST',
      headers: getHeaders(),
      body: JSON.stringify({
        comentarios_bitacora: comments,
        proxima_cita: nextDate || null
      })
    });
    
    if (!res.ok) {
      const data = await res.json();
      throw new Error(data.error || 'Failed to submit visit log');
    }
    
    document.getElementById('add-visit-form').reset();
    await loadClientVisits(activeClientId);
  } catch (err) {
    alert(err.message);
  }
});

// -------------------------------------------------------------
// COTIZADOR (QUOTE BUILDER) LOGIC
// -------------------------------------------------------------
let calcDebounceTimeout = null;

// Hook dynamic calculations on any form inputs
function registerLiveCalculatorEvents() {
  const formInputs = [
    'quote-client', 'quote-ciclo', 'quote-condicion', 
    'quote-temporada', 'quote-financiera', 'quote-notas'
  ];
  
  formInputs.forEach(id => {
    const el = document.getElementById(id);
    if (el) {
      el.removeEventListener('input', debouncedLiveCalculation);
      el.removeEventListener('change', debouncedLiveCalculation);
      
      el.addEventListener('input', debouncedLiveCalculation);
      el.addEventListener('change', debouncedLiveCalculation);
    }
  });

  // Watch product changes inside builder box
  const builderContainer = document.getElementById('items-builder-container');
  if (builderContainer) {
    builderContainer.removeEventListener('input', debouncedLiveCalculation);
    builderContainer.removeEventListener('change', debouncedLiveCalculation);
    
    builderContainer.addEventListener('input', debouncedLiveCalculation);
    builderContainer.addEventListener('change', debouncedLiveCalculation);
  }
}

async function loadCotizadorConfig() {
  try {
    // Fetch clients list
    const cRes = await fetch(`${API_URL}/api/clientes`, { headers: getHeaders() });
    allClients = await cRes.json();
    
    const clientSelect = document.getElementById('quote-client');
    clientSelect.innerHTML = '<option value="">-- Selecciona un Agricultor --</option>';
    allClients.forEach(c => {
      clientSelect.innerHTML += `<option value="${c.id}">${c.nombre} (${c.cuenta_clave_nombre || 'General'})</option>`;
    });
    
    // Fetch seasons list
    const sRes = await fetch(`${API_URL}/api/temporadas`, { headers: getHeaders() });
    allSeasons = await sRes.json();
    
    const seasonSelect = document.getElementById('quote-temporada');
    seasonSelect.innerHTML = '';
    allSeasons.forEach(s => {
      const sign = s.estado_operacion === 'Restar' ? '-' : '+';
      const label = s.descuento_porcentaje > 0 ? ` (${sign}${s.descuento_porcentaje}%)` : '';
      seasonSelect.innerHTML += `<option value="${s.id}">${s.actividad}${label}</option>`;
    });
    
    // Fetch products catalog
    const pRes = await fetch(`${API_URL}/api/productos`, { headers: getHeaders() });
    allProducts = await pRes.json();
    
    // Reset builder
    document.getElementById('items-builder-container').innerHTML = '';
    quoteItemsCount = 0;
    addQuoteItemRow(); // Add default first item row
    
    resetVirtualSheet();
    registerLiveCalculatorEvents();
  } catch (err) {
    console.error('Failed to load cotizador options:', err);
  }
}

// Add dynamic item row to cotizador
function addQuoteItemRow() {
  quoteItemsCount++;
  const container = document.getElementById('items-builder-container');
  
  const div = document.createElement('div');
  div.className = 'item-row';
  div.id = `quote-item-row-${quoteItemsCount}`;
  
  let options = '<option value="">-- Selecciona un Producto --</option>';
  allProducts.forEach(p => {
    options += `<option value="${p.id}">${p.producto} ($${p.list_price_mxn.toLocaleString('es-MX')} MXN)</option>`;
  });
  
  div.innerHTML = `
    <div class="form-group">
      <label>Producto</label>
      <select class="form-input item-product-select" required>${options}</select>
    </div>
    <div class="form-group">
      <label>Cantidad</label>
      <input type="number" class="form-input item-qty-input" min="1" value="1" required>
    </div>
    <div class="form-group">
      <label>Precio Unitario</label>
      <input type="text" class="form-input item-calc-unit-price" style="background-color: var(--bg);" value="-" readonly>
    </div>
    <button type="button" class="btn-remove" onclick="removeQuoteItemRow(${quoteItemsCount})">🗑️</button>
  `;
  
  container.appendChild(div);
  debouncedLiveCalculation();
}

document.getElementById('btn-add-item').addEventListener('click', addQuoteItemRow);

function removeQuoteItemRow(rowNum) {
  const row = document.getElementById(`quote-item-row-${rowNum}`);
  if (row) {
    row.remove();
    debouncedLiveCalculation();
  }
}

// Collect form inputs helper
function getQuotePayload() {
  const client_id = Number(document.getElementById('quote-client').value);
  const ciclo_agricola = document.getElementById('quote-ciclo').value;
  const condiciones_pago = document.getElementById('quote-condicion').value;
  const temporada_id = Number(document.getElementById('quote-temporada').value);
  const financiera = document.getElementById('quote-financiera').value.trim();
  const notas = document.getElementById('quote-notas').value.trim();
  
  const items = [];
  const rows = document.querySelectorAll('#items-builder-container .item-row');
  rows.forEach(r => {
    const select = r.querySelector('.item-product-select');
    const qtyInput = r.querySelector('.item-qty-input');
    
    if (select && select.value && qtyInput && qtyInput.value) {
      items.push({
        producto_id: Number(select.value),
        cantidad: Number(qtyInput.value)
      });
    }
  });
  
  return { client_id, ciclo_agricola, condiciones_pago, temporada_id, items, financiera, notas };
}

// Debounced recalculation of quote
function debouncedLiveCalculation() {
  clearTimeout(calcDebounceTimeout);
  calcDebounceTimeout = setTimeout(async () => {
    const payload = getQuotePayload();
    if (!payload.client_id || payload.items.length === 0) {
      resetVirtualSheet();
      return;
    }
    
    try {
      const res = await fetch(`${API_URL}/api/cotizaciones/calcular`, {
        method: 'POST',
        headers: getHeaders(),
        body: JSON.stringify({
          cliente_id: payload.client_id,
          items: payload.items,
          temporada_id: payload.temporada_id
        })
      });
      
      const calc = await res.json();
      if (!res.ok) throw new Error(calc.error || 'Calculation failed');
      
      // Update individual unit prices in the form
      const rows = document.querySelectorAll('#items-builder-container .item-row');
      rows.forEach(r => {
        const select = r.querySelector('.item-product-select');
        const unitPriceInput = r.querySelector('.item-calc-unit-price');
        
        if (select && unitPriceInput) {
          const calcItem = calc.items.find(i => i.producto_id === Number(select.value));
          if (calcItem) {
            unitPriceInput.value = `$${calcItem.precio_neto.toLocaleString('es-MX', { minimumFractionDigits: 2 })} MXN`;
          }
        }
      });
      
      updateVirtualSheet(calc, payload);
    } catch (err) {
      console.warn("Live calculator error:", err.message);
    }
  }, 350);
}

// Reset printable sheet view
function resetVirtualSheet() {
  document.getElementById('preview-client-name').textContent = 'Seleccione un cliente';
  document.getElementById('preview-client-contact').textContent = '-';
  document.getElementById('preview-client-phone').textContent = '-';
  document.getElementById('preview-client-location').textContent = '-';
  
  document.getElementById('preview-ciclo-text').textContent = '-';
  document.getElementById('preview-condiciones-text').textContent = '-';
  document.getElementById('preview-temporada-text').textContent = '-';
  
  document.getElementById('preview-cell-financiera').style.display = 'none';
  document.getElementById('preview-financiera-text').textContent = '-';
  
  document.getElementById('preview-table-body').innerHTML = `
    <tr>
      <td colspan="6" style="text-align: center; color: var(--text-light); padding: 30px;">
        No hay productos agregados a la cotización.
      </td>
    </tr>
  `;
  document.getElementById('preview-discount-vol').textContent = '-';
  document.getElementById('preview-row-anticipo').style.display = 'none';
  document.getElementById('preview-total-val').textContent = '$0.00 MXN';
  document.getElementById('preview-notes-content').textContent = 'El precio final calculado incluye los descuentos por volumen y campaña en base a las reglas de la distribuidora. Sujeto a cambios sin previo aviso.';
  
  document.getElementById('client-quick-details').style.display = 'none';
}

// Populate printable sheet with calculation details
function updateVirtualSheet(calc, payload) {
  const client = allClients.find(c => c.id === payload.client_id);
  if (client) {
    // Show quick form helper card
    document.getElementById('client-quick-details').style.display = 'block';
    document.getElementById('qc-contacto').textContent = client.contacto || '-';
    document.getElementById('qc-telefono').textContent = client.telefono || '-';
    document.getElementById('qc-ubicacion').textContent = client.ubicacion || '-';
    document.getElementById('qc-superficie').textContent = client.superficie_text || '-';
    
    // Fill virtual sheet fields
    document.getElementById('preview-client-name').textContent = client.nombre;
    document.getElementById('preview-client-contact').textContent = client.contacto ? `Contacto: ${client.contacto}` : '-';
    document.getElementById('preview-client-phone').textContent = client.telefono ? `Tel: ${client.telefono}` : '-';
    document.getElementById('preview-client-location').textContent = client.ubicacion ? `Ubicación: ${client.ubicacion}` : '-';
  }
  
  document.getElementById('preview-ciclo-text').textContent = payload.ciclo_agricola;
  document.getElementById('preview-condiciones-text').textContent = payload.condiciones_pago;
  document.getElementById('preview-temporada-text').textContent = calc.temporada_nombre;
  
  // Financiera cell
  const finCell = document.getElementById('preview-cell-financiera');
  if (payload.condiciones_pago === 'CREDITO' && payload.financiera) {
    finCell.style.display = 'block';
    document.getElementById('preview-financiera-text').textContent = payload.financiera;
  } else {
    finCell.style.display = 'none';
  }
  
  // Set dates
  const today = new Date().toLocaleDateString('es-MX', { year: 'numeric', month: '2-digit', day: '2-digit' });
  document.getElementById('preview-date').textContent = `FECHA: ${today}`;
  document.getElementById('preview-folio').textContent = `CG-2026-PENDIENTE`;
  
  // Build preview items rows
  const tbody = document.getElementById('preview-table-body');
  tbody.innerHTML = '';
  
  calc.items.forEach(i => {
    const listPrice = i.precio_lista;
    const netPrice = i.precio_neto;
    const discount = listPrice - netPrice;
    
    tbody.innerHTML += `
      <tr>
        <td><strong>${i.producto_nombre}</strong><br><span style="font-size: 9px; color: var(--text-light);">${i.tipo_categoria}</span></td>
        <td style="text-align: center; font-weight: 600;">${i.cantidad}</td>
        <td style="text-align: right;">$${listPrice.toLocaleString('es-MX', { minimumFractionDigits: 2 })}</td>
        <td style="text-align: right; color: var(--danger); font-weight: 500;">-$${discount.toLocaleString('es-MX', { minimumFractionDigits: 2 })}</td>
        <td style="text-align: right; font-weight: 600;">$${netPrice.toLocaleString('es-MX', { minimumFractionDigits: 2 })}</td>
        <td style="text-align: right; font-weight: 700;">$${i.subtotal.toLocaleString('es-MX', { minimumFractionDigits: 2 })}</td>
      </tr>
    `;
  });
  
  // Volume multiplier stats
  const volPct = calc.vol_multiplier < 1.00 ? `${Math.round((1 - calc.vol_multiplier) * 100)}%` : 'Sin descuento';
  document.getElementById('preview-discount-vol').textContent = `${volPct} (${calc.total_discountable_seeds} bolsas)`;
  
  // Anticipo apartado
  const anticipoRow = document.getElementById('preview-row-anticipo');
  if (calc.anticipo_requerido > 0 && payload.condiciones_pago === 'APARTADO') {
    anticipoRow.style.display = 'flex';
    document.getElementById('preview-anticipo-val').textContent = `$${calc.anticipo_requerido.toLocaleString('es-MX', { minimumFractionDigits: 2 })} MXN`;
  } else {
    anticipoRow.style.display = 'none';
  }
  
  document.getElementById('preview-total-val').textContent = `$${calc.total_mxn.toLocaleString('es-MX', { minimumFractionDigits: 2 })} MXN`;
  document.getElementById('preview-notes-content').textContent = payload.notas || 'El precio final calculado incluye los descuentos por volumen y campaña en base a las reglas de la distribuidora. Sujeto a cambios sin previo aviso.';
}

// Quote Form Submit Handler
document.getElementById('quotation-form').addEventListener('submit', async (e) => {
  e.preventDefault();
  const payload = getQuotePayload();
  
  if (!payload.client_id || payload.items.length === 0) {
    alert('Por favor selecciona un cliente y agrega al menos un producto.');
    return;
  }
  
  try {
    const res = await fetch(`${API_URL}/api/cotizaciones`, {
      method: 'POST',
      headers: getHeaders(),
      body: JSON.stringify(payload)
    });
    
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || 'Failed to submit quote');
    
    alert(`Pedido registrado exitosamente con Folio: ${data.folio}`);
    
    // Reset Form & Switch view
    document.getElementById('quotation-form').reset();
    document.getElementById('items-builder-container').innerHTML = '';
    quoteItemsCount = 0;
    addQuoteItemRow();
    switchView('dashboard-view', 'Tablero General');
  } catch (err) {
    alert(err.message);
  }
});

// Quote Share & Print triggers
document.getElementById('btn-print-quote').addEventListener('click', () => {
  window.print();
});

document.getElementById('btn-whatsapp-quote').addEventListener('click', () => {
  const payload = getQuotePayload();
  if (!payload.client_id) {
    alert("Por favor selecciona un cliente primero.");
    return;
  }
  
  const clientName = document.getElementById('preview-client-name').textContent;
  const totalVal = document.getElementById('preview-total-val').textContent;
  const ciclo = payload.ciclo_agricola;
  const condicion = payload.condiciones_pago;
  
  const itemsText = Array.from(document.querySelectorAll('#preview-table-body tr')).map(row => {
    const cols = row.querySelectorAll('td');
    if (cols.length < 6) return '';
    const name = cols[0].querySelector('strong').textContent;
    const qty = cols[1].textContent;
    const price = cols[4].textContent;
    return `• ${name} (x${qty}) - Neto: ${price}`;
  }).filter(t => t !== '').join('\n');
  
  const msg = `*AgriSales Pro - Cotización*\n` +
              `Cliente: *${clientName}*\n` +
              `Ciclo: *${ciclo}* | Condición: *${condicion}*\n\n` +
              `*Conceptos:*\n${itemsText}\n\n` +
              `*Total Cotizado: ${totalVal}*\n\n` +
              `_Cotización generada digitalmente en AgriSales Pro. Sujeta a cambios._`;
              
  const encoded = encodeURIComponent(msg);
  window.open(`https://wa.me/?text=${encoded}`, '_blank');
});

// -------------------------------------------------------------
// CATÁLOGO DE PRODUCTOS VIEW LOGIC
// -------------------------------------------------------------
let currentCategoryFilter = 'ALL';

async function loadCatalogData() {
  try {
    const res = await fetch(`${API_URL}/api/productos`, { headers: getHeaders() });
    allProducts = await res.json();
    renderCatalogGrid();
    
    // Set up filter pill click actions
    const pills = document.querySelectorAll('#catalog-category-filters .filter-pill');
    pills.forEach(pill => {
      pill.removeEventListener('click', handleFilterPillClick);
      pill.addEventListener('click', handleFilterPillClick);
    });
  } catch (err) {
    console.error('Failed to load product catalog view:', err);
  }
}

function handleFilterPillClick(e) {
  const pills = document.querySelectorAll('#catalog-category-filters .filter-pill');
  pills.forEach(p => p.classList.remove('active'));
  e.currentTarget.classList.add('active');
  currentCategoryFilter = e.currentTarget.getAttribute('data-category');
  renderCatalogGrid();
}

function renderCatalogGrid() {
  const grid = document.getElementById('product-catalog-grid');
  grid.innerHTML = '';
  
  const filtered = currentCategoryFilter === 'ALL'
    ? allProducts
    : allProducts.filter(p => p.tipo_categoria === currentCategoryFilter);
    
  filtered.forEach(p => {
    let emoji = '🌾';
    if (p.tipo_categoria === 'Agroquímico') emoji = '🧪';
    if (p.producto.includes('Urea') || p.producto.includes('Amoniaco') || p.producto.includes('Map')) emoji = '🔋';
    
    const priceText = p.list_price_mxn > 0 ? `$${p.list_price_mxn.toLocaleString('es-MX', { minimumFractionDigits: 2 })} MXN` : 'A cotizar';
    const detailText = p.descontar === 1 ? `Base USD: $${p.base_usd} | Escala volumen` : (p.descuento_fijo_quimicos > 0 ? `Descuento fijo: -$${p.descuento_fijo_quimicos} MXN` : 'Precio de lista neto');
    
    grid.innerHTML += `
      <div class="product-card">
        <div class="product-image-placeholder">${emoji}</div>
        <div class="product-info">
          <h3>${p.producto}</h3>
          <p>${p.tipo_categoria} | ${detailText}</p>
        </div>
        <div class="product-price-box">
          <span class="product-price">${priceText}</span>
          <button class="btn btn-secondary" style="width: auto; padding: 6px 12px; font-size: 11px; margin: 0;" onclick="addProductDirectlyToBuilder(${p.id})">Agregar a Cotización</button>
        </div>
      </div>
    `;
  });
}

// Quick helper to add product from catalog directly to quote builder
window.addProductDirectlyToBuilder = function(productId) {
  const navItems = document.querySelectorAll('.nav-links .nav-item');
  navItems.forEach(i => {
    i.classList.remove('active');
    if (i.getAttribute('data-target') === 'cotizador-view') {
      i.classList.add('active');
    }
  });
  switchView('cotizador-view', 'Cotizador');
  
  // Find empty row
  const rows = document.querySelectorAll('#items-builder-container .item-row');
  let targetRow = null;
  for (const row of rows) {
    const select = row.querySelector('.item-product-select');
    if (select && !select.value) {
      targetRow = row;
      break;
    }
  }
  
  if (!targetRow) {
    addQuoteItemRow();
    const newRows = document.querySelectorAll('#items-builder-container .item-row');
    targetRow = newRows[newRows.length - 1];
  }
  
  const select = targetRow.querySelector('.item-product-select');
  if (select) {
    select.value = productId;
    debouncedLiveCalculation();
  }
};

// -------------------------------------------------------------
// WAREHOUSE & INVENTORY LOGIC
// -------------------------------------------------------------
// Tab Switching
document.getElementById('tab-existencias').addEventListener('click', () => toggleAlmacenTab('existencias'));
document.getElementById('tab-movimientos').addEventListener('click', () => toggleAlmacenTab('movimientos'));
document.getElementById('tab-produccion').addEventListener('click', () => toggleAlmacenTab('produccion'));

function toggleAlmacenTab(tabName) {
  const tabs = ['existencias', 'movimientos', 'produccion'];
  tabs.forEach(t => {
    document.getElementById(`tab-${t}`).classList.remove('active');
    document.getElementById(`panel-${t}`).style.display = 'none';
  });
  
  document.getElementById(`tab-${tabName}`).classList.add('active');
  document.getElementById(`panel-${tabName}`).style.display = 'block';
  
  loadAlmacenData();
}

async function loadAlmacenData() {
  try {
    if (allProducts.length === 0) {
      const pRes = await fetch(`${API_URL}/api/productos`, { headers: getHeaders() });
      allProducts = await pRes.json();
    }
    
    // 1. Load Current Stocks
    const stockRes = await fetch(`${API_URL}/api/almacen/existencias`, { headers: getHeaders() });
    const stocks = await stockRes.json();
    
    const stockTbody = document.getElementById('stock-tbody');
    stockTbody.innerHTML = '';
    
    stocks.forEach(s => {
      const isLow = s.existencias <= 0;
      const statusBadge = isLow ? `<span class="badge badge-danger">Sin Stock</span>` : `<span class="badge badge-success">Disponible</span>`;
      const qtyFormatted = s.existencias.toLocaleString('es-MX', { minimumFractionDigits: 3 });
      
      stockTbody.innerHTML += `
        <tr style="${isLow ? 'background-color: #fff5f5;' : ''}">
          <td><strong>${s.producto}</strong></td>
          <td>${s.tipo_categoria}</td>
          <td style="text-align: right; font-weight: 600; ${isLow ? 'color: var(--danger);' : ''}">${qtyFormatted}</td>
          <td>${statusBadge}</td>
        </tr>
      `;
    });
    
    // 2. Load History Movements
    const movesRes = await fetch(`${API_URL}/api/almacen/movimientos`, { headers: getHeaders() });
    const movements = await movesRes.json();
    
    const movesTbody = document.getElementById('movements-tbody');
    movesTbody.innerHTML = '';
    
    movements.forEach(m => {
      const dateOnly = m.fecha_movimiento.slice(0, 16).replace('T', ' ');
      const valEnt = m.cantidad_entrante > 0 ? m.cantidad_entrante.toLocaleString('es-MX', { minimumFractionDigits: 3 }) : '-';
      const valSal = m.cantidad_saliente > 0 ? m.cantidad_saliente.toLocaleString('es-MX', { minimumFractionDigits: 3 }) : '-';
      
      movesTbody.innerHTML += `
        <tr>
          <td style="font-size: 12px; color: var(--text-light);">${dateOnly}</td>
          <td><span class="badge ${m.tipo_movimiento.startsWith('Entrada') || m.tipo_movimiento.includes('Reversión') ? 'badge-success' : 'badge-warning'}">${m.tipo_movimiento}</span></td>
          <td><strong>${m.producto_nombre}</strong></td>
          <td style="text-align: right; color: var(--success); font-weight: 500;">${valEnt}</td>
          <td style="text-align: right; color: var(--danger); font-weight: 500;">${valSal}</td>
          <td style="text-align: right; font-weight: 600;">${m.existencias_resultantes.toLocaleString('es-MX', { minimumFractionDigits: 3 })}</td>
        </tr>
      `;
    });
    
    // 3. Load Form select options
    const moveProdSelect = document.getElementById('move-prod');
    moveProdSelect.innerHTML = '<option value="">-- Selecciona un Producto --</option>';
    allProducts.forEach(p => {
      moveProdSelect.innerHTML += `<option value="${p.id}">${p.producto}</option>`;
    });
    
  } catch (err) {
    console.error('Failed to load Almacen inventory log:', err);
  }
}

// Manual movement submission handler
document.getElementById('add-movement-form').addEventListener('submit', async (e) => {
  e.preventDefault();
  
  const payload = {
    producto_id: Number(document.getElementById('move-prod').value),
    tipo_movimiento: document.getElementById('move-tipo').value,
    cantidad_entrante: Number(document.getElementById('move-entrante').value) || 0.0,
    cantidad_saliente: Number(document.getElementById('move-saliente').value) || 0.0,
    referencia_factura: document.getElementById('move-referencia').value.trim(),
    notas: document.getElementById('move-notas').value.trim()
  };
  
  try {
    const res = await fetch(`${API_URL}/api/almacen/movimientos`, {
      method: 'POST',
      headers: getHeaders(),
      body: JSON.stringify(payload)
    });
    
    if (!res.ok) {
      const data = await res.json();
      throw new Error(data.error || 'Failed to submit movement');
    }
    
    document.getElementById('add-movement-form').reset();
    await loadAlmacenData();
    alert('Movimiento registrado e inventario actualizado.');
  } catch (err) {
    alert(err.message);
  }
});

// Dynamic calculations on UAN conversion yield input
document.getElementById('uan-input-solub').addEventListener('input', (e) => {
  const inputTons = Number(e.target.value) || 0.0;
  const yieldLiters = inputTons * 2000.0;
  document.getElementById('uan-output-estimate').value = `${yieldLiters.toLocaleString('es-MX', { maximumFractionDigits: 3 })} Litros`;
});

// UAN conversion submission handler
document.getElementById('produccion-uan-form').addEventListener('submit', async (e) => {
  e.preventDefault();
  const tons = Number(document.getElementById('uan-input-solub').value);
  
  if (tons <= 0) return;
  
  try {
    const res = await fetch(`${API_URL}/api/almacen/produccion-uan32`, {
      method: 'POST',
      headers: getHeaders(),
      body: JSON.stringify({ cantidad_solub_toneladas: tons })
    });
    
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || 'Conversion process failed');
    
    document.getElementById('produccion-uan-form').reset();
    document.getElementById('uan-output-estimate').value = '0.00 Litros';
    await loadAlmacenData();
    
    alert(`Conversión completada con éxito. Se restaron ${tons} Tons de Solub 45 y se agregaron ${data.uan_produced_liters.toLocaleString('es-MX')} Litros de UAN-32 en inventario.`);
  } catch (err) {
    alert(err.message);
  }
});

// -------------------------------------------------------------
// ADMINISTRATION CATALOG LOGIC
// -------------------------------------------------------------
let adminActiveTab = 'asesores';
let allAdminAsesores = [];
let allAdminProductos = [];

// Tab switching
if (document.getElementById('tab-admin-asesores')) {
  document.getElementById('tab-admin-asesores').addEventListener('click', () => switchAdminTab('asesores'));
  document.getElementById('tab-admin-productos').addEventListener('click', () => switchAdminTab('productos'));
  document.getElementById('tab-admin-metas').addEventListener('click', () => switchAdminTab('metas'));
}

function switchAdminTab(tabName) {
  adminActiveTab = tabName;
  document.getElementById('tab-admin-asesores').classList.remove('active');
  document.getElementById('tab-admin-productos').classList.remove('active');
  document.getElementById('tab-admin-metas').classList.remove('active');
  document.getElementById('panel-admin-asesores').style.display = 'none';
  document.getElementById('panel-admin-productos').style.display = 'none';
  document.getElementById('panel-admin-metas').style.display = 'none';
  
  document.getElementById(`tab-admin-${tabName}`).classList.add('active');
  document.getElementById(`panel-admin-${tabName}`).style.display = 'block';
  
  loadAdminData();
}

async function loadAdminData() {
  if (adminActiveTab === 'asesores') {
    await loadAdminAsesores();
  } else if (adminActiveTab === 'productos') {
    await loadAdminProductos();
  } else if (adminActiveTab === 'metas') {
    await loadAdminMetas();
  }
}

// 1. ASESORES ADMIN LOGIC
async function loadAdminAsesores() {
  const tbody = document.getElementById('admin-asesores-tbody');
  if (!tbody) return;
  tbody.innerHTML = '<tr><td colspan="7" style="text-align: center; color: var(--text-light);">Cargando...</td></tr>';
  
  try {
    const res = await fetch(`${API_URL}/api/asesores`, { headers: getHeaders() });
    allAdminAsesores = await res.json();
    
    tbody.innerHTML = '';
    if (allAdminAsesores.length === 0) {
      tbody.innerHTML = '<tr><td colspan="7" style="text-align: center;">No hay asesores registrados.</td></tr>';
      return;
    }
    
    allAdminAsesores.forEach(a => {
      const activeText = a.activo === 1 ? 'Activo' : 'Inactivo';
      const activeBadge = a.activo === 1 ? 'badge-success' : 'badge-danger';
      const tel = a.telefono || '-';
      
      tbody.innerHTML += `
        <tr style="${a.activo === 0 ? 'background-color: #f8fafc; opacity: 0.75;' : ''}">
          <td><strong>${a.nombre}</strong></td>
          <td>${a.usuario}</td>
          <td>${a.email}</td>
          <td>${tel}</td>
          <td><span class="badge" style="background-color: ${a.nivel_rol === 'Administrador' ? '#eff6ff' : '#f1f5f9'}; color: ${a.nivel_rol === 'Administrador' ? '#1d4ed8' : '#475569'}; border-color: ${a.nivel_rol === 'Administrador' ? '#bfdbfe' : '#e2e8f0'};">${a.nivel_rol}</span></td>
          <td><span class="badge ${activeBadge}">${activeText}</span></td>
          <td>
            <div style="display: flex; gap: 8px;">
              <button class="btn btn-secondary" style="width: auto; padding: 4px 8px; font-size: 12px; margin: 0;" onclick="openEditAsesorModal(${a.id})">Editar</button>
              ${a.activo === 1 
                ? `<button class="btn btn-secondary" style="width: auto; padding: 4px 8px; font-size: 12px; margin: 0; border-color: var(--danger); color: var(--danger);" onclick="toggleAsesorActiveStatus(${a.id}, false)">Desactivar</button>`
                : `<button class="btn btn-secondary" style="width: auto; padding: 4px 8px; font-size: 12px; margin: 0; border-color: var(--success); color: var(--success);" onclick="toggleAsesorActiveStatus(${a.id}, true)">Activar</button>`
              }
            </div>
          </td>
        </tr>
      `;
    });
  } catch (err) {
    tbody.innerHTML = `<tr><td colspan="7" style="text-align: center; color: var(--danger);">Error al cargar asesores: ${err.message}</td></tr>`;
  }
}

// 2. PRODUCTOS ADMIN LOGIC
async function loadAdminProductos() {
  const tbody = document.getElementById('admin-productos-tbody');
  if (!tbody) return;
  tbody.innerHTML = '<tr><td colspan="8" style="text-align: center; color: var(--text-light);">Cargando...</td></tr>';
  
  try {
    const res = await fetch(`${API_URL}/api/productos`, { headers: getHeaders() });
    allAdminProductos = await res.json();
    
    tbody.innerHTML = '';
    if (allAdminProductos.length === 0) {
      tbody.innerHTML = '<tr><td colspan="8" style="text-align: center;">No hay productos registrados.</td></tr>';
      return;
    }
    
    allAdminProductos.forEach(p => {
      const activeText = p.activo === 1 ? 'Activo' : 'Inactivo';
      const activeBadge = p.activo === 1 ? 'badge-success' : 'badge-danger';
      const baseUsd = p.base_usd > 0 ? `$${p.base_usd.toFixed(2)}` : '-';
      const fixedDisc = p.descuento_fijo_quimicos > 0 ? `$${p.descuento_fijo_quimicos.toFixed(2)}` : '-';
      const scaleText = p.descontar === 1 ? 'Sí' : 'No';
      const scaleBadge = p.descontar === 1 ? 'badge-success' : 'badge-warning';
      
      tbody.innerHTML += `
        <tr style="${p.activo === 0 ? 'background-color: #f8fafc; opacity: 0.75;' : ''}">
          <td><strong>${p.producto}</strong></td>
          <td>${p.tipo_categoria}</td>
          <td style="text-align: right; font-weight: 600;">$${p.list_price_mxn.toLocaleString('es-MX', { minimumFractionDigits: 2 })}</td>
          <td style="text-align: right;">${baseUsd}</td>
          <td style="text-align: right; color: var(--danger);">${fixedDisc}</td>
          <td><span class="badge ${scaleBadge}">${scaleText}</span></td>
          <td><span class="badge ${activeBadge}">${activeText}</span></td>
          <td>
            <div style="display: flex; gap: 8px;">
              <button class="btn btn-secondary" style="width: auto; padding: 4px 8px; font-size: 12px; margin: 0;" onclick="openEditProductoModal(${p.id})">Editar</button>
              ${p.activo === 1
                ? `<button class="btn btn-secondary" style="width: auto; padding: 4px 8px; font-size: 12px; margin: 0; border-color: var(--danger); color: var(--danger);" onclick="toggleProductoActiveStatus(${p.id}, false)">Desactivar</button>`
                : `<button class="btn btn-secondary" style="width: auto; padding: 4px 8px; font-size: 12px; margin: 0; border-color: var(--success); color: var(--success);" onclick="toggleProductoActiveStatus(${p.id}, true)">Activar</button>`
              }
            </div>
          </td>
        </tr>
      `;
    });
  } catch (err) {
    tbody.innerHTML = `<tr><td colspan="8" style="text-align: center; color: var(--danger);">Error al cargar productos: ${err.message}</td></tr>`;
  }
}

// ASESORES FORM HANDLERS
if (document.getElementById('btn-open-asesor-modal')) {
  document.getElementById('btn-open-asesor-modal').addEventListener('click', () => {
    document.getElementById('add-asesor-form').reset();
    document.getElementById('asesor-form-id').value = '';
    document.getElementById('asesor-modal-title').textContent = 'Registrar Nuevo Asesor';
    document.getElementById('asesor-submit-btn').textContent = 'Registrar Asesor';
    document.getElementById('asesor-password-label').textContent = 'Contraseña';
    document.getElementById('asesor-password').placeholder = 'Dejar vacío para usar "password123"';
    document.getElementById('asesor-status').value = '1';
    
    openModal('add-asesor-modal');
  });
}

window.openEditAsesorModal = function(id) {
  const a = allAdminAsesores.find(x => x.id === id);
  if (!a) return;
  
  document.getElementById('asesor-form-id').value = a.id;
  document.getElementById('asesor-name').value = a.nombre;
  document.getElementById('asesor-user').value = a.usuario;
  document.getElementById('asesor-role').value = a.nivel_rol;
  document.getElementById('asesor-email').value = a.email;
  document.getElementById('asesor-phone').value = a.telefono || '';
  document.getElementById('asesor-cumpleanos').value = a.cumpleanos || '';
  document.getElementById('asesor-status').value = a.activo.toString();
  document.getElementById('asesor-password').value = '';
  
  document.getElementById('asesor-modal-title').textContent = 'Editar Asesor';
  document.getElementById('asesor-submit-btn').textContent = 'Guardar Cambios';
  document.getElementById('asesor-password-label').textContent = 'Nueva Contraseña (Opcional)';
  document.getElementById('asesor-password').placeholder = 'Dejar vacío para no modificar';
  
  openModal('add-asesor-modal');
};

document.getElementById('add-asesor-form').addEventListener('submit', async (e) => {
  e.preventDefault();
  
  const id = document.getElementById('asesor-form-id').value;
  const payload = {
    nombre: document.getElementById('asesor-name').value.trim(),
    usuario: document.getElementById('asesor-user').value.trim(),
    nivel_rol: document.getElementById('asesor-role').value,
    email: document.getElementById('asesor-email').value.trim(),
    telefono: document.getElementById('asesor-phone').value.trim() || null,
    cumpleanos: document.getElementById('asesor-cumpleanos').value || null,
    activo: document.getElementById('asesor-status').value === '1',
    password: document.getElementById('asesor-password').value || null
  };
  
  const url = id ? `${API_URL}/api/asesores/${id}` : `${API_URL}/api/asesores`;
  const method = id ? 'PUT' : 'POST';
  
  try {
    const res = await fetch(url, {
      method,
      headers: getHeaders(),
      body: JSON.stringify(payload)
    });
    
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || 'Failed to save advisor');
    
    closeModal('add-asesor-modal');
    await loadAdminAsesores();
    alert(id ? 'Asesor actualizado exitosamente' : 'Asesor registrado exitosamente');
  } catch (err) {
    alert(err.message);
  }
});

window.toggleAsesorActiveStatus = async function(id, activate) {
  if (!confirm(`¿Estás seguro de que deseas ${activate ? 'reactivar' : 'desactivar'} a este asesor?`)) return;
  
  const a = allAdminAsesores.find(x => x.id === id);
  if (!a) return;
  
  const payload = {
    nombre: a.nombre,
    usuario: a.usuario,
    nivel_rol: a.nivel_rol,
    email: a.email,
    telefono: a.telefono,
    cumpleanos: a.cumpleanos,
    activo: activate
  };
  
  try {
    const res = await fetch(`${API_URL}/api/asesores/${id}`, {
      method: 'PUT',
      headers: getHeaders(),
      body: JSON.stringify(payload)
    });
    
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || 'Failed to toggle advisor status');
    
    await loadAdminAsesores();
  } catch (err) {
    alert(err.message);
  }
};

// PRODUCTOS FORM HANDLERS
if (document.getElementById('btn-open-producto-modal')) {
  document.getElementById('btn-open-producto-modal').addEventListener('click', () => {
    document.getElementById('add-producto-form').reset();
    document.getElementById('producto-form-id').value = '';
    document.getElementById('producto-modal-title').textContent = 'Registrar Nuevo Producto';
    document.getElementById('producto-submit-btn').textContent = 'Registrar Producto';
    document.getElementById('prod-status').value = '1';
    
    // Show stock field for new entries
    document.getElementById('group-stock-inicial').style.display = 'block';
    
    openModal('add-producto-modal');
  });
}

window.openEditProductoModal = function(id) {
  const p = allAdminProductos.find(x => x.id === id);
  if (!p) return;
  
  document.getElementById('producto-form-id').value = p.id;
  document.getElementById('prod-name').value = p.producto;
  document.getElementById('prod-category').value = p.tipo_categoria;
  document.getElementById('prod-list-price').value = p.list_price_mxn;
  document.getElementById('prod-base-usd').value = p.base_usd;
  document.getElementById('prod-fixed-discount').value = p.descuento_fijo_quimicos;
  document.getElementById('prod-objective').value = p.objetivo_anual || 0;
  document.getElementById('prod-status').value = p.activo.toString();
  document.getElementById('prod-descontar').checked = p.descontar === 1;
  
  // Hide initial stock field for edits
  document.getElementById('group-stock-inicial').style.display = 'none';
  
  document.getElementById('producto-modal-title').textContent = 'Editar Producto';
  document.getElementById('producto-submit-btn').textContent = 'Guardar Cambios';
  
  openModal('add-producto-modal');
};

document.getElementById('add-producto-form').addEventListener('submit', async (e) => {
  e.preventDefault();
  
  const id = document.getElementById('producto-form-id').value;
  const payload = {
    producto: document.getElementById('prod-name').value.trim(),
    tipo_categoria: document.getElementById('prod-category').value,
    list_price_mxn: Number(document.getElementById('prod-list-price').value),
    base_usd: Number(document.getElementById('prod-base-usd').value) || 0.0,
    descuento_fijo_quimicos: Number(document.getElementById('prod-fixed-discount').value) || 0.0,
    objetivo_anual: Number(document.getElementById('prod-objective').value) || 0,
    descontar: document.getElementById('prod-descontar').checked,
    activo: document.getElementById('prod-status').value === '1',
    stock_inicial: id ? 0 : Number(document.getElementById('prod-stock-inicial').value) || 0.0
  };
  
  const url = id ? `${API_URL}/api/productos/${id}` : `${API_URL}/api/productos`;
  const method = id ? 'PUT' : 'POST';
  
  try {
    const res = await fetch(url, {
      method,
      headers: getHeaders(),
      body: JSON.stringify(payload)
    });
    
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || 'Failed to save product');
    
    closeModal('add-producto-modal');
    await loadAdminProductos();
    alert(id ? 'Producto actualizado exitosamente' : 'Producto registrado exitosamente');
  } catch (err) {
    alert(err.message);
  }
});

window.toggleProductoActiveStatus = async function(id, activate) {
  if (!confirm(`¿Estás seguro de que deseas ${activate ? 'reactivar' : 'desactivar'} este producto del catálogo?`)) return;
  
  const p = allAdminProductos.find(x => x.id === id);
  if (!p) return;
  
  const payload = {
    producto: p.producto,
    tipo_categoria: p.tipo_categoria,
    list_price_mxn: p.list_price_mxn,
    base_usd: p.base_usd,
    descuento_fijo_quimicos: p.descuento_fijo_quimicos,
    objetivo_anual: p.objetivo_anual,
    descontar: p.descontar === 1,
    activo: activate
  };
  
  try {
    const res = await fetch(`${API_URL}/api/productos/${id}`, {
      method: 'PUT',
      headers: getHeaders(),
      body: JSON.stringify(payload)
    });
    
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || 'Failed to toggle product status');
    
    await loadAdminProductos();
  } catch (err) {
    alert(err.message);
  }
};

// -------------------------------------------------------------
// WEEKLY PLANNING VIEW LOGIC
// -------------------------------------------------------------
let activePlanWeek = '';

function getCurrentWeekString() {
  const d = new Date();
  const day = d.getDay(),
      diff = d.getDate() - day + (day == 0 ? -6:1);
  const monday = new Date(d.setDate(diff));
  
  const year = monday.getFullYear();
  const target = new Date(monday.valueOf());
  const dayNr = (monday.getDay() + 6) % 7;
  target.setDate(target.getDate() - dayNr + 3);
  const firstThursday = target.valueOf();
  target.setMonth(0, 1);
  if (target.getDay() !== 4) {
    target.setMonth(0, 1 + ((4 - target.getDay()) + 7) % 7);
  }
  const weekNum = 1 + Math.ceil((firstThursday - target) / 604800000);
  const weekPad = String(weekNum).padStart(2, '0');
  return `${year}-W${weekPad}`;
}

function getWeekDateRange(weekStr) {
  const parts = weekStr.split('-W');
  const year = parseInt(parts[0], 10);
  const week = parseInt(parts[1], 10);
  
  const jan4 = new Date(year, 0, 4);
  const dayOfJan4 = jan4.getDay();
  const mondayOfIsoWeek1 = new Date(jan4.getTime() - ((dayOfJan4 === 0 ? 7 : dayOfJan4) - 1) * 86400000);
  
  const monday = new Date(mondayOfIsoWeek1.getTime() + (week - 1) * 7 * 86400000);
  const sunday = new Date(monday.getTime() + 6 * 86400000);
  
  return {
    monday: monday.toISOString().slice(0, 10),
    sunday: sunday.toISOString().slice(0, 10)
  };
}

async function loadPlaneacionView() {
  const weekSelect = document.getElementById('plan-week-select');
  if (weekSelect && !weekSelect.value) {
    weekSelect.value = getCurrentWeekString();
  }
  activePlanWeek = weekSelect.value;
  
  if (user.nivel_rol === 'Administrador' || user.nivel_rol === 'Coordinador') {
    await loadPlanAdvisorOptions();
  }
  
  await loadPlanClientOptions();
  await loadWeeklySchedule();
}

async function loadPlanAdvisorOptions() {
  const select = document.getElementById('plan-advisor-filter');
  if (!select) return;
  
  try {
    const res = await fetch(`${API_URL}/api/asesores`, { headers: getHeaders() });
    const advisers = await res.json();
    const curr = select.value || 'ALL';
    
    select.innerHTML = '<option value="ALL">Todos los Asesores</option>';
    advisers.forEach(a => {
      if (a.activo === 1) {
        select.innerHTML += `<option value="${a.id}">${a.nombre}</option>`;
      }
    });
    select.value = curr;
  } catch (err) {
    console.error(err);
  }
}

async function loadPlanClientOptions() {
  const select = document.getElementById('plan-client');
  if (!select) return;
  
  try {
    if (allClients.length === 0) {
      const res = await fetch(`${API_URL}/api/clientes`, { headers: getHeaders() });
      allClients = await res.json();
    }
    
    select.innerHTML = '<option value="">-- Selecciona un Cliente --</option>';
    allClients.forEach(c => {
      select.innerHTML += `<option value="${c.id}">${c.nombre}</option>`;
    });
  } catch (err) {
    console.error(err);
  }
}

async function loadWeeklySchedule() {
  const weekStr = document.getElementById('plan-week-select').value;
  if (!weekStr) return;
  
  const range = getWeekDateRange(weekStr);
  const advisorFilter = document.getElementById('plan-advisor-filter');
  const advisorId = advisorFilter ? advisorFilter.value : 'ALL';
  
  try {
    let url = `${API_URL}/api/planificacion?fecha_inicio=${range.monday}&fecha_fin=${range.sunday}`;
    if (advisorId !== 'ALL') {
      url += `&asesor_id=${advisorId}`;
    }
    
    const res = await fetch(url, { headers: getHeaders() });
    const planList = await res.json();
    currentPlanList = planList;
    
    // Reset day column structures and checkboxes
    for (let i = 1; i <= 5; i++) {
      document.getElementById(`agenda-day-${i}`).innerHTML = '';
      document.getElementById(`count-day-${i}`).textContent = '0';
      const dayCheckbox = document.querySelector(`.day-select-checkbox[data-day="${i}"]`);
      if (dayCheckbox) {
        dayCheckbox.checked = false;
        dayCheckbox.disabled = true;
      }
    }
    
    const dayCounts = [0, 0, 0, 0, 0];
    
    planList.forEach(p => {
      const date = new Date(p.fecha_programada + 'T00:00:00');
      let dayIndex = date.getDay();
      
      if (dayIndex === 0 || dayIndex === 6) {
        dayIndex = 5;
      }
      
      if (dayIndex >= 1 && dayIndex <= 5) {
        const col = document.getElementById(`agenda-day-${dayIndex}`);
        dayCounts[dayIndex - 1]++;
        
        // Enable day select checkbox
        const dayCheckbox = document.querySelector(`.day-select-checkbox[data-day="${dayIndex}"]`);
        if (dayCheckbox) {
          dayCheckbox.disabled = false;
        }
        
        const card = document.createElement('div');
        card.className = 'kanban-card';
        
        let colorBorder = 'var(--info)';
        if (p.realizada === 1) colorBorder = 'var(--success)';
        if (p.realizada === 2) colorBorder = 'var(--text-light)';
        if (p.realizada === 3) colorBorder = 'var(--danger)';
        card.style.borderLeft = `4px solid ${colorBorder}`;
        
        card.style.cursor = 'pointer';
        card.addEventListener('click', (e) => {
          if (e.target.closest('button') || e.target.closest('input[type="checkbox"]')) return;
          if (p.realizada === 3) {
            reschedulePlanActivity(p);
          } else if (p.realizada === 0) {
            openEditPlanModal(p);
          }
        });
        
        let statusBadge = '';
        if (p.realizada === 1) statusBadge = '<span class="badge badge-success" style="font-size: 8px; padding: 2px 6px;">Realizada</span>';
        if (p.realizada === 2) statusBadge = '<span class="badge" style="font-size: 8px; padding: 2px 6px; background-color: #f1f5f9; color: var(--text-light); border-color: var(--border);">Cancelada</span>';
        if (p.realizada === 3) statusBadge = '<span class="badge badge-danger" style="font-size: 8px; padding: 2px 6px;">Vencida</span>';
        if (p.realizada === 0) statusBadge = '<span class="badge badge-info" style="font-size: 8px; padding: 2px 6px;">Pendiente</span>';

        const bagsText = p.pronostico_bolsas > 0 ? `📦 ${p.pronostico_bolsas} b.` : '';
        const amtText = p.pronostico_monto_mxn > 0 ? `💰 $${p.pronostico_monto_mxn.toLocaleString('es-MX', {maximumFractionDigits: 0})}` : '';
        const forecastText = (bagsText || amtText) ? `<div style="font-size: 11px; margin-top: 4px; font-weight: 600; color: var(--accent);">${bagsText} ${amtText}</div>` : '';
        
        let actions = '';
        if (p.realizada === 0 && (p.asesor_id === user.id || user.nivel_rol === 'Administrador')) {
          actions = `
            <div style="display: flex; gap: 8px; margin-top: 8px; border-top: 1px solid #f1f5f9; padding-top: 8px; justify-content: flex-end;">
              <button class="btn btn-secondary" style="padding: 4px 8px; font-size: 10px; margin: 0; width: auto;" onclick="openCompletePlanModal(${p.id})">✔️ Cerrar</button>
              <button class="btn btn-secondary" style="padding: 4px 8px; font-size: 10px; margin: 0; width: auto; border-color: var(--danger); color: var(--danger);" onclick="deletePlanActivity(${p.id})">🗑️</button>
            </div>
          `;
        } else if (p.realizada === 3 && (p.asesor_id === user.id || user.nivel_rol === 'Administrador')) {
          actions = `
            <div style="display: flex; gap: 8px; margin-top: 8px; border-top: 1px solid #f1f5f9; padding-top: 8px; justify-content: flex-end;">
              <button class="btn btn-secondary" style="padding: 4px 8px; font-size: 10px; margin: 0; width: auto; border-color: var(--accent); color: var(--accent);" onclick="reschedulePlanActivity(${p.id})">🔄 Reagendar</button>
            </div>
          `;
        }
        
        card.innerHTML = `
          <div style="display: flex; align-items: flex-start; gap: 8px; margin-bottom: 4px;">
            <input type="checkbox" class="card-select-checkbox" data-id="${p.id}" style="width: 15px; height: 15px; cursor: pointer; margin-top: 3px;">
            <div style="flex-grow: 1;">
              <div style="display: flex; justify-content: space-between; align-items: flex-start; gap: 6px;">
                <strong style="font-size: 13.5px; color: var(--text);">${p.cliente_nombre}</strong>
                ${statusBadge}
              </div>
              <div style="font-size: 11px; color: var(--text-light); font-weight: 500;">Visita: ${p.fecha_programada.slice(5)}</div>
              <div style="font-size: 12px; color: var(--text); margin-top: 4px; font-style: italic;">"${p.objetivo_visita || 'Sin objetivo'}"</div>
              ${forecastText}
              <div style="font-size: 10px; color: var(--text-light); margin-top: 4px;">👤 Asesor: ${p.asesor_nombre.split(' ')[0]}</div>
            </div>
          </div>
          ${actions}
        `;
        col.appendChild(card);

        // Bind checkbox click behavior to stop propagation and compute stats on change
        const selectCheckbox = card.querySelector('.card-select-checkbox');
        if (selectCheckbox) {
          selectCheckbox.addEventListener('click', (e) => {
            e.stopPropagation();
          });
          selectCheckbox.addEventListener('change', () => {
            calculateAndUpdateWeeklyStats();
            updateDayHeaderCheckboxes();
          });
        }
      }
    });
    
    for (let i = 1; i <= 5; i++) {
      document.getElementById(`count-day-${i}`).textContent = dayCounts[i - 1];
    }
    
    await loadPlanningMetaProgress(advisorId);
  } catch (err) {
    console.error(err);
  }
}

async function loadPlanningMetaProgress(advisorId = 'ALL') {
  try {
    const cycle = 'O-I 2026';
    const res = await fetch(`${API_URL}/api/dashboard/proyecciones?ciclo_agricola=${cycle}`, { headers: getHeaders() });
    let rollups = await res.json();
    
    if (advisorId && advisorId !== 'ALL') {
      rollups = rollups.filter(r => r.asesor_id === Number(advisorId));
    }
    
    let totalMetaMxn = 0.0;
    let totalMetaBags = 0;
    let totalRealMxn = 0.0;
    let totalRealBags = 0;
    
    rollups.forEach(r => {
      totalMetaMxn += r.meta_mxn;
      totalMetaBags += r.meta_bolsas;
      totalRealMxn += r.real_mxn;
      totalRealBags += r.real_bolsas;
    });
    
    // Store globally so selection updates can use them
    currentCycleMetaMxn = totalMetaMxn;
    currentCycleMetaBags = totalMetaBags;
    
    const mxnProgressPct = totalMetaMxn > 0 ? Math.min((totalRealMxn / totalMetaMxn) * 100, 100) : 0;
    document.getElementById('meta-progress-mxn-text').innerHTML = `
      $${totalRealMxn.toLocaleString('es-MX', {minimumFractionDigits: 2})} MXN 
      <span style="color: var(--text-light); font-weight: 500; font-size: 13px;">de $${totalMetaMxn.toLocaleString('es-MX', {minimumFractionDigits: 2})} (${mxnProgressPct.toFixed(1)}%)</span>
    `;
    document.getElementById('meta-progress-mxn-bar').style.width = `${mxnProgressPct}%`;
    
    const bagsProgressPct = totalMetaBags > 0 ? Math.min((totalRealBags / totalMetaBags) * 100, 100) : 0;
    document.getElementById('meta-progress-bags-text').innerHTML = `
      ${totalRealBags} bolsas 
      <span style="color: var(--text-light); font-weight: 500; font-size: 13px;">de ${totalMetaBags} bolsas (${bagsProgressPct.toFixed(1)}%)</span>
    `;
    document.getElementById('meta-progress-bags-bar').style.width = `${bagsProgressPct}%`;
    
    calculateAndUpdateWeeklyStats();
    updateDayHeaderCheckboxes();
  } catch (err) {
    console.error(err);
  }
}

function calculateAndUpdateWeeklyStats() {
  const checkedCardIds = Array.from(document.querySelectorAll('.card-select-checkbox:checked'))
    .map(cb => Number(cb.getAttribute('data-id')));
  
  const useAll = checkedCardIds.length === 0;
  const selectedPlans = useAll 
    ? currentPlanList 
    : currentPlanList.filter(p => checkedCardIds.includes(p.id));
  
  let countTotal = selectedPlans.length;
  let countRealizadas = selectedPlans.filter(p => p.realizada === 1).length;
  let countVencidas = selectedPlans.filter(p => p.realizada === 3).length;
  let countPendientes = selectedPlans.filter(p => p.realizada === 0).length;
  
  let forecastMxn = 0;
  let forecastBags = 0;
  selectedPlans.forEach(p => {
    forecastMxn += p.pronostico_monto_mxn || 0;
    forecastBags += p.pronostico_bolsas || 0;
  });
  
  document.getElementById('plan-stat-total').textContent = countTotal;
  document.getElementById('plan-stat-realizadas').textContent = countRealizadas;
  document.getElementById('plan-stat-vencidas').textContent = countVencidas;
  document.getElementById('plan-stat-pendientes').textContent = countPendientes;
  
  const forecastTextEl = document.getElementById('meta-forecast-text');
  forecastTextEl.innerHTML = `
    $${forecastMxn.toLocaleString('es-MX', {minimumFractionDigits: 2})} MXN (${forecastBags} bolsas)
  `;
  
  const forecastCardTitleEl = forecastTextEl.previousElementSibling;
  const titleText = useAll ? 'Pronóstico en Proyección Semanal' : '🎯 Pronóstico de Selección';
  if (forecastCardTitleEl) {
    forecastCardTitleEl.innerHTML = `${titleText} ${!useAll ? '<span class="badge badge-accent" style="margin-left: 8px;">Filtro Activo</span>' : ''}`;
  }
  
  const subtitleEl = forecastTextEl.nextElementSibling;
  if (subtitleEl) {
    if (useAll) {
      subtitleEl.innerHTML = `Ventas potenciales estimadas de visitas agendadas en la semana.`;
    } else {
      const pctMxnStr = currentCycleMetaMxn > 0 
        ? ` (${((forecastMxn / currentCycleMetaMxn) * 100).toFixed(1)}% de meta ciclo)` 
        : '';
      const pctBagsStr = currentCycleMetaBags > 0 
        ? ` (${((forecastBags / currentCycleMetaBags) * 100).toFixed(1)}% de meta ciclo)` 
        : '';
      subtitleEl.innerHTML = `
        Monto equivale al ${pctMxnStr || '0%'} de la meta del ciclo.<br>
        Bolsas equivalen al ${pctBagsStr || '0%'} de la meta del ciclo.
      `;
    }
  }

  document.querySelectorAll('.card-select-checkbox').forEach(cb => {
    const card = cb.closest('.kanban-card');
    if (card) {
      if (cb.checked) {
        card.classList.add('card-selected');
      } else {
        card.classList.remove('card-selected');
      }
    }
  });
}

function updateDayHeaderCheckboxes() {
  for (let i = 1; i <= 5; i++) {
    const dayCheckbox = document.querySelector(`.day-select-checkbox[data-day="${i}"]`);
    if (!dayCheckbox) continue;
    const container = document.getElementById(`agenda-day-${i}`);
    if (!container) continue;
    const checkboxes = container.querySelectorAll('.card-select-checkbox');
    if (checkboxes.length === 0) {
      dayCheckbox.checked = false;
      dayCheckbox.disabled = true;
    } else {
      dayCheckbox.disabled = false;
      const allChecked = Array.from(checkboxes).every(cb => cb.checked);
      dayCheckbox.checked = allChecked;
    }
  }
}

window.toggleDaySelection = function(dayIndex, isChecked) {
  const container = document.getElementById(`agenda-day-${dayIndex}`);
  if (!container) return;
  const checkboxes = container.querySelectorAll('.card-select-checkbox');
  checkboxes.forEach(cb => {
    cb.checked = isChecked;
  });
  calculateAndUpdateWeeklyStats();
  updateDayHeaderCheckboxes();
};

// Binds week change and advisor filter change
document.getElementById('plan-week-select').addEventListener('change', () => {
  loadWeeklySchedule();
});

const planAdvFilter = document.getElementById('plan-advisor-filter');
if (planAdvFilter) {
  planAdvFilter.addEventListener('change', () => {
    loadWeeklySchedule();
  });
}

document.getElementById('btn-open-plan-modal').addEventListener('click', () => {
  document.getElementById('add-plan-form').reset();
  document.getElementById('plan-form-id').value = '';
  document.getElementById('plan-date').value = new Date().toISOString().slice(0, 10);
  
  const modalTitle = document.getElementById('plan-modal-title');
  if (modalTitle) modalTitle.textContent = 'Programar Nueva Visita';
  
  const submitBtn = document.getElementById('plan-submit-btn');
  if (submitBtn) submitBtn.textContent = 'Programar Actividad';
  
  const convertBtn = document.getElementById('btn-convert-to-prospect');
  if (convertBtn) convertBtn.style.display = 'none';
  
  openModal('add-plan-modal');
});

window.openEditPlanModal = function(p) {
  document.getElementById('plan-client').value = p.cliente_id;
  document.getElementById('plan-date').value = p.fecha_programada;
  document.getElementById('plan-objective').value = p.objetivo_visita || '';
  document.getElementById('plan-forecast-bags').value = p.pronostico_bolsas || 0;
  document.getElementById('plan-forecast-amount').value = p.pronostico_monto_mxn || 0;
  document.getElementById('plan-form-id').value = p.id;
  
  const modalTitle = document.getElementById('plan-modal-title');
  if (modalTitle) modalTitle.textContent = 'Editar Visita Programada';
  
  const submitBtn = document.getElementById('plan-submit-btn');
  if (submitBtn) submitBtn.textContent = 'Guardar Cambios';
  
  const convertBtn = document.getElementById('btn-convert-to-prospect');
  if (convertBtn) {
    convertBtn.style.display = p.realizada === 0 ? 'inline-block' : 'none';
  }
  
  openModal('add-plan-modal');
};

document.getElementById('add-plan-form').addEventListener('submit', async (e) => {
  e.preventDefault();
  
  const id = document.getElementById('plan-form-id').value;
  
  const payload = {
    cliente_id: Number(document.getElementById('plan-client').value),
    fecha_programada: document.getElementById('plan-date').value,
    objetivo_visita: document.getElementById('plan-objective').value.trim(),
    pronostico_bolsas: Number(document.getElementById('plan-forecast-bags').value) || 0,
    pronostico_monto_mxn: Number(document.getElementById('plan-forecast-amount').value) || 0.0
  };
  
  const url = id ? `${API_URL}/api/planificacion/${id}` : `${API_URL}/api/planificacion`;
  const method = id ? 'PUT' : 'POST';
  
  try {
    const res = await fetch(url, {
      method,
      headers: getHeaders(),
      body: JSON.stringify(payload)
    });
    
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || 'Failed to save plan');
    
    closeModal('add-plan-modal');
    await loadWeeklySchedule();
    alert(id ? 'Visita actualizada exitosamente.' : 'Visita programada exitosamente.');
  } catch (err) {
    alert(err.message);
  }
});

const convertBtn = document.getElementById('btn-convert-to-prospect');
if (convertBtn) {
  convertBtn.addEventListener('click', async () => {
    const id = document.getElementById('plan-form-id').value;
    if (!id) return;
    
    if (!confirm('¿Estás seguro de que deseas enviar esta planificación al Canva como Prospecto? Se marcará como concluida en tu agenda y se creará una cotización en borrador.')) {
      return;
    }
    
    try {
      const res = await fetch(`${API_URL}/api/planificacion/${id}/convertir-cotizacion`, {
        method: 'POST',
        headers: getHeaders()
      });
      
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Failed to convert plan');
      
      closeModal('add-plan-modal');
      await loadWeeklySchedule();
      alert('Se ha enviado exitosamente al Canva en el Canal de Ventas como Prospecto.');
    } catch (err) {
      alert(err.message);
    }
  });
}

window.openCompletePlanModal = function(id) {
  document.getElementById('complete-plan-form').reset();
  document.getElementById('complete-plan-id').value = id;
  document.getElementById('complete-plan-status').value = '1';
  document.getElementById('group-complete-bitacora').style.display = 'block';
  document.getElementById('complete-plan-bitacora').required = true;
  
  openModal('complete-plan-modal');
};

document.getElementById('complete-plan-status').addEventListener('change', (e) => {
  const isRealized = e.target.value === '1';
  const group = document.getElementById('group-complete-bitacora');
  const txt = document.getElementById('complete-plan-bitacora');
  
  group.style.display = isRealized ? 'block' : 'none';
  txt.required = isRealized;
});

document.getElementById('complete-plan-form').addEventListener('submit', async (e) => {
  e.preventDefault();
  
  const id = document.getElementById('complete-plan-id').value;
  const statusVal = Number(document.getElementById('complete-plan-status').value);
  const bitacoraVal = document.getElementById('complete-plan-bitacora').value.trim();
  
  const payload = {
    realizada: statusVal,
    bitacora: statusVal === 1 ? bitacoraVal : null
  };
  
  try {
    const res = await fetch(`${API_URL}/api/planificacion/${id}`, {
      method: 'PUT',
      headers: getHeaders(),
      body: JSON.stringify(payload)
    });
    
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || 'Failed to update plan status');
    
    closeModal('complete-plan-modal');
    await loadWeeklySchedule();
    alert(statusVal === 1 ? 'Visita cerrada y registrada en bitácora CRM' : 'Visita cancelada');
  } catch (err) {
    alert(err.message);
  }
});

window.reschedulePlanActivity = function(p) {
  if (typeof p === 'number' || typeof p === 'string') {
    p = currentPlanList.find(x => x.id === Number(p));
  }
  if (!p) return;
  
  document.getElementById('add-plan-form').reset();
  document.getElementById('plan-form-id').value = '';
  
  document.getElementById('plan-client').value = p.cliente_id;
  document.getElementById('plan-date').value = new Date().toISOString().slice(0, 10);
  document.getElementById('plan-objective').value = `[Reagenda] ${p.objetivo_visita || ''}`.replace('[Reagenda] [Reagenda]', '[Reagenda]');
  document.getElementById('plan-forecast-bags').value = p.pronostico_bolsas || 0;
  document.getElementById('plan-forecast-amount').value = p.pronostico_monto_mxn || 0.0;
  
  const modalTitle = document.getElementById('plan-modal-title');
  if (modalTitle) modalTitle.textContent = 'Reagendar Visita';
  
  const submitBtn = document.getElementById('plan-submit-btn');
  if (submitBtn) submitBtn.textContent = 'Reagendar Actividad';
  
  const convertBtn = document.getElementById('btn-convert-to-prospect');
  if (convertBtn) convertBtn.style.display = 'none';
  
  openModal('add-plan-modal');
};

window.deletePlanActivity = async function(id) {
  if (!confirm('¿Estás seguro de que deseas eliminar esta visita programada de tu agenda?')) return;
  
  try {
    const res = await fetch(`${API_URL}/api/planificacion/${id}`, {
      method: 'DELETE',
      headers: getHeaders()
    });
    
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || 'Failed to delete plan');
    
    await loadWeeklySchedule();
  } catch (err) {
    alert(err.message);
  }
};

// -------------------------------------------------------------
// METAS COMERCIALES (ADMIN) VIEW LOGIC
// -------------------------------------------------------------
let allAdminMetas = [];

async function loadAdminMetas() {
  const tbody = document.getElementById('admin-metas-tbody');
  if (!tbody) return;
  tbody.innerHTML = '<tr><td colspan="5" style="text-align: center; color: var(--text-light);">Cargando...</td></tr>';
  
  try {
    const res = await fetch(`${API_URL}/api/metas`, { headers: getHeaders() });
    const data = await res.json();
    if (!res.ok) {
      throw new Error(data.error || 'Failed to fetch metas');
    }
    allAdminMetas = data;
    
    tbody.innerHTML = '';
    if (!Array.isArray(allAdminMetas) || allAdminMetas.length === 0) {
      tbody.innerHTML = '<tr><td colspan="5" style="text-align: center;">No hay metas comerciales configuradas.</td></tr>';
      return;
    }
    
    allAdminMetas.forEach(m => {
      const amountVal = Number(m.monto_objetivo_mxn) || 0.0;
      tbody.innerHTML += `
        <tr>
          <td><strong>${m.asesor_nombre || 'General / Global'}</strong></td>
          <td>${m.ciclo_agricola}</td>
          <td style="text-align: right; font-weight: 600;">$${amountVal.toLocaleString('es-MX', {minimumFractionDigits: 2})}</td>
          <td style="text-align: right; font-weight: 600;">${m.bolsas_objetivo}</td>
          <td>
            <button class="btn btn-secondary" style="width: auto; padding: 4px 8px; font-size: 12px; margin: 0;" onclick="openEditMetaModal(${m.id})">Editar</button>
          </td>
        </tr>
      `;
    });
  } catch (err) {
    tbody.innerHTML = `<tr><td colspan="5" style="text-align: center; color: var(--danger);">Error: ${err.message}</td></tr>`;
  }
}

if (document.getElementById('btn-open-meta-modal')) {
  document.getElementById('btn-open-meta-modal').addEventListener('click', async () => {
    document.getElementById('add-meta-form').reset();
    document.getElementById('meta-modal-title').textContent = 'Configurar Meta Comercial';
    await loadMetaAdvisorSelect();
    openModal('add-meta-modal');
  });
}

async function loadMetaAdvisorSelect() {
  const select = document.getElementById('meta-asesor');
  if (!select) return;
  
  try {
    const res = await fetch(`${API_URL}/api/asesores`, { headers: getHeaders() });
    const advisers = await res.json();
    
    select.innerHTML = '';
    advisers.forEach(a => {
      if (a.activo === 1) {
        select.innerHTML += `<option value="${a.id}">${a.nombre}</option>`;
      }
    });
  } catch (err) {
    console.error(err);
  }
}

window.openEditMetaModal = async function(id) {
  const m = allAdminMetas.find(x => x.id === id);
  if (!m) return;
  
  await loadMetaAdvisorSelect();
  
  document.getElementById('meta-asesor').value = m.asesor_id;
  document.getElementById('meta-ciclo').value = m.ciclo_agricola;
  document.getElementById('meta-bags').value = m.bolsas_objetivo;
  document.getElementById('meta-amount').value = m.monto_objetivo_mxn;
  
  document.getElementById('meta-modal-title').textContent = 'Editar Meta Comercial';
  openModal('add-meta-modal');
};

document.getElementById('add-meta-form').addEventListener('submit', async (e) => {
  e.preventDefault();
  
  const payload = {
    asesor_id: Number(document.getElementById('meta-asesor').value),
    ciclo_agricola: document.getElementById('meta-ciclo').value,
    monto_objetivo_mxn: Number(document.getElementById('meta-amount').value) || 0.0,
    bolsas_objetivo: Number(document.getElementById('meta-bags').value) || 0
  };
  
  try {
    const res = await fetch(`${API_URL}/api/metas`, {
      method: 'POST',
      headers: getHeaders(),
      body: JSON.stringify(payload)
    });
    
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || 'Failed to save meta');
    
    closeModal('add-meta-modal');
    await loadAdminMetas();
    alert('Meta guardada exitosamente.');
  } catch (err) {
    alert(err.message);
  }
});

// -------------------------------------------------------------
// CLIENTS & AGRICULTORES CATALOG LOGIC
// -------------------------------------------------------------
let allCatalogClients = [];
let catalogAdvisorsLoaded = false;
let catalogEventsBound = false;

function bindCatalogClientEvents() {
  if (catalogEventsBound) return;
  
  const searchInput = document.getElementById('catalog-client-search');
  if (searchInput) {
    searchInput.addEventListener('input', () => {
      renderCatalogClientes();
    });
  }
  
  const advisorFilter = document.getElementById('catalog-client-advisor-filter');
  if (advisorFilter) {
    advisorFilter.addEventListener('change', () => {
      renderCatalogClientes();
    });
  }
  
  catalogEventsBound = true;
}

async function loadCatalogClientAdvisorOptions() {
  const filterSelect = document.getElementById('catalog-client-advisor-filter');
  if (!filterSelect || catalogAdvisorsLoaded) return;
  
  try {
    const res = await fetch(`${API_URL}/api/asesores`, { headers: getHeaders() });
    const advisers = await res.json();
    
    filterSelect.innerHTML = '<option value="ALL">Todos los Asesores</option>';
    advisers.forEach(a => {
      if (a.activo === 1) {
        filterSelect.innerHTML += `<option value="${a.id}">${a.nombre}</option>`;
      }
    });
    catalogAdvisorsLoaded = true;
  } catch (err) {
    console.error('Failed to load advisor options for client catalog:', err);
  }
}

window.loadClientesCatalog = async function() {
  const tbody = document.getElementById('catalog-clientes-tbody');
  if (tbody) {
    tbody.innerHTML = '<tr><td colspan="9" style="text-align: center; color: var(--text-light);">Cargando agricultores...</td></tr>';
  }
  
  const thCatalogAsesor = document.getElementById('th-catalog-asesor');
  if (thCatalogAsesor) {
    thCatalogAsesor.style.display = user.nivel_rol === 'Asesor' ? 'none' : '';
  }
  
  try {
    bindCatalogClientEvents();
    
    if (user.nivel_rol === 'Administrador' || user.nivel_rol === 'Coordinador') {
      await loadCatalogClientAdvisorOptions();
    }
    
    const res = await fetch(`${API_URL}/api/clientes`, { headers: getHeaders() });
    const data = await res.json();
    
    if (!res.ok) {
      if (res.status === 401 || res.status === 403) {
        throw new Error('Sesión vencida. Por favor, cierra sesión e inicia sesión de nuevo.');
      }
      throw new Error(data.error || 'Failed to fetch clients');
    }
    
    if (!Array.isArray(data)) {
      throw new Error('La respuesta del servidor no tiene el formato esperado.');
    }
    
    allCatalogClients = data;
    renderCatalogClientes();
  } catch (err) {
    console.error('Failed to load client catalog:', err);
    if (tbody) {
      tbody.innerHTML = `<tr><td colspan="9" style="text-align: center; color: var(--danger);">Error al cargar: ${err.message}</td></tr>`;
    }
  }
};

window.renderCatalogClientes = function() {
  const tbody = document.getElementById('catalog-clientes-tbody');
  if (!tbody) return;
  
  if (!Array.isArray(allCatalogClients)) {
    tbody.innerHTML = '<tr><td colspan="9" style="text-align: center; color: var(--danger);">Error: Datos inválidos o sesión vencida.</td></tr>';
    return;
  }
  
  const searchTerm = document.getElementById('catalog-client-search').value.toLowerCase().trim();
  const advisorFilter = document.getElementById('catalog-client-advisor-filter').value;
  
  tbody.innerHTML = '';
  
  let filtered = allCatalogClients;
  
  if (searchTerm) {
    filtered = filtered.filter(c => 
      c.nombre.toLowerCase().includes(searchTerm) || 
      (c.ubicacion && c.ubicacion.toLowerCase().includes(searchTerm)) ||
      (c.contacto && c.contacto.toLowerCase().includes(searchTerm))
    );
  }
  
  if (user.nivel_rol !== 'Asesor' && advisorFilter !== 'ALL') {
    filtered = filtered.filter(c => c.asesor_id === Number(advisorFilter));
  }
  
  if (filtered.length === 0) {
    const cols = user.nivel_rol === 'Asesor' ? 8 : 9;
    tbody.innerHTML = `<tr><td colspan="${cols}" style="text-align: center; color: var(--text-light);">No se encontraron agricultores.</td></tr>`;
    return;
  }
  
  filtered.forEach(c => {
    let badgeClass = c.estado_status === 'Cliente' ? 'badge-success' : 'badge-warning';
    
    tbody.innerHTML += `
      <tr>
        <td><strong>${c.nombre}</strong></td>
        ${user.nivel_rol !== 'Asesor' ? `<td>${c.asesor_nombre || 'Sin Asesor'}</td>` : ''}
        <td>${c.cuenta_clave_nombre || '-'}</td>
        <td>${c.contacto || '-'}</td>
        <td>${c.telefono || '-'}</td>
        <td>${c.ubicacion || '-'}</td>
        <td>${c.superficie_text || '-'}</td>
        <td><span class="badge ${badgeClass}">${c.estado_status}</span></td>
        <td style="text-align: center;">
          <button class="btn btn-secondary" style="width: auto; padding: 4px 10px; font-size: 11px;" onclick="editCatalogClient(${c.id})">✏️ Editar</button>
        </td>
      </tr>
    `;
  });
};

window.editCatalogClient = async function(clientId) {
  const c = allCatalogClients.find(x => x.id === clientId);
  if (!c) return;
  
  document.getElementById('client-modal-title').textContent = 'Editar Agricultor';
  document.getElementById('client-form-id').value = c.id;
  document.getElementById('client-name').value = c.nombre;
  document.getElementById('client-contacto').value = c.contacto || '';
  document.getElementById('client-telefono').value = c.telefono || '';
  document.getElementById('client-correo').value = c.correo || '';
  document.getElementById('client-ubicacion').value = c.ubicacion || '';
  document.getElementById('client-superficie').value = c.superficie_text || '';
  document.getElementById('client-submit-btn').textContent = 'Guardar Cambios';
  
  await loadCRMClientFormConfig(c.cuenta_clave_id, c.asesor_id);
  openModal('add-client-modal');
};


