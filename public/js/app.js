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
let allMovements = [];

// On Page Load
document.addEventListener('DOMContentLoaded', () => {
  initApp();
  setupPlanningSelectionListeners();
  bindIAViewEventListeners();
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

// Load and populate cycles dynamically
let allCycles = [];

async function loadAllCycles() {
  try {
    const res = await fetch(`${API_URL}/api/ciclos`, { headers: getHeaders() });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || 'Failed to fetch cycles');
    allCycles = data;
    
    // Populate all cycle selects
    const selects = [
      'dashboard-ciclo-select',
      'quote-ciclo',
      'edit-quote-ciclo',
      'meta-ciclo',
      'metas-ciclo-select',
      'meta-global-ciclo',
      'ia-ceo-ciclo-select'
    ];
    
    selects.forEach(id => {
      const select = document.getElementById(id);
      if (!select) return;
      
      const currentVal = select.value;
      select.innerHTML = '';
      
      allCycles.forEach(c => {
        const opt = document.createElement('option');
        if (['metas-ciclo-select', 'meta-global-ciclo', 'ia-ceo-ciclo-select'].includes(id)) {
          opt.value = c.id;
        } else {
          opt.value = c.nombre;
        }
        opt.textContent = c.nombre + (c.activo ? '' : ' (Inactivo)');
        select.appendChild(opt);
      });
      
      if (currentVal && Array.from(select.options).some(o => o.value === currentVal)) {
        select.value = currentVal;
      }
    });
  } catch (err) {
    console.error('Error loading cycles:', err);
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

async function showAppView() {
  document.getElementById('login-view').style.display = 'none';
  document.getElementById('app-view').style.display = 'grid';
  
  // Load cycles dynamically on boot
  await loadAllCycles();
  
  // Set User Profile Display
  document.getElementById('user-display-name').textContent = user.nombre;
  document.getElementById('user-display-role').textContent = user.nivel_rol;
  
  // Handle Admin Sidebar Visibility
  if (user.nivel_rol === 'Administrador') {
    document.querySelectorAll('.admin-only').forEach(el => {
      if (el.classList.contains('view-section')) {
        el.style.display = ''; // let CSS handle view section toggling
      } else {
        el.style.display = 'block';
      }
    });
  } else {
    document.querySelectorAll('.admin-only').forEach(el => el.style.display = 'none');
  }

  // Handle Admin or Advisor Sidebar Visibility
  const isAdminOrAdvisor = ['Administrador', 'Asesor'].includes(user.nivel_rol);
  document.querySelectorAll('.admin-or-advisor-only').forEach(el => {
    if (el.classList.contains('view-section')) {
      el.style.display = isAdminOrAdvisor ? '' : 'none';
    } else {
      el.style.display = isAdminOrAdvisor ? 'block' : 'none';
    }
  });

  // Handle Admin or Coordinator Visibility
  if (user.nivel_rol === 'Administrador' || user.nivel_rol === 'Coordinador') {
    document.querySelectorAll('.admin-or-coordinator-only').forEach(el => {
      if (el.classList.contains('view-section')) {
        el.style.display = '';
      } else if (el.tagName === 'SELECT') {
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

  // Desktop sidebar collapse controls
  const appView = document.getElementById('app-view');
  const sidebarToggle = document.getElementById('sidebar-collapse-toggle');
  if (appView && sidebarToggle) {
    const activeSidebarToggle = sidebarToggle.cloneNode(true);
    sidebarToggle.parentNode.replaceChild(activeSidebarToggle, sidebarToggle);
    const savedCollapsed = localStorage.getItem('agrisalesSidebarCollapsed') === 'true';
    appView.classList.toggle('sidebar-collapsed', savedCollapsed);
    activeSidebarToggle.setAttribute('aria-expanded', String(!savedCollapsed));
    activeSidebarToggle.setAttribute('title', savedCollapsed ? 'Expandir menú' : 'Contraer menú');
    activeSidebarToggle.setAttribute('aria-label', savedCollapsed ? 'Expandir menú' : 'Contraer menú');

    activeSidebarToggle.addEventListener('click', () => {
      const collapsed = appView.classList.toggle('sidebar-collapsed');
      localStorage.setItem('agrisalesSidebarCollapsed', String(collapsed));
      activeSidebarToggle.setAttribute('aria-expanded', String(!collapsed));
      activeSidebarToggle.setAttribute('title', collapsed ? 'Expandir menú' : 'Contraer menú');
      activeSidebarToggle.setAttribute('aria-label', collapsed ? 'Expandir menú' : 'Contraer menú');
    });
  }
  
  // Load Default Dashboard View
  switchView('dashboard-view', 'Tablero General');
}

// Navigation Router
function switchView(viewId, title) {
  if (viewId === 'asignacion-view' && user && user.nivel_rol === 'Asesor') {
    viewId = 'asignacion-asesor-view';
    title = 'Asignación de Agricultores';
  }
  
  document.getElementById('view-title').textContent = title;
  
  const sections = document.querySelectorAll('.view-section');
  sections.forEach(sec => sec.classList.remove('active'));
  
  const targetEl = document.getElementById(viewId);
  if (targetEl) targetEl.classList.add('active');
  
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
  } else if (viewId === 'asignacion-view') {
    loadAsignacionView();
  } else if (viewId === 'asignacion-asesor-view') {
    loadAdvisorAssignmentView();
  } else if (viewId === 'ia-view') {
    loadIAViewData();
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
  allMatchingMetrics = null;
  allUnassignedClients = [];
  allActiveBids = [];
  localStorage.removeItem('token');
  localStorage.removeItem('user');
  showLoginView();
});

// -------------------------------------------------------------
// DASHBOARD LOGIC
// -------------------------------------------------------------
async function loadDashboardData() {
  const getInitials = (name) => {
    if (!name) return 'A';
    const parts = name.trim().split(/\s+/);
    if (parts.length >= 2) {
      return (parts[0][0] + parts[1][0]).toUpperCase();
    }
    return parts[0][0].toUpperCase();
  };

  const getAvatarColor = (name) => {
    let hash = 0;
    for (let i = 0; i < name.length; i++) {
      hash = name.charCodeAt(i) + ((hash << 5) - hash);
    }
    const h = Math.abs(hash % 360);
    return `hsl(${h}, 65%, 45%)`;
  };

  const cycleSelect = document.getElementById('dashboard-ciclo-select');
  if (cycleSelect && !cycleSelect.dataset.listenerBound) {
    cycleSelect.dataset.listenerBound = 'true';
    cycleSelect.addEventListener('change', () => {
      loadDashboardData();
    });
  }
  const selectedCycle = cycleSelect ? cycleSelect.value : 'O-I 2026';

  try {
    const res = await fetch(`${API_URL}/api/dashboard/stats?ciclo_agricola=${encodeURIComponent(selectedCycle)}`, { headers: getHeaders() });
    const stats = await res.json();
    
    if (document.getElementById('stat-clients')) document.getElementById('stat-clients').textContent = stats.total_clients;
    if (document.getElementById('stat-sales')) {
      const salesVal = Number(stats.total_sales_mxn) || 0.0;
      document.getElementById('stat-sales').textContent = `$${salesVal.toLocaleString('es-MX', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} MXN`;
    }
    if (document.getElementById('stat-sales-contado')) {
      const contadoVal = Number(stats.contado_sales_mxn) || 0.0;
      document.getElementById('stat-sales-contado').textContent = `$${contadoVal.toLocaleString('es-MX', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} MXN`;
    }
    if (document.getElementById('stat-sales-credito')) {
      const creditoVal = Number(stats.credito_sales_mxn) || 0.0;
      document.getElementById('stat-sales-credito').textContent = `$${creditoVal.toLocaleString('es-MX', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} MXN`;
    }
    if (document.getElementById('stat-sales-recuperado')) {
      const recuperadoVal = Number(stats.recuperado_sales_mxn) || 0.0;
      document.getElementById('stat-sales-recuperado').textContent = `$${recuperadoVal.toLocaleString('es-MX', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} MXN`;
    }
    if (document.getElementById('stat-sales-promesa')) {
      const promesaVal = Number(stats.promesa_sales_mxn) || 0.0;
      document.getElementById('stat-sales-promesa').textContent = `$${promesaVal.toLocaleString('es-MX', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} MXN`;
    }
    
    // Render goals progress table
    const goalsTbody = document.getElementById('dashboard-goals-tbody');
    if (goalsTbody) {
      goalsTbody.innerHTML = '';
      if (!stats.goals_progress || stats.goals_progress.length === 0) {
        goalsTbody.innerHTML = '<tr><td colspan="5" style="text-align: center;">No hay metas comerciales definidas.</td></tr>';
      } else {
        stats.goals_progress.forEach(g => {
          const target = Number(g.target) || 0;
          const real = Number(g.real) || 0;
          let pct = 0;
          if (target > 0) {
            pct = Math.round((real / target) * 100);
          }
          
          let fillClass = 'success';
          if (pct < 50) fillClass = 'danger';
          else if (pct < 80) fillClass = 'warning';
          
          const fillWidth = Math.min(pct, 100);
          
          goalsTbody.innerHTML += `
            <tr>
              <td><strong>${g.category}</strong></td>
              <td style="text-align: right; font-weight: 500;">${target.toLocaleString('es-MX')} ${g.unit}</td>
              <td style="text-align: right; font-weight: 600; color: var(--success);">${real.toLocaleString('es-MX')} ${g.unit}</td>
              <td style="text-align: right; font-weight: 700;">${pct}%</td>
              <td>
                <div style="display: flex; align-items: center; gap: 8px;">
                  <div class="progress-bar-container" style="flex-grow: 1;">
                    <div class="progress-bar-fill ${fillClass}" style="width: ${fillWidth}%;"></div>
                  </div>
                </div>
              </td>
            </tr>
          `;
        });
      }
    }
    
    // Fetch all quotes to render recent orders table
    const quotesRes = await fetch(`${API_URL}/api/cotizaciones`, { headers: getHeaders() });
    const quotes = await quotesRes.json();
    
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
      // Admin or Coordinator: show active advisor performance cards
      visitsTitle.textContent = 'Desempeño de Asesores Activos';
      
      if (!stats.advisers_performance || stats.advisers_performance.length === 0) {
        visitsContainer.innerHTML = `<div style="text-align: center; color: var(--text-light); padding: 30px;">No hay asesores comerciales activos registrados.</div>`;
      } else {
        let cardsHtml = `<div class="advisor-cards-container">`;
        stats.advisers_performance.forEach(adv => {
          // Calculate compliance percentage
          let compliance = 100;
          const plansEvaluated = adv.plan_completed + adv.plan_expired;
          if (plansEvaluated > 0) {
            compliance = Math.round((adv.plan_completed / plansEvaluated) * 100);
          } else if (adv.plan_total === 0) {
            compliance = null; // No visits planned
          }
          
          let complianceLabel = compliance !== null ? `${compliance}%` : 'N/A';
          let complianceClass = 'badge-success';
          if (compliance !== null) {
            if (compliance < 50) complianceClass = 'badge-danger';
            else if (compliance < 80) complianceClass = 'badge-warning';
          } else {
            complianceClass = 'badge-secondary';
          }
          
          const ratingVal = Number(adv.calificacion) || 5.0;
          const nameInitials = getInitials(adv.nombre);
          const avatarColor = getAvatarColor(adv.nombre);
          
          cardsHtml += `
            <div class="advisor-performance-card">
              <div class="advisor-card-header">
                <div class="advisor-avatar" style="background-color: ${avatarColor};">${nameInitials}</div>
                <div class="advisor-meta-info">
                  <div class="advisor-name-row">
                    <span class="advisor-card-name">${adv.nombre}</span>
                    <span class="advisor-card-rating">⭐ ${ratingVal.toFixed(1)}</span>
                  </div>
                  <span class="advisor-card-email">${adv.email || 'Sin correo'}</span>
                </div>
              </div>
              <div class="advisor-metrics-grid">
                <div class="advisor-metric-item">
                  <span class="advisor-metric-label">Ventas</span>
                  <span class="advisor-metric-value sales">$${Number(adv.sales_total).toLocaleString('es-MX', { minimumFractionDigits: 0, maximumFractionDigits: 0 })}</span>
                </div>
                <div class="advisor-metric-item">
                  <span class="advisor-metric-label">Clientes</span>
                  <span class="advisor-metric-value">${adv.client_count}</span>
                </div>
                <div class="advisor-metric-item">
                  <span class="advisor-metric-label">Cumplimiento</span>
                  <span class="advisor-metric-value"><span class="badge ${complianceClass}">${complianceLabel}</span></span>
                </div>
                <div class="advisor-metric-item">
                  <span class="advisor-metric-label">Cotizaciones</span>
                  <span class="advisor-metric-value">${adv.quote_count}</span>
                </div>
              </div>
            </div>
          `;
        });
        cardsHtml += `</div>`;
        visitsContainer.innerHTML = cardsHtml;
      }
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
    
    // single click to view detail modal (ignoring buttons)
    card.addEventListener('click', (e) => {
      if (e.target.closest('.kanban-arrow-btn') || e.target.closest('button')) {
        return;
      }
      showQuoteDetails(q.id);
    });
    
    // Build items summary label
    const itemsSummary = q.items.map(i => `${i.producto_nombre.split(' ')[0]} (x${i.cantidad_ordenada || i.cantidad || 0})`).join(', ') || 'Sin productos';
    
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

let activeQuoteId = null;
let activeQuote = null;
let editQuoteItemsCount = 0;

window.showQuoteDetails = async function(quoteId) {
  try {
    // Reset modal display modes
    toggleQuoteEditMode(false);
    
    // 1. Find the quote in allQuotes or fetch it if not found
    let quote = allQuotes.find(q => q.id === Number(quoteId));
    if (!quote) {
      const res = await fetch(`${API_URL}/api/cotizaciones`, { headers: getHeaders() });
      if (res.ok) {
        allQuotes = await res.json();
        quote = allQuotes.find(q => q.id === Number(quoteId));
      }
    }

    if (!quote) {
      alert('No se encontró la cotización especificada.');
      return;
    }

    activeQuoteId = quote.id;
    activeQuote = quote;

    // 2. Render details fields in View Mode
    document.getElementById('quote-detail-folio').textContent = quote.folio_cotizacion || '-';
    document.getElementById('quote-detail-cliente').textContent = quote.cliente_nombre || '-';
    document.getElementById('quote-detail-asesor').textContent = quote.asesor_nombre || '-';
    document.getElementById('quote-detail-fecha').textContent = quote.fecha_creacion || '-';
    document.getElementById('quote-detail-ciclo').textContent = quote.ciclo_agricola || '-';
    document.getElementById('quote-detail-condiciones').textContent = quote.condiciones_pago || '-';
    document.getElementById('quote-detail-financiera').textContent = quote.financiera || 'Ninguna';
    document.getElementById('quote-detail-notas').textContent = quote.notas || 'Sin notas adicionales.';

    // Status Badge
    const statusBadge = document.getElementById('quote-detail-estatus');
    statusBadge.textContent = quote.estatus;
    statusBadge.className = 'badge';
    
    // Setup badge color
    if (quote.estatus === 'Borrador') {
      statusBadge.style.background = 'rgba(52, 152, 219, 0.2)';
      statusBadge.style.color = '#3498db';
    } else if (quote.estatus === 'Autorizada' || quote.estatus === 'Cotizado') {
      statusBadge.style.background = 'rgba(46, 204, 113, 0.2)';
      statusBadge.style.color = '#2ecc71';
    } else if (quote.estatus === 'Vendido') {
      statusBadge.style.background = 'rgba(241, 196, 15, 0.2)';
      statusBadge.style.color = '#f1c40f';
    } else {
      statusBadge.style.background = 'rgba(149, 165, 166, 0.2)';
      statusBadge.style.color = '#95a5a6';
    }

    // 3. Render products table in View Mode
    const productsBody = document.getElementById('quote-detail-products-body');
    productsBody.innerHTML = '';
    
    if (!quote.items || quote.items.length === 0) {
      productsBody.innerHTML = `<tr><td colspan="5" style="text-align: center; color: var(--text-light); padding: 12px;">Sin productos en esta cotización.</td></tr>`;
    } else {
      quote.items.forEach(item => {
        const qty = item.cantidad_ordenada || item.cantidad || 0;
        const subtotal = qty * item.precio_neto_unitario;
        productsBody.innerHTML += `
          <tr>
            <td style="padding: 8px; border-bottom: 1px solid var(--border);">${item.producto_nombre}</td>
            <td style="padding: 8px; border-bottom: 1px solid var(--border); text-align: center;">${qty}</td>
            <td style="padding: 8px; border-bottom: 1px solid var(--border); text-align: right;">$${parseFloat(item.precio_lista_unitario).toLocaleString('es-MX', { minimumFractionDigits: 2 })}</td>
            <td style="padding: 8px; border-bottom: 1px solid var(--border); text-align: right;">$${parseFloat(item.precio_neto_unitario).toLocaleString('es-MX', { minimumFractionDigits: 2 })}</td>
            <td style="padding: 8px; border-bottom: 1px solid var(--border); text-align: right; font-weight: 500;">$${subtotal.toLocaleString('es-MX', { minimumFractionDigits: 2 })}</td>
          </tr>
        `;
      });
    }

    // Render total
    document.getElementById('quote-detail-total').textContent = `$${parseFloat(quote.total_mxn).toLocaleString('es-MX', { minimumFractionDigits: 2 })} MXN`;

    // 4. Handle buttons visibility (Authorize, Edit, Delete)
    const isBorrador = quote.estatus === 'Borrador' || quote.estatus === 'Pendiente Autorización';
    const hasAdminOrCoordPermission = user.nivel_rol === 'Administrador' || user.nivel_rol === 'Coordinador';
    const isOwner = quote.asesor_id === user.id;

    // Authorize button: only Admin or Coordinator for Draft quotes
    const authBtn = document.getElementById('btn-authorize-quote');
    if (isBorrador && hasAdminOrCoordPermission) {
      authBtn.style.display = 'inline-flex';
      authBtn.onclick = async () => {
        if (confirm(`¿Está seguro que desea autorizar la cotización con Folio ${quote.folio_cotizacion}?`)) {
          await authorizeQuote(quote.id);
        }
      };
    } else {
      authBtn.style.display = 'none';
    }

    // Edit button: Admin/Coordinator can edit any. Advisor can edit only their own draft quotes.
    const editBtn = document.getElementById('btn-edit-quote');
    if (hasAdminOrCoordPermission || (isOwner && isBorrador)) {
      editBtn.style.display = 'inline-block';
    } else {
      editBtn.style.display = 'none';
    }

    // Delete button: Admin/Coordinator can delete any. Advisor can delete only their own draft quotes.
    const deleteBtn = document.getElementById('btn-delete-quote');
    if (hasAdminOrCoordPermission || (isOwner && isBorrador)) {
      deleteBtn.style.display = 'inline-block';
    } else {
      deleteBtn.style.display = 'none';
    }

    openModal('quote-detail-modal');
  } catch (err) {
    console.error('Failed to show quote details:', err);
    alert('Error al mostrar los detalles de la cotización: ' + err.message);
  }
};

window.toggleQuoteEditMode = async function(isEdit) {
  const viewDiv = document.getElementById('quote-detail-view-mode');
  const editDiv = document.getElementById('quote-detail-edit-mode');
  
  if (!isEdit) {
    viewDiv.style.display = 'block';
    editDiv.style.display = 'none';
    return;
  }
  
  if (!activeQuote) return;
  
  try {
    // Load config if needed
    if (allProducts.length === 0) {
      const pRes = await fetch(`${API_URL}/api/productos`, { headers: getHeaders() });
      allProducts = await pRes.json();
    }
    if (allSeasons.length === 0) {
      const sRes = await fetch(`${API_URL}/api/temporadas`, { headers: getHeaders() });
      allSeasons = await sRes.json();
    }
    
    // Fill header inputs
    document.getElementById('edit-quote-ciclo').value = activeQuote.ciclo_agricola || 'O-I 2026';
    document.getElementById('edit-quote-condicion').value = activeQuote.condiciones_pago || 'CONTADO';
    document.getElementById('edit-quote-financiera').value = activeQuote.financiera || '';
    document.getElementById('edit-quote-notas').value = activeQuote.notas || '';
    
    // Populate seasons select
    const seasonSelect = document.getElementById('edit-quote-temporada');
    seasonSelect.innerHTML = '';
    allSeasons.forEach(s => {
      const sign = s.estado_operacion === 'Restar' ? '-' : '+';
      const label = s.descuento_porcentaje > 0 ? ` (${sign}${s.descuento_porcentaje}%)` : '';
      seasonSelect.innerHTML += `<option value="${s.id}">${s.actividad}${label}</option>`;
    });
    
    // Match season
    const firstDetail = activeQuote.items && activeQuote.items[0];
    if (firstDetail && firstDetail.temporada_id) {
      seasonSelect.value = firstDetail.temporada_id;
    }
    
    // Populate product rows
    const container = document.getElementById('edit-quote-items-container');
    container.innerHTML = '';
    editQuoteItemsCount = 0;
    
    if (activeQuote.items && activeQuote.items.length > 0) {
      activeQuote.items.forEach(item => {
        addEditQuoteItemRow(item.producto_id, item.cantidad_ordenada || item.cantidad || 0);
      });
    } else {
      addEditQuoteItemRow();
    }
    
    await recalculateEditQuoteTotal();
    
    viewDiv.style.display = 'none';
    editDiv.style.display = 'block';
  } catch (err) {
    console.error('Failed to init edit mode:', err);
    alert('Error al abrir editor: ' + err.message);
  }
};

window.addEditQuoteItemRow = function(prodId = '', qty = 1) {
  editQuoteItemsCount++;
  const container = document.getElementById('edit-quote-items-container');
  
  const div = document.createElement('div');
  div.className = 'item-row';
  div.id = `edit-quote-item-row-${editQuoteItemsCount}`;
  div.style.display = 'flex';
  div.style.gap = '10px';
  div.style.alignItems = 'center';
  div.style.marginBottom = '8px';
  
  let options = '<option value="">-- Selecciona un Producto --</option>';
  allProducts.forEach(p => {
    options += `<option value="${p.id}" ${p.id === Number(prodId) ? 'selected' : ''}>${p.producto} ($${p.list_price_mxn.toLocaleString('es-MX')} MXN)</option>`;
  });
  
  div.innerHTML = `
    <div style="flex: 2;">
      <select class="form-input edit-item-product-select" style="margin-bottom:0;" required onchange="recalculateEditQuoteTotal()">${options}</select>
    </div>
    <div style="width: 100px;">
      <input type="number" class="form-input edit-item-qty-input" style="margin-bottom:0;" min="1" value="${qty}" required oninput="recalculateEditQuoteTotal()">
    </div>
    <div>
      <button type="button" class="btn btn-secondary" style="margin:0; padding: 10px; background: rgba(231, 76, 60, 0.1); color: #e74c3c; border-color: rgba(231, 76, 60, 0.2);" onclick="removeEditQuoteItemRow(${editQuoteItemsCount})">🗑️</button>
    </div>
  `;
  container.appendChild(div);
};

window.removeEditQuoteItemRow = function(rowIndex) {
  const row = document.getElementById(`edit-quote-item-row-${rowIndex}`);
  if (row) {
    row.remove();
    recalculateEditQuoteTotal();
  }
};

window.recalculateEditQuoteTotal = async function() {
  if (!activeQuote) return;
  
  const rows = document.querySelectorAll('#edit-quote-items-container .item-row');
  const items = [];
  
  rows.forEach(r => {
    const prodSelect = r.querySelector('.edit-item-product-select');
    const qtyInput = r.querySelector('.edit-item-qty-input');
    
    if (prodSelect && prodSelect.value) {
      items.push({
        producto_id: Number(prodSelect.value),
        cantidad: Number(qtyInput.value) || 1
      });
    }
  });
  
  if (items.length === 0) {
    document.getElementById('edit-quote-total-val').textContent = '$0.00 MXN';
    return;
  }
  
  try {
    const seasonId = document.getElementById('edit-quote-temporada').value;
    
    const res = await fetch(`${API_URL}/api/cotizaciones/calcular`, {
      method: 'POST',
      headers: getHeaders(),
      body: JSON.stringify({
        cliente_id: activeQuote.cliente_id,
        temporada_id: Number(seasonId) || null,
        items
      })
    });
    
    if (res.ok) {
      const calcResult = await res.json();
      document.getElementById('edit-quote-total-val').textContent = `$${parseFloat(calcResult.total_mxn).toLocaleString('es-MX', { minimumFractionDigits: 2 })} MXN`;
    }
  } catch (err) {
    console.error('Failed to calculate pricing:', err);
  }
};

window.saveEditQuote = async function() {
  if (!activeQuote) return;
  
  const ciclo = document.getElementById('edit-quote-ciclo').value;
  const condicion = document.getElementById('edit-quote-condicion').value;
  const temporadaId = document.getElementById('edit-quote-temporada').value;
  const financiera = document.getElementById('edit-quote-financiera').value.trim();
  const notas = document.getElementById('edit-quote-notas').value.trim();
  
  const rows = document.querySelectorAll('#edit-quote-items-container .item-row');
  const items = [];
  
  rows.forEach(r => {
    const prodSelect = r.querySelector('.edit-item-product-select');
    const qtyInput = r.querySelector('.edit-item-qty-input');
    
    if (prodSelect && prodSelect.value) {
      items.push({
        producto_id: Number(prodSelect.value),
        cantidad: Number(qtyInput.value) || 1
      });
    }
  });
  
  if (items.length === 0) {
    alert('Debe agregar al menos un producto con cantidad válida.');
    return;
  }
  
  try {
    const res = await fetch(`${API_URL}/api/cotizaciones/${activeQuote.id}`, {
      method: 'PUT',
      headers: getHeaders(),
      body: JSON.stringify({
        ciclo_agricola: ciclo,
        condiciones_pago: condicion,
        temporada_id: Number(temporadaId) || null,
        financiera: financiera || null,
        notas: notas || null,
        items
      })
    });
    
    if (!res.ok) {
      const errData = await res.json();
      throw new Error(errData.error || 'Failed to update quote details');
    }
    
    closeModal('quote-detail-modal');
    alert('Cotización actualizada con éxito.');
    
    // Reload CRM Board
    await loadCRMBoardData();
    
    // Reload Outreach panel if open
    if (document.getElementById('outreach-quotes-tbody')) {
      await loadOutreachPanel();
    }
  } catch (err) {
    alert(`Error al guardar: ${err.message}`);
  }
};

window.deleteQuoteClick = async function() {
  if (!activeQuote) return;
  
  if (!confirm(`¿Está completamente seguro de que desea ELIMINAR permanentemente la cotización con Folio ${activeQuote.folio_cotizacion}? Esta acción no se puede deshacer y revertirá cualquier stock afectado.`)) {
    return;
  }
  
  try {
    const res = await fetch(`${API_URL}/api/cotizaciones/${activeQuote.id}`, {
      method: 'DELETE',
      headers: getHeaders()
    });
    
    if (!res.ok) {
      const errData = await res.json();
      throw new Error(errData.error || 'Failed to delete quote');
    }
    
    closeModal('quote-detail-modal');
    alert('Cotización eliminada con éxito.');
    
    // Reload CRM Board
    await loadCRMBoardData();
    
    // Reload Outreach panel if open
    if (document.getElementById('outreach-quotes-tbody')) {
      await loadOutreachPanel();
    }
  } catch (err) {
    alert(`Error al eliminar: ${err.message}`);
  }
};

async function authorizeQuote(quoteId) {
  try {
    const res = await fetch(`${API_URL}/api/cotizaciones/${quoteId}/status`, {
      method: 'PUT',
      headers: getHeaders(),
      body: JSON.stringify({ estatus: 'Autorizada' })
    });
    
    if (!res.ok) {
      const errData = await res.json();
      throw new Error(errData.error || 'Failed to authorize quote');
    }
    
    closeModal('quote-detail-modal');
    
    // Reload CRM Board
    await loadCRMBoardData();
    
    // Reload Outreach panel if open
    if (document.getElementById('outreach-quotes-tbody')) {
      await loadOutreachPanel();
    }
  } catch (err) {
    alert(`Error al autorizar: ${err.message}`);
  }
}

// Bind season change in edit mode to recalculate total
document.addEventListener('change', (e) => {
  if (e.target && e.target.id === 'edit-quote-temporada') {
    recalculateEditQuoteTotal();
  }
});

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
    let clientOptions = '<option value="">-- Selecciona un Agricultor --</option>';
    allClients.forEach(c => {
      clientOptions += `<option value="${c.id}">${c.nombre} (${c.cuenta_clave_nombre || 'General'})</option>`;
    });
    clientSelect.innerHTML = clientOptions;
    
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
    allMovements = movements;
    
    const movesTbody = document.getElementById('movements-tbody');
    let movesHtml = '';
    
    movements.forEach(m => {
      const dateOnly = m.fecha_movimiento.slice(0, 16).replace('T', ' ');
      const valEnt = m.cantidad_entrante > 0 ? m.cantidad_entrante.toLocaleString('es-MX', { minimumFractionDigits: 3 }) : '-';
      const valSal = m.cantidad_saliente > 0 ? m.cantidad_saliente.toLocaleString('es-MX', { minimumFractionDigits: 3 }) : '-';
      
      movesHtml += `
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
    movesTbody.innerHTML = movesHtml;
    
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
  document.getElementById('tab-admin-ciclos').addEventListener('click', () => switchAdminTab('ciclos'));
}

function switchAdminTab(tabName) {
  adminActiveTab = tabName;
  document.getElementById('tab-admin-asesores').classList.remove('active');
  document.getElementById('tab-admin-productos').classList.remove('active');
  document.getElementById('tab-admin-metas').classList.remove('active');
  document.getElementById('tab-admin-ciclos').classList.remove('active');
  document.getElementById('panel-admin-asesores').style.display = 'none';
  document.getElementById('panel-admin-productos').style.display = 'none';
  document.getElementById('panel-admin-metas').style.display = 'none';
  document.getElementById('panel-admin-ciclos').style.display = 'none';
  
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
  } else if (adminActiveTab === 'ciclos') {
    await loadAdminCiclos();
  }
}

// 1. ASESORES ADMIN LOGIC
async function loadAdminAsesores() {
  const tbody = document.getElementById('admin-asesores-tbody');
  if (!tbody) return;
  tbody.innerHTML = '<tr><td colspan="8" style="text-align: center; color: var(--text-light);">Cargando...</td></tr>';
  
  try {
    const res = await fetch(`${API_URL}/api/asesores`, { headers: getHeaders() });
    allAdminAsesores = await res.json();
    
    tbody.innerHTML = '';
    if (allAdminAsesores.length === 0) {
      tbody.innerHTML = '<tr><td colspan="8" style="text-align: center;">No hay asesores registrados.</td></tr>';
      return;
    }
    
    allAdminAsesores.forEach(a => {
      const activeText = a.activo === 1 ? 'Activo' : 'Inactivo';
      const activeBadge = a.activo === 1 ? 'badge-success' : 'badge-danger';
      const tel = a.telefono || '-';
      const ratingVal = Number(a.calificacion) || 5.0;
      
      tbody.innerHTML += `
        <tr style="${a.activo === 0 ? 'background-color: #f8fafc; opacity: 0.75;' : ''}">
          <td><strong>${a.nombre}</strong></td>
          <td>${a.usuario}</td>
          <td>${a.email}</td>
          <td>${tel}</td>
          <td><span class="badge" style="background-color: ${a.nivel_rol === 'Administrador' ? '#eff6ff' : '#f1f5f9'}; color: ${a.nivel_rol === 'Administrador' ? '#1d4ed8' : '#475569'}; border-color: ${a.nivel_rol === 'Administrador' ? '#bfdbfe' : '#e2e8f0'};">${a.nivel_rol}</span></td>
          <td>⭐ ${ratingVal.toFixed(1)}</td>
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
    tbody.innerHTML = `<tr><td colspan="8" style="text-align: center; color: var(--danger);">Error al cargar asesores: ${err.message}</td></tr>`;
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
    document.getElementById('asesor-calificacion').value = '5.0';
    
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
  document.getElementById('asesor-calificacion').value = a.calificacion !== undefined && a.calificacion !== null ? a.calificacion : '5.0';
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
    calificacion: document.getElementById('asesor-calificacion').value ? Number(document.getElementById('asesor-calificacion').value) : 5.0,
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

// SUBTABS FOR METAS AND CYCLES CO-ORDINATION
if (document.getElementById('btn-subtab-metas-globales')) {
  document.getElementById('btn-subtab-metas-globales').addEventListener('click', () => {
    document.getElementById('btn-subtab-metas-globales').classList.add('active');
    document.getElementById('btn-subtab-metas-asesores').classList.remove('active');
    document.getElementById('subpanel-metas-globales').style.display = 'block';
    document.getElementById('subpanel-metas-asesores').style.display = 'none';
    loadAdminMetas();
  });
  
  document.getElementById('btn-subtab-metas-asesores').addEventListener('click', () => {
    document.getElementById('btn-subtab-metas-globales').classList.remove('active');
    document.getElementById('btn-subtab-metas-asesores').classList.add('active');
    document.getElementById('subpanel-metas-globales').style.display = 'none';
    document.getElementById('subpanel-metas-asesores').style.display = 'block';
    loadAdminMetas();
  });
}

if (document.getElementById('metas-ciclo-select')) {
  document.getElementById('metas-ciclo-select').addEventListener('change', () => {
    loadAdminMetas();
  });
}

let allGlobalMetas = [];
async function loadAdminMetas() {
  const select = document.getElementById('metas-ciclo-select');
  if (!select) return;
  
  // Try to default to first cycle if select is empty on render
  if (select.children.length === 0 && allCycles.length > 0) {
    // Populate select if it was not done yet
    select.innerHTML = '';
    allCycles.forEach(c => {
      const opt = document.createElement('option');
      opt.value = c.id;
      opt.textContent = c.nombre + (c.activo ? '' : ' (Inactivo)');
      select.appendChild(opt);
    });
  }

  const cicloId = select.value;
  if (!cicloId) {
    const tbodyGlobal = document.getElementById('admin-metas-globales-tbody');
    if (tbodyGlobal) tbodyGlobal.innerHTML = '<tr><td colspan="5" style="text-align: center; color: var(--text-light);">No hay ciclos configurados. Crea uno primero en la pestaña Ciclos.</td></tr>';
    const tbodyAsesores = document.getElementById('admin-metas-tbody');
    if (tbodyAsesores) tbodyAsesores.innerHTML = '<tr><td colspan="9" style="text-align: center; color: var(--text-light);">No hay ciclos configurados.</td></tr>';
    return;
  }

  const isGlobalActive = document.getElementById('btn-subtab-metas-globales')?.classList.contains('active');
  
  if (isGlobalActive) {
    await loadGlobalMetas(cicloId);
  } else {
    await loadAdvisorMetas(cicloId);
  }
}

async function loadGlobalMetas(cicloId) {
  const tbody = document.getElementById('admin-metas-globales-tbody');
  if (!tbody) return;
  tbody.innerHTML = '<tr><td colspan="5" style="text-align: center; color: var(--text-light);">Cargando metas globales...</td></tr>';
  
  try {
    const res = await fetch(`${API_URL}/api/metas-globales?ciclo_id=${cicloId}`, { headers: getHeaders() });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || 'Failed to fetch global goals');
    allGlobalMetas = data;
    
    tbody.innerHTML = '';
    if (allGlobalMetas.length === 0) {
      tbody.innerHTML = '<tr><td colspan="5" style="text-align: center; color: var(--text-light);">No hay metas globales configuradas para este ciclo.</td></tr>';
      return;
    }
    
    allGlobalMetas.forEach(m => {
      const amountVal = Number(m.monto_objetivo_mxn) || 0.0;
      tbody.innerHTML += `
        <tr>
          <td><strong>${m.producto}</strong></td>
          <td>${m.tipo_categoria}</td>
          <td style="text-align: right; font-weight: 600;">${m.cantidad_objetivo}</td>
          <td style="text-align: right; font-weight: 600;">$${amountVal.toLocaleString('es-MX', {minimumFractionDigits: 2})}</td>
          <td>
            <button class="btn btn-secondary" style="width: auto; padding: 4px 8px; font-size: 12px; margin: 0;" onclick="openEditGlobalMetaModal(${m.id})">Editar</button>
            <button class="btn btn-danger" style="width: auto; padding: 4px 8px; font-size: 12px; margin: 0; background: var(--danger);" onclick="deleteGlobalMeta(${m.id})">Eliminar</button>
          </td>
        </tr>
      `;
    });
  } catch (err) {
    tbody.innerHTML = `<tr><td colspan="5" style="text-align: center; color: var(--danger);">Error: ${err.message}</td></tr>`;
  }
}

async function loadAdvisorMetas(cicloId) {
  const tbody = document.getElementById('admin-metas-tbody');
  if (!tbody) return;
  tbody.innerHTML = '<tr><td colspan="9" style="text-align: center; color: var(--text-light);">Cargando metas de asesores...</td></tr>';
  
  // Find cycle name for this ID
  const cicloObj = allCycles.find(c => String(c.id) === String(cicloId));
  const cicloNombre = cicloObj ? cicloObj.nombre : '';
  
  try {
    const res = await fetch(`${API_URL}/api/metas`, { headers: getHeaders() });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || 'Failed to fetch metas');
    
    // Filter metas by the chosen cycle name
    allAdminMetas = data.filter(m => m.ciclo_agricola === cicloNombre);
    
    tbody.innerHTML = '';
    if (allAdminMetas.length === 0) {
      tbody.innerHTML = '<tr><td colspan="9" style="text-align: center; color: var(--text-light);">No hay metas asignadas a asesores para este ciclo.</td></tr>';
      return;
    }
    
    allAdminMetas.forEach(m => {
      const amountVal = Number(m.monto_objetivo_mxn) || 0.0;
      tbody.innerHTML += `
        <tr>
          <td><strong>${m.asesor_nombre || 'General / Global'}</strong></td>
          <td>${m.ciclo_agricola}</td>
          <td style="text-align: right; font-weight: 600;">$${amountVal.toLocaleString('es-MX', {minimumFractionDigits: 2})}</td>
          <td style="text-align: right; font-weight: 600;">${m.bolsas_objetivo || 0}</td>
          <td style="text-align: right; font-weight: 600;">${m.meta_faena || 0}</td>
          <td style="text-align: right; font-weight: 600;">${m.meta_clavis || 0}</td>
          <td style="text-align: right; font-weight: 600;">${m.meta_cropprotection || 0}</td>
          <td style="text-align: right; font-weight: 600;">${m.meta_cosecha || 0}</td>
          <td>
            <button class="btn btn-secondary" style="width: auto; padding: 4px 8px; font-size: 12px; margin: 0;" onclick="openEditMetaModal(${m.id})">Editar</button>
          </td>
        </tr>
      `;
    });
  } catch (err) {
    tbody.innerHTML = `<tr><td colspan="9" style="text-align: center; color: var(--danger);">Error: ${err.message}</td></tr>`;
  }
}

// Global Metas CRUD Events
if (document.getElementById('btn-open-meta-global-modal')) {
  document.getElementById('btn-open-meta-global-modal').addEventListener('click', async () => {
    document.getElementById('add-meta-global-form').reset();
    document.getElementById('meta-global-id').value = '';
    document.getElementById('meta-global-modal-title').textContent = 'Configurar Meta Global';
    
    const currentCicloId = document.getElementById('metas-ciclo-select').value;
    document.getElementById('meta-global-ciclo').value = currentCicloId;
    
    await loadGlobalMetaProductSelect();
    openModal('add-meta-global-modal');
  });
}

async function loadGlobalMetaProductSelect() {
  const select = document.getElementById('meta-global-producto');
  if (!select) return;
  select.innerHTML = '<option value="">Cargando productos...</option>';
  
  try {
    const res = await fetch(`${API_URL}/api/productos`, { headers: getHeaders() });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || 'Failed to load products');
    
    select.innerHTML = '<option value="" disabled selected>Seleccione un producto</option>';
    data.forEach(p => {
      if (p.activo) {
        const opt = document.createElement('option');
        opt.value = p.id;
        opt.textContent = `${p.producto} (${p.tipo_categoria})`;
        select.appendChild(opt);
      }
    });
  } catch (err) {
    select.innerHTML = `<option value="">Error: ${err.message}</option>`;
  }
}

window.openEditGlobalMetaModal = async function(id) {
  const m = allGlobalMetas.find(x => x.id === id);
  if (!m) return;
  
  await loadGlobalMetaProductSelect();
  
  document.getElementById('meta-global-id').value = m.id;
  document.getElementById('meta-global-ciclo').value = m.ciclo_id;
  document.getElementById('meta-global-producto').value = m.producto_id;
  document.getElementById('meta-global-cantidad').value = m.cantidad_objetivo;
  document.getElementById('meta-global-monto').value = m.monto_objetivo_mxn;
  
  document.getElementById('meta-global-modal-title').textContent = 'Editar Meta Global';
  openModal('add-meta-global-modal');
};

document.getElementById('add-meta-global-form').addEventListener('submit', async (e) => {
  e.preventDefault();
  
  const payload = {
    ciclo_id: Number(document.getElementById('meta-global-ciclo').value),
    producto_id: Number(document.getElementById('meta-global-producto').value),
    cantidad_objetivo: Number(document.getElementById('meta-global-cantidad').value) || 0.0,
    monto_objetivo_mxn: Number(document.getElementById('meta-global-monto').value) || 0.0
  };
  
  try {
    const res = await fetch(`${API_URL}/api/metas-globales`, {
      method: 'POST',
      headers: getHeaders(),
      body: JSON.stringify(payload)
    });
    
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || 'Failed to save global meta');
    
    closeModal('add-meta-global-modal');
    await loadAdminMetas();
    alert('Meta global guardada exitosamente.');
  } catch (err) {
    alert(err.message);
  }
});

window.deleteGlobalMeta = async function(id) {
  if (!confirm('¿Está seguro de eliminar esta meta global?')) return;
  try {
    const res = await fetch(`${API_URL}/api/metas-globales/${id}`, {
      method: 'DELETE',
      headers: getHeaders()
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || 'Failed to delete global goal');
    
    await loadAdminMetas();
    alert('Meta global eliminada exitosamente.');
  } catch (err) {
    alert(err.message);
  }
};

// Advisor Metas Manual Modal Events
if (document.getElementById('btn-open-meta-modal')) {
  document.getElementById('btn-open-meta-modal').addEventListener('click', async () => {
    document.getElementById('add-meta-form').reset();
    document.getElementById('meta-modal-title').textContent = 'Configurar Meta Comercial';
    
    // Pre-select current cycle name
    const currentCicloId = document.getElementById('metas-ciclo-select').value;
    const currentCicloObj = allCycles.find(c => String(c.id) === String(currentCicloId));
    if (currentCicloObj) {
      document.getElementById('meta-ciclo').value = currentCicloObj.nombre;
    }
    
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
      if (a.activo === 1 && a.nivel_rol === 'Asesor') {
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
  document.getElementById('meta-faena').value = m.meta_faena || 0;
  document.getElementById('meta-clavis').value = m.meta_clavis || 0;
  document.getElementById('meta-cropprotection').value = m.meta_cropprotection || 0;
  document.getElementById('meta-cosecha').value = m.meta_cosecha || 0;
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
    bolsas_objetivo: Number(document.getElementById('meta-bags').value) || 0,
    meta_faena: Number(document.getElementById('meta-faena').value) || 0,
    meta_clavis: Number(document.getElementById('meta-clavis').value) || 0,
    meta_cropprotection: Number(document.getElementById('meta-cropprotection').value) || 0,
    meta_cosecha: Number(document.getElementById('meta-cosecha').value) || 0
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

// Ciclos Catalog CRUD logic
let allAdminCiclos = [];

async function loadAdminCiclos() {
  const tbody = document.getElementById('admin-ciclos-tbody');
  if (!tbody) return;
  tbody.innerHTML = '<tr><td colspan="4" style="text-align: center; color: var(--text-light);">Cargando ciclos...</td></tr>';
  
  try {
    const res = await fetch(`${API_URL}/api/ciclos`, { headers: getHeaders() });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || 'Failed to fetch cycles');
    allAdminCiclos = data;
    
    tbody.innerHTML = '';
    if (allAdminCiclos.length === 0) {
      tbody.innerHTML = '<tr><td colspan="4" style="text-align: center;">No hay ciclos agrícolas registrados.</td></tr>';
      return;
    }
    
    allAdminCiclos.forEach(c => {
      tbody.innerHTML += `
        <tr>
          <td>${c.id}</td>
          <td><strong>${c.nombre}</strong></td>
          <td>
            <span class="badge ${c.activo ? 'badge-success' : 'badge-secondary'}" style="background: ${c.activo ? 'rgba(46, 204, 113, 0.2)' : 'rgba(127, 140, 141, 0.2)'}; color: ${c.activo ? '#2ecc71' : '#7f8c8d'}; border: 1px solid ${c.activo ? 'rgba(46, 204, 113, 0.4)' : 'rgba(127, 140, 141, 0.4)'}; padding: 2px 8px; border-radius: 4px; font-size: 11px;">
              ${c.activo ? 'Activo' : 'Inactivo'}
            </span>
          </td>
          <td>
            <button class="btn btn-secondary" style="width: auto; padding: 4px 8px; font-size: 12px; margin: 0;" onclick="openEditCicloModal(${c.id})">Editar</button>
            <button class="btn btn-danger" style="width: auto; padding: 4px 8px; font-size: 12px; margin: 0; background: var(--danger);" onclick="deleteCiclo(${c.id})">Eliminar</button>
          </td>
        </tr>
      `;
    });
  } catch (err) {
    tbody.innerHTML = `<tr><td colspan="4" style="text-align: center; color: var(--danger);">Error: ${err.message}</td></tr>`;
  }
}

if (document.getElementById('btn-open-ciclo-modal')) {
  document.getElementById('btn-open-ciclo-modal').addEventListener('click', () => {
    document.getElementById('add-ciclo-form').reset();
    document.getElementById('ciclo-id').value = '';
    document.getElementById('ciclo-modal-title').textContent = 'Registrar Ciclo Agrícola';
    openModal('add-ciclo-modal');
  });
}

window.openEditCicloModal = function(id) {
  const c = allAdminCiclos.find(x => x.id === id);
  if (!c) return;
  
  document.getElementById('ciclo-id').value = c.id;
  document.getElementById('ciclo-nombre').value = c.nombre;
  document.getElementById('ciclo-activo').value = c.activo;
  
  document.getElementById('ciclo-modal-title').textContent = 'Editar Ciclo Agrícola';
  openModal('add-ciclo-modal');
};

document.getElementById('add-ciclo-form').addEventListener('submit', async (e) => {
  e.preventDefault();
  const id = document.getElementById('ciclo-id').value;
  const nombre = document.getElementById('ciclo-nombre').value.trim();
  const activo = Number(document.getElementById('ciclo-activo').value);
  
  const url = id ? `${API_URL}/api/ciclos/${id}` : `${API_URL}/api/ciclos`;
  const method = id ? 'PUT' : 'POST';
  
  try {
    const res = await fetch(url, {
      method,
      headers: getHeaders(),
      body: JSON.stringify({ nombre, activo })
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || 'Failed to save cycle');
    
    closeModal('add-ciclo-modal');
    await loadAllCycles(); // Refresh dropdowns across app
    if (adminActiveTab === 'ciclos') {
      await loadAdminCiclos();
    }
    alert('Ciclo agrícola guardado exitosamente.');
  } catch (err) {
    alert(err.message);
  }
});

window.deleteCiclo = async function(id) {
  if (!confirm('¿Está seguro de eliminar este ciclo agrícola? Se eliminarán todas las metas globales asociadas.')) return;
  try {
    const res = await fetch(`${API_URL}/api/ciclos/${id}`, {
      method: 'DELETE',
      headers: getHeaders()
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || 'Failed to delete cycle');
    
    await loadAllCycles(); // Refresh dropdowns across app
    if (adminActiveTab === 'ciclos') {
      await loadAdminCiclos();
    }
    alert('Ciclo agrícola eliminado exitosamente.');
  } catch (err) {
    alert(err.message);
  }
};

// -------------------------------------------------------------
// CLIENTS & AGRICULTORES CATALOG LOGIC
// -------------------------------------------------------------
let allCatalogClients = [];
let selectedCatalogClientIds = new Set();
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

  const selectAll = document.getElementById('catalog-select-all-clients');
  if (selectAll) {
    selectAll.addEventListener('change', () => {
      const visibleIds = getFilteredCatalogClients().map(c => c.id);
      if (selectAll.checked) {
        visibleIds.forEach(id => selectedCatalogClientIds.add(id));
      } else {
        visibleIds.forEach(id => selectedCatalogClientIds.delete(id));
      }
      renderCatalogClientes();
    });
  }

  const bulkDeleteBtn = document.getElementById('btn-delete-selected-clients');
  if (bulkDeleteBtn) {
    bulkDeleteBtn.addEventListener('click', deleteSelectedCatalogClients);
  }
  
  catalogEventsBound = true;
}

function getFilteredCatalogClients() {
  if (!Array.isArray(allCatalogClients)) return [];

  const searchInput = document.getElementById('catalog-client-search');
  const advisorSelect = document.getElementById('catalog-client-advisor-filter');
  const searchTerm = searchInput ? searchInput.value.toLowerCase().trim() : '';
  const advisorFilter = advisorSelect ? advisorSelect.value : 'ALL';
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

  return filtered;
}

function updateCatalogSelectionControls(visibleClients = getFilteredCatalogClients()) {
  const isAdmin = user?.nivel_rol === 'Administrador';
  const selectAll = document.getElementById('catalog-select-all-clients');
  const bulkDeleteBtn = document.getElementById('btn-delete-selected-clients');
  const selectedCount = document.getElementById('selected-clients-count');
  const visibleIds = visibleClients.map(c => c.id);
  const checkedVisibleCount = visibleIds.filter(id => selectedCatalogClientIds.has(id)).length;

  if (selectAll) {
    selectAll.style.display = isAdmin ? '' : 'none';
    selectAll.checked = visibleIds.length > 0 && checkedVisibleCount === visibleIds.length;
    selectAll.indeterminate = checkedVisibleCount > 0 && checkedVisibleCount < visibleIds.length;
    selectAll.disabled = visibleIds.length === 0;
  }

  if (bulkDeleteBtn) {
    bulkDeleteBtn.style.display = isAdmin ? 'inline-flex' : 'none';
    bulkDeleteBtn.disabled = selectedCatalogClientIds.size === 0;
  }

  if (selectedCount) {
    selectedCount.textContent = selectedCatalogClientIds.size;
  }
}

window.toggleCatalogClientSelection = function(clientId, checked) {
  if (checked) {
    selectedCatalogClientIds.add(clientId);
  } else {
    selectedCatalogClientIds.delete(clientId);
  }
  updateCatalogSelectionControls();
};

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
  updateCatalogSelectionControls([]);
  
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
    selectedCatalogClientIds = new Set(
      [...selectedCatalogClientIds].filter(id => allCatalogClients.some(c => c.id === id))
    );
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
  
  tbody.innerHTML = '';
  const filtered = getFilteredCatalogClients();
  updateCatalogSelectionControls(filtered);
  
  if (filtered.length === 0) {
    const cols = user.nivel_rol === 'Asesor' ? 8 : 9;
    tbody.innerHTML = `<tr><td colspan="${cols}" style="text-align: center; color: var(--text-light);">No se encontraron agricultores.</td></tr>`;
    return;
  }
  
  let catalogHtml = '';
  filtered.forEach(c => {
    let badgeClass = c.estado_status === 'Cliente' ? 'badge-success' : 'badge-warning';
    const isSelected = selectedCatalogClientIds.has(c.id);
    const selectionControl = user.nivel_rol === 'Administrador'
      ? `<input type="checkbox" class="catalog-row-checkbox" ${isSelected ? 'checked' : ''} title="Seleccionar agricultor" aria-label="Seleccionar agricultor" onchange="toggleCatalogClientSelection(${c.id}, this.checked)">`
      : '';
    const deleteButton = user.nivel_rol === 'Administrador'
      ? `<button class="btn btn-secondary icon-action-btn danger" title="Borrar agricultor" aria-label="Borrar agricultor" onclick="deleteCatalogClient(${c.id})">🗑️</button>`
      : '';
    
    catalogHtml += `
      <tr>
        <td>
          <div class="catalog-name-cell">
            <strong>${c.nombre}</strong>
            ${selectionControl}
          </div>
        </td>
        ${user.nivel_rol !== 'Asesor' ? `<td>${c.asesor_nombre || 'Sin Asesor'}</td>` : ''}
        <td>${c.cuenta_clave_nombre || '-'}</td>
        <td>${c.contacto || '-'}</td>
        <td>${c.telefono || '-'}</td>
        <td>${c.ubicacion || '-'}</td>
        <td>${c.superficie_text || '-'}</td>
        <td><span class="badge ${badgeClass}">${c.estado_status}</span></td>
        <td style="text-align: center;">
          <div class="catalog-row-actions">
            <button class="btn btn-secondary icon-action-btn" title="Editar agricultor" aria-label="Editar agricultor" onclick="editCatalogClient(${c.id})">✏️</button>
            ${deleteButton}
          </div>
        </td>
      </tr>
    `;
  });
  tbody.innerHTML = catalogHtml;
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

window.deleteCatalogClient = async function(clientId) {
  const c = allCatalogClients.find(x => x.id === clientId);
  if (!c) return;

  const confirmed = confirm(`¿Borrar al agricultor "${c.nombre}"?\n\nSe ocultará del catálogo y se rechazarán sus pujas pendientes.`);
  if (!confirmed) return;

  try {
    const res = await fetch(`${API_URL}/api/clientes/${clientId}`, {
      method: 'DELETE',
      headers: getHeaders()
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || 'Failed to delete client');

    selectedCatalogClientIds.delete(clientId);
    await loadClientesCatalog();
    alert('Agricultor borrado con éxito.');
  } catch (err) {
    alert(err.message);
  }
};

async function deleteSelectedCatalogClients() {
  const ids = [...selectedCatalogClientIds];
  if (ids.length === 0) return;

  const confirmed = confirm(`¿Borrar ${ids.length} agricultor${ids.length === 1 ? '' : 'es'} seleccionado${ids.length === 1 ? '' : 's'}?\n\nSe ocultarán del catálogo y se rechazarán sus pujas pendientes.`);
  if (!confirmed) return;

  const bulkDeleteBtn = document.getElementById('btn-delete-selected-clients');
  if (bulkDeleteBtn) bulkDeleteBtn.disabled = true;

  try {
    const res = await fetch(`${API_URL}/api/clientes/bulk-delete`, {
      method: 'POST',
      headers: getHeaders(),
      body: JSON.stringify({ ids })
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || 'Failed to delete clients');

    selectedCatalogClientIds.clear();
    await loadClientesCatalog();
    const deletedCount = data.deleted || ids.length;
    alert(`${deletedCount} agricultor${deletedCount === 1 ? '' : 'es'} borrado${deletedCount === 1 ? '' : 's'} con éxito.`);
  } catch (err) {
    alert(err.message);
    updateCatalogSelectionControls();
  }
}

// -------------------------------------------------------------
// CLIENT ASSIGNMENT & BIDDING (PUJAS) LOGIC
// -------------------------------------------------------------

// Active state for client tabs
let activeClientTab = 'catalog'; // 'catalog' or 'bids'
let allUnassignedClients = [];
let allActiveBids = [];
let allMatchingMetrics = null;

// Tab switcher for advisor client list
window.switchClientTab = function(tabName) {
  activeClientTab = tabName;
  const tabCatalog = document.getElementById('tab-client-catalog');
  const tabBids = document.getElementById('tab-client-bids');
  const secCatalog = document.getElementById('client-catalog-section');
  const secBids = document.getElementById('client-bids-section');
  
  if (tabName === 'catalog') {
    if (tabCatalog) tabCatalog.classList.add('active');
    if (tabBids) tabBids.classList.remove('active');
    if (secCatalog) secCatalog.style.display = 'block';
    if (secBids) secBids.style.display = 'none';
    loadCatalogData();
  } else {
    if (tabCatalog) tabCatalog.classList.remove('active');
    if (tabBids) tabBids.classList.add('active');
    if (secCatalog) secCatalog.style.display = 'none';
    if (secBids) secBids.style.display = 'block';
    loadClientBidsPool();
  }
};

// Load client bids pool (Advisors)
window.loadClientBidsPool = async function() {
  const tbody = document.getElementById('client-bids-tbody');
  if (!tbody) return;
  
  try {
    tbody.innerHTML = '<tr><td colspan="7" style="text-align: center; color: var(--text-light);">Cargando pool de clientes...</td></tr>';
    
    // Fetch biddable clients and bids list
    const clientsRes = await fetch(`${API_URL}/api/asignacion/sin-asesor`, { headers: getHeaders() });
    const allClients = await clientsRes.json();
    
    const bidsRes = await fetch(`${API_URL}/api/asignacion/pujas`, { headers: getHeaders() });
    const myBids = await bidsRes.json();
    
    // Filter to only biddable ones
    const biddableClients = allClients.filter(c => c.disponible_para_puja === 1);
    
    // Load historical purchases metrics if available, or just fetch quotes
    const quotesRes = await fetch(`${API_URL}/api/cotizaciones`, { headers: getHeaders() });
    const quotes = await quotesRes.json();
    
    let bidsHtml = '';
    
    if (biddableClients.length === 0) {
      tbody.innerHTML = '<tr><td colspan="7" style="text-align: center; color: var(--text-light);">No hay agricultores disponibles para puja en este momento.</td></tr>';
      return;
    }
    
    biddableClients.forEach(c => {
      // Calculate purchase volume
      const totalPurchases = quotes
        .filter(q => q.cliente_id === c.id && (q.estatus === 'Vendido' || q.estatus === 'Entregado'))
        .reduce((sum, q) => sum + q.total_mxn, 0);
      
      const bid = myBids.find(b => b.cliente_id === c.id && b.asesor_id === user.id);
      
      let statusHtml = '<span class="badge badge-secondary">Ninguna</span>';
      let actionText = '✏️ Enviar Propuesta';
      if (bid) {
        let badgeClass = 'badge-warning';
        if (bid.estatus === 'Aprobada') badgeClass = 'badge-success';
        if (bid.estatus === 'Rechazada') badgeClass = 'badge-danger';
        statusHtml = `<span class="badge ${badgeClass}" title="${bid.justificacion}">${bid.estatus}</span>`;
        actionText = bid.estatus === 'Pendiente' ? '✏️ Editar Propuesta' : '👁️ Ver';
      }
      
      const isActionDisabled = bid && bid.estatus !== 'Pendiente';
      
      bidsHtml += `
        <tr>
          <td><strong>${c.nombre}</strong></td>
          <td>${c.contacto || '-'}</td>
          <td>${c.ubicacion || '-'}</td>
          <td>${c.superficie_text || '-'}</td>
          <td>$${totalPurchases.toLocaleString('es-MX', { maximumFractionDigits: 0 })} MXN</td>
          <td>${statusHtml}</td>
          <td style="text-align: center;">
            <button class="btn btn-primary" style="width: auto; padding: 4px 10px; font-size: 11px; margin: 0;" 
              onclick="openBidForm(${c.id}, '${c.nombre.replace(/'/g, "\\'")}', '${bid ? bid.justificacion.replace(/'/g, "\\'").replace(/"/g, '&quot;') : ''}')"
              ${isActionDisabled ? 'disabled style="opacity:0.5; cursor:not-allowed;"' : ''}>
              ${actionText}
            </button>
          </td>
        </tr>
      `;
    });
    tbody.innerHTML = bidsHtml;
  } catch (err) {
    console.error('Failed to load client bids pool:', err);
    tbody.innerHTML = `<tr><td colspan="7" style="text-align: center; color: var(--danger);">Error: ${err.message}</td></tr>`;
  }
};

// Open Bid Form modal
window.openBidForm = function(clientId, clientName, existingJustification = '') {
  document.getElementById('bid-client-id').value = clientId;
  document.getElementById('bid-client-name').textContent = clientName;
  document.getElementById('bid-justification').value = existingJustification;
  openModal('bid-modal');
};

// Bind Bid Form Submit
document.getElementById('bid-form').addEventListener('submit', async (e) => {
  e.preventDefault();
  const clientId = document.getElementById('bid-client-id').value;
  const justificacion = document.getElementById('bid-justification').value;
  const submitBtn = document.getElementById('bid-submit-btn');
  
  try {
    submitBtn.disabled = true;
    submitBtn.textContent = 'Enviando...';
    
    const res = await fetch(`${API_URL}/api/asignacion/pujas`, {
      method: 'POST',
      headers: getHeaders(),
      body: JSON.stringify({ cliente_id: clientId, justificacion })
    });
    
    if (!res.ok) {
      const errData = await res.json();
      throw new Error(errData.error || 'Failed to submit bid');
    }
    
    closeModal('bid-modal');
    alert('Propuesta de asignación enviada con éxito.');
    loadClientBidsPool();
  } catch (err) {
    alert(`Error: ${err.message}`);
  } finally {
    submitBtn.disabled = false;
    submitBtn.textContent = 'Enviar Puja';
  }
});

// Load Assignment View (Admin Only)
window.loadAsignacionView = async function() {
  const unassignedList = document.getElementById('assign-unassigned-list');
  const biddableList = document.getElementById('assign-biddable-list');
  const advisorsList = document.getElementById('assign-advisors-list');
  
  if (!unassignedList || !biddableList || !advisorsList) return;
  
  try {
    unassignedList.innerHTML = '<div style="text-align: center; color: var(--text-light); padding: 20px;">Cargando agricultores...</div>';
    biddableList.innerHTML = '<div style="text-align: center; color: var(--text-light); padding: 20px;">Cargando pool...</div>';
    advisorsList.innerHTML = '<div style="text-align: center; color: var(--text-light); padding: 20px;">Cargando asesores...</div>';
    
    // 1. Fetch unassigned clients
    const clientsRes = await fetch(`${API_URL}/api/asignacion/sin-asesor`, { headers: getHeaders() });
    allUnassignedClients = await clientsRes.json();
    
    // 2. Fetch all bids
    const bidsRes = await fetch(`${API_URL}/api/asignacion/pujas`, { headers: getHeaders() });
    allActiveBids = await bidsRes.json();
    
    // 3. Fetch active advisors
    const advisorsRes = await fetch(`${API_URL}/api/asesores`, { headers: getHeaders() });
    const advisors = await advisorsRes.json();
    
    // 4. Fetch metrics for AI Suggestions
    const metricsRes = await fetch(`${API_URL}/api/asignacion/metricas-AI`, { headers: getHeaders() });
    allMatchingMetrics = await metricsRes.json();
    
    // Bind search input filters
    const searchInput = document.getElementById('assign-search-client');
    const searchAdvisorInput = document.getElementById('assign-search-advisor');
    const onSearchInput = () => {
      if (allMatchingMetrics) {
        const activeAdvisors = advisors.filter(a => a.activo === 1 && a.nivel_rol === 'Asesor');
        renderAsignacionBoard(activeAdvisors);
      }
    };
    if (searchInput && !searchInput.dataset.listenerBound) {
      searchInput.dataset.listenerBound = 'true';
      searchInput.addEventListener('input', onSearchInput);
    }
    if (searchAdvisorInput && !searchAdvisorInput.dataset.listenerBound) {
      searchAdvisorInput.dataset.listenerBound = 'true';
      searchAdvisorInput.addEventListener('input', onSearchInput);
    }
    
    // Bind Biddable Pool Card Drag & Drop
    const biddableCard = document.getElementById('assign-biddable-card');
    if (biddableCard && !biddableCard.dataset.listenersBound) {
      biddableCard.dataset.listenersBound = 'true';
      biddableCard.addEventListener('dragover', (e) => {
        e.preventDefault();
        biddableCard.style.borderColor = 'var(--warning)';
        biddableCard.style.background = 'rgba(241, 196, 15, 0.05)';
      });
      biddableCard.addEventListener('dragleave', () => {
        biddableCard.style.borderColor = 'var(--border)';
        biddableCard.style.background = 'var(--bg-hover)';
      });
      biddableCard.addEventListener('drop', async (e) => {
        e.preventDefault();
        biddableCard.style.borderColor = 'var(--border)';
        biddableCard.style.background = 'var(--bg-hover)';
        
        const dragData = e.dataTransfer.getData('text/plain');
        if (dragData && dragData.startsWith('client:')) {
          const clientId = Number(dragData.split(':')[1]);
          await toggleClientBiddable(clientId, true);
        }
      });
    }
    
    // Render
    renderAsignacionBoard(advisors.filter(a => a.activo === 1 && a.nivel_rol === 'Asesor'));
  } catch (err) {
    console.error('Failed to load assignment view:', err);
    unassignedList.innerHTML = `<div style="color: var(--danger); padding: 20px;">Error: ${err.message}</div>`;
  }
};

// Render Board layout
window.renderAsignacionBoard = function(advisors) {
  const unassignedList = document.getElementById('assign-unassigned-list');
  const biddableList = document.getElementById('assign-biddable-list');
  const advisorsList = document.getElementById('assign-advisors-list');
  
  const searchInput = document.getElementById('assign-search-client');
  const searchTerm = searchInput ? searchInput.value.toLowerCase().trim() : '';
  
  const searchAdvisorInput = document.getElementById('assign-search-advisor');
  const advisorSearchTerm = searchAdvisorInput ? searchAdvisorInput.value.toLowerCase().trim() : '';
  
  // Filter unassigned clients
  let filteredClients = allUnassignedClients;
  if (searchTerm) {
    filteredClients = filteredClients.filter(c => 
      c.nombre.toLowerCase().includes(searchTerm) ||
      (c.contacto && c.contacto.toLowerCase().includes(searchTerm)) ||
      (c.ubicacion && c.ubicacion.toLowerCase().includes(searchTerm))
    );
  }
  
  // Filter advisors
  window.filteredAdvisors = advisors;
  if (advisorSearchTerm) {
    window.filteredAdvisors = advisors.filter(a => a.nombre.toLowerCase().includes(advisorSearchTerm));
  }
  
  // Separate clients
  const directAssignClients = filteredClients.filter(c => c.disponible_para_puja === 0);
  const biddablePoolClients = allUnassignedClients.filter(c => c.disponible_para_puja === 1);
  
  // Update counts
  document.getElementById('assign-unassigned-count').textContent = directAssignClients.length;
  document.getElementById('assign-biddable-count').textContent = biddablePoolClients.length;
  document.getElementById('assign-advisors-count').textContent = window.filteredAdvisors.length;
  
  // Render column 1: Direct Assign
  unassignedList.innerHTML = '';
  if (directAssignClients.length === 0) {
    unassignedList.innerHTML = '<div style="text-align: center; color: var(--text-light); padding: 30px; border: 1px dashed var(--border); border-radius: var(--radius);">No hay clientes sin asesor para asignación directa.</div>';
  } else {
    directAssignClients.forEach(c => {
      // Find client purchase history
      const cMetric = allMatchingMetrics?.clients.find(cm => cm.cliente_id === c.id);
      const purchaseVol = cMetric ? cMetric.total_purchase_mxn : 0;
      
      const card = document.createElement('div');
      card.className = 'kanban-card';
      card.id = `client-assign-card-${c.id}`;
      card.draggable = true;
      card.style.cursor = 'grab';
      card.style.borderLeft = '4px solid var(--primary)';
      card.addEventListener('dragstart', (e) => {
        e.dataTransfer.setData('text/plain', `client:${c.id}`);
      });
      
      card.innerHTML = `
        <div style="display: flex; justify-content: space-between; align-items: flex-start; gap: 8px;">
          <div style="display: flex; align-items: center; gap: 6px;">
            <input type="checkbox" class="assign-client-checkbox" value="${c.id}" onchange="updateAssignBulkAction()">
            <strong style="font-size: 13px; color: var(--text-dark);">${c.nombre}</strong>
          </div>
          <button class="btn btn-secondary" style="width: auto; padding: 2px 6px; font-size: 10px; margin: 0; line-height: 1;" onclick="showAISuggestion(${c.id}, '${c.nombre.replace(/'/g, "\\'")}')" title="Recomendación IA">🤖 IA</button>
        </div>
        <div style="font-size: 11px; color: var(--text-light); margin: 4px 0;">📍 ${c.ubicacion || 'Sin ubicación'} | 📐 ${c.superficie_text || '-'}</div>
        <div style="font-size: 11px; color: var(--text-light); font-weight: 500;">Historial: $${purchaseVol.toLocaleString('es-MX', { maximumFractionDigits: 0 })} MXN</div>
        <div style="display: flex; justify-content: flex-end; margin-top: 8px;">
          <button class="btn btn-primary" style="width: auto; padding: 4px 8px; font-size: 11px; margin: 0; background: var(--warning); border-color: var(--warning);" onclick="toggleClientBiddable(${c.id}, true)">🔔 Hacer Disponible</button>
        </div>
      `;
      unassignedList.appendChild(card);
    });
  }

  // Reset bulk actions state when rendering
  const selectAllCb = document.getElementById('assign-select-all');
  if (selectAllCb) selectAllCb.checked = false;
  if (typeof updateAssignBulkAction === 'function') updateAssignBulkAction();

  
  // Render column 2: Biddable Pool with bids
  biddableList.innerHTML = '';
  if (biddablePoolClients.length === 0) {
    biddableList.innerHTML = '<div style="text-align: center; color: var(--text-light); padding: 30px; border: 1px dashed var(--border); border-radius: var(--radius);">El pool de pujas está vacío.</div>';
  } else {
    biddablePoolClients.forEach(c => {
      const clientBids = allActiveBids.filter(b => b.cliente_id === c.id && b.estatus === 'Pendiente');
      const cMetric = allMatchingMetrics?.clients.find(cm => cm.cliente_id === c.id);
      const purchaseVol = cMetric ? cMetric.total_purchase_mxn : 0;
      
      const card = document.createElement('div');
      card.className = 'kanban-card';
      card.style.padding = '12px';
      card.style.borderLeft = '4px solid var(--warning)';
      card.style.marginBottom = '12px';
      
      const hasBids = clientBids.length > 0;
      card.innerHTML = `
        <div style="display: flex; justify-content: space-between; align-items: flex-start; gap: 8px; margin-bottom: 6px;">
          <strong style="font-size: 13px; color: var(--text-dark);">${c.nombre}</strong>
          <button class="btn btn-secondary" style="width: auto; padding: 2px 6px; font-size: 10px; margin: 0; line-height: 1;" onclick="toggleClientBiddable(${c.id}, false)" title="Quitar del pool">Quitar ✗</button>
        </div>
        <div style="font-size: 11px; color: var(--text-light); margin-bottom: 8px;">📍 ${c.ubicacion || 'Sin ubicación'} | $${purchaseVol.toLocaleString('es-MX', { maximumFractionDigits: 0 })} MXN</div>
        
        <div style="display: flex; justify-content: space-between; align-items: center; margin-top: 12px; gap: 8px;">
          <span class="badge ${hasBids ? 'badge-warning' : 'badge-secondary'}" style="font-size: 10px; padding: 4px 8px;">${clientBids.length} prop.</span>
          <button class="btn btn-primary" style="width: auto; padding: 4px 8px; font-size: 11px; margin: 0; ${hasBids ? '' : 'opacity: 0.5; pointer-events: none;'}" 
            onclick="openAdminDecisionModal(${c.id}, '${c.nombre.replace(/'/g, "\\'")}', ${purchaseVol})">
            👁️ Propuestas
          </button>
        </div>
      `;
      biddableList.appendChild(card);
    });
  }
  
  // Render column 3: Advisors (Drop Zones)
  advisorsList.innerHTML = '';
  if (window.filteredAdvisors.length === 0) {
    advisorsList.innerHTML = '<div style="text-align: center; color: var(--text-light); padding: 30px;">No hay asesores comerciales que coincidan.</div>';
  } else {
    window.filteredAdvisors.forEach(a => {
      const aMetric = allMatchingMetrics?.advisors.find(am => am.asesor_id === a.id);
      const salesVol = aMetric ? Number(aMetric.total_sales_mxn) : 0;
      const complVisits = aMetric ? Number(aMetric.completed_visits) : 0;
      const totalVisits = aMetric ? Number(aMetric.total_visits) : 0;
      const pendingVisits = aMetric ? Number(aMetric.pending_visits) : 0;
      
      const complRate = totalVisits > 0 ? Math.round((complVisits / totalVisits) * 100) : 0;
      
      const card = document.createElement('div');
      card.className = 'card';
      card.id = `advisor-assign-card-${a.id}`;
      card.style.padding = '12px';
      card.style.border = '2px dashed var(--border)';
      card.style.background = 'var(--bg-card)';
      card.style.transition = 'all 0.2s ease';
      
      // Drag & Drop listeners on Drop Zone
      card.addEventListener('dragover', (e) => {
        e.preventDefault();
        card.style.borderColor = 'var(--success)';
        card.style.background = 'rgba(46, 204, 113, 0.1)';
      });
      
      card.addEventListener('dragleave', () => {
        card.style.borderColor = 'var(--border)';
        card.style.background = 'var(--bg-card)';
      });
      
      card.addEventListener('drop', async (e) => {
        e.preventDefault();
        card.style.borderColor = 'var(--border)';
        card.style.background = 'var(--bg-card)';
        
        const dragData = e.dataTransfer.getData('text/plain');
        if (dragData && dragData.startsWith('client:')) {
          const clientId = Number(dragData.split(':')[1]);
          await assignClientDirectly(clientId, a.id, a.nombre);
        }
      });
      
      card.innerHTML = `
        <div style="font-weight: bold; font-size: 13px; color: var(--text-dark); display: flex; justify-content: space-between;">
          <span>👤 ${a.nombre}</span>
        </div>
        <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 4px; font-size: 11px; color: var(--text-light); margin-top: 6px;">
          <div>Ventas: <strong>$${(salesVol / 1000000).toFixed(1)}M</strong></div>
          <div>Visitas: <strong>${complRate}% (${complVisits}/${totalVisits})</strong></div>
          <div style="grid-column: span 2;">Carga de Trabajo: <strong style="color: ${pendingVisits > 4 ? 'var(--danger)' : 'var(--success)'};">${pendingVisits} pendientes</strong></div>
        </div>
      `;
      advisorsList.appendChild(card);
    });
  }
};

// Make client available for puja
window.toggleClientBiddable = async function(clientId, isBiddable) {
  try {
    const res = await fetch(`${API_URL}/api/clientes/${clientId}/puja-status`, {
      method: 'PUT',
      headers: getHeaders(),
      body: JSON.stringify({ disponible_para_puja: isBiddable })
    });
    
    if (!res.ok) {
      const errData = await res.json();
      throw new Error(errData.error || 'Failed to update status');
    }
    
    loadAsignacionView();
  } catch (err) {
    alert(`Error: ${err.message}`);
  }
};

// Decide on advisor bid
window.processBidDecision = async function(bidId, decision) {
  try {
    const res = await fetch(`${API_URL}/api/asignacion/pujas/${bidId}/decision`, {
      method: 'POST',
      headers: getHeaders(),
      body: JSON.stringify({ decision })
    });
    
    if (!res.ok) {
      const errData = await res.json();
      throw new Error(errData.error || 'Failed to submit decision');
    }
    
    loadAsignacionView();
  } catch (err) {
    alert(`Error: ${err.message}`);
  }
};

// Direct Drag & Drop assignment
window.assignClientDirectly = async function(clientId, advisorId, advisorName) {
  try {
    const res = await fetch(`${API_URL}/api/asignacion/clientes/${clientId}/asesor`, {
      method: 'PUT',
      headers: getHeaders(),
      body: JSON.stringify({ asesor_id: advisorId })
    });
    
    if (!res.ok) {
      const errData = await res.json();
      throw new Error(errData.error || 'Failed to assign client');
    }
    
    alert(`Cliente asignado con éxito a ${advisorName}.`);
    loadAsignacionView();
  } catch (err) {
    alert(`Error: ${err.message}`);
  }
};

// AI Matching Suggester
window.showAISuggestion = function(clientId, clientName) {
  if (!user || (user.nivel_rol !== 'Administrador' && user.nivel_rol !== 'Coordinador')) {
    return;
  }
  const modalBody = document.getElementById('ai-suggestion-body');
  if (!modalBody || !allMatchingMetrics) return;
  
  const cMetric = allMatchingMetrics.clients.find(cm => cm.cliente_id === clientId);
  const clientPurchase = cMetric ? cMetric.total_purchase_mxn : 0;
  
  // Heuristic Scoring
  const scores = allMatchingMetrics.advisors.map(a => {
    const maxSales = Math.max(...allMatchingMetrics.advisors.map(ad => ad.total_sales_mxn), 1);
    const salesScore = (a.total_sales_mxn / maxSales) * 100;
    
    const complRate = a.total_visits > 0 ? (a.completed_visits / a.total_visits) * 100 : 70;
    
    const maxPending = Math.max(...allMatchingMetrics.advisors.map(ad => ad.pending_visits), 1);
    const availabilityScore = ((maxPending - a.pending_visits) / maxPending) * 100;
    
    let matchScore = 0;
    let reasoning = '';
    
    if (clientPurchase > 1000000) {
      matchScore = Math.round((salesScore * 0.6) + (complRate * 0.4));
      
      const salesDesc = a.total_sales_mxn > 0 ? `$${(a.total_sales_mxn/1000000).toFixed(2)}M MXN` : 'sin ventas';
      if (salesScore >= 80 && complRate >= 80) {
        reasoning = `Excelente recomendación: Líder en ventas comerciales con ${salesDesc} y altísimo nivel de cumplimiento de visitas programadas (${Math.round(complRate)}%), idóneo para retener y desarrollar esta cuenta clave.`;
      } else if (salesScore >= 40) {
        reasoning = `Sólido perfil comercial con ${salesDesc} de facturación y efectividad del ${Math.round(complRate)}% en su agenda semanal. Adecuado para un servicio continuo y de calidad.`;
      } else {
        reasoning = `Mantiene un volumen moderado de ventas (${salesDesc}) y cumplimiento de agenda del ${Math.round(complRate)}%. Opción secundaria viable.`;
      }
    } else {
      matchScore = Math.round((availabilityScore * 0.6) + (complRate * 0.4));
      
      const pendingDesc = a.pending_visits === 0 ? 'agenda totalmente libre (0 visitas pendientes)' : `${a.pending_visits} visitas pendientes en su agenda`;
      if (availabilityScore >= 80 && complRate >= 80) {
        reasoning = `Excelente recomendación: Tiene ${pendingDesc} y un cumplimiento sobresaliente de visitas del ${Math.round(complRate)}%, asegurando atención inmediata y constante.`;
      } else if (availabilityScore >= 40) {
        reasoning = `Disponibilidad de agenda favorable (${pendingDesc}) y un nivel de efectividad del ${Math.round(complRate)}% para dar un seguimiento oportuno.`;
      } else {
        reasoning = `Agenda activa (${pendingDesc}) y efectividad del ${Math.round(complRate)}%. Conveniente si se requiere cercanía local o cobertura específica.`;
      }
    }
    
    return {
      id: a.asesor_id,
      nombre: a.nombre,
      score: Math.max(matchScore, 10),
      reasoning,
      stats: {
        sales: a.total_sales_mxn,
        visits: complRate,
        pending: a.pending_visits
      }
    };
  });
  
  // Sort with logical tie-breaker
  scores.sort((a, b) => {
    if (b.score !== a.score) {
      return b.score - a.score;
    }
    // Tie-breakers
    if (clientPurchase > 1000000) {
      return b.stats.sales - a.stats.sales; // Higher sales volume breaks tie
    } else {
      return a.stats.pending - b.stats.pending; // Lower workload (fewer pending visits) breaks tie
    }
  });
  
  let html = `
    <div style="background: var(--bg-hover); padding: 12px; border-radius: var(--radius); margin-bottom: 16px;">
      <div style="font-weight: 600; font-size: 13px; color: var(--text-light); text-transform: uppercase; margin-bottom: 4px;">Cliente Analizado</div>
      <div style="font-size: 16px; font-weight: bold; color: var(--text-dark);">${clientName}</div>
      <div style="font-size: 13px; color: var(--primary); font-weight: 500; margin-top: 4px;">Compras Históricas: $${clientPurchase.toLocaleString('es-MX', { maximumFractionDigits: 0 })} MXN</div>
    </div>
    
    <div style="font-weight: 700; font-size: 14px; color: var(--text-dark); margin-bottom: 12px;">Top 3 Asesores Recomendados:</div>
    <div style="display: flex; flex-direction: column; gap: 12px;">
  `;
  
  scores.slice(0, 3).forEach((s, idx) => {
    let medal = '🥇';
    if (idx === 1) medal = '🥈';
    if (idx === 2) medal = '🥉';
    
    html += `
      <div style="border: 1px solid var(--border); border-radius: var(--radius); padding: 12px; display: flex; flex-direction: column; gap: 6px;">
        <div style="display: flex; justify-content: space-between; align-items: center;">
          <strong style="font-size: 14px; color: var(--text-dark);">${medal} ${s.nombre}</strong>
          <span class="badge ${s.score > 80 ? 'badge-success' : 'badge-info'}" style="font-size: 12px; padding: 4px 10px; font-weight: 700;">${s.score}% Match</span>
        </div>
        <p style="margin: 0; font-size: 12px; color: var(--text-dark); line-height: 1.4; font-style: italic;">"${s.reasoning}"</p>
        <div style="font-size: 11px; color: var(--text-light); display: flex; gap: 12px; border-top: 1px dashed var(--border); padding-top: 6px; margin-top: 2px;">
          <span>Ventas: $${(s.stats.sales / 1000000).toFixed(2)}M</span>
          <span>Visitas: ${Math.round(s.stats.visits)}%</span>
          <span>Pendientes: ${s.stats.pending}</span>
        </div>
        <div style="display: flex; justify-content: flex-end; margin-top: 4px;">
          <button class="btn btn-primary" style="width: auto; padding: 4px 12px; font-size: 11px; margin: 0;" onclick="closeModal('ai-suggestion-modal'); assignClientDirectly(${clientId}, ${s.id}, '${s.nombre.replace(/'/g, "\\'")}')">Asignar Directamente</button>
        </div>
      </div>
    `;
  });
  
  html += `</div>`;
  modalBody.innerHTML = html;
  openModal('ai-suggestion-modal');
};

// Admin Decision Modal Candidate list renderer
window.openAdminDecisionModal = function(clientId, clientName, clientPurchase) {
  if (!user || user.nivel_rol !== 'Administrador') {
    return;
  }
  const modalInfo = document.getElementById('decision-modal-client-info');
  const candidatesList = document.getElementById('decision-modal-candidates-list');
  if (!modalInfo || !candidatesList || !allActiveBids || !allMatchingMetrics) return;
  
  modalInfo.innerHTML = `
    <div style="font-weight: 600; font-size: 12px; color: var(--text-light); text-transform: uppercase;">Agricultor</div>
    <div style="font-size: 16px; font-weight: bold; color: var(--text-dark);">${clientName}</div>
    <div style="font-size: 13px; color: var(--primary); font-weight: 500; margin-top: 4px;">Compras Históricas: $${clientPurchase.toLocaleString('es-MX', { maximumFractionDigits: 0 })} MXN</div>
  `;
  
  const clientBids = allActiveBids.filter(b => b.cliente_id === clientId && b.estatus === 'Pendiente');
  
  candidatesList.innerHTML = '';
  if (clientBids.length === 0) {
    candidatesList.innerHTML = '<div style="text-align: center; color: var(--text-light); padding: 20px;">No hay propuestas de asesores para este agricultor.</div>';
  } else {
    clientBids.forEach(b => {
      // Calculate AI score for this candidate advisor
      const aMetric = allMatchingMetrics.advisors.find(am => am.asesor_id === b.asesor_id);
      const salesVol = aMetric ? Number(aMetric.total_sales_mxn) : 0;
      const complVisits = aMetric ? Number(aMetric.completed_visits) : 0;
      const totalVisits = aMetric ? Number(aMetric.total_visits) : 0;
      const pendingVisits = aMetric ? Number(aMetric.pending_visits) : 0;
      const complRate = totalVisits > 0 ? (complVisits / totalVisits) * 100 : 70;
      
      const maxSales = Math.max(...allMatchingMetrics.advisors.map(ad => ad.total_sales_mxn), 1);
      const salesScore = (salesVol / maxSales) * 100;
      const maxPending = Math.max(...allMatchingMetrics.advisors.map(ad => ad.pending_visits), 1);
      const availabilityScore = ((maxPending - pendingVisits) / maxPending) * 100;
      
      let matchScore = 0;
      if (clientPurchase > 1000000) {
        matchScore = Math.round((salesScore * 0.5) + (complRate * 0.3) + (availabilityScore * 0.2));
      } else {
        matchScore = Math.round((availabilityScore * 0.5) + (complRate * 0.3) + (salesScore * 0.2));
      }
      matchScore = Math.max(matchScore, 10);
      
      const card = document.createElement('div');
      card.style.border = '1px solid var(--border)';
      card.style.borderRadius = 'var(--radius)';
      card.style.padding = '16px';
      card.style.background = 'var(--bg-card)';
      card.style.display = 'flex';
      card.style.flexDirection = 'column';
      card.style.gap = '8px';
      
      card.innerHTML = `
        <div style="display: flex; justify-content: space-between; align-items: center;">
          <strong style="font-size: 14px; color: var(--text-dark);">👤 ${b.asesor_nombre}</strong>
          <span class="badge ${matchScore > 80 ? 'badge-success' : 'badge-info'}" style="font-size: 12px; padding: 4px 10px; font-weight: 700;">${matchScore}% Match IA</span>
        </div>
        <div style="background: var(--bg-hover); padding: 10px; border-left: 3px solid var(--primary); border-radius: var(--radius); font-style: italic; font-size: 12px; color: var(--text-dark);">
          "${b.justificacion}"
        </div>
        <div style="display: flex; justify-content: space-between; align-items: center; border-top: 1px dashed var(--border); padding-top: 8px; margin-top: 4px;">
          <div style="font-size: 11px; color: var(--text-light); display: flex; gap: 12px;">
            <span>Ventas: $${(salesVol / 1000000).toFixed(2)}M</span>
            <span>Visitas: ${Math.round(complRate)}%</span>
            <span>Pendientes: ${pendingVisits}</span>
          </div>
          <div style="display: flex; gap: 8px;">
            <button class="btn btn-primary" style="width: auto; padding: 4px 12px; font-size: 11px; margin: 0; background: var(--success); border-color: var(--success);" 
              onclick="closeModal('admin-decision-modal'); processBidDecision(${b.id}, 'Aprobada')">
              ✓ Aceptar
            </button>
            <button class="btn btn-primary" style="width: auto; padding: 4px 8px; font-size: 11px; margin: 0; background: var(--danger); border-color: var(--danger);" 
              onclick="closeModal('admin-decision-modal'); processBidDecision(${b.id}, 'Rechazada')">
              ✗ Rechazar
            </button>
          </div>
        </div>
      `;
      candidatesList.appendChild(card);
    });
  }
  
  openModal('admin-decision-modal');
};

// Advisor Assignment view loader
window.loadAdvisorAssignmentView = async function() {
  const grid = document.getElementById('assign-advisor-biddable-grid');
  const searchInput = document.getElementById('assign-advisor-search-client');
  const searchTerm = searchInput ? searchInput.value.toLowerCase().trim() : '';
  
  if (!grid) return;
  
  try {
    grid.innerHTML = '<div style="grid-column: 1/-1; text-align: center; color: var(--text-light); padding: 40px;">Cargando agricultores disponibles...</div>';
    
    // Fetch biddable clients
    const clientsRes = await fetch(`${API_URL}/api/asignacion/sin-asesor`, { headers: getHeaders() });
    const allClients = await clientsRes.json();
    const biddableClients = allClients.filter(c => c.disponible_para_puja === 1);
    
    // Fetch my bids
    const bidsRes = await fetch(`${API_URL}/api/asignacion/pujas`, { headers: getHeaders() });
    const myBids = await bidsRes.json();
    
    // Fetch historical purchase metrics by querying cotizaciones
    const quotesRes = await fetch(`${API_URL}/api/cotizaciones`, { headers: getHeaders() });
    const quotes = await quotesRes.json();
    
    // Filter by search term
    let filtered = biddableClients;
    if (searchTerm) {
      filtered = filtered.filter(c => 
        c.nombre.toLowerCase().includes(searchTerm) ||
        (c.contacto && c.contacto.toLowerCase().includes(searchTerm)) ||
        (c.ubicacion && c.ubicacion.toLowerCase().includes(searchTerm))
      );
    }
    
    grid.innerHTML = '';
    
    if (filtered.length === 0) {
      grid.innerHTML = '<div style="grid-column: 1/-1; text-align: center; color: var(--text-light); padding: 40px;">No hay agricultores disponibles en este momento.</div>';
    } else {
      filtered.forEach(c => {
        const totalPurchases = quotes
          .filter(q => q.cliente_id === c.id && (q.estatus === 'Vendido' || q.estatus === 'Entregado'))
          .reduce((sum, q) => sum + q.total_mxn, 0);
          
        const bid = myBids.find(b => b.cliente_id === c.id && b.asesor_id === user.id);
        
        let badgeHtml = '<span class="badge badge-secondary">Disponible</span>';
        let actionBtn = `<button class="btn btn-primary" style="width: 100%; margin-top: 12px;" onclick="openBidForm(${c.id}, '${c.nombre.replace(/'/g, "\\'")}', '')">✏️ Postularse</button>`;
        
        if (bid) {
          if (bid.estatus === 'Pendiente') {
            badgeHtml = '<span class="badge badge-warning">Propuesta Pendiente</span>';
            actionBtn = `<button class="btn btn-primary" style="width: 100%; margin-top: 12px; background: var(--secondary); border-color: var(--secondary);" onclick="openBidForm(${c.id}, '${c.nombre.replace(/'/g, "\\'")}', '${bid.justificacion.replace(/'/g, "\\'").replace(/"/g, '&quot;')}')">✏️ Editar Postulación</button>`;
          } else if (bid.estatus === 'Aprobada') {
            badgeHtml = '<span class="badge badge-success">¡Aprobado y Asignado!</span>';
            actionBtn = `<button class="btn btn-primary" style="width: 100%; margin-top: 12px; opacity: 0.5; pointer-events: none;" disabled>✓ Asignado</button>`;
          } else {
            badgeHtml = '<span class="badge badge-danger">Postulación Rechazada</span>';
            actionBtn = `<button class="btn btn-primary" style="width: 100%; margin-top: 12px; opacity: 0.5; pointer-events: none;" disabled>✗ Rechazado</button>`;
          }
        }
        
        const card = document.createElement('div');
        card.className = 'card';
        card.style.padding = '16px';
        card.style.display = 'flex';
        card.style.flexDirection = 'column';
        card.style.justifyContent = 'space-between';
        card.style.borderLeft = bid?.estatus === 'Aprobada' ? '4px solid var(--success)' : '4px solid var(--primary)';
        
        card.innerHTML = `
          <div>
            <div style="display: flex; justify-content: space-between; align-items: flex-start; gap: 8px; margin-bottom: 8px;">
              <strong style="font-size: 14px; color: var(--text-dark);">${c.nombre}</strong>
              ${badgeHtml}
            </div>
            <div style="font-size: 12px; color: var(--text-light); margin-bottom: 6px;">📍 ${c.ubicacion || 'Sin ubicación'} | 📐 ${c.superficie_text || '-'}</div>
            <div style="font-size: 12px; color: var(--text-dark); font-weight: 500;">Historial Compras: $${totalPurchases.toLocaleString('es-MX', { maximumFractionDigits: 0 })} MXN</div>
            ${bid && bid.justificacion ? `<div style="font-size: 11px; color: var(--text-light); font-style: italic; margin-top: 8px; background: var(--bg-hover); padding: 6px; border-radius: var(--radius);">Tu justificación: "${bid.justificacion}"</div>` : ''}
          </div>
          <div>
            ${actionBtn}
          </div>
        `;
        grid.appendChild(card);
      });
    }
    
    // Also load notifications
    await loadNotificationsFeed();
    
    // Bind search key input
    if (searchInput && !searchInput.dataset.listenerBound) {
      searchInput.dataset.listenerBound = 'true';
      searchInput.addEventListener('input', () => {
        loadAdvisorAssignmentView();
      });
    }
  } catch (err) {
    console.error('Failed to load advisor assignment view:', err);
    grid.innerHTML = `<div style="grid-column: 1/-1; color: var(--danger); text-align: center; padding: 40px;">Error: ${err.message}</div>`;
  }
};

// Load Advisor Notifications feed
window.loadNotificationsFeed = async function() {
  const container = document.getElementById('notif-feed-container');
  const countBadge = document.getElementById('notif-unread-count');
  if (!container) return;
  
  try {
    const res = await fetch(`${API_URL}/api/notificaciones`, { headers: getHeaders() });
    const notifs = await res.json();
    
    const unread = notifs.filter(n => n.leido === 0).length;
    if (countBadge) {
      if (unread > 0) {
        countBadge.textContent = unread;
        countBadge.style.display = 'inline-block';
      } else {
        countBadge.style.display = 'none';
      }
    }
    
    container.innerHTML = '';
    if (notifs.length === 0) {
      container.innerHTML = '<div style="text-align: center; color: var(--text-light); padding: 20px;">Sin notificaciones recientes.</div>';
      return;
    }
    
    notifs.forEach(n => {
      const card = document.createElement('div');
      card.style.background = n.leido === 0 ? 'rgba(230, 126, 34, 0.08)' : 'var(--bg-hover)';
      card.style.borderLeft = n.leido === 0 ? '3px solid var(--warning)' : '3px solid var(--border)';
      card.style.padding = '8px 12px';
      card.style.borderRadius = 'var(--radius)';
      card.style.fontSize = '12px';
      card.style.display = 'flex';
      card.style.flexDirection = 'column';
      card.style.gap = '4px';
      
      const time = new Date(n.creado_en).toLocaleString('es-MX', { hour: '2-digit', minute: '2-digit', day: '2-digit', month: '2-digit' });
      
      card.innerHTML = `
        <div style="color: var(--text-dark);">${n.mensaje}</div>
        <div style="font-size: 10px; color: var(--text-light); text-align: right;">${time}</div>
      `;
      container.appendChild(card);
    });
  } catch (err) {
    console.error('Failed to load notifications:', err);
    container.innerHTML = '<div style="color: var(--danger); text-align: center;">Error al cargar notificaciones.</div>';
  }
};

// Clear Advisor Notifications
window.clearNotifications = async function() {
  try {
    const res = await fetch(`${API_URL}/api/notificaciones/leido`, {
      method: 'POST',
      headers: getHeaders()
    });
    if (!res.ok) throw new Error('Failed to mark read');
    loadNotificationsFeed();
  } catch (err) {
    console.error(err);
  }
};

// Export Kardex to Excel (CSV)
function exportKardexToCSV() {
  if (!allMovements || allMovements.length === 0) {
    alert("No hay movimientos cargados para exportar.");
    return;
  }
  
  let csvContent = "\uFEFF"; // UTF-8 BOM
  csvContent += "Fecha,Tipo de Movimiento,Producto,Entradas,Salidas,Saldo Resultante,Referencia,Notas\n";
  
  allMovements.forEach(m => {
    const date = m.fecha_movimiento.slice(0, 16).replace('T', ' ');
    const type = `"${m.tipo_movimiento.replace(/"/g, '""')}"`;
    const prod = `"${m.producto_nombre.replace(/"/g, '""')}"`;
    const ent = m.cantidad_entrante || 0;
    const sal = m.cantidad_saliente || 0;
    const balance = m.existencias_resultantes || 0;
    const ref = `"${(m.referencia_factura || '').replace(/"/g, '""')}"`;
    const notes = `"${(m.notas || '').replace(/"/g, '""')}"`;
    csvContent += `${date},${type},${prod},${ent},${sal},${balance},${ref},${notes}\n`;
  });
  
  const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.setAttribute("href", url);
  link.setAttribute("download", `kardex_movimientos_${new Date().toISOString().slice(0, 10)}.csv`);
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
}

// Export Kardex to PDF (Printable Window)
function exportKardexToPDF() {
  if (!allMovements || allMovements.length === 0) {
    alert("No hay movimientos cargados para exportar.");
    return;
  }
  
  const printWindow = window.open('', '_blank');
  if (!printWindow) {
    alert("Por favor permite las ventanas emergentes (popups) para exportar a PDF.");
    return;
  }
  
  let rowsHtml = '';
  allMovements.forEach(m => {
    const date = m.fecha_movimiento.slice(0, 16).replace('T', ' ');
    const ent = m.cantidad_entrante > 0 ? m.cantidad_entrante.toLocaleString('es-MX', { minimumFractionDigits: 3 }) : '-';
    const sal = m.cantidad_saliente > 0 ? m.cantidad_saliente.toLocaleString('es-MX', { minimumFractionDigits: 3 }) : '-';
    rowsHtml += `
      <tr>
        <td>${date}</td>
        <td>${m.tipo_movimiento}</td>
        <td><strong>${m.producto_nombre}</strong></td>
        <td style="text-align: right;">${ent}</td>
        <td style="text-align: right;">${sal}</td>
        <td style="text-align: right;">${m.existencias_resultantes.toLocaleString('es-MX', { minimumFractionDigits: 3 })}</td>
      </tr>
    `;
  });
  
  printWindow.document.write(`
    <html>
      <head>
        <title>Kardex de Movimientos - AgriSales Pro</title>
        <style>
          body { font-family: 'Helvetica Neue', Helvetica, Arial, sans-serif; color: #333; padding: 20px; }
          .header { display: flex; justify-content: space-between; align-items: center; border-bottom: 2px solid #10b981; padding-bottom: 15px; margin-bottom: 25px; }
          .title { font-size: 24px; font-weight: bold; color: #10b981; }
          .subtitle { font-size: 14px; color: #666; }
          table { width: 100%; border-collapse: collapse; margin-top: 15px; }
          th { background-color: #f3f4f6; color: #374151; font-weight: 600; text-align: left; padding: 10px; border-bottom: 1px solid #d1d5db; font-size: 12px; }
          td { padding: 10px; border-bottom: 1px solid #e5e7eb; font-size: 12px; }
          tr:nth-child(even) { background-color: #fafafa; }
          .footer { text-align: center; margin-top: 30px; font-size: 10px; color: #999; border-top: 1px solid #eee; padding-top: 10px; }
        </style>
      </head>
      <body>
        <div class="header">
          <div>
            <div class="title">AgriSales Pro</div>
            <div class="subtitle">Reporte de Auditoría de Inventario (Kardex)</div>
          </div>
          <div style="text-align: right;">
            <div style="font-weight: 600; font-size: 12px;">Fecha de Impresión:</div>
            <div style="font-size: 12px; color: #666;">${new Date().toLocaleString()}</div>
          </div>
        </div>
        <table>
          <thead>
            <tr>
              <th>Fecha</th>
              <th>Movimiento</th>
              <th>Producto</th>
              <th style="text-align: right;">Entradas</th>
              <th style="text-align: right;">Salidas</th>
              <th style="text-align: right;">Saldo</th>
            </tr>
          </thead>
          <tbody>
            ${rowsHtml}
          </tbody>
        </table>
        <div class="footer">
          AgriSales Pro &copy; 2026 - Distribuidora Casas Grandes. Todos los derechos reservados.
        </div>
        <script>
          window.onload = function() {
            window.print();
            window.onafterprint = function() { window.close(); };
          }
        </script>
      </body>
    </html>
  `);
  printWindow.document.close();
}

// Bind Export buttons
document.addEventListener('DOMContentLoaded', () => {
  const csvBtn = document.getElementById('btn-export-kardex-csv');
  const pdfBtn = document.getElementById('btn-export-kardex-pdf');
  
  if (csvBtn) csvBtn.addEventListener('click', exportKardexToCSV);
  if (pdfBtn) pdfBtn.addEventListener('click', exportKardexToPDF);
});

// =============================================================
// AI AGENTS SEGUIMIENTO IA FRONTEND
// =============================================================
let activeIaTab = 'ceo';
let currentAgentsConfig = [];

async function loadIAViewData() {
  try {
    const res = await fetch('/api/agentes/config', {
      method: 'GET',
      headers: getHeaders()
    });
    if (!res.ok) throw new Error('Error al cargar configuraciones de agentes');
    
    const data = await res.json();
    currentAgentsConfig = data.configs;
    
    // Set Provider Selector
    const providerSelect = document.getElementById('ia-provider');
    if (providerSelect) {
      providerSelect.value = data.provider || 'gemini';
      toggleProviderUI(data.provider || 'gemini');
    }
    
    // Set API Keys and Model
    const geminiInput = document.getElementById('ia-gemini-key');
    if (geminiInput) {
      geminiInput.value = data.maskedGeminiKey || '';
    }

    const openrouterInput = document.getElementById('ia-openrouter-key');
    if (openrouterInput) {
      openrouterInput.value = data.maskedOpenRouterKey || '';
    }

    const modelInput = document.getElementById('ia-openrouter-model');
    if (modelInput) {
      modelInput.value = data.openrouterModel || 'google/gemini-2.5-flash';
    }
    
    // Set Switches and Prompts
    currentAgentsConfig.forEach(agent => {
      const switchEl = document.getElementById(`switch-agent-${agent.agente_id}`);
      const promptEl = document.getElementById(`prompt-${agent.agente_id}`);
      
      if (switchEl) {
        switchEl.checked = agent.activo === 1;
        // visual style for custom switch
        const handle = switchEl.nextElementSibling;
        if (handle) {
          if (agent.activo === 1) {
            handle.style.background = 'var(--primary)';
            handle.querySelector('.switch-handle').style.left = '23px';
          } else {
            handle.style.background = '#ccc';
            handle.querySelector('.switch-handle').style.left = '3px';
          }
        }
      }
      if (promptEl) {
        const c = JSON.parse(agent.configuracion || '{}');
        promptEl.value = c.prompt_adicional || '';
      }
    });
    
    // Initialize Tab if first time
    setupIATabs();
    
    // Load current active tab panel
    switchIAPanel(activeIaTab);

  } catch (err) {
    console.error(err);
    alert(err.message);
  }
}

function toggleProviderUI(provider) {
  const geminiContainer = document.getElementById('container-gemini-config');
  const openrouterContainer = document.getElementById('container-openrouter-config');
  
  if (provider === 'openrouter') {
    if (geminiContainer) geminiContainer.style.display = 'none';
    if (openrouterContainer) {
      openrouterContainer.style.display = 'grid';
      openrouterContainer.style.setProperty('display', 'grid', 'important');
    }
  } else {
    if (geminiContainer) geminiContainer.style.display = 'block';
    if (openrouterContainer) openrouterContainer.style.display = 'none';
  }
}

function setupIATabs() {
  const tabs = [
    { id: 'tab-ia-ceo', name: 'ceo' },
    { id: 'tab-ia-coordinador', name: 'coordinador' },
    { id: 'tab-ia-outreach', name: 'outreach' },
    { id: 'tab-ia-logs', name: 'logs' }
  ];
  
  tabs.forEach(tab => {
    const el = document.getElementById(tab.id);
    if (el) {
      // Avoid duplicate event listener bindings by overwriting or checking
      if (!el.dataset.bound) {
        el.addEventListener('click', (e) => {
          e.preventDefault();
          tabs.forEach(t => document.getElementById(t.id)?.classList.remove('active'));
          el.classList.add('active');
          switchIAPanel(tab.name);
        });
        el.dataset.bound = 'true';
      }
    }
  });
}

function switchIAPanel(tabName) {
  activeIaTab = tabName;
  
  // Hide all panels
  document.querySelectorAll('.ia-panel').forEach(p => p.style.display = 'none');
  
  // Show active panel
  const activePanel = document.getElementById(`panel-ia-${tabName}`);
  if (activePanel) activePanel.style.display = 'block';
  
  // Load data
  if (tabName === 'ceo') {
    loadCEOPanel();
  } else if (tabName === 'coordinador') {
    loadCoordinadorPanel();
  } else if (tabName === 'outreach') {
    loadOutreachPanel();
  } else if (tabName === 'logs') {
    loadIALogs();
  }
}

async function loadCEOPanel() {
  const container = document.getElementById('ceo-proposal-container');
  if (!container) return;
  
  // Populate the select dropdown for CEO cycle if it's empty
  const select = document.getElementById('ia-ceo-ciclo-select');
  if (select && select.children.length === 0 && allCycles.length > 0) {
    select.innerHTML = '';
    allCycles.forEach(c => {
      const opt = document.createElement('option');
      opt.value = c.id;
      opt.textContent = c.nombre;
      select.appendChild(opt);
    });
  }
  
  try {
    const res = await fetch('/api/agentes/ceo/propuesta', {
      method: 'GET',
      headers: getHeaders()
    });
    if (!res.ok) throw new Error('Error al cargar propuesta de metas');
    
    const proposal = await res.json();
    
    if (!proposal) {
      container.innerHTML = `
        <div class="card" style="text-align: center; padding: 40px; color: var(--text-light);">
          <p style="font-size: 16px; margin-bottom: 15px;">No hay propuestas de metas pendientes en este momento.</p>
          <p style="font-size: 13px;">Haz clic en el botón "Ejecutar CEO Agent" para analizar los datos del sistema y generar una propuesta de metas.</p>
        </div>
      `;
      return;
    }
    
    // Parse proposal.propuesta_markdown
    const mdHtml = simpleMarkdownToHtml(proposal.propuesta_markdown);
    
    let cycleNameStr = `PV ${new Date(proposal.creado_en).getFullYear()}`;
    if (proposal.ciclo_id) {
      const cyc = allCycles.find(c => String(c.id) === String(proposal.ciclo_id));
      if (cyc) cycleNameStr = cyc.nombre;
    }
    
    container.innerHTML = `
      <div class="card" style="margin-bottom: 20px; border-left: 4px solid var(--primary);">
        <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 20px; border-bottom: 1px solid var(--border); padding-bottom: 10px;">
          <div>
            <h4 style="margin: 0; font-size: 16px; color: var(--text);">Propuesta de Metas - Ciclo ${cycleNameStr}</h4>
            <small style="color: var(--text-light);">Generado el: ${new Date(proposal.creado_en).toLocaleString('es-MX')}</small>
          </div>
          <span class="badge badge-warning" style="background: rgba(243, 156, 18, 0.2); color: #f39c12; border: 1px solid rgba(243, 156, 18, 0.4); padding: 4px 10px; border-radius: 12px; font-size: 12px;">Pendiente de Aprobación</span>
        </div>
        <div class="markdown-content" style="line-height: 1.6; margin-bottom: 24px; font-size: 14px;">
          ${mdHtml}
        </div>
        <div style="display: flex; gap: 12px; justify-content: flex-end; border-top: 1px solid var(--border); padding-top: 16px;">
          <button id="btn-aplicar-metas-ceo" class="btn btn-primary" style="width: auto; padding: 10px 24px;" data-id="${proposal.id}">✓ Aprobar y Aplicar Metas</button>
        </div>
      </div>
    `;
    
    // Bind Apply Button
    document.getElementById('btn-aplicar-metas-ceo')?.addEventListener('click', async (e) => {
      const proposalId = e.target.getAttribute('data-id');
      e.target.disabled = true;
      e.target.innerText = 'Aplicando Metas...';
      
      try {
        const applyRes = await fetch('/api/agentes/ceo/aplicar', {
          method: 'POST',
          headers: getHeaders(),
          body: JSON.stringify({ propuesta_id: proposalId })
        });
        if (!applyRes.ok) throw new Error('Error al aplicar metas');
        
        alert('Las metas individuales han sido guardadas y aplicadas con éxito en el sistema.');
        loadCEOPanel();
      } catch (err) {
        alert(err.message);
        e.target.disabled = false;
        e.target.innerText = '✓ Aprobar y Aplicar Metas';
      }
    });

  } catch (err) {
    container.innerHTML = `<div class="card" style="padding: 20px; color: var(--danger); text-align: center;">${err.message}</div>`;
  }
}

async function loadCoordinadorPanel() {
  const container = document.getElementById('coordinador-followups-container');
  if (!container) return;
  
  try {
    const res = await fetch('/api/agentes/coordinador/seguimientos', {
      method: 'GET',
      headers: getHeaders()
    });
    if (!res.ok) throw new Error('Error al cargar seguimientos de agenda');
    
    const data = await res.json();
    const followUps = data.followUps || [];
    
    if (followUps.length === 0) {
      container.innerHTML = `
        <div class="card" style="text-align: center; padding: 40px; color: var(--text-light); grid-column: 1 / -1;">
          <p style="font-size: 16px;">No hay seguimientos generados recientemente.</p>
          <p style="font-size: 13px; margin-top: 8px;">Haz clic en "Ejecutar Coordinador Agent Ahora" para analizar las agendas y generar propuestas de contacto.</p>
        </div>
      `;
      return;
    }
    
    let html = '';
    followUps.forEach(f => {
      html += `
        <div class="card whatsapp-card" style="padding: 20px; display: flex; flex-direction: column; justify-content: space-between;">
          <div>
            <div style="display: flex; justify-content: space-between; align-items: flex-start; margin-bottom: 12px;">
              <div>
                <h4 style="margin: 0; font-size: 16px; color: var(--text);">${f.nombre}</h4>
                <small style="color: var(--text-light);">Teléfono: ${f.telefono || 'Sin registrar'}</small>
              </div>
              <span class="badge" style="background: rgba(231, 76, 60, 0.15); color: #e74c3c; padding: 2px 8px; border-radius: 10px; font-size: 11px;">
                ${f.pendientes_count} visitas pendientes
              </span>
            </div>
            <div style="background: rgba(255, 255, 255, 0.03); border: 1px solid var(--border); border-radius: var(--radius-sm); padding: 12px; font-style: italic; font-size: 13px; color: var(--text); line-height: 1.5; margin-bottom: 16px; white-space: pre-wrap;">
              "${f.mensaje}"
            </div>
          </div>
          <div style="display: flex; justify-content: flex-end;">
            <a href="${f.wa_url}" target="_blank" class="btn btn-success" style="width: auto; padding: 8px 16px; font-size: 13px; display: flex; align-items: center; gap: 6px; text-decoration: none; background: #2ecc71; color: #fff; border-radius: var(--radius-md);">
              🟢 Enviar por WhatsApp
            </a>
          </div>
        </div>
      `;
    });
    
    container.innerHTML = html;

  } catch (err) {
    container.innerHTML = `<div class="card" style="padding: 20px; color: var(--danger); text-align: center; grid-column: 1 / -1;">${err.message}</div>`;
  }
}

async function loadOutreachPanel() {
  const tbody = document.getElementById('outreach-quotes-tbody');
  if (!tbody) return;
  
  try {
    const res = await fetch('/api/cotizaciones', {
      method: 'GET',
      headers: getHeaders()
    });
    if (!res.ok) throw new Error('Error al cargar cotizaciones');
    
    const quotes = await res.json();
    
    // Filter quotes created by outreach agent (starts with OUT- in folio or generated by outreach in notes)
    const outreachQuotes = quotes.filter(q => 
      (q.folio_cotizacion && q.folio_cotizacion.startsWith('OUT-')) || 
      (q.notas && q.notas.includes('Outreach'))
    );
    
    if (outreachQuotes.length === 0) {
      tbody.innerHTML = `
        <tr>
          <td colspan="6" style="text-align: center; color: var(--text-light); padding: 30px;">
            No hay cotizaciones sugeridas por la IA en borrador en este momento.<br>
            <small>Haz clic en "Ejecutar Outreach Agent Ahora" para analizar agricultores y proponer cotizaciones.</small>
          </td>
        </tr>
      `;
      return;
    }
    
    let html = '';
    outreachQuotes.forEach(q => {
      html += `
        <tr>
          <td><a href="javascript:void(0)" onclick="showQuoteDetails('${q.id}')" style="color: var(--accent); font-weight: 700; text-decoration: none;">${q.folio_cotizacion}</a></td>
          <td>${q.cliente_nombre || q.cliente_id}</td>
          <td>${q.asesor_nombre || 'Sin asignar'}</td>
          <td style="text-align: right; font-weight: 600;">$${parseFloat(q.total_mxn).toLocaleString('es-MX', { minimumFractionDigits: 2 })} MXN</td>
          <td><span class="badge" style="background: rgba(52, 152, 219, 0.2); color: #3498db; padding: 2px 8px; border-radius: 10px; font-size: 11px;">${q.estatus}</span></td>
          <td style="display: flex; gap: 6px;">
            <button class="btn btn-primary" style="width: auto; padding: 4px 10px; font-size: 12px; margin: 0; background: var(--accent); border-color: var(--accent);" onclick="showQuoteDetails('${q.id}')">👁️ Ver Detalle</button>
            <button class="btn btn-secondary" style="width: auto; padding: 4px 10px; font-size: 12px; margin: 0;" onclick="viewQuoteInCRM('${q.id}')">📋 Ver en Kanban</button>
          </td>
        </tr>
      `;
    });
    
    tbody.innerHTML = html;

  } catch (err) {
    tbody.innerHTML = `<tr><td colspan="6" style="text-align: center; color: var(--danger);">${err.message}</td></tr>`;
  }
}

window.viewQuoteInCRM = function(quoteId) {
  // Switch to CRM View
  const crmTab = document.querySelector('.nav-links [data-target="crm-view"]');
  if (crmTab) crmTab.click();
  
  // Wait a bit for board render, then scroll to it and highlight it
  setTimeout(() => {
    const card = document.getElementById(`quote-card-${quoteId}`);
    if (card) {
      card.scrollIntoView({ behavior: 'smooth', block: 'center' });
      card.classList.add('highlight-pulse');
      setTimeout(() => {
        card.classList.remove('highlight-pulse');
      }, 3000);
    }
  }, 400);
}

async function loadIALogs() {
  const tbody = document.getElementById('ia-logs-tbody');
  if (!tbody) return;
  
  try {
    const res = await fetch('/api/agentes/logs', {
      method: 'GET',
      headers: getHeaders()
    });
    if (!res.ok) throw new Error('Error al cargar bitácora de agentes');
    
    const logs = await res.json();
    
    if (logs.length === 0) {
      tbody.innerHTML = `
        <tr>
          <td colspan="5" style="text-align: center; color: var(--text-light); padding: 30px;">No hay registros de eventos aún.</td>
        </tr>
      `;
      return;
    }
    
    let html = '';
    logs.forEach(l => {
      const dateStr = new Date(l.creado_en).toLocaleString('es-MX');
      let badgeClass = 'info';
      if (l.tipo_evento === 'success') badgeClass = 'success';
      if (l.tipo_evento === 'error') badgeClass = 'error';
      
      const agentNames = {
        'ceo': '🎯 CEO Agent',
        'coordinador': '💬 Coordinator Agent',
        'outreach': '📝 Outreach Agent'
      };
      
      // Detalle toggle
      const hasDetail = !!l.detalle;
      const detailBtn = hasDetail 
        ? `<button class="btn btn-secondary" style="width: auto; padding: 2px 8px; font-size: 11px;" onclick="toggleLogDetail(this)">Ver Detalle</button>`
        : '<span style="color: var(--text-light);">-</span>';
      
      html += `
        <tr>
          <td><strong>${agentNames[l.agente_id] || l.agente_id}</strong></td>
          <td style="white-space: nowrap;">${dateStr}</td>
          <td><span class="badge-log ${l.tipo_evento}">${l.tipo_evento.toUpperCase()}</span></td>
          <td>${l.mensaje}</td>
          <td>${detailBtn}</td>
        </tr>
        ${hasDetail ? `
          <tr class="log-detail-row" style="display: none; background: rgba(0,0,0,0.15);">
            <td colspan="5">
              <pre style="max-width: 100%; white-space: pre-wrap; font-family: monospace; font-size: 11px; padding: 12px; color: var(--text); overflow-x: auto; max-height: 200px;">${l.detalle}</pre>
            </td>
          </tr>
        ` : ''}
      `;
    });
    
    tbody.innerHTML = html;

  } catch (err) {
    tbody.innerHTML = `<tr><td colspan="5" style="text-align: center; color: var(--danger);">${err.message}</td></tr>`;
  }
}

function toggleLogDetail(btn) {
  const currentRow = btn.closest('tr');
  const detailRow = currentRow.nextElementSibling;
  if (detailRow && detailRow.classList.contains('log-detail-row')) {
    const isHidden = detailRow.style.display === 'none';
    detailRow.style.display = isHidden ? 'table-row' : 'none';
    btn.innerText = isHidden ? 'Ocultar Detalle' : 'Ver Detalle';
  }
}

// Simple Markdown parser for proposal presentation
function simpleMarkdownToHtml(md) {
  if (!md) return '';
  let html = md;
  
  // Headers
  html = html.replace(/^### (.*$)/gim, '<h5 style="margin-top: 12px; margin-bottom: 6px; font-size: 15px; font-weight: 600;">$1</h5>');
  html = html.replace(/^## (.*$)/gim, '<h4 style="margin-top: 16px; margin-bottom: 8px; font-size: 16px; font-weight: 700; border-bottom: 1px solid var(--border); padding-bottom: 4px;">$1</h4>');
  html = html.replace(/^# (.*$)/gim, '<h3 style="margin-top: 20px; margin-bottom: 10px; font-size: 18px; font-weight: 800;">$1</h3>');
  
  // Bold
  html = html.replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>');
  
  // Tables
  // Simple check if markdown table is present and replace it with a styled table
  const lines = html.split('\n');
  let inTable = false;
  let tableRows = [];
  let parsedLines = [];
  
  lines.forEach(line => {
    if (line.trim().startsWith('|')) {
      inTable = true;
      // skip separators
      if (!line.includes('---')) {
        const cells = line.split('|').map(c => c.trim()).filter((c, i, arr) => i > 0 && i < arr.length - 1);
        tableRows.push(cells);
      }
    } else {
      if (inTable) {
        // construct HTML table
        let tableHtml = '<table class="data-table" style="margin: 15px 0; font-size: 13px;"><thead><tr>';
        // Header row
        tableRows[0].forEach(cell => {
          tableHtml += `<th>${cell}</th>`;
        });
        tableHtml += '</tr></thead><tbody>';
        // Body rows
        for (let r = 1; r < tableRows.length; r++) {
          tableHtml += '<tr>';
          tableRows[r].forEach(cell => {
            tableHtml += `<td>${cell}</td>`;
          });
          tableHtml += '</tr>';
        }
        tableHtml += '</tbody></table>';
        parsedLines.push(tableHtml);
        inTable = false;
        tableRows = [];
      }
      parsedLines.push(line);
    }
  });
  
  html = parsedLines.join('\n');
  
  // Bullet lists
  html = html.replace(/^\s*\-\s*(.*$)/gim, '<li style="margin-left: 20px; list-style-type: disc;">$1</li>');
  
  // Paragraphs
  html = html.replace(/\n\n/g, '<br><br>');
  
  return html;
}

// Bind event listeners for the system config buttons
function bindIAViewEventListeners() {
  // Bind Provider dropdown change
  const providerSelect = document.getElementById('ia-provider');
  if (providerSelect) {
    providerSelect.addEventListener('change', (e) => {
      toggleProviderUI(e.target.value);
    });
  }

  // Save Config and Switches
  const saveBtn = document.getElementById('btn-save-ia-config');
  if (saveBtn) {
    saveBtn.addEventListener('click', async (e) => {
      e.preventDefault();
      saveBtn.disabled = true;
      saveBtn.innerText = 'Guardando...';
      
      const payload = {
        provider: document.getElementById('ia-provider').value,
        gemini_api_key: document.getElementById('ia-gemini-key').value,
        openrouter_api_key: document.getElementById('ia-openrouter-key').value,
        openrouter_model: document.getElementById('ia-openrouter-model').value,
        configs: [
          {
            agente_id: 'ceo',
            activo: document.getElementById('switch-agent-ceo').checked ? 1 : 0,
            configuracion: { prompt_adicional: document.getElementById('prompt-ceo').value }
          },
          {
            agente_id: 'coordinador',
            activo: document.getElementById('switch-agent-coordinador').checked ? 1 : 0,
            configuracion: { prompt_adicional: document.getElementById('prompt-coordinador').value }
          },
          {
            agente_id: 'outreach',
            activo: document.getElementById('switch-agent-outreach').checked ? 1 : 0,
            configuracion: { prompt_adicional: document.getElementById('prompt-outreach').value }
          }
        ]
      };
      
      try {
        const res = await fetch('/api/agentes/config', {
          method: 'POST',
          headers: getHeaders(),
          body: JSON.stringify(payload)
        });
        if (!res.ok) throw new Error('Error al guardar configuraciones');
        
        alert('Configuraciones e interruptores de agentes de IA actualizados correctamente.');
        loadIAViewData();
      } catch (err) {
        alert(err.message);
      } finally {
        saveBtn.disabled = false;
        saveBtn.innerText = 'Guardar Configuración';
      }
    });
  }

  // Toggle API Key visibility buttons
  document.querySelectorAll('.btn-toggle-key').forEach(btn => {
    btn.addEventListener('click', (e) => {
      e.preventDefault();
      const targetId = btn.getAttribute('data-target');
      const apiKeyInput = document.getElementById(targetId);
      if (apiKeyInput) {
        const isPassword = apiKeyInput.type === 'password';
        apiKeyInput.type = isPassword ? 'text' : 'password';
        btn.innerText = isPassword ? '🔒' : '👁️';
      }
    });
  });

  // Bind Switch visuals (custom switch click handle to check/uncheck checkbox)
  const switches = ['ceo', 'coordinador', 'outreach'];
  switches.forEach(sw => {
    const swEl = document.getElementById(`switch-agent-${sw}`);
    if (swEl) {
      swEl.addEventListener('change', () => {
        const handle = swEl.nextElementSibling;
        if (handle) {
          const isChecked = swEl.checked;
          handle.style.background = isChecked ? 'var(--primary)' : '#ccc';
          handle.querySelector('.switch-handle').style.left = isChecked ? '23px' : '3px';
        }
      });
    }
  });

  // Run CEO Agent Button
  const runCeoBtn = document.getElementById('btn-run-ceo');
  if (runCeoBtn) {
    runCeoBtn.addEventListener('click', async () => {
      const select = document.getElementById('ia-ceo-ciclo-select');
      const cicloId = select ? select.value : '';
      if (!cicloId) {
        alert('Por favor, seleccione un ciclo agrícola.');
        return;
      }
      
      runCeoBtn.disabled = true;
      runCeoBtn.innerText = '🤖 CEO Generando metas...';
      try {
        const res = await fetch('/api/agentes/ejecutar', {
          method: 'POST',
          headers: getHeaders(),
          body: JSON.stringify({ agente_id: 'ceo', ciclo_id: Number(cicloId) })
        });
        if (!res.ok) {
          const errData = await res.json();
          throw new Error(errData.error || 'Fallo en la ejecución');
        }
        alert('El CEO Agent completó el análisis de desempeño y ha generado una propuesta de metas.');
        loadCEOPanel();
      } catch (err) {
        alert(`Error al ejecutar CEO: ${err.message}`);
      } finally {
        runCeoBtn.disabled = false;
        runCeoBtn.innerText = '⚡ Ejecutar CEO Agent';
      }
    });
  }

  // Run Coordinator Agent Button
  const runCoordBtn = document.getElementById('btn-run-coordinador');
  if (runCoordBtn) {
    runCoordBtn.addEventListener('click', async () => {
      runCoordBtn.disabled = true;
      runCoordBtn.innerText = '🤖 Redactando mensajes...';
      try {
        const res = await fetch('/api/agentes/ejecutar', {
          method: 'POST',
          headers: getHeaders(),
          body: JSON.stringify({ agente_id: 'coordinador' })
        });
        if (!res.ok) {
          const errData = await res.json();
          throw new Error(errData.error || 'Fallo en la ejecución');
        }
        alert('El Coordinador Agent completó la revisión de la planeación y generó mensajes de WhatsApp.');
        loadCoordinadorPanel();
      } catch (err) {
        alert(`Error al ejecutar Coordinador: ${err.message}`);
      } finally {
        runCoordBtn.disabled = false;
        runCoordBtn.innerText = '⚡ Ejecutar Coordinador Agent Ahora';
      }
    });
  }

  // Run Outreach Agent Button
  const runOutreachBtn = document.getElementById('btn-run-outreach');
  if (runOutreachBtn) {
    runOutreachBtn.addEventListener('click', async () => {
      runOutreachBtn.disabled = true;
      runOutreachBtn.innerText = '🤖 Creando cotizaciones...';
      try {
        const res = await fetch('/api/agentes/ejecutar', {
          method: 'POST',
          headers: getHeaders(),
          body: JSON.stringify({ agente_id: 'outreach' })
        });
        if (!res.ok) {
          const errData = await res.json();
          throw new Error(errData.error || 'Fallo en la ejecución');
        }
        alert('El Outreach Agent analizó los patrones históricos y generó cotizaciones borrador automáticas.');
        loadOutreachPanel();
      } catch (err) {
        alert(`Error al ejecutar Outreach: ${err.message}`);
      } finally {
        runOutreachBtn.disabled = false;
        runOutreachBtn.innerText = '⚡ Ejecutar Outreach Agent Ahora';
      }
    });
  }

  // Refresh Logs Button
  const refreshLogsBtn = document.getElementById('btn-refresh-logs');
  if (refreshLogsBtn) {
    refreshLogsBtn.addEventListener('click', () => {
      loadIALogs();
    });
  }
}
