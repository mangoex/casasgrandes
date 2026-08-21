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
      let errorMessage = '';
      try {
        errorMessage = (await response.clone().json()).error || '';
      } catch {
        // A non-JSON failure must not be treated as an expired session.
      }

      const invalidSession = ['Access token required', 'Invalid or expired token'].includes(errorMessage);
      if (!urlStr.includes('/api/auth/login') && invalidSession) {
        console.warn('Session expired or invalid. Redirecting to login...', urlStr);
        token = null;
        user = null;
        localStorage.removeItem('token');
        localStorage.removeItem('user');
        showLoginView();
      }
    }
    return response;
  } catch (error) {
    throw error;
  }
};

let activeClientId = null;
let quoteItemsCount = 0;
let allQuotes = [];
let allProspects = [];
let activeProspectId = null;
let activePlanningQuoteContext = null;
let preserveProspectQuoteContext = false;
let selectedCreditAttachmentFile = null;
let allClients = [];
let selectedKanbanQuoteIds = new Set();
let lastRenderedKanbanQuotes = [];
let allProducts = [];
let allSeasons = [];
let currentPlanList = [];
let currentCycleMetaMxn = 0;
let currentCycleMetaBags = 0;
let allMovements = [];
let allWarehouseStocks = [];
let warehouseMovementFormCollapsed = false;
let stageReportFormEventsBound = false;

// On Page Load
document.addEventListener('DOMContentLoaded', () => {
  initApp();
  setupPlanningSelectionListeners();
  setupKanbanDeleteShortcut();
  bindIAViewEventListeners();
  bindProgramacionEventListeners();
  bindStageReportFormEvents();
});

function setupKanbanDeleteShortcut() {
  document.addEventListener('keydown', (e) => {
    const activeEl = document.activeElement;
    const isTextInput = activeEl?.tagName === 'INPUT' && !['checkbox', 'radio', 'button'].includes(activeEl.type);
    const isEditing = activeEl && (
      isTextInput ||
      activeEl.tagName === 'TEXTAREA' ||
      activeEl.tagName === 'SELECT' ||
      activeEl.isContentEditable
    );

    if (isEditing || !['Delete', 'Backspace'].includes(e.key)) return;
    const activeView = document.querySelector('.view-section.active');
    if (!activeView || activeView.id !== 'crm-view' || selectedKanbanQuoteIds.size === 0) return;

    e.preventDefault();
    deleteSelectedKanbanQuotes();
  });
}

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

  document.body.classList.toggle('role-asesor', user.nivel_rol === 'Asesor');
  const greetingEl = document.getElementById('mobile-greeting-name');
  if (greetingEl) {
    greetingEl.textContent = user.nombre ? `¡Buenos días, ${user.nombre.split(' ')[0]}!` : '¡Buenos días!';
  }
  const initialsEl = document.getElementById('mobile-user-initials');
  if (initialsEl) {
    initialsEl.textContent = (user.nombre || 'Asesor')
      .trim()
      .split(/\s+/)
      .slice(0, 2)
      .map(part => part[0])
      .join('')
      .toUpperCase();
  }
  document.body.classList.toggle(
    'mobile-dashboard-active',
    user.nivel_rol === 'Asesor' && document.getElementById('dashboard-view')?.classList.contains('active')
  );
  
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

  updateWarehouseMovementLayout();
  
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
      if (item.dataset.mobileAction === 'menu') {
        document.querySelector('aside')?.classList.add('active');
        document.getElementById('sidebar-backdrop')?.classList.add('active');
        return;
      }
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
        'planeacion-view': 'Agenda de Visitas',
        'clientes-view': 'Mis Agricultores',
        'cotizador-view': 'Cotizador',
        'crm-view': 'Canal de Ventas',
        'comisiones-view': 'Módulo de Comisiones',
        'catalog-view': 'Catálogo de Productos'
      };
      
      switchView(target, titles[target] || 'AgriSales Pro');
    });
  });

  document.getElementById('mobile-quote-more')?.addEventListener('click', () => {
    document.querySelector('aside')?.classList.add('active');
    document.getElementById('sidebar-backdrop')?.classList.add('active');
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

  if (viewId === 'programacion-view' && !['Administrador', 'Coordinador'].includes(user?.nivel_rol)) {
    return;
  }
  
  if (!title) {
    const defaultTitles = {
      'dashboard-view': 'Tablero General',
      'clientes-view': 'Catálogo de Clientes / Agricultores',
      'cotizador-view': 'Cotizador de Productos',
      'catalog-view': 'Catálogo de Semillas e Insumos'
    };
    title = defaultTitles[viewId] || 'AgriSales Pro';
  }
  
  document.getElementById('view-title').textContent = title;
  
  const sections = document.querySelectorAll('.view-section');
  sections.forEach(sec => sec.classList.remove('active'));
  
  const targetEl = document.getElementById(viewId);
  if (targetEl) targetEl.classList.add('active');
  document.body.classList.toggle(
    'mobile-dashboard-active',
    user?.nivel_rol === 'Asesor' && viewId === 'dashboard-view'
  );
  document.body.classList.toggle(
    'mobile-quote-active',
    user?.nivel_rol === 'Asesor' && viewId === 'cotizador-view'
  );
  
  // Sync mobile bottom nav items active state
  document.querySelectorAll('.mobile-nav-item').forEach(item => {
    item.classList.toggle('active', item.getAttribute('data-target') === viewId);
  });
  
  // Refresh specific views data
  if (viewId === 'dashboard-view') {
    loadDashboardData();
  } else if (viewId === 'crm-view') {
    loadCRMBoardData();
  } else if (viewId === 'clientes-view') {
    loadClientesCatalog();
  } else if (viewId === 'cotizador-view') {
    if (!preserveProspectQuoteContext) {
      activeProspectId = null;
      activePlanningQuoteContext = null;
    }
    loadCotizadorConfig();
  } else if (viewId === 'comisiones-view') {
    loadComisionesView();
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
  } else if (viewId === 'programacion-view') {
    loadProgramacionView();
  }
}

function openMobileAgenda() {
  switchView('planeacion-view', 'Mi agenda');
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
    
    const contentType = res.headers.get('content-type') || '';
    const data = contentType.includes('application/json')
      ? await res.json()
      : { error: 'El servidor está respondiendo temporalmente de forma inesperada. Espera unos segundos y vuelve a intentar.' };
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

    // Populate Asesor Mobile Dashboard metrics
    if (document.getElementById('mobile-sales-real')) {
      const salesVal = Number(stats.total_sales_mxn) || 0.0;
      const targetVal = 10000;
      document.getElementById('mobile-sales-real').textContent = `$${salesVal.toLocaleString('es-MX', { maximumFractionDigits: 0 })} vendido`;
      const targetEl = document.getElementById('mobile-sales-target');
      if (targetEl) targetEl.textContent = `$${targetVal.toLocaleString('es-MX')}`;
      const pct = Math.min(Math.round((salesVal / targetVal) * 100), 100);
      const percentageEl = document.getElementById('mobile-sales-percentage');
      if (percentageEl) percentageEl.textContent = `${pct}%`;
    }
    if (document.getElementById('mobile-orders-count')) {
      let ordersCount = 0;
      if (Array.isArray(stats.advisers_performance)) {
        const adv = stats.advisers_performance.find(a => a.id === user.id);
        if (adv) ordersCount = Number(adv.quote_count) || 0;
      }
      document.getElementById('mobile-orders-count').textContent = ordersCount;
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
          <tr style="cursor: pointer;" onclick="showQuoteDetails(${q.id})">
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

      const mobileDateEl = document.getElementById('mobile-dashboard-date');
      if (mobileDateEl) {
        mobileDateEl.textContent = new Intl.DateTimeFormat('es-MX', {
          weekday: 'long',
          day: 'numeric',
          month: 'long'
        }).format(new Date());
        mobileDateEl.textContent = mobileDateEl.textContent.charAt(0).toUpperCase() + mobileDateEl.textContent.slice(1);
      }

      const pendingPlans = weeklyPlans
        .filter(plan => Number(plan.realizada) === 0)
        .sort((a, b) => String(a.fecha_programada).localeCompare(String(b.fecha_programada)));
      const nextPlan = pendingPlans[0];
      const nextVisitClient = document.getElementById('mobile-next-visit-client');
      const nextVisitDetail = document.getElementById('mobile-next-visit-detail');
      const nextVisitDate = document.getElementById('mobile-next-visit-date');
      const nextVisitAction = document.getElementById('mobile-next-visit-action');

      if (nextPlan) {
        if (nextVisitClient) nextVisitClient.textContent = nextPlan.cliente_nombre || 'Visita programada';
        if (nextVisitDetail) nextVisitDetail.textContent = nextPlan.objetivo_visita || 'Seguimiento comercial';
        if (nextVisitDate) {
          const nextDate = new Date(`${nextPlan.fecha_programada}T00:00:00`);
          const todayIso = new Date().toISOString().slice(0, 10);
          nextVisitDate.textContent = nextPlan.fecha_programada === todayIso
            ? 'Hoy'
            : new Intl.DateTimeFormat('es-MX', { day: 'numeric', month: 'short' }).format(nextDate);
        }
        if (nextVisitAction) nextVisitAction.querySelector('span').textContent = 'Iniciar visita';
      } else {
        if (nextVisitClient) nextVisitClient.textContent = 'Sin visitas pendientes';
        if (nextVisitDetail) nextVisitDetail.textContent = 'Tu agenda está libre por ahora';
        if (nextVisitDate) nextVisitDate.textContent = 'Libre';
        if (nextVisitAction) nextVisitAction.querySelector('span').textContent = 'Abrir agenda';
      }
      
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
          // Calculate compliance percentage: (visitas realizadas / total de visitas programadas)
          const planCompleted = Number(adv.plan_completed || 0);
          const planTotal = Number(adv.plan_total || 0);

          let compliance = 0;
          if (planTotal > 0) {
            compliance = Math.round((planCompleted / planTotal) * 100);
          } else {
            compliance = 0; // Sin visitas programadas en agenda -> 0%
          }

          let complianceLabel = `${compliance}%`;
          let complianceClass = 'badge-secondary';
          if (planTotal > 0) {
            if (compliance >= 80) complianceClass = 'badge-success';
            else if (compliance >= 50) complianceClass = 'badge-warning';
            else complianceClass = 'badge-danger';
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
  if (user?.nivel_rol !== 'Administrador') {
    alert('Solo un administrador puede mover cotizaciones en el canal de ventas.');
    return;
  }
  
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
  if (user?.nivel_rol !== 'Administrador') {
    alert('Solo un administrador puede mover cotizaciones en el canal de ventas.');
    return;
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
const btnOpenClientModal = document.getElementById('btn-open-client-modal');
if (btnOpenClientModal) {
  btnOpenClientModal.addEventListener('click', () => {
    document.getElementById('client-modal-title').textContent = 'Registrar Nuevo Cliente';
    document.getElementById('client-form-id').value = '';
    document.getElementById('client-submit-btn').textContent = 'Registrar Cliente';
    document.getElementById('add-client-form').reset();
    loadCRMClientFormConfig();
    openModal('add-client-modal');
  });
}

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
    
    const [qRes, pRes] = await Promise.all([
      fetch(`${API_URL}/api/cotizaciones`, { headers: getHeaders() }),
      fetch(`${API_URL}/api/prospectos`, { headers: getHeaders() })
    ]);
    allQuotes = await qRes.json();
    allProspects = await pRes.json();
    if (!qRes.ok || !pRes.ok || !Array.isArray(allQuotes) || !Array.isArray(allProspects)) {
      throw new Error('No fue posible cargar el canal de ventas');
    }
    
    if (user.nivel_rol === 'Administrador' || user.nivel_rol === 'Coordinador') {
      await loadKanbanAdvisorOptions();
    }
    
    filterAndRenderKanban();
  } catch (err) {
    console.error('Failed to load Sales Pipeline Board:', err);
  }
}

function renderKanbanBoard(quotesList, prospectsList = []) {
  lastRenderedKanbanQuotes = quotesList;
  selectedKanbanQuoteIds = new Set(
    [...selectedKanbanQuoteIds].filter(id => quotesList.some(q => Number(q.id) === Number(id)))
  );

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
    if (status === 'Cancelado') return; // Hide canceled quotes from board

    const pendingAuthorization = ['Borrador', 'Pendiente', 'Pendiente Autorización'].includes(status);
    if (pendingAuthorization) {
      const col = columns.Borrador;
      col.count++;
      const card = document.createElement('div');
      card.className = 'kanban-card';
      card.style.cursor = 'pointer';
      card.style.borderLeft = '4px solid var(--warning)';
      card.addEventListener('click', () => showQuoteDetails(q.id));
      const itemsSummary = (q.items || [])
        .map(item => `${item.producto_nombre.split(' ')[0]} (x${item.cantidad_ordenada || item.cantidad || 0})`)
        .join(', ') || 'Sin productos';
      card.innerHTML = `
        <div class="kanban-card-title"><span>${escapeHtml(q.cliente_nombre)}</span></div>
        <div class="kanban-card-desc">${escapeHtml(itemsSummary)}</div>
        <div style="font-size:11px; color:var(--text-light); font-weight:500;">Folio: ${escapeHtml(q.folio_cotizacion || '-')}</div>
        <div class="kanban-card-meta">
          <span style="font-size:11px; color:var(--text-light);">👤 ${escapeHtml((q.asesor_nombre || '').split(' ')[0])}</span>
          <span class="kanban-card-price">$${Number(q.total_mxn || 0).toLocaleString('es-MX', { maximumFractionDigits: 0 })}</span>
        </div>
        <div style="margin-top:8px;"><span class="badge badge-warning">Pendiente de autorización</span></div>
      `;
      col.el.appendChild(card);
      return;
    }
    
    const col = columns[status];
    if (!col) return;
    
    col.count++;
    
    // Create card element
    const card = document.createElement('div');
    card.className = 'kanban-card';
    card.id = `quote-card-${q.id}`;
    card.draggable = user?.nivel_rol === 'Administrador';
    if (card.draggable) card.addEventListener('dragstart', (e) => drag(e, q.id));
    
    // single click to view detail modal (ignoring buttons)
    card.addEventListener('click', (e) => {
      if (e.target.closest('.kanban-arrow-btn') || e.target.closest('button') || e.target.closest('input')) {
        return;
      }
      showQuoteDetails(q.id);
    });
    
    // Build items summary label
    const itemsSummary = q.items.map(i => `${i.producto_nombre.split(' ')[0]} (x${i.cantidad_ordenada || i.cantidad || 0})`).join(', ') || 'Sin productos';
    
    const prevLabels = {
      'Vendido': 'Cotizado',
      'Entregado': 'Cobrado'
    };
    const nextLabels = {
      'Autorizada': 'Cobrado',
      'Vendido': 'Entregado'
    };
    
    const prevLabel = prevLabels[status] || '';
    const nextLabel = nextLabels[status] || '';
    const isSelected = selectedKanbanQuoteIds.has(Number(q.id));
    
    card.innerHTML = `
      <div class="kanban-card-title">
        <span>${q.cliente_nombre}</span>
        <input type="checkbox" class="kanban-card-select" ${isSelected ? 'checked' : ''} title="Seleccionar cotización" aria-label="Seleccionar cotización" onchange="toggleKanbanQuoteSelection(${q.id}, this.checked, event)">
      </div>
      <div class="kanban-card-desc">${itemsSummary}</div>
      <div style="font-size:11px; color:var(--text-light); font-weight: 500;">Folio: ${q.folio_cotizacion}</div>
      <div class="kanban-card-meta">
        <span style="font-size: 11px; color: var(--text-light);">👤 ${q.asesor_nombre.split(' ')[0]}</span>
        <span class="kanban-card-price">$${q.total_mxn.toLocaleString('es-MX', { maximumFractionDigits: 0 })}</span>
      </div>
      <div class="kanban-card-mobile-arrows">
        ${user?.nivel_rol === 'Administrador' && status !== 'Autorizada' ? `<button class="kanban-arrow-btn prev-stage" onclick="moveQuoteStatus(${q.id}, '${status}', 'up', event)">▲ ${prevLabel}</button>` : ''}
        ${user?.nivel_rol === 'Administrador' && status !== 'Entregado' ? `<button class="kanban-arrow-btn next-stage" onclick="moveQuoteStatus(${q.id}, '${status}', 'down', event)">▼ ${nextLabel}</button>` : ''}
      </div>
    `;
    
    col.el.appendChild(card);
  });

  const prospectColumn = columns.Borrador;
  prospectsList.forEach(prospect => {
    prospectColumn.count++;
    const card = document.createElement('div');
    card.className = 'kanban-card';
    card.style.cursor = 'pointer';
    card.style.borderLeft = '4px solid var(--info)';
    card.addEventListener('click', () => openProspectInCotizador(prospect.id));
    card.innerHTML = `
      <div class="kanban-card-title"><span>${escapeHtml(prospect.cliente_nombre)}</span></div>
      <div class="kanban-card-desc">Prospecto sin cotización</div>
      <div style="font-size:11px; color:var(--text-light); font-weight: 500;">Origen: visita de campo</div>
      <div class="kanban-card-meta">
        <span style="font-size: 11px; color: var(--text-light);">👤 ${escapeHtml((prospect.asesor_nombre || '').split(' ')[0])}</span>
        <span class="badge badge-info">Prospecto</span>
      </div>
    `;
    prospectColumn.el.appendChild(card);
  });
  
  // Render count badges
  Object.keys(columns).forEach(k => {
    columns[k].countEl.textContent = columns[k].count;
  });
  updateKanbanSelectionControls();
}

function getVisibleKanbanQuotesByStatus(status) {
  return lastRenderedKanbanQuotes.filter(q => {
    let quoteStatus = q.estatus;
    if (quoteStatus === 'Borrador' || quoteStatus === 'Pendiente' || quoteStatus === 'Pendiente Autorización') return false;
    return quoteStatus === status;
  });
}

function getSelectedKanbanQuotes(status = null) {
  const visible = status ? getVisibleKanbanQuotesByStatus(status) : lastRenderedKanbanQuotes;
  return visible.filter(q => selectedKanbanQuoteIds.has(Number(q.id)));
}

function updateKanbanSelectionControls() {
  const columnConfig = {
    Autorizada: 'cotizado',
    Vendido: 'cobrado',
    Entregado: 'entregado'
  };

  Object.entries(columnConfig).forEach(([status, key]) => {
    const checkbox = document.getElementById(`kanban-select-all-${key}`);
    const deleteBtn = document.querySelector(`#col-${key} .kanban-delete-selected`);
    const visible = getVisibleKanbanQuotesByStatus(status);
    const selectedCount = visible.filter(q => selectedKanbanQuoteIds.has(Number(q.id))).length;

    if (checkbox) {
      checkbox.checked = visible.length > 0 && selectedCount === visible.length;
      checkbox.indeterminate = selectedCount > 0 && selectedCount < visible.length;
      checkbox.disabled = visible.length === 0;
    }

    if (deleteBtn) {
      deleteBtn.disabled = selectedCount === 0;
      deleteBtn.dataset.count = selectedCount;
    }
  });
}

window.toggleKanbanQuoteSelection = function(quoteId, checked, event) {
  if (event) event.stopPropagation();
  const numericId = Number(quoteId);
  if (checked) {
    selectedKanbanQuoteIds.add(numericId);
  } else {
    selectedKanbanQuoteIds.delete(numericId);
  }
  updateKanbanSelectionControls();
};

window.toggleKanbanColumnSelection = function(status, checked) {
  getVisibleKanbanQuotesByStatus(status).forEach(q => {
    const id = Number(q.id);
    if (checked) {
      selectedKanbanQuoteIds.add(id);
    } else {
      selectedKanbanQuoteIds.delete(id);
    }
  });
  renderKanbanBoard(lastRenderedKanbanQuotes);
};

window.deleteSelectedKanbanQuotes = async function(status = null) {
  const selectedQuotes = getSelectedKanbanQuotes(status);
  if (selectedQuotes.length === 0) return;

  const confirmed = confirm(`¿Borrar ${selectedQuotes.length} cotización${selectedQuotes.length === 1 ? '' : 'es'} seleccionada${selectedQuotes.length === 1 ? '' : 's'}?\n\nEsta acción no se puede deshacer y revertirá cualquier inventario afectado.`);
  if (!confirmed) return;

  try {
    for (const quote of selectedQuotes) {
      const res = await fetch(`${API_URL}/api/cotizaciones/${quote.id}`, {
        method: 'DELETE',
        headers: getHeaders()
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || `No se pudo borrar ${quote.folio_cotizacion}`);
      selectedKanbanQuoteIds.delete(Number(quote.id));
    }

    await loadCRMBoardData();
    alert(`${selectedQuotes.length} cotización${selectedQuotes.length === 1 ? '' : 'es'} borrada${selectedQuotes.length === 1 ? '' : 's'} con éxito.`);
  } catch (err) {
    alert(err.message);
    await loadCRMBoardData();
  }
};

// Unified Kanban Filter & Render
window.filterAndRenderKanban = function() {
  const searchInput = document.getElementById('kanban-search');
  const advisorSelect = document.getElementById('kanban-advisor-filter');
  
  const term = searchInput ? searchInput.value.toLowerCase().trim() : '';
  const advisorId = advisorSelect ? advisorSelect.value : 'ALL';
  
  let filtered = allQuotes;
  let filteredProspects = allProspects;
  
  if (advisorId && advisorId !== 'ALL') {
    filtered = filtered.filter(q => q.asesor_id === Number(advisorId));
    filteredProspects = filteredProspects.filter(p => p.asesor_id === Number(advisorId));
  }
  
  if (term) {
    filtered = filtered.filter(q => 
      q.cliente_nombre.toLowerCase().includes(term) ||
      q.folio_cotizacion.toLowerCase().includes(term) ||
      q.asesor_nombre.toLowerCase().includes(term) ||
      q.items.some(i => i.producto_nombre.toLowerCase().includes(term))
    );
    filteredProspects = filteredProspects.filter(p =>
      p.cliente_nombre.toLowerCase().includes(term) ||
      p.asesor_nombre.toLowerCase().includes(term)
    );
  }
  
  renderKanbanBoard(filtered, filteredProspects);
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
        const tamanoBadge = item.tamano ? `<br><span style="font-size: 11px; color: #0284c7; font-weight: 600;">Tamaño: ${escapeHtml(item.tamano)}</span>` : '';
        productsBody.innerHTML += `
          <tr>
            <td style="padding: 8px; border-bottom: 1px solid var(--border);">${escapeHtml(item.producto_nombre || '')}${tamanoBadge}</td>
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
    const isBorrador = quote.estatus === 'Borrador' || quote.estatus === 'Pendiente Autorización' || quote.estatus === 'Pendiente';
    const hasAdminOrCoordPermission = user.nivel_rol === 'Administrador' || user.nivel_rol === 'Coordinador';
    const hasAdminAuthorizationPermission = user.nivel_rol === 'Administrador';
    const isOwner = quote.asesor_id === user.id;

    // Only an administrator can authorize a pending quotation.
    const authBtn = document.getElementById('btn-authorize-quote');
    if (isBorrador && hasAdminAuthorizationPermission) {
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
    
    // Match season - force to 'Temporada (Precio Lleno)'
    const defaultSeason = allSeasons.find(s => s.actividad === 'Temporada (Precio Lleno)');
    if (defaultSeason) {
      seasonSelect.value = defaultSeason.id;
    } else {
      const firstDetail = activeQuote.items && activeQuote.items[0];
      if (firstDetail && firstDetail.temporada_id) {
        seasonSelect.value = firstDetail.temporada_id;
      }
    }
    
    // Populate product rows
    const container = document.getElementById('edit-quote-items-container');
    container.innerHTML = '';
    editQuoteItemsCount = 0;
    
    if (activeQuote.items && activeQuote.items.length > 0) {
      activeQuote.items.forEach(item => {
        addEditQuoteItemRow(item.producto_id, item.cantidad_ordenada || item.cantidad || 0, item.tamano || '');
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

window.addEditQuoteItemRow = function(prodId = '', qty = 1, tamano = '') {
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

  const selectedProd = (allProducts || []).find(p => p.id === Number(prodId));
  const sizes = getSizesForProduct(selectedProd);
  const showTamano = sizes.length > 0;
  let tamanoOptions = '<option value="">-- Tamaño --</option>';
  sizes.forEach(s => {
    tamanoOptions += `<option value="${escapeAttribute(s)}" ${s === tamano ? 'selected' : ''}>${escapeHtml(s)}</option>`;
  });
  
  div.innerHTML = `
    <div style="flex: 2;">
      <select class="form-input edit-item-product-select" style="margin-bottom:0;" required>${options}</select>
    </div>
    <div class="edit-item-tamano-group" style="flex: 1; ${showTamano ? '' : 'display: none;'}">
      <select class="form-input edit-item-tamano-select" style="margin-bottom:0;">${tamanoOptions}</select>
    </div>
    <div style="width: 100px;">
      <input type="number" class="form-input edit-item-qty-input" style="margin-bottom:0;" min="1" value="${qty}" required oninput="recalculateEditQuoteTotal()">
    </div>
    <div>
      <button type="button" class="btn btn-secondary" style="margin:0; padding: 10px; background: rgba(231, 76, 60, 0.1); color: #e74c3c; border-color: rgba(231, 76, 60, 0.2);" onclick="removeEditQuoteItemRow(${editQuoteItemsCount})">🗑️</button>
    </div>
  `;
  container.appendChild(div);

  const prodSelect = div.querySelector('.edit-item-product-select');
  const tamanoGroup = div.querySelector('.edit-item-tamano-group');
  const tamanoSelect = div.querySelector('.edit-item-tamano-select');

  prodSelect.addEventListener('change', () => {
    const pId = Number(prodSelect.value);
    const pObj = (allProducts || []).find(p => p.id === pId);
    const pSizes = getSizesForProduct(pObj);
    if (pSizes.length > 0) {
      tamanoGroup.style.display = '';
      tamanoSelect.innerHTML = '<option value="">-- Tamaño --</option>' + pSizes.map(s => `<option value="${escapeAttribute(s)}">${escapeHtml(s)}</option>`).join('');
    } else {
      tamanoGroup.style.display = 'none';
      tamanoSelect.innerHTML = '<option value="">-- Tamaño --</option>';
      tamanoSelect.value = '';
    }
    recalculateEditQuoteTotal();
  });
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
    const tamanoSelect = r.querySelector('.edit-item-tamano-select');
    const qtyInput = r.querySelector('.edit-item-qty-input');
    
    if (prodSelect && prodSelect.value) {
      items.push({
        producto_id: Number(prodSelect.value),
        cantidad: Number(qtyInput.value) || 1,
        tamano: (tamanoSelect && tamanoSelect.value) ? tamanoSelect.value.trim() : null
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
    const tamanoSelect = r.querySelector('.edit-item-tamano-select');
    const qtyInput = r.querySelector('.edit-item-qty-input');
    
    if (prodSelect && prodSelect.value) {
      items.push({
        producto_id: Number(prodSelect.value),
        cantidad: Number(qtyInput.value) || 1,
        tamano: (tamanoSelect && tamanoSelect.value) ? tamanoSelect.value.trim() : null
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
      const nextDateStr = v.proxima_cita ? `<span class="visita-next">🗓️ Próxima Cita: ${escapeHtml(v.proxima_cita)}</span>` : '';
      const dateLabel = v.fecha_reporte || v.fecha_visita || '-';
      let contentHtml = '';

      if (v.tipo === 'reporte_etapa') {
        let parsedResponses = {};
        try {
          parsedResponses = typeof v.respuestas === 'string' ? JSON.parse(v.respuestas) : (v.respuestas || {});
        } catch {
          parsedResponses = {};
        }
        const stageLabel = v.etapa_clave ? `Etapa ${escapeHtml(v.etapa_clave)}` : 'Reporte de etapa';
        const details = [];
        if (parsedResponses.anomalia) details.push(`<div><strong>Anomalía:</strong> ${escapeHtml(parsedResponses.anomalia)}</div>`);
        if (parsedResponses.descripcion_situacion) details.push(`<div><strong>Situación:</strong> ${escapeHtml(parsedResponses.descripcion_situacion)}</div>`);
        if (parsedResponses.comentarios_productor) details.push(`<div><strong>Comentarios:</strong> ${escapeHtml(parsedResponses.comentarios_productor)}</div>`);
        if (parsedResponses.hibrido_material) details.push(`<div><strong>Híbrido/material:</strong> ${escapeHtml(parsedResponses.hibrido_material)}</div>`);
        if (parsedResponses.rendimiento) details.push(`<div><strong>Rendimiento:</strong> ${escapeHtml(parsedResponses.rendimiento)}</div>`);
        if (parsedResponses.hectareaje) details.push(`<div><strong>Hectareaje:</strong> ${escapeHtml(parsedResponses.hectareaje)}</div>`);
        contentHtml = `<div><strong>${stageLabel}</strong></div>${details.join('')}`;
      } else {
        contentHtml = escapeHtml(v.comentarios_bitacora || '');
      }

      container.innerHTML += `
        <div class="visita-card">
          <div class="visita-header">
            <span>👤 ${escapeHtml(v.asesor_nombre || '')}</span>
            <span>📅 ${escapeHtml(dateLabel)}</span>
          </div>
          <div class="visita-content">${contentHtml}</div>
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
    builderContainer.removeEventListener('focusin', handleQuoteQuantityFocus);
    builderContainer.removeEventListener('focusout', handleQuoteQuantityBlur);
    
    builderContainer.addEventListener('input', debouncedLiveCalculation);
    builderContainer.addEventListener('change', debouncedLiveCalculation);
    builderContainer.addEventListener('focusin', handleQuoteQuantityFocus);
    builderContainer.addEventListener('focusout', handleQuoteQuantityBlur);
  }
}

function setQuoteQuantity(input, quantity) {
  if (!input) return;
  const normalizedQuantity = Math.max(1, Math.floor(Number(quantity) || 1));
  input.value = String(normalizedQuantity);
  input.dispatchEvent(new Event('input', { bubbles: true }));
  input.dispatchEvent(new Event('change', { bubbles: true }));
}

function changeQuoteQuantity(button, delta) {
  const wrapper = button.closest('.item-row-wrapper');
  const input = wrapper?.querySelector('.item-qty-input');
  if (!input) return;
  const currentQuantity = Number.isFinite(input.valueAsNumber) ? input.valueAsNumber : 1;
  setQuoteQuantity(input, currentQuantity + delta);
}

function handleQuoteQuantityFocus(event) {
  const input = event.target.closest('.item-qty-input');
  if (!input || !window.matchMedia('(max-width: 768px)').matches) return;
  window.setTimeout(() => input.select(), 0);
}

function handleQuoteQuantityBlur(event) {
  const input = event.target.closest('.item-qty-input');
  if (!input) return;
  setQuoteQuantity(input, input.valueAsNumber);
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
    
    // Auto-default to 'Temporada (Precio Lleno)' since campaign select is hidden
    const defaultSeason = allSeasons.find(s => s.actividad === 'Temporada (Precio Lleno)');
    if (defaultSeason) {
      seasonSelect.value = defaultSeason.id;
    }
    
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
  const rowNum = quoteItemsCount;

  const wrapper = document.createElement('div');
  wrapper.className = 'item-row-wrapper';
  wrapper.id = `quote-item-row-${rowNum}`;

  let options = '<option value="">-- Selecciona un Producto --</option>';
  allProducts.forEach(p => {
    options += `<option value="${p.id}">${p.producto} ($${p.list_price_mxn.toLocaleString('es-MX')} MXN)</option>`;
  });

  wrapper.innerHTML = `
    <div class="item-row">
      <div class="mobile-product-icon" aria-hidden="true">
        <span class="material-symbols-rounded">agriculture</span>
      </div>
      <div class="form-group item-product-group">
        <label>Producto</label>
        <select class="form-input item-product-select" required>${options}</select>
        <span class="mobile-item-package">Presentación agrícola</span>
      </div>
      <div class="form-group item-tamano-group" style="display: none; min-width: 120px;">
        <label>Tamaño</label>
        <select class="form-input item-tamano-select">
          <option value="">-- Tamaño --</option>
        </select>
      </div>
      <div class="form-group item-qty-group">
        <label>Cantidad</label>
        <span class="mobile-quantity-label">Cantidad</span>
        <div class="mobile-quantity-stepper">
          <button type="button" aria-label="Disminuir cantidad" data-quantity-delta="-1">−</button>
          <input type="number" class="form-input item-qty-input" min="1" step="1" inputmode="numeric" enterkeyhint="done" value="1" aria-label="Cantidad de producto" required>
          <button type="button" aria-label="Aumentar cantidad" data-quantity-delta="1">+</button>
        </div>
        <small class="mobile-quantity-hint">Toca el número para escribir</small>
      </div>
      <div class="form-group item-price-group">
        <label>Precio Base</label>
        <input type="text" class="form-input item-calc-unit-price" style="background-color: var(--bg);" value="-" readonly>
        <span class="mobile-item-subtotal">Subtotal —</span>
      </div>
      <button type="button" class="btn-remove" aria-label="Eliminar producto" onclick="removeQuoteItemRow(${rowNum})">
        <span class="desktop-remove-icon" aria-hidden="true">🗑️</span>
        <span class="mobile-remove-icon material-symbols-rounded" aria-hidden="true">delete</span>
      </button>
    </div>
    <!-- La Cuenta Clave se aplica antes del descuento adicional del asesor. -->
    <div class="item-discount-row" id="discount-row-${rowNum}" style="display:none;">
      <div class="item-key-account-step" style="display:none;">
        <label>🔑 Cuenta Clave</label>
        <div class="item-key-account-name" style="font-size:11px; color:#2563eb; font-weight:700;">-</div>
        <div class="item-key-account-amount" style="font-weight:700; font-size:15px; color:#2563eb;">-$0.00 MXN</div>
      </div>
      <div class="item-advisor-discount-control">
        <label>🎚️ Descuento Asesor</label>
        <input type="range" class="discount-slider item-discount-slider"
               min="0" max="0" step="1" value="0"
               data-row="${rowNum}"
               oninput="onDiscountSliderChange(this)">
      </div>
      <div class="item-advisor-discount-amount" style="text-align:center;">
        <label>Descuento aplicado</label>
        <div class="item-discount-amount" style="font-weight:700; font-size:15px; color:var(--accent);">$0 MXN</div>
        <div style="font-size:10px; color:var(--text-light); margin-top:2px;">
          Máx: <span class="item-discount-max-label">$0</span> MXN
        </div>
      </div>
      <div style="text-align:right;">
        <label>Precio Final (con descuento)</label>
        <div class="item-final-price" style="font-weight:700; font-size:16px; color:var(--success);">-</div>
      </div>
    </div>
  `;

  container.appendChild(wrapper);

  const prodSelect = wrapper.querySelector('.item-product-select');
  const tamanoGroup = wrapper.querySelector('.item-tamano-group');
  const tamanoSelect = wrapper.querySelector('.item-tamano-select');

  prodSelect.addEventListener('change', () => {
    const prodId = Number(prodSelect.value);
    const prod = (allProducts || []).find(p => p.id === prodId);
    const sizes = getSizesForProduct(prod);
    if (sizes.length > 0) {
      tamanoGroup.style.display = 'block';
      tamanoSelect.innerHTML = '<option value="">-- Tamaño --</option>' + sizes.map(s => `<option value="${escapeAttribute(s)}">${escapeHtml(s)}</option>`).join('');
    } else {
      tamanoGroup.style.display = 'none';
      tamanoSelect.innerHTML = '<option value="">-- Tamaño --</option>';
      tamanoSelect.value = '';
    }
  });

  wrapper.querySelectorAll('[data-quantity-delta]').forEach(button => {
    button.addEventListener('click', () => {
      changeQuoteQuantity(button, Number(button.dataset.quantityDelta || 0));
    });
  });
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
  const wrappers = document.querySelectorAll('#items-builder-container .item-row-wrapper');
  wrappers.forEach(w => {
    const select = w.querySelector('.item-product-select');
    const tamanoSelect = w.querySelector('.item-tamano-select');
    const qtyInput = w.querySelector('.item-qty-input');
    const slider = w.querySelector('.item-discount-slider');
    
    if (select && select.value && qtyInput && qtyInput.value) {
      items.push({
        producto_id: Number(select.value),
        cantidad: Number(qtyInput.value),
        tamano: (tamanoSelect && tamanoSelect.value) ? tamanoSelect.value.trim() : null,
        descuento_aplicado: slider ? (parseFloat(slider.value) || 0.0) : 0.0
      });
    }
  });
  
  return {
    client_id,
    cliente_id: client_id,
    ciclo_agricola,
    condiciones_pago,
    temporada_id,
    items,
    financiera,
    notas,
    prospecto_id: activeProspectId || undefined,
    planificacion_id: activePlanningQuoteContext?.planId,
    origen_etapa: activePlanningQuoteContext?.stageCode
  };
}

function updateCreditAttachmentControl() {
  const condition = document.getElementById('quote-condicion')?.value;
  const attachButton = document.getElementById('btn-attach-credit-pdf');
  const status = document.getElementById('quote-credit-pdf-status');
  if (!attachButton || !status) return;
  const isCredit = condition === 'CREDITO';
  attachButton.style.display = isCredit ? 'inline-flex' : 'none';
  status.style.display = isCredit && selectedCreditAttachmentFile ? 'block' : 'none';
  if (!isCredit) {
    selectedCreditAttachmentFile = null;
    const input = document.getElementById('quote-credit-pdf-input');
    if (input) input.value = '';
    status.textContent = '';
  }
}

function readFileAsBase64(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onerror = () => reject(new Error('No fue posible leer el PDF seleccionado.'));
    reader.onload = () => resolve(String(reader.result).split(',')[1] || '');
    reader.readAsDataURL(file);
  });
}

async function uploadCreditAttachment(quoteId, file) {
  const contenidoBase64 = await readFileAsBase64(file);
  const res = await fetch(`${API_URL}/api/cotizaciones/${quoteId}/adjuntos`, {
    method: 'POST',
    headers: getHeaders(),
    body: JSON.stringify({
      nombre_archivo: file.name,
      mime_type: 'application/pdf',
      contenido_base64: contenidoBase64
    })
  });
  const data = await res.json();
  if (!res.ok) throw new Error(data.error || 'No fue posible adjuntar el PDF.');
}

document.getElementById('quote-condicion')?.addEventListener('change', updateCreditAttachmentControl);
document.getElementById('btn-attach-credit-pdf')?.addEventListener('click', () => {
  document.getElementById('quote-credit-pdf-input')?.click();
});
document.getElementById('quote-credit-pdf-input')?.addEventListener('change', event => {
  const file = event.target.files?.[0];
  if (!file) return;
  const isPdf = file.type === 'application/pdf' || file.name.toLowerCase().endsWith('.pdf');
  if (!isPdf || file.size > 8 * 1024 * 1024) {
    selectedCreditAttachmentFile = null;
    event.target.value = '';
    alert('Selecciona un PDF válido de hasta 8 MB.');
    updateCreditAttachmentControl();
    return;
  }
  selectedCreditAttachmentFile = file;
  const status = document.getElementById('quote-credit-pdf-status');
  if (status) status.textContent = `PDF seleccionado: ${file.name}`;
  updateCreditAttachmentControl();
});

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
      
      // Update individual unit prices and discount sliders in the form
      const wrappers = document.querySelectorAll('#items-builder-container .item-row-wrapper');
      wrappers.forEach(wrapper => {
        const select = wrapper.querySelector('.item-product-select');
        const unitPriceInput = wrapper.querySelector('.item-calc-unit-price');
        const discountRow = wrapper.querySelector('.item-discount-row');
        const keyAccountStep = wrapper.querySelector('.item-key-account-step');
        const keyAccountName = wrapper.querySelector('.item-key-account-name');
        const keyAccountAmount = wrapper.querySelector('.item-key-account-amount');
        const advisorControl = wrapper.querySelector('.item-advisor-discount-control');
        const advisorAmount = wrapper.querySelector('.item-advisor-discount-amount');
        const slider = wrapper.querySelector('.item-discount-slider');
        const maxLabel = wrapper.querySelector('.item-discount-max-label');
        
        if (select && select.value && unitPriceInput) {
          const calcItem = calc.items.find(i => i.producto_id === Number(select.value));
          if (calcItem) {
            const keyAccountDiscount = Number(calcItem.descuento_cuenta_clave_mxn || 0);
            const maxDisc = Number(calcItem.max_discount_mxn || 0);
            const hasKeyAccountDiscount = keyAccountDiscount > 0;
            const hasAdvisorDiscount = maxDisc > 0;

            // Base is shown before Cuenta Clave, then the advisor slider continues from the reduced price.
            unitPriceInput.value = `$${Number(calcItem.precio_antes_cuenta_clave || calcItem.precio_neto).toLocaleString('es-MX', { minimumFractionDigits: 2 })} MXN`;
            const mobileSubtotal = wrapper.querySelector('.mobile-item-subtotal');
            const quantity = Number(wrapper.querySelector('.item-qty-input')?.value) || 1;
            if (mobileSubtotal) {
              mobileSubtotal.textContent = `Subtotal $${(Number(calcItem.precio_neto) * quantity).toLocaleString('es-MX', { minimumFractionDigits: 2 })}`;
            }
            if (keyAccountStep) keyAccountStep.style.display = hasKeyAccountDiscount ? 'block' : 'none';
            if (keyAccountName) keyAccountName.textContent = calc.cuenta_clave_nombre || 'Cuenta Clave';
            if (keyAccountAmount) keyAccountAmount.textContent = `-$${keyAccountDiscount.toLocaleString('es-MX', { minimumFractionDigits: 2 })} MXN`;
            if (advisorControl) advisorControl.style.display = hasAdvisorDiscount ? 'block' : 'none';
            if (advisorAmount) advisorAmount.style.display = hasAdvisorDiscount ? 'block' : 'none';
            if (discountRow) {
              discountRow.style.display = (hasKeyAccountDiscount || hasAdvisorDiscount) ? 'grid' : 'none';
              discountRow.style.gridTemplateColumns = hasKeyAccountDiscount && hasAdvisorDiscount
                ? '1fr 1.2fr 1fr 1fr'
                : (hasAdvisorDiscount ? '1.2fr 1fr 1fr' : '1fr 1fr');
            }
            
            // Configure discount slider
            if (hasAdvisorDiscount && slider) {
              slider.max = maxDisc;
              // Only reset to 0 if the max changed (new product selection)
              if (parseFloat(slider.getAttribute('data-max-prev') || 0) !== maxDisc) {
                slider.value = 0;
                slider.setAttribute('data-max-prev', maxDisc);
              }
              if (maxLabel) maxLabel.textContent = maxDisc.toLocaleString('es-MX', { minimumFractionDigits: 0 });
              // Store base net price for slider calculations
              slider.setAttribute('data-base-price', calcItem.precio_neto);
              // Update slider display
              onDiscountSliderChange(slider);
            } else if (slider) {
              slider.value = 0;
              slider.setAttribute('data-max-prev', '0');
              slider.style.setProperty('--slider-pct', '0%');
              slider.setAttribute('data-base-price', calcItem.precio_neto);
              const finalEl = wrapper.querySelector('.item-final-price');
              if (finalEl) finalEl.textContent = `$${Number(calcItem.precio_neto).toLocaleString('es-MX', { minimumFractionDigits: 2 })} MXN`;
            }
          }
        }
      });
      
      updateVirtualSheet(calc, payload);
    } catch (err) {
      console.warn("Live calculator error:", err.message);
    }
  }, 350);
}

// Handle discount slider movement — updates the per-row display in real time
window.onDiscountSliderChange = function(slider) {
  const val = parseFloat(slider.value) || 0;
  const max = parseFloat(slider.max) || 1;
  const basePrice = parseFloat(slider.getAttribute('data-base-price')) || 0;
  const finalPrice = basePrice - val;
  
  const wrapper = slider.closest('.item-row-wrapper');
  if (!wrapper) return;
  
  const amountEl = wrapper.querySelector('.item-discount-amount');
  const finalEl = wrapper.querySelector('.item-final-price');
  const mobileSubtotal = wrapper.querySelector('.mobile-item-subtotal');
  const quantity = Number(wrapper.querySelector('.item-qty-input')?.value) || 1;
  
  if (amountEl) amountEl.textContent = `$${val.toLocaleString('es-MX', { minimumFractionDigits: 2 })} MXN`;
  if (finalEl) finalEl.textContent = `$${finalPrice.toLocaleString('es-MX', { minimumFractionDigits: 2 })} MXN`;
  if (mobileSubtotal) {
    mobileSubtotal.textContent = `Subtotal $${(finalPrice * quantity).toLocaleString('es-MX', { minimumFractionDigits: 2 })}`;
  }
  
  // Update slider gradient fill
  const pct = max > 0 ? (val / max) * 100 : 0;
  slider.style.setProperty('--slider-pct', `${pct}%`);
  
  // Recalculate grand total with discounts applied
  recalcTotalsWithDiscounts();
};

// Recalculate grand total factoring in any advisor discounts from sliders
function recalcTotalsWithDiscounts() {
  let adjustedTotal = 0;
  const wrappers = document.querySelectorAll('#items-builder-container .item-row-wrapper');
  wrappers.forEach(wrapper => {
    const select = wrapper.querySelector('.item-product-select');
    const qtyInput = wrapper.querySelector('.item-qty-input');
    const slider = wrapper.querySelector('.item-discount-slider');
    const basePrice = slider ? parseFloat(slider.getAttribute('data-base-price') || 0) : 0;
    const discountVal = slider ? parseFloat(slider.value || 0) : 0;
    const qty = qtyInput ? (parseFloat(qtyInput.value) || 1) : 1;
    
    if (select && select.value && basePrice > 0) {
      adjustedTotal += (basePrice - discountVal) * qty;
    }
  });
  
  if (adjustedTotal > 0) {
    document.getElementById('preview-total-val').textContent =
      `$${adjustedTotal.toLocaleString('es-MX', { minimumFractionDigits: 2 })} MXN`;
    // Update Puntos and Cupón
    document.getElementById('preview-puntos-val').textContent =
      `$${(adjustedTotal * 0.03).toLocaleString('es-MX', { minimumFractionDigits: 2 })} MXN`;
    document.getElementById('preview-cupon-val').textContent =
      `$${(adjustedTotal * 0.01).toLocaleString('es-MX', { minimumFractionDigits: 2 })} MXN`;
    updateMobileQuoteSummary(adjustedTotal);
  }
}

function updateMobileQuoteSummary(total) {
  const safeTotal = Number(total) || 0;
  const currency = value => `$${value.toLocaleString('es-MX', { minimumFractionDigits: 2 })}`;
  const totalEl = document.getElementById('mobile-quote-total');
  const pointsEl = document.getElementById('mobile-quote-points');
  const couponEl = document.getElementById('mobile-quote-coupon');
  if (totalEl) totalEl.textContent = `${currency(safeTotal)} MXN`;
  if (pointsEl) pointsEl.textContent = currency(safeTotal * 0.03);
  if (couponEl) couponEl.textContent = currency(safeTotal * 0.01);
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
  document.getElementById('preview-puntos-val').textContent = '$0.00 MXN';
  document.getElementById('preview-cupon-val').textContent = '$0.00 MXN';
  updateMobileQuoteSummary(0);
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
  // Read any advisor discounts currently set in the sliders
  const sliderDiscounts = {};
  document.querySelectorAll('#items-builder-container .item-row-wrapper').forEach(wrapper => {
    const select = wrapper.querySelector('.item-product-select');
    const slider = wrapper.querySelector('.item-discount-slider');
    if (select && select.value && slider) {
      sliderDiscounts[Number(select.value)] = parseFloat(slider.value) || 0;
    }
  });
  
  const tbody = document.getElementById('preview-table-body');
  tbody.innerHTML = '';
  let grandTotalWithDiscounts = 0;
  
  calc.items.forEach(i => {
    const listPrice = i.precio_lista;
    const netPrice = i.precio_neto;
    const advisorDiscount = sliderDiscounts[i.producto_id] || 0;
    const finalPrice = netPrice - advisorDiscount;
    const totalVolumeDiscount = listPrice - netPrice;
    const subtotalFinal = finalPrice * i.cantidad;
    grandTotalWithDiscounts += subtotalFinal;
    
    // Format advisor discount for the DCTO NETO column
    const formattedDiscount = `-$${advisorDiscount.toLocaleString('es-MX', { minimumFractionDigits: 2 })}`;
    const discountStyle = advisorDiscount > 0
      ? 'color: var(--accent); font-weight: 600;'
      : 'color: var(--text-light);';
    
    tbody.innerHTML += `
      <tr>
        <td><strong>${i.producto_nombre}</strong><br><span style="font-size: 9px; color: var(--text-light);">${i.tipo_categoria}</span></td>
        <td style="text-align: center; font-weight: 600;">${i.cantidad}</td>
        <td style="text-align: right;">$${listPrice.toLocaleString('es-MX', { minimumFractionDigits: 2 })}</td>
        <td style="text-align: right; ${discountStyle}">${formattedDiscount}</td>
        <td style="text-align: right; font-weight: 600;">$${finalPrice.toLocaleString('es-MX', { minimumFractionDigits: 2 })}</td>
        <td style="text-align: right; font-weight: 700;">$${subtotalFinal.toLocaleString('es-MX', { minimumFractionDigits: 2 })}</td>
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
  
  // Total (with advisor discounts applied)
  document.getElementById('preview-total-val').textContent = `$${grandTotalWithDiscounts.toLocaleString('es-MX', { minimumFractionDigits: 2 })} MXN`;
  
  // Puntos (3%) y Cupón (1%) — informational benefit for the client
  document.getElementById('preview-puntos-val').textContent =
    `$${(grandTotalWithDiscounts * 0.03).toLocaleString('es-MX', { minimumFractionDigits: 2 })} MXN`;
  document.getElementById('preview-cupon-val').textContent =
    `$${(grandTotalWithDiscounts * 0.01).toLocaleString('es-MX', { minimumFractionDigits: 2 })} MXN`;
  updateMobileQuoteSummary(grandTotalWithDiscounts);
  
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

    let attachmentMessage = '';
    if (payload.condiciones_pago === 'CREDITO' && selectedCreditAttachmentFile) {
      try {
        await uploadCreditAttachment(data.id, selectedCreditAttachmentFile);
        attachmentMessage = ' PDF de crédito adjuntado.';
      } catch (attachmentError) {
        attachmentMessage = ` La cotización fue creada, pero el PDF no se adjuntó: ${attachmentError.message}`;
      }
    }
    
    const cameFromSaleVisit = Boolean(activePlanningQuoteContext?.planId);
    const successMessage = cameFromSaleVisit
      ? `Cotización ${data.folio} enviada a autorización. La visita quedó registrada como prospecto.`
      : `Cotización ${data.folio} enviada a autorización.`;
    alert(`${successMessage}${attachmentMessage}`);
    
    // Reset Form & Switch view
    document.getElementById('quotation-form').reset();
    document.getElementById('items-builder-container').innerHTML = '';
    quoteItemsCount = 0;
    activeProspectId = null;
    activePlanningQuoteContext = null;
    selectedCreditAttachmentFile = null;
    document.getElementById('quote-credit-pdf-input').value = '';
    updateCreditAttachmentControl();
    addQuoteItemRow();
    switchView('dashboard-view', 'Tablero General');
  } catch (err) {
    alert(err.message);
  }
});

document.getElementById('btn-save-mobile-draft')?.addEventListener('click', () => {
  const payload = getQuotePayload();
  localStorage.setItem('agrisalesMobileQuoteDraft', JSON.stringify({
    ...payload,
    savedAt: new Date().toISOString()
  }));
  alert('Borrador guardado en este dispositivo.');
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
    
    const canEdit = user?.nivel_rol === 'Administrador';
    const description = p.descripcion ? escapeHtml(p.descripcion) : detailText;
    grid.innerHTML += `
      <div class="product-card ${canEdit ? 'product-card-editable' : ''}" ${canEdit ? `role="button" tabindex="0" data-product-id="${p.id}" aria-label="Editar ${escapeAttribute(p.producto)}"` : ''}>
        <div class="product-image-placeholder">${emoji}</div>
        <div class="product-info">
          <h3>${p.producto}</h3>
          <p>${p.clave ? `${escapeHtml(p.clave)} | ` : ''}${p.tipo_categoria} | ${description}</p>
        </div>
        <div class="product-price-box">
          <span class="product-price">${priceText}</span>
          <button class="btn btn-secondary" style="width: auto; padding: 6px 12px; font-size: 11px; margin: 0;" onclick="addProductDirectlyToBuilder(${p.id})">Agregar a Cotización</button>
        </div>
      </div>
    `;
  });

  if (user?.nivel_rol === 'Administrador') {
    grid.querySelectorAll('.product-card-editable').forEach(card => {
      const openEditor = event => {
        if (event.target.closest('button')) return;
        window.openEditProductoModal(Number(card.dataset.productId));
      };
      card.addEventListener('click', openEditor);
      card.addEventListener('keydown', event => {
        if (event.key === 'Enter' || event.key === ' ') {
          event.preventDefault();
          openEditor(event);
        }
      });
    });
  }
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

function updateWarehouseMovementLayout() {
  const layout = document.getElementById('warehouse-movements-layout');
  const entryContainer = document.getElementById('movement-entry-container');
  const entryCard = document.getElementById('movement-entry-card');
  const toggleButton = document.getElementById('btn-toggle-movement-form');
  if (!layout || !entryContainer || !entryCard || !toggleButton) return;

  const canRegisterMovements = true;
  if (!canRegisterMovements) {
    entryContainer.style.display = 'none';
    layout.style.gridTemplateColumns = 'minmax(0, 1fr)';
    return;
  }

  entryContainer.style.display = 'block';
  entryCard.style.display = warehouseMovementFormCollapsed ? 'none' : 'block';
  entryContainer.style.width = warehouseMovementFormCollapsed ? '38px' : '';
  layout.style.gridTemplateColumns = warehouseMovementFormCollapsed
    ? '38px minmax(0, 1fr)'
    : 'minmax(320px, 1fr) minmax(0, 1.5fr)';
  toggleButton.textContent = warehouseMovementFormCollapsed ? '›' : '‹';
  toggleButton.title = warehouseMovementFormCollapsed ? 'Expandir registro de movimientos' : 'Contraer registro de movimientos';
  toggleButton.setAttribute('aria-label', toggleButton.title);
  toggleButton.style.right = warehouseMovementFormCollapsed ? '0' : '-15px';
}

function openWarehouseEntryForm() {
  toggleAlmacenTab('movimientos');
  if (warehouseMovementFormCollapsed) {
    warehouseMovementFormCollapsed = false;
    updateWarehouseMovementLayout();
  }
  document.getElementById('op-btn-entrada')?.click();
  document.getElementById('movement-entry-card')?.scrollIntoView({ behavior: 'smooth' });
}
function openWarehouseExitForm() {
  toggleAlmacenTab('movimientos');
  if (warehouseMovementFormCollapsed) {
    warehouseMovementFormCollapsed = false;
    updateWarehouseMovementLayout();
  }
  document.getElementById('op-btn-salida')?.click();
  document.getElementById('movement-entry-card')?.scrollIntoView({ behavior: 'smooth' });
}

function setupWarehouseFormHandlers() {
  const btnAll = document.getElementById('cat-btn-all');
  const btnAgroquimicos = document.getElementById('cat-btn-agroquimicos');
  const btnSemilla = document.getElementById('cat-btn-semilla');
  const inputCat = document.getElementById('move-categoria');

  const btnSalida = document.getElementById('op-btn-salida');
  const btnEntrada = document.getElementById('op-btn-entrada');
  const inputTipoOp = document.getElementById('move-tipo-operacion');
  const containerSalida = document.getElementById('fields-salida-container');
  const containerEntrada = document.getElementById('fields-entrada-container');
  const btnSubmit = document.getElementById('btn-submit-movement');
  const labelProveedor = document.getElementById('label-move-proveedor');
  const btnAddItem = document.getElementById('btn-add-movement-item');

  const updateCategoryFilterUI = (cat) => {
    if (inputCat) inputCat.value = cat;
    [btnAll, btnAgroquimicos, btnSemilla].forEach(btn => {
      if (!btn) return;
      btn.classList.remove('active');
      btn.style.backgroundColor = '';
      btn.style.color = '';
    });

    let activeBtn = btnAll;
    if (cat === 'Agroquímicos') activeBtn = btnAgroquimicos;
    else if (cat === 'Semilla') activeBtn = btnSemilla;

    if (activeBtn) {
      activeBtn.classList.add('active');
      activeBtn.style.backgroundColor = 'var(--primary, #047857)';
      activeBtn.style.color = '#ffffff';
    }

    // Refresh products in all current item rows
    document.querySelectorAll('#movement-items-list .movement-item-row').forEach(row => {
      const selectProd = row.querySelector('.move-item-prod');
      const curVal = selectProd ? selectProd.value : null;
      populateMovementItemProducts(row, curVal);
    });
  };

  const updateOperationUI = (op) => {
    if (inputTipoOp) inputTipoOp.value = op;
    if (op === 'Salida') {
      if (btnSalida) {
        btnSalida.classList.add('active');
        btnSalida.style.backgroundColor = 'var(--danger, #ef4444)';
        btnSalida.style.color = '#ffffff';
      }
      if (btnEntrada) {
        btnEntrada.classList.remove('active');
        btnEntrada.style.backgroundColor = '';
        btnEntrada.style.color = '';
      }
      if (containerSalida) containerSalida.style.display = 'block';
      if (containerEntrada) containerEntrada.style.display = 'none';
      if (btnSubmit) btnSubmit.textContent = 'Registrar Salida';
    } else {
      if (btnEntrada) {
        btnEntrada.classList.add('active');
        btnEntrada.style.backgroundColor = 'var(--success, #10b981)';
        btnEntrada.style.color = '#ffffff';
      }
      if (btnSalida) {
        btnSalida.classList.remove('active');
        btnSalida.style.backgroundColor = '';
        btnSalida.style.color = '';
      }
      if (containerSalida) containerSalida.style.display = 'none';
      if (containerEntrada) containerEntrada.style.display = 'block';
      if (btnSubmit) btnSubmit.textContent = 'Registrar Entrada';
    }
    if (labelProveedor) {
      labelProveedor.textContent = 'Proveedor o Cliente';
    }

    // Update item rows for salida vs entrada (lots and price)
    document.querySelectorAll('#movement-items-list .movement-item-row').forEach(row => {
      const isSalida = op === 'Salida';
      const precioGroup = row.querySelector('.move-item-precio-group');
      if (precioGroup) precioGroup.style.display = isSalida ? 'block' : 'none';
      updateMovementItemLots(row);
    });
  };

  if (btnAll) btnAll.onclick = () => updateCategoryFilterUI('Todos');
  if (btnAgroquimicos) btnAgroquimicos.onclick = () => updateCategoryFilterUI('Agroquímicos');
  if (btnSemilla) btnSemilla.onclick = () => updateCategoryFilterUI('Semilla');
  if (btnSalida) btnSalida.onclick = () => updateOperationUI('Salida');
  if (btnEntrada) btnEntrada.onclick = () => updateOperationUI('Entrada');

  if (btnAddItem) {
    btnAddItem.onclick = () => addWarehouseMovementItem();
  }

  // Initialize UI based on current hidden input values (or defaults)
  updateCategoryFilterUI(inputCat?.value || 'Todos');
  updateOperationUI(inputTipoOp?.value || 'Salida');

  const btnTopEntrada = document.getElementById('btn-top-registrar-entrada');
  const btnTopSalida = document.getElementById('btn-top-registrar-salida');
  const btnCardEntrada = document.getElementById('btn-card-registrar-entrada');
  const btnCardSalida = document.getElementById('btn-card-registrar-salida');

  if (btnTopEntrada) btnTopEntrada.onclick = openWarehouseEntryForm;
  if (btnTopSalida) btnTopSalida.onclick = openWarehouseExitForm;
  if (btnCardEntrada) btnCardEntrada.onclick = openWarehouseEntryForm;
  if (btnCardSalida) btnCardSalida.onclick = openWarehouseExitForm;

  // Initialize with at least 1 item row
  initWarehouseMovementItems();

  // Default date to today
  const moveFecha = document.getElementById('move-fecha');
  if (moveFecha && !moveFecha.value) {
    moveFecha.value = new Date().toISOString().slice(0, 10);
  }
}

async function populateWarehouseAuxiliaryControls() {
  const moveAsesor = document.getElementById('move-asesor');

  // Load advisors if needed
  if (moveAsesor && moveAsesor.children.length <= 1) {
    try {
      const res = await fetch(`${API_URL}/api/asesores`, { headers: getHeaders() });
      if (res.ok) {
        const asesores = await res.json();
        const optionsHtml = (Array.isArray(asesores) ? asesores : []).map(a => 
          `<option value="${a.id}">${escapeHtml(a.nombre)}</option>`
        ).join('');
        moveAsesor.innerHTML = '<option value="">-- Seleccionar Asesor --</option>' + optionsHtml;
      }
    } catch (e) {
      console.warn('Failed to load advisors for warehouse form:', e);
    }
  }

  // Load all active clients for interactive search box and Kardex filter
  if (!window.allWarehouseClients || window.allWarehouseClients.length === 0) {
    try {
      const res = await fetch(`${API_URL}/api/clientes?all=true`, { headers: getHeaders() });
      if (res.ok) {
        const data = await res.json();
        window.allWarehouseClients = Array.isArray(data) ? data : (data.clientes || []);
        setupWarehouseClientSearch();
        populateWarehouseClientFilter();
      }
    } catch (e) {
      console.warn('Failed to load clients for warehouse form:', e);
    }
  } else {
    setupWarehouseClientSearch();
  }
}

function setupWarehouseClientSearch() {
  const searchInput = document.getElementById('move-cliente-search');
  const hiddenInput = document.getElementById('move-cliente');
  const dropdown = document.getElementById('move-cliente-dropdown');
  const clearBtn = document.getElementById('btn-clear-cliente');
  const infoBadge = document.getElementById('move-cliente-selected-info');
  const moveAsesor = document.getElementById('move-asesor');

  if (!searchInput || !dropdown) return;
  if (searchInput.getAttribute('data-bound') === 'true') return;
  searchInput.setAttribute('data-bound', 'true');

  const renderDropdownItems = (filterText = '') => {
    const clients = window.allWarehouseClients || [];
    const query = filterText.trim().toLowerCase();
    
    let filtered = clients;
    if (query) {
      filtered = clients.filter(c => 
        (c.nombre && c.nombre.toLowerCase().includes(query)) ||
        (c.asesor_nombre && c.asesor_nombre.toLowerCase().includes(query))
      );
    }

    if (filtered.length === 0) {
      dropdown.innerHTML = '<div style="padding: 10px; text-align: center; color: var(--text-light, #9ca3af); font-size: 12px;">No se encontraron clientes con esa búsqueda</div>';
      dropdown.style.display = 'block';
      return;
    }

    const matchesToShow = filtered.slice(0, 60);
    dropdown.innerHTML = matchesToShow.map(c => {
      const asesorText = c.asesor_nombre ? `<span style="font-size: 11px; color: var(--text-light, #6b7280); font-weight: normal;">Asesor: ${escapeHtml(c.asesor_nombre)}</span>` : '';
      return `
        <div class="client-search-item" data-id="${c.id}" data-asesor-id="${c.asesor_id || ''}" data-name="${escapeHtml(c.nombre)}" style="padding: 8px 12px; cursor: pointer; border-radius: 6px; font-size: 13px; font-weight: 500; display: flex; justify-content: space-between; align-items: center; border-bottom: 1px solid var(--border-light, #f3f4f6);" onmouseover="this.style.background='var(--bg-hover, #f3f4f6)'" onmouseout="this.style.background='transparent'">
          <span>${escapeHtml(c.nombre)}</span>
          ${asesorText}
        </div>
      `;
    }).join('');

    dropdown.style.display = 'block';

    dropdown.querySelectorAll('.client-search-item').forEach(item => {
      item.onclick = function() {
        const id = this.getAttribute('data-id');
        const name = this.getAttribute('data-name');
        const asesorId = this.getAttribute('data-asesor-id');

        hiddenInput.value = id;
        searchInput.value = name;
        dropdown.style.display = 'none';

        if (clearBtn) clearBtn.style.display = 'block';

        if (asesorId && moveAsesor) {
          moveAsesor.value = asesorId;
        }

        const clientObj = (window.allWarehouseClients || []).find(c => String(c.id) === String(id));
        if (infoBadge && clientObj) {
          infoBadge.style.display = 'block';
          infoBadge.innerHTML = `✓ Seleccionado: <strong>${escapeHtml(clientObj.nombre)}</strong>${clientObj.asesor_nombre ? ` — Asesor: ${escapeHtml(clientObj.asesor_nombre)}` : ''}`;
        }
      };
    });
  };

  searchInput.onfocus = function() {
    renderDropdownItems(this.value);
  };

  searchInput.oninput = function() {
    if (!this.value) {
      hiddenInput.value = '';
      if (infoBadge) infoBadge.style.display = 'none';
      if (clearBtn) clearBtn.style.display = 'none';
    }
    renderDropdownItems(this.value);
  };

  if (clearBtn) {
    clearBtn.onclick = function() {
      searchInput.value = '';
      hiddenInput.value = '';
      clearBtn.style.display = 'none';
      if (infoBadge) infoBadge.style.display = 'none';
      dropdown.style.display = 'none';
      searchInput.focus();
    };
  }

  document.addEventListener('click', (e) => {
    if (!searchInput.contains(e.target) && !dropdown.contains(e.target) && clearBtn && !clearBtn.contains(e.target)) {
      dropdown.style.display = 'none';
    }
  });
}

function populateWarehouseProductControls() {
  const moveProdSelect = document.getElementById('move-prod');
  const filterSelect = document.getElementById('movement-filter-product');
  const activeCategory = document.getElementById('move-categoria')?.value || 'Agroquímicos';
  const selectedMovementProduct = moveProdSelect?.value || '';
  const selectedFilterProduct = filterSelect?.value || '';

  if (moveProdSelect) {
    const filtered = allProducts.filter(p => p.activo === 1).filter(p => {
      if (activeCategory === 'Semilla') {
        return p.tipo_categoria === 'Híbrido' || p.tipo_categoria === 'Semilla';
      } else {
        return p.tipo_categoria !== 'Híbrido' && p.tipo_categoria !== 'Semilla';
      }
    });
    // Fallback: if category filter leaves no products, show all active
    const listToRender = filtered.length > 0 ? filtered : allProducts.filter(p => p.activo === 1);
    const optionsHtml = listToRender.map(product => 
      `<option value="${product.id}">${escapeHtml(product.producto)} (${escapeHtml(product.tipo_categoria)})</option>`
    ).join('');
    moveProdSelect.innerHTML = '<option value="">-- Selecciona un Producto --</option>' + optionsHtml;
    moveProdSelect.value = selectedMovementProduct;
    updateWarehouseTamanoOptions();
    updateWarehouseLoteOptions();
  }
  if (filterSelect) {
    const optionsHtml = allProducts.map(product => 
      `<option value="${product.id}">${escapeHtml(product.producto)}</option>`
    ).join('');
    filterSelect.innerHTML = '<option value="">Todos los productos</option>' + optionsHtml;
    filterSelect.value = selectedFilterProduct;
  }
}

function getSizesForProduct(productOrName) {
  if (!productOrName) return [];
  
  let prodObj = null;
  if (typeof productOrName === 'object') {
    prodObj = productOrName;
  } else if (typeof productOrName === 'number') {
    prodObj = (allProducts || []).find(p => p.id === productOrName) || (allAdminProductos || []).find(p => p.id === productOrName);
  } else if (typeof productOrName === 'string') {
    const searchName = productOrName.trim().toUpperCase();
    prodObj = (allProducts || []).find(p => p.producto && p.producto.trim().toUpperCase() === searchName) ||
              (allAdminProductos || []).find(p => p.producto && p.producto.trim().toUpperCase() === searchName);
  }

  if (prodObj && prodObj.tamanos) {
    return String(prodObj.tamanos)
      .split(',')
      .map(s => s.trim())
      .filter(Boolean);
  }

  return [];
}

function updateWarehouseTamanoOptions() {
  const selectTamano = document.getElementById('move-tamano');
  const inputCustom = document.getElementById('move-tamano-custom');
  const selectProd = document.getElementById('move-prod');
  if (!selectTamano) return;

  const selectedProdId = Number(selectProd?.value);
  const selectedProd = (allProducts || []).find(p => p.id === selectedProdId) || (allAdminProductos || []).find(p => p.id === selectedProdId);
  const prodName = selectedProd?.producto || (selectProd?.selectedIndex > 0 ? selectProd.options[selectProd.selectedIndex].text : '');
  
  const sizes = getSizesForProduct(selectedProd || prodName);
  const currentVal = selectTamano.value;

  const optionsHtml = sizes.map(s => `<option value="${escapeAttribute(s)}">${escapeHtml(s)}</option>`).join('');
  selectTamano.innerHTML = '<option value="">-- Seleccionar Tamaño --</option>' + optionsHtml + '<option value="Otro">Otro (Especificar)</option>';

  if (sizes.includes(currentVal) || currentVal === 'Otro') {
    selectTamano.value = currentVal;
  }

  if (inputCustom) {
    inputCustom.style.display = selectTamano.value === 'Otro' ? 'block' : 'none';
    if (selectTamano.value !== 'Otro') inputCustom.value = '';
  }
}

let currentWarehouseAvailableLots = [];

async function updateWarehouseLoteOptions() {
  const tipoOp = document.getElementById('move-tipo-operacion')?.value || 'Salida';
  const prodSelect = document.getElementById('move-prod');
  const prodId = Number(prodSelect?.value);
  const selectTamano = document.getElementById('move-tamano');
  const inputTamanoCustom = document.getElementById('move-tamano-custom');
  let tamano = selectTamano ? selectTamano.value.trim() : '';
  if (tamano === 'Otro' && inputTamanoCustom) {
    tamano = inputTamanoCustom.value.trim();
  }

  const loteSelect = document.getElementById('move-lote-select');
  const loteInput = document.getElementById('move-lote');
  const loteDatalist = document.getElementById('move-lote-datalist');

  if (tipoOp === 'Salida') {
    if (loteSelect) loteSelect.style.display = 'block';
    if (loteInput) loteInput.style.display = 'none';

    if (!prodId) {
      if (loteSelect) {
        loteSelect.innerHTML = '<option value="">-- Selecciona un Producto primero --</option>';
      }
      currentWarehouseAvailableLots = [];
      return;
    }

    try {
      let url = `${API_URL}/api/almacen/lotes-disponibles?producto_id=${prodId}`;
      if (tamano) {
        url += `&tamano=${encodeURIComponent(tamano)}`;
      }
      const res = await fetch(url, { headers: getHeaders() });
      if (!res.ok) throw new Error('Error al consultar lotes disponibles');
      const lots = await res.json();
      currentWarehouseAvailableLots = Array.isArray(lots) ? lots : [];

      if (loteSelect) {
        if (currentWarehouseAvailableLots.length === 0) {
          loteSelect.innerHTML = '<option value="">-- Sin lotes con existencia disponible --</option>';
        } else {
          const optionsHtml = currentWarehouseAvailableLots.map(l => {
            return `<option value="${escapeHtml(l.lote)}" data-existencias="${l.existencias}">${escapeHtml(l.lote)} (Disponible: ${l.existencias})</option>`;
          }).join('');
          loteSelect.innerHTML = '<option value="">-- Seleccionar Lote --</option>' + optionsHtml;
        }
      }
    } catch (err) {
      console.warn('Error fetching lotes disponibles:', err);
      if (loteSelect) {
        loteSelect.innerHTML = '<option value="">Error al cargar lotes</option>';
      }
    }
  } else {
    // Entrada
    if (loteSelect) loteSelect.style.display = 'none';
    if (loteInput) loteInput.style.display = 'block';

    if (!prodId) {
      if (loteDatalist) loteDatalist.innerHTML = '';
      return;
    }

    try {
      let url = `${API_URL}/api/almacen/lotes-historial?producto_id=${prodId}`;
      if (tamano) {
        url += `&tamano=${encodeURIComponent(tamano)}`;
      }
      const res = await fetch(url, { headers: getHeaders() });
      if (!res.ok) throw new Error('Error al consultar historial de lotes');
      const lots = await res.json();
      const lotList = Array.isArray(lots) ? lots : [];
      if (loteDatalist) {
        loteDatalist.innerHTML = lotList.map(l => {
          const val = typeof l === 'object' && l !== null ? (l.lote || '') : String(l);
          return `<option value="${escapeHtml(val)}"></option>`;
        }).join('');
      }
    } catch (err) {
      console.warn('Error fetching lotes historial:', err);
      if (loteDatalist) loteDatalist.innerHTML = '';
    }
  }
}

async function loadWarehouseMovementTypes() {
  const select = document.getElementById('movement-filter-type');
  if (!select) return;
  const selectedType = select.value;
  select.innerHTML = `
    <option value="">Todos los movimientos</option>
    <option value="Salida">Salidas</option>
    <option value="Entrada">Entradas</option>
  `;
  select.value = selectedType;
}

function renderWarehouseMovements(movements) {
  const movesTbody = document.getElementById('movements-tbody');
  if (!movesTbody) return;
  if (movements.length === 0) {
    movesTbody.innerHTML = '<tr><td colspan="9" style="text-align: center; color: var(--text-light);">No hay movimientos registrados con estos filtros.</td></tr>';
    return;
  }
  movesTbody.innerHTML = movements.map(m => {
    const dateOnly = (m.fecha_movimiento || '').slice(0, 10);
    const valEnt = m.cantidad_entrante > 0 ? Number(m.cantidad_entrante).toLocaleString('es-MX', { minimumFractionDigits: 3 }) : '-';
    const valSal = m.cantidad_saliente > 0 ? Number(m.cantidad_saliente).toLocaleString('es-MX', { minimumFractionDigits: 3 }) : '-';
    const isEntry = m.cantidad_entrante > 0 || (m.tipo_movimiento || '').startsWith('Entrada');

    let loteTamanoStr = '';
    if (m.lote) loteTamanoStr += `<br><span style="font-size: 11px; color: var(--text-light);">Lote: <strong>${escapeHtml(m.lote)}</strong></span>`;
    if (m.tamano) loteTamanoStr += `<span style="font-size: 11px; color: var(--text-light); margin-left: 6px;">Tamaño: <strong>${escapeHtml(m.tamano)}</strong></span>`;

    let contactDetails = '';
    if (isEntry) {
      if (m.proveedor_cliente) contactDetails += `<span>Prov/Cli: ${escapeHtml(m.proveedor_cliente)}</span>`;
      if (m.numero_movimiento) contactDetails += `${contactDetails ? '<br>' : ''}<span style="font-size: 11px; color: var(--text-light);">N° Ent: ${escapeHtml(m.numero_movimiento)}</span>`;
    } else {
      if (m.cliente_nombre) contactDetails += `<span>Cliente: ${escapeHtml(m.cliente_nombre)}</span>`;
      if (m.asesor_nombre) contactDetails += `${contactDetails ? '<br>' : ''}<span style="font-size: 11px; color: var(--text-light);">Asesor: ${escapeHtml(m.asesor_nombre)}</span>`;
      if (m.numero_remision) contactDetails += `${contactDetails ? '<br>' : ''}<span style="font-size: 11px; color: var(--primary);">Remisión: ${escapeHtml(m.numero_remision)}</span>`;
      if (m.opcion_operacion) contactDetails += `<span style="font-size: 11px; color: var(--text-light); margin-left: 4px;">(${escapeHtml(m.opcion_operacion)})</span>`;
      if (m.precio_venta > 0) contactDetails += `${contactDetails ? '<br>' : ''}<span style="font-size: 11px; font-weight: 600;">$${Number(m.precio_venta).toLocaleString('es-MX', { minimumFractionDigits: 2 })}</span>`;
    }

    const catBadge = m.categoria === 'Semilla' ? '🌽 Semilla' : '🌱 Agroquímico';

    const canDelete = user?.nivel_rol === 'Administrador';

    return `
      <tr>
        <td style="font-size: 12px; white-space: nowrap;">${dateOnly}</td>
        <td><span style="font-size: 11px; font-weight: 600;">${catBadge}</span></td>
        <td><span class="badge ${isEntry ? 'badge-success' : 'badge-warning'}">${escapeHtml(m.tipo_movimiento || (isEntry ? 'Entrada' : 'Salida'))}</span></td>
        <td><strong>${escapeHtml(m.producto_nombre)}</strong>${loteTamanoStr}</td>
        <td style="font-size: 12px;">${contactDetails || '-'}</td>
        <td style="text-align: right; color: var(--success); font-weight: 600;">${valEnt}</td>
        <td style="text-align: right; color: var(--danger); font-weight: 600;">${valSal}</td>
        <td style="text-align: right; font-weight: 700;">${Number(m.existencias_resultantes || 0).toLocaleString('es-MX', { minimumFractionDigits: 3 })}</td>
        <td style="text-align: center;">
          ${canDelete ? `<button class="btn-icon" style="color: var(--danger); font-size: 16px; padding: 4px;" onclick="deleteWarehouseMovement(${m.id})" title="Eliminar registro">🗑️</button>` : ''}
        </td>
      </tr>
    `;
  }).join('');
}

async function deleteWarehouseMovement(id) {
  if (!confirm('¿Estás seguro de que deseas eliminar este movimiento? Esta acción recalculará las existencias posteriores.')) {
    return;
  }
  
  try {
    const res = await fetch(`${API_URL}/api/almacen/movimientos/${id}`, {
      method: 'DELETE',
      headers: getHeaders()
    });
    
    if (!res.ok) {
      const errorData = await res.json().catch(() => ({}));
      throw new Error(errorData.error || 'No fue posible eliminar el movimiento.');
    }
    
    alert('Movimiento eliminado correctamente.');
    loadAlmacenData();
  } catch (err) {
    console.error(err);
    alert('Error: ' + err.message);
  }
}

async function loadWarehouseMovements() {
  const category = document.getElementById('movement-filter-category')?.value || '';
  const type = document.getElementById('movement-filter-type')?.value || '';
  const productId = document.getElementById('movement-filter-product')?.value || '';
  const clienteId = document.getElementById('movement-filter-client')?.value || '';

  const params = new URLSearchParams();
  if (category) params.set('categoria', category);
  if (type) params.set('tipo_movimiento', type);
  if (productId) params.set('producto_id', productId);
  if (clienteId) params.set('cliente_id', clienteId);

  const query = params.toString();
  try {
    const res = await fetch(`${API_URL}/api/almacen/movimientos${query ? `?${query}` : ''}`, { headers: getHeaders() });
    if (!res.ok) throw new Error('No fue posible cargar el historial de movimientos.');
    allMovements = await res.json();
    renderWarehouseMovements(allMovements);
  } catch (err) {
    console.warn('Error loading warehouse movements:', err);
    const movesTbody = document.getElementById('movements-tbody');
    if (movesTbody) {
      movesTbody.innerHTML = `<tr><td colspan="9" style="text-align: center; color: var(--danger); padding: 16px;"><span style="display: block; margin-bottom: 8px; font-size: 13px;">No se pudo conectar con el servidor temporalmente.</span><button type="button" class="btn btn-secondary" onclick="loadWarehouseMovements()" style="padding: 4px 12px; font-size: 12px; width: auto; display: inline-flex; align-items: center; gap: 6px;">🔄 Reintentar cargar historial</button></td></tr>`;
    }
    throw err;
  }
}

async function loadAlmacenData() {
  setupWarehouseFormHandlers();

  // 1. Fetch Products if needed
  try {
    if (!allProducts || allProducts.length === 0) {
      const pRes = await fetch(`${API_URL}/api/productos`, { headers: getHeaders() });
      if (pRes.ok) {
        allProducts = await pRes.json();
      }
    }
  } catch (err) {
    console.warn('Could not fetch products for warehouse:', err);
  }

  // 2. Fetch and render Current Stocks
  try {
    const stockRes = await fetch(`${API_URL}/api/almacen/existencias`, { headers: getHeaders() });
    if (!stockRes.ok) throw new Error('Error al consultar existencias');
    const stocks = await stockRes.json();
    allWarehouseStocks = Array.isArray(stocks) ? stocks : [];
    
    const stockTbody = document.getElementById('stock-tbody');
    if (stockTbody) {
      if (allWarehouseStocks.length === 0) {
        stockTbody.innerHTML = '<tr><td colspan="4" style="text-align: center; color: var(--text-light);">No hay productos registrados en el inventario.</td></tr>';
      } else {
        const canAdjustStock = user?.nivel_rol === 'Administrador';
        stockTbody.innerHTML = allWarehouseStocks.map(s => {
          const qty = Number(s.existencias || 0);
          const isLow = qty <= 0;
          const statusBadge = isLow ? `<span class="badge badge-danger">Sin Stock</span>` : `<span class="badge badge-success">Disponible</span>`;
          const qtyFormatted = qty.toLocaleString('es-MX', { minimumFractionDigits: 3 });
          const prodName = escapeHtml(s.producto || 'Sin Nombre');
          const catName = escapeHtml(s.tipo_categoria || '-');
          
          return `
            <tr ${canAdjustStock ? `onclick="openStockAdjustmentModal(${s.id})" title="Editar existencias físicas de ${prodName}"` : ''} style="${isLow ? 'background-color: #fff5f5;' : ''}${canAdjustStock ? ' cursor: pointer;' : ''}">
              <td><strong>${prodName}</strong></td>
              <td>${catName}</td>
              <td style="text-align: right; font-weight: 600; ${isLow ? 'color: var(--danger);' : ''}">${qtyFormatted}</td>
              <td>${statusBadge}</td>
            </tr>
          `;
        }).join('');
      }
    }
  } catch (err) {
    console.error('Failed to load Almacen stock existencias:', err);
    const stockTbody = document.getElementById('stock-tbody');
    if (stockTbody) {
      stockTbody.innerHTML = '<tr><td colspan="4" style="text-align: center; color: var(--danger);">Error al cargar las existencias físicas.</td></tr>';
    }
  }

  // 3. Populate form dropdowns and load movements in background
  try {
    populateWarehouseProductControls();
    await loadWarehouseMovementTypes();
    await loadWarehouseMovements();
  } catch (err) {
    console.warn('Failed to load warehouse movements history:', err);
  }

  // 4. Load auxiliary controls (Advisors and Clients) asynchronously
  populateWarehouseAuxiliaryControls().catch(err => {
    console.warn('Failed to load auxiliary controls:', err);
  });
}

window.openStockAdjustmentModal = function(productId) {
  if (user?.nivel_rol !== 'Administrador') return;
  const stock = allWarehouseStocks.find(item => Number(item.id) === Number(productId));
  if (!stock) return;
  document.getElementById('stock-adjustment-product-id').value = stock.id;
  document.getElementById('stock-adjustment-product-name').value = stock.producto;
  document.getElementById('stock-adjustment-current').value = Number(stock.existencias).toLocaleString('es-MX', { minimumFractionDigits: 3 });
  document.getElementById('stock-adjustment-quantity').value = stock.existencias;
  document.getElementById('stock-adjustment-notes').value = '';
  openModal('stock-adjustment-modal');
};

document.getElementById('stock-adjustment-form').addEventListener('submit', async event => {
  event.preventDefault();
  const productId = document.getElementById('stock-adjustment-product-id').value;
  const existencias = Number(document.getElementById('stock-adjustment-quantity').value);
  if (!Number.isFinite(existencias) || existencias < 0) {
    alert('Indica una existencia física válida, igual o mayor a cero.');
    return;
  }
  try {
    const res = await fetch(`${API_URL}/api/almacen/existencias/${productId}/ajuste`, {
      method: 'POST',
      headers: getHeaders(),
      body: JSON.stringify({
        existencias,
        notas: document.getElementById('stock-adjustment-notes').value.trim()
      })
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || 'No fue posible ajustar las existencias.');
    closeModal('stock-adjustment-modal');
    await loadAlmacenData();
    alert(data.message);
  } catch (err) {
    alert(err.message);
  }
});



// Filter handlers for movement history
document.getElementById('movement-filter-category')?.addEventListener('change', () => {
  loadWarehouseMovements().catch(err => alert(err.message));
});
document.getElementById('movement-filter-type')?.addEventListener('change', () => {
  loadWarehouseMovements().catch(err => alert(err.message));
});
document.getElementById('movement-filter-product')?.addEventListener('change', () => {
  loadWarehouseMovements().catch(err => alert(err.message));
});
document.getElementById('movement-filter-client')?.addEventListener('change', () => {
  loadWarehouseMovements().catch(err => alert(err.message));
});

// Manual movement submission handler (Entradas y Salidas)
document.getElementById('add-movement-form').addEventListener('submit', async (e) => {
  e.preventDefault();
  
  const categoria = document.getElementById('move-categoria').value;
  const tipoOp = document.getElementById('move-tipo-operacion').value; // 'Salida' o 'Entrada'
  const productoId = Number(document.getElementById('move-prod').value);
  const isSalida = tipoOp === 'Salida';
  const fecha = document.getElementById('move-fecha').value;
  const notas = document.getElementById('move-notas').value.trim();

  const itemRows = document.querySelectorAll('#movement-items-list .movement-item-row');
  if (itemRows.length === 0) {
    alert('Por favor agrega al menos un producto a la remisión.');
    return;
  }

  const items = [];
  for (let i = 0; i < itemRows.length; i++) {
    const row = itemRows[i];
    const indexLabel = `Partida #${i + 1}`;
    const prodSelect = row.querySelector('.move-item-prod');
    const prodId = Number(prodSelect?.value);
    if (!prodId) {
      alert(`Por favor selecciona un producto en la ${indexLabel}.`);
      prodSelect?.focus();
      return;
    }

    const prodObj = (allProducts || []).find(p => p.id === prodId) || (allAdminProductos || []).find(p => p.id === prodId);
    const isSeed = prodObj?.tipo_categoria === 'Híbrido' || prodObj?.tipo_categoria === 'Semilla';

    const selectTamano = row.querySelector('.move-item-tamano');
    const inputTamanoCustom = row.querySelector('.move-item-tamano-custom');
    let tamano = selectTamano ? selectTamano.value.trim() : '';
    if (tamano === 'Otro' && inputTamanoCustom) {
      tamano = inputTamanoCustom.value.trim();
    }

    if (isSeed && !tamano) {
      alert(`El tamaño es obligatorio para el producto "${prodObj?.producto || prodId}" en la ${indexLabel}.`);
      selectTamano?.focus();
      return;
    }

    const loteSelect = row.querySelector('.move-item-lote-select');
    const loteInput = row.querySelector('.move-item-lote-input');
    const lote = (isSalida ? loteSelect?.value : loteInput?.value || '').trim();

    if (!lote) {
      alert(`El número de Lote es obligatorio en la ${indexLabel}.`);
      if (isSalida) loteSelect?.focus(); else loteInput?.focus();
      return;
    }

    const cantidadInput = row.querySelector('.move-item-cantidad');
    const cantidad = Number(cantidadInput?.value) || 0;
    if (cantidad <= 0) {
      alert(`Ingresa una cantidad válida mayor a cero en la ${indexLabel}.`);
      cantidadInput?.focus();
      return;
    }

    if (isSalida && loteSelect) {
      const selectedOption = loteSelect.options[loteSelect.selectedIndex];
      const disp = selectedOption ? Number(selectedOption.getAttribute('data-existencias')) : NaN;
      if (Number.isFinite(disp) && cantidad > disp) {
        alert(`Existencias insuficientes para el lote "${lote}" en la ${indexLabel}. Disponibles: ${disp.toLocaleString('es-MX', { minimumFractionDigits: 3 })}, Requeridas: ${cantidad.toLocaleString('es-MX', { minimumFractionDigits: 3 })}`);
        cantidadInput?.focus();
        return;
      }
    }

    const precioInput = row.querySelector('.move-item-precio');
    const precioVenta = isSalida ? (Number(precioInput?.value) || 0.0) : 0.0;

    items.push({
      producto_id: prodId,
      lote,
      tamano: tamano || null,
      cantidad,
      precio_venta: precioVenta,
      categoria: prodObj?.tipo_categoria || 'Agroquímicos'
    });
  }

  const payload = {
    tipo: tipoOp,
    fecha_movimiento: fecha ? new Date(fecha).toISOString() : new Date().toISOString(),
    notas,
    items
  };

  if (isSalida) {
    payload.opcion_operacion = document.getElementById('move-opcion').value;
    payload.numero_remision = document.getElementById('move-remision').value.trim();
    payload.numero_movimiento = document.getElementById('move-num-salida').value.trim();
    payload.asesor_id = Number(document.getElementById('move-asesor').value) || null;
    payload.cliente_id = Number(document.getElementById('move-cliente').value) || null;
    payload.tipo_movimiento = `Salida (${payload.opcion_operacion})`;
  } else {
    payload.proveedor_cliente = document.getElementById('move-proveedor').value.trim();
    payload.numero_movimiento = document.getElementById('move-num-entrada').value.trim();
    payload.tipo_movimiento = 'Entrada';
  }

  try {
    const res = await fetch(`${API_URL}/api/almacen/movimientos`, {
      method: 'POST',
      headers: getHeaders(),
      body: JSON.stringify(payload)
    });

    const data = await res.json();
    if (!res.ok) {
      throw new Error(data.error || 'No fue posible registrar el movimiento.');
    }

    document.getElementById('add-movement-form').reset();
    document.getElementById('move-fecha').value = new Date().toISOString().slice(0, 10);
    document.getElementById('cat-btn-all')?.click();
    document.getElementById('op-btn-salida')?.click();

    // Reset items list to 1 single clean row
    initWarehouseMovementItems();

    await loadAlmacenData();
    alert(data.message || 'Movimientos registrados exitosamente.');
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
let allAdminKeyAccounts = [];

// Tab switching
if (document.getElementById('tab-admin-asesores')) {
  document.getElementById('tab-admin-asesores').addEventListener('click', () => switchAdminTab('asesores'));
  document.getElementById('tab-admin-productos').addEventListener('click', () => switchAdminTab('productos'));
  document.getElementById('tab-admin-metas').addEventListener('click', () => switchAdminTab('metas'));
  document.getElementById('tab-admin-ciclos').addEventListener('click', () => switchAdminTab('ciclos'));
  document.getElementById('tab-admin-cuentas').addEventListener('click', () => switchAdminTab('cuentas'));
  document.getElementById('tab-admin-mantenimiento').addEventListener('click', () => switchAdminTab('mantenimiento'));
}

function switchAdminTab(tabName) {
  adminActiveTab = tabName;
  document.getElementById('tab-admin-asesores').classList.remove('active');
  document.getElementById('tab-admin-productos').classList.remove('active');
  document.getElementById('tab-admin-metas').classList.remove('active');
  document.getElementById('tab-admin-ciclos').classList.remove('active');
  document.getElementById('tab-admin-cuentas').classList.remove('active');
  document.getElementById('panel-admin-asesores').style.display = 'none';
  document.getElementById('panel-admin-productos').style.display = 'none';
  document.getElementById('panel-admin-metas').style.display = 'none';
  document.getElementById('panel-admin-ciclos').style.display = 'none';
  document.getElementById('panel-admin-cuentas').style.display = 'none';
  document.getElementById('panel-admin-mantenimiento').style.display = 'none';
  
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
  } else if (adminActiveTab === 'cuentas') {
    await loadAdminKeyAccounts();
  }
}

async function loadAdminKeyAccounts() {
  const tbody = document.getElementById('admin-cuentas-clave-tbody');
  if (!tbody) return;
  tbody.innerHTML = '<tr><td colspan="4" style="text-align:center; color:var(--text-light);">Cargando cuentas clave...</td></tr>';
  try {
    const res = await fetch(`${API_URL}/api/cuentas-clave`, { headers: getHeaders() });
    const data = await res.json();
    if (!res.ok || !Array.isArray(data)) throw new Error(data.error || 'No fue posible cargar las cuentas clave');
    allAdminKeyAccounts = data;
    if (!data.length) {
      tbody.innerHTML = '<tr><td colspan="4" style="text-align:center; color:var(--text-light);">No hay cuentas clave registradas.</td></tr>';
      return;
    }
    tbody.innerHTML = data.map(account => `
      <tr>
        <td><strong>${escapeHtml(account.tier_name)}</strong></td>
        <td>${escapeHtml(account.descripcion || '-')}</td>
        <td style="text-align:right; font-weight:600;">$${Number(account.descuento_mxn || 0).toLocaleString('es-MX', { minimumFractionDigits: 2 })}</td>
        <td>
          <button class="btn btn-secondary" style="width:auto; padding:4px 8px; font-size:12px; margin:0;" onclick="openEditCuentaClaveModal(${account.id})">Editar</button>
          <button class="btn btn-secondary" style="width:auto; padding:4px 8px; font-size:12px; margin-left:8px; border-color:var(--danger); color:var(--danger);" onclick="deleteCuentaClave(${account.id})">Eliminar</button>
        </td>
      </tr>
    `).join('');
  } catch (err) {
    tbody.innerHTML = `<tr><td colspan="4" style="text-align:center; color:var(--danger);">Error: ${escapeHtml(err.message)}</td></tr>`;
  }
}

document.getElementById('btn-open-cuenta-clave-modal')?.addEventListener('click', () => {
  document.getElementById('add-cuenta-clave-form').reset();
  document.getElementById('cuenta-clave-id').value = '';
  document.getElementById('cuenta-clave-descuento').value = '0';
  document.getElementById('cuenta-clave-modal-title').textContent = 'Registrar Cuenta Clave';
  openModal('add-cuenta-clave-modal');
});

window.openEditCuentaClaveModal = function(id) {
  const account = allAdminKeyAccounts.find(item => Number(item.id) === Number(id));
  if (!account) return;
  document.getElementById('cuenta-clave-id').value = account.id;
  document.getElementById('cuenta-clave-nombre').value = account.tier_name || '';
  document.getElementById('cuenta-clave-descripcion').value = account.descripcion || '';
  document.getElementById('cuenta-clave-descuento').value = Number(account.descuento_mxn || 0);
  document.getElementById('cuenta-clave-modal-title').textContent = 'Editar Cuenta Clave';
  openModal('add-cuenta-clave-modal');
};

document.getElementById('add-cuenta-clave-form')?.addEventListener('submit', async event => {
  event.preventDefault();
  const id = document.getElementById('cuenta-clave-id').value;
  const payload = {
    nombre: document.getElementById('cuenta-clave-nombre').value.trim(),
    descripcion: document.getElementById('cuenta-clave-descripcion').value.trim(),
    descuento_mxn: Number(document.getElementById('cuenta-clave-descuento').value) || 0
  };
  try {
    const res = await fetch(id ? `${API_URL}/api/cuentas-clave/${id}` : `${API_URL}/api/cuentas-clave`, {
      method: id ? 'PUT' : 'POST',
      headers: getHeaders(),
      body: JSON.stringify(payload)
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || 'No fue posible guardar la cuenta clave');
    closeModal('add-cuenta-clave-modal');
    catalogKeyAccountsLoaded = false;
    await loadAdminKeyAccounts();
    alert('Cuenta clave guardada correctamente.');
  } catch (err) {
    alert(err.message);
  }
});

window.deleteCuentaClave = async function(id) {
  if (!confirm('¿Eliminar esta cuenta clave? Solo es posible si no tiene agricultores asignados.')) return;
  try {
    const res = await fetch(`${API_URL}/api/cuentas-clave/${id}`, { method: 'DELETE', headers: getHeaders() });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || 'No fue posible eliminar la cuenta clave');
    catalogKeyAccountsLoaded = false;
    await loadAdminKeyAccounts();
    alert('Cuenta clave eliminada correctamente.');
  } catch (err) {
    alert(err.message);
  }
};

const openProductionCleanupBtn = document.getElementById('btn-open-production-cleanup');
if (openProductionCleanupBtn) {
  openProductionCleanupBtn.addEventListener('click', () => {
    document.getElementById('production-cleanup-confirmation').value = '';
    openModal('production-cleanup-modal');
  });
}

const confirmProductionCleanupBtn = document.getElementById('btn-confirm-production-cleanup');
if (confirmProductionCleanupBtn) {
  confirmProductionCleanupBtn.addEventListener('click', async () => {
    const confirmation = document.getElementById('production-cleanup-confirmation').value.trim();
    if (confirmation !== 'LIMPIAR PRODUCCION') {
      alert('Escribe LIMPIAR PRODUCCION para confirmar la limpieza.');
      return;
    }

    confirmProductionCleanupBtn.disabled = true;
    try {
      const res = await fetch(`${API_URL}/api/admin/limpiar-operacion`, {
        method: 'POST',
        headers: getHeaders(),
        body: JSON.stringify({ confirmacion: confirmation })
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'No fue posible limpiar los datos');

      closeModal('production-cleanup-modal');
      alert(`Limpieza completada. Respaldo #${data.respaldo_id}. Se conservaron ${data.conservado.bitacora_crm} registros de bitácora CRM.`);
      loadCRMBoardData();
      loadWeeklySchedule();
    } catch (err) {
      alert(err.message);
    } finally {
      confirmProductionCleanupBtn.disabled = false;
    }
  });
}

const openWarehouseCleanupBtn = document.getElementById('btn-open-warehouse-cleanup');
if (openWarehouseCleanupBtn) {
  openWarehouseCleanupBtn.addEventListener('click', () => {
    document.getElementById('warehouse-cleanup-confirmation').value = '';
    openModal('warehouse-cleanup-modal');
  });
}

const confirmWarehouseCleanupBtn = document.getElementById('btn-confirm-warehouse-cleanup');
if (confirmWarehouseCleanupBtn) {
  confirmWarehouseCleanupBtn.addEventListener('click', async () => {
    const confirmation = document.getElementById('warehouse-cleanup-confirmation').value.trim();
    if (confirmation !== 'LIMPIAR ALMACEN') {
      alert('Escribe LIMPIAR ALMACEN para confirmar la limpieza.');
      return;
    }

    confirmWarehouseCleanupBtn.disabled = true;
    try {
      const res = await fetch(`${API_URL}/api/admin/limpiar-almacen`, {
        method: 'POST',
        headers: getHeaders(),
        body: JSON.stringify({ confirmacion: confirmation })
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'No fue posible limpiar el almacén');

      closeModal('warehouse-cleanup-modal');
      await loadAlmacenData();
      alert(`Limpieza de almacén completada. Respaldo #${data.respaldo_id}. Se eliminaron ${data.eliminado.movimientos_almacen} movimientos y las existencias quedaron en cero.`);
    } catch (err) {
      alert(err.message);
    } finally {
      confirmWarehouseCleanupBtn.disabled = false;
    }
  });
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
  tbody.innerHTML = '<tr><td colspan="9" style="text-align: center; color: var(--text-light);">Cargando...</td></tr>';
  
  try {
    const res = await fetch(`${API_URL}/api/productos?include_inactive=1`, { headers: getHeaders() });
    allAdminProductos = await res.json();
    
    tbody.innerHTML = '';
    if (allAdminProductos.length === 0) {
      tbody.innerHTML = '<tr><td colspan="9" style="text-align: center;">No hay productos registrados.</td></tr>';
      return;
    }
    
    allAdminProductos.forEach(p => {
      const activeText = p.activo === 1 ? 'Activo' : 'Inactivo';
      const activeBadge = p.activo === 1 ? 'badge-success' : 'badge-danger';
      const baseUsd = p.base_usd > 0 ? `$${p.base_usd.toFixed(2)}` : '-';
      const fixedDisc = p.descuento_fijo_quimicos > 0 ? `$${p.descuento_fijo_quimicos.toFixed(2)}` : '-';
      const scaleText = p.descontar === 1 ? 'Sí' : 'No';
      const scaleBadge = p.descontar === 1 ? 'badge-success' : 'badge-warning';
      const tamanosStr = p.tamanos ? `<span style="font-size: 11px; font-weight: 600; color: #0284c7; background: #e0f2fe; padding: 2px 6px; border-radius: 4px;">${escapeHtml(p.tamanos)}</span>` : '<span style="color: var(--text-light); font-size: 11px;">-</span>';
      
      tbody.innerHTML += `
        <tr style="${p.activo === 0 ? 'background-color: #f8fafc; opacity: 0.75;' : ''}">
          <td><strong>${p.producto}</strong></td>
          <td>${p.tipo_categoria}</td>
          <td>${tamanosStr}</td>
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
              <button class="btn btn-secondary" title="Eliminar producto" aria-label="Eliminar ${escapeHtml(p.producto)}" style="width: auto; padding: 4px 8px; font-size: 12px; margin: 0; border-color: var(--danger); color: var(--danger);" onclick="deleteProducto(${p.id})">🗑️</button>
            </div>
          </td>
        </tr>
      `;
    });
  } catch (err) {
    tbody.innerHTML = `<tr><td colspan="9" style="text-align: center; color: var(--danger);">Error al cargar productos: ${err.message}</td></tr>`;
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
const PRODUCT_CATEGORIES = [
  { value: 'Híbrido', label: 'Híbrido (Semilla)' },
  { value: 'Agroquímico', label: 'Agroquímico' },
  { value: 'Fertilizante', label: 'Fertilizante' }
];

function populateProductCategorySelect(selectedCategory = 'Híbrido') {
  const select = document.getElementById('prod-category');
  if (!select) return;

  const categories = [...PRODUCT_CATEGORIES];
  if (selectedCategory && !categories.some(category => category.value === selectedCategory)) {
    categories.push({ value: selectedCategory, label: selectedCategory });
  }

  select.innerHTML = categories
    .map(category => `<option value="${escapeAttribute(category.value)}">${escapeHtml(category.label)}</option>`)
    .join('');
  select.value = selectedCategory || 'Híbrido';
}

if (document.getElementById('btn-open-producto-modal')) {
  document.getElementById('btn-open-producto-modal').addEventListener('click', () => {
    document.getElementById('add-producto-form').reset();
    document.getElementById('producto-form-id').value = '';
    document.getElementById('producto-modal-title').textContent = 'Registrar Nuevo Producto';
    document.getElementById('producto-submit-btn').textContent = 'Registrar Producto';
    document.getElementById('prod-status').value = '1';
    document.getElementById('prod-sizes').value = '';
    populateProductCategorySelect();
    
    // Show stock field for new entries
    document.getElementById('group-stock-inicial').style.display = 'block';
    
    openModal('add-producto-modal');
  });
}

window.openEditProductoModal = function(id) {
  const p = allAdminProductos.find(x => x.id === id) || allProducts.find(x => x.id === id);
  if (!p) return;
  
  document.getElementById('producto-form-id').value = p.id;
  document.getElementById('prod-key').value = p.clave || '';
  document.getElementById('prod-name').value = p.producto;
  document.getElementById('prod-description').value = p.descripcion || '';
  document.getElementById('prod-sizes').value = p.tamanos || '';
  populateProductCategorySelect(p.tipo_categoria);
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
    clave: document.getElementById('prod-key').value.trim(),
    producto: document.getElementById('prod-name').value.trim(),
    descripcion: document.getElementById('prod-description').value.trim(),
    tipo_categoria: document.getElementById('prod-category').value,
    tamanos: document.getElementById('prod-sizes').value.trim(),
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
    await loadCatalogData();
    if (selectedProgramacionProductId && Number(selectedProgramacionProductId) === Number(id || data.id)) {
      await loadMonthlyPricingTable(selectedProgramacionProductId);
    }
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

window.deleteProducto = async function(id) {
  const product = allAdminProductos.find(item => item.id === id);
  if (!product) return;
  if (!confirm(`¿Eliminar definitivamente "${product.producto}"? Esta acción no se puede deshacer.`)) return;

  try {
    const res = await fetch(`${API_URL}/api/productos/${id}`, {
      method: 'DELETE',
      headers: getHeaders()
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || 'No fue posible eliminar el producto.');

    await loadAdminProductos();
    await loadCatalogData();
    alert('Producto eliminado correctamente.');
  } catch (err) {
    alert(err.message);
  }
};

// -------------------------------------------------------------
// WEEKLY PLANNING VIEW LOGIC
// -------------------------------------------------------------
let activePlanWeek = '';
let planClientSearchController = null;
let allPlanClients = [];
let planClientAdvisorId = null;
let activeStageReportContext = null;
let activePlanModalPlan = null;

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

  const advisorLabel = document.getElementById('plan-advisor-filter-label');
  if (advisorLabel) {
    advisorLabel.textContent = user.nivel_rol === 'Administrador' ? 'Asesor responsable' : 'Filtrar Asesor';
  }
  
  const loaders = [loadWeeklySchedule()];
  if (user.nivel_rol === 'Administrador' || user.nivel_rol === 'Coordinador') loaders.push(loadPlanAdvisorOptions());
  if (user.nivel_rol === 'Asesor') loaders.push(loadCatalogStageStates());
  await Promise.all(loaders);
}

async function loadPlanAdvisorOptions() {
  const filterSelect = document.getElementById('plan-advisor-filter');
  if (!filterSelect) return;
  
  try {
    const res = await fetch(`${API_URL}/api/asesores`, { headers: getHeaders() });
    const advisers = await res.json();
    if (!res.ok || !Array.isArray(advisers)) throw new Error('No fue posible cargar asesores');
    const activeAdvisers = advisers.filter(a => Number(a.activo) === 1);

    if (filterSelect) {
      const currentFilter = filterSelect.value || 'ALL';
      filterSelect.innerHTML = '<option value="ALL">Todos los Asesores</option>';
      activeAdvisers.forEach(a => {
        filterSelect.innerHTML += `<option value="${a.id}">${escapeHtml(a.nombre)}</option>`;
      });
      filterSelect.value = currentFilter;
    }

  } catch (err) {
    console.error(err);
  }
}

function getPlanClientAdvisorId() {
  if (!['Administrador', 'Coordinador'].includes(user?.nivel_rol)) return user?.id || null;
  const advisorId = document.getElementById('plan-advisor-filter')?.value;
  return advisorId && advisorId !== 'ALL' ? advisorId : null;
}

function renderPlanClientOptions(searchTerm = '') {
  const select = document.getElementById('plan-client');
  if (!select) return;

  const normalizedSearch = String(searchTerm || '').trim().toLocaleLowerCase('es-MX');
  const matchingClients = normalizedSearch
    ? allPlanClients.filter(client => [client.nombre, client.ubicacion, client.contacto]
      .some(value => String(value || '').toLocaleLowerCase('es-MX').includes(normalizedSearch)))
    : allPlanClients;
  const selectedClientId = select.value;
  select.replaceChildren(new Option(
    matchingClients.length ? '-- Selecciona un Agricultor --' : 'Sin coincidencias',
    ''
  ));
  matchingClients.forEach(client => select.add(new Option(client.nombre, String(client.id))));
  if (matchingClients.some(client => String(client.id) === selectedClientId)) {
    select.value = selectedClientId;
  }
}

async function loadPlanClientOptions(searchTerm = '', forceReload = false) {
  const select = document.getElementById('plan-client');
  if (!select) return;

  const advisorId = getPlanClientAdvisorId();
  try {
    if (!forceReload && planClientAdvisorId === String(advisorId)) {
      renderPlanClientOptions(searchTerm);
      return;
    }

    if (planClientSearchController) planClientSearchController.abort();
    planClientSearchController = new AbortController();
    select.replaceChildren(new Option('Cargando agricultores...', ''));
    const params = new URLSearchParams();
    if (advisorId) params.set('asesor_id', advisorId);
    const res = await fetch(`${API_URL}/api/clientes?${params.toString()}`, {
      headers: getHeaders(),
      signal: planClientSearchController.signal
    });
    const payload = await res.json();
    if (!res.ok || !Array.isArray(payload)) throw new Error(payload.error || 'No fue posible cargar agricultores');
    if (String(getPlanClientAdvisorId()) !== String(advisorId)) return;

    allPlanClients = payload;
    planClientAdvisorId = String(advisorId);
    renderPlanClientOptions(document.getElementById('plan-client-search')?.value || searchTerm);
  } catch (err) {
    if (err.name === 'AbortError') return;
    console.error(err);
    select.replaceChildren(new Option('No fue posible cargar agricultores', ''));
  }
}

function setPlanClientSelection(clientId, clientName) {
  const select = document.getElementById('plan-client');
  if (!select) return;
  const option = new Option(clientName || `Agricultor #${clientId}`, String(clientId), true, true);
  select.replaceChildren(option);
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
    if (!res.ok || !Array.isArray(planList)) throw new Error('No fue posible cargar la planificación semanal');
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
          openEditPlanModal(p);
        });
        
        let statusBadge = '';
        if (p.realizada === 1) statusBadge = '<span class="badge badge-success" style="font-size: 8px; padding: 2px 6px;">Realizada</span>';
        if (p.realizada === 2) statusBadge = '<span class="badge" style="font-size: 8px; padding: 2px 6px; background-color: #f1f5f9; color: var(--text-light); border-color: var(--border);">Cancelada</span>';
        if (p.realizada === 3) statusBadge = '<span class="badge badge-danger" style="font-size: 8px; padding: 2px 6px;">Vencida</span>';
        if (p.realizada === 0) statusBadge = '<span class="badge badge-info" style="font-size: 8px; padding: 2px 6px;">Pendiente</span>';

        const bagsText = p.pronostico_bolsas > 0 ? `📦 ${p.pronostico_bolsas} b.` : '';
        const amtText = p.pronostico_monto_mxn > 0 ? `💰 $${p.pronostico_monto_mxn.toLocaleString('es-MX', {maximumFractionDigits: 0})}` : '';
        const forecastText = (bagsText || amtText) ? `<div style="font-size: 11px; margin-top: 4px; font-weight: 600; color: var(--accent);">${bagsText} ${amtText}</div>` : '';
        
        const canManageOwnPlan = p.asesor_id === user.id || user.nivel_rol === 'Administrador';
        const isAdmin = user.nivel_rol === 'Administrador';
        let actions = '';
        if (p.realizada === 0 && canManageOwnPlan) {
          actions = `
            <div style="display: flex; gap: 8px; margin-top: 8px; border-top: 1px solid #f1f5f9; padding-top: 8px; justify-content: flex-end;">
              <button class="btn btn-secondary" style="padding: 4px 8px; font-size: 10px; margin: 0; width: auto;" onclick="openCompletePlanModal(${p.id})">✔️ Cerrar</button>
              ${isAdmin ? `<button class="btn btn-secondary" title="Eliminar actividad" aria-label="Eliminar actividad" style="padding: 4px 8px; font-size: 10px; margin: 0; width: auto; border-color: var(--danger); color: var(--danger);" onclick="deletePlanActivity(${p.id})">🗑️</button>` : ''}
            </div>
          `;
        } else if (p.realizada === 3 && canManageOwnPlan) {
          actions = `
            <div style="display: flex; gap: 8px; margin-top: 8px; border-top: 1px solid #f1f5f9; padding-top: 8px; justify-content: flex-end;">
              <button class="btn btn-secondary" style="padding: 4px 8px; font-size: 10px; margin: 0; width: auto; border-color: var(--accent); color: var(--accent);" onclick="openEditPlanModal(currentPlanList.find(plan => plan.id === ${p.id}))">📋 Prospecto</button>
              ${isAdmin ? `<button class="btn btn-secondary" title="Eliminar actividad" aria-label="Eliminar actividad" style="padding: 4px 8px; font-size: 10px; margin: 0; width: auto; border-color: var(--danger); color: var(--danger);" onclick="deletePlanActivity(${p.id})">🗑️</button>` : ''}
            </div>
          `;
        } else if (isAdmin) {
          actions = `
            <div style="display: flex; gap: 8px; margin-top: 8px; border-top: 1px solid #f1f5f9; padding-top: 8px; justify-content: flex-end;">
              <button class="btn btn-secondary" title="Eliminar actividad" aria-label="Eliminar actividad" style="padding: 4px 8px; font-size: 10px; margin: 0; width: auto; border-color: var(--danger); color: var(--danger);" onclick="deletePlanActivity(${p.id})">🗑️</button>
            </div>
          `;
        }
        
        card.innerHTML = `
          <div style="display: flex; align-items: flex-start; gap: 8px; margin-bottom: 4px;">
            <input type="checkbox" class="card-select-checkbox" data-id="${p.id}" style="width: 15px; height: 15px; cursor: pointer; margin-top: 3px;">
            <div style="flex-grow: 1;">
              <div style="display: flex; justify-content: space-between; align-items: flex-start; gap: 6px;">
                <div class="plan-card-client">
                  <strong style="font-size: 13.5px; color: var(--text);">${escapeHtml(p.cliente_nombre)}</strong>
                </div>
                ${statusBadge}
              </div>
              <div style="font-size: 11px; color: var(--text-light); font-weight: 500;">Visita: ${p.fecha_programada.slice(5)}</div>
              <div style="font-size: 12px; color: var(--text); margin-top: 4px; font-style: italic;">"${escapeHtml(p.objetivo_visita || 'Sin objetivo')}"</div>
              ${forecastText}
              <div style="font-size: 10px; color: var(--text-light); margin-top: 4px;">👤 Asesor: ${escapeHtml((p.asesor_nombre || '').split(' ')[0])}</div>
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
            updatePlanSelectionControls();
          });
        }
      }
    });
    
    for (let i = 1; i <= 5; i++) {
      document.getElementById(`count-day-${i}`).textContent = dayCounts[i - 1];
    }
    updatePlanSelectionControls();
    loadPlanningMetaProgress(advisorId);
  } catch (err) {
    console.error(err);
    for (let i = 1; i <= 5; i++) {
      const column = document.getElementById(`agenda-day-${i}`);
      if (column) column.innerHTML = '<div style="padding: 12px; color: var(--danger); font-size: 12px;">No fue posible cargar la agenda.</div>';
    }
    updatePlanSelectionControls();
  }
}

async function loadPlanningMetaProgress(advisorId = 'ALL') {
  try {
    const cycle = 'O-I 2026';
    const res = await fetch(`${API_URL}/api/dashboard/proyecciones?ciclo_agricola=${cycle}`, { headers: getHeaders() });
    if (!res.ok) throw new Error('No fue posible cargar el avance comercial');
    let rollups = await res.json();
    if (!Array.isArray(rollups)) throw new Error('Respuesta de avance comercial inválida');
    
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
    updatePlanSelectionControls();
  } catch (err) {
    console.error(err);
    document.getElementById('meta-progress-mxn-text').textContent = 'No disponible';
    document.getElementById('meta-progress-bags-text').textContent = 'No disponible';
    document.getElementById('meta-progress-mxn-bar').style.width = '0%';
    document.getElementById('meta-progress-bags-bar').style.width = '0%';
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
  updatePlanSelectionControls();
};

function updatePlanSelectionControls() {
  const bulkDeleteBtn = document.getElementById('btn-delete-selected-plans');
  const selectedCount = document.getElementById('selected-plans-count');
  const selectedIds = Array.from(document.querySelectorAll('.card-select-checkbox:checked'));
  const isAdmin = user?.nivel_rol === 'Administrador';
  if (bulkDeleteBtn) {
    bulkDeleteBtn.style.display = isAdmin ? 'inline-flex' : 'none';
    bulkDeleteBtn.disabled = selectedIds.length === 0;
  }
  if (selectedCount) selectedCount.textContent = selectedIds.length;
}

// Binds week change and advisor filter change
document.getElementById('plan-week-select').addEventListener('change', () => {
  loadWeeklySchedule();
});

const planAdvFilter = document.getElementById('plan-advisor-filter');
if (planAdvFilter) {
  planAdvFilter.addEventListener('change', () => {
    loadWeeklySchedule();
    const planModal = document.getElementById('add-plan-modal');
    if (planModal?.classList.contains('active') && !activePlanModalPlan) {
      document.getElementById('plan-client-search').value = '';
      loadPlanClientOptions('', true);
    }
  });
}

const planClientSearch = document.getElementById('plan-client-search');
if (planClientSearch) {
  planClientSearch.addEventListener('input', () => {
    renderPlanClientOptions(planClientSearch.value);
  });
}

document.getElementById('btn-open-plan-modal').addEventListener('click', () => {
  activePlanModalPlan = null;
  document.getElementById('add-plan-form').reset();
  document.getElementById('plan-form-id').value = '';
  document.getElementById('plan-date').value = new Date().toISOString().slice(0, 10);
  document.getElementById('plan-client-search').value = '';
  loadPlanClientOptions();
  
  // A report must be tied to a saved visit. It becomes available immediately
  // after the visit is created and the modal reopens in edit mode.
  const stagesContainer = document.getElementById('plan-modal-stages-container');
  if (stagesContainer) stagesContainer.innerHTML = '';
  
  const modalTitle = document.getElementById('plan-modal-title');
  if (modalTitle) modalTitle.textContent = 'Programar Nueva Visita';
  
  const submitBtn = document.getElementById('plan-submit-btn');
  if (submitBtn) {
    submitBtn.style.display = 'inline-block';
    submitBtn.textContent = 'Programar Actividad';
  }
  
  const convertBtn = document.getElementById('btn-convert-to-prospect');
  if (convertBtn) convertBtn.style.display = 'none';
  
  // Re-enable all fields
  const form = document.getElementById('add-plan-form');
  form.querySelectorAll('.form-input').forEach(input => {
    input.disabled = false;
  });
  
  openModal('add-plan-modal');
});

window.openEditPlanModal = function(p) {
  activePlanModalPlan = p;
  document.getElementById('plan-client-search').value = p.cliente_nombre || '';
  setPlanClientSelection(p.cliente_id, p.cliente_nombre);
  document.getElementById('plan-date').value = p.fecha_programada;
  document.getElementById('plan-objective').value = p.objetivo_visita || '';
  document.getElementById('plan-forecast-bags').value = p.pronostico_bolsas || 0;
  document.getElementById('plan-forecast-amount').value = p.pronostico_monto_mxn || 0;
  document.getElementById('plan-form-id').value = p.id;
  
  // Reports are available for a saved visit and use that visit's scheduled date.
  const stagesContainer = document.getElementById('plan-modal-stages-container');
  if (stagesContainer) {
    stagesContainer.innerHTML = user?.nivel_rol === 'Asesor' ? renderStageButtonsForPlan(p) : '';
    bindStageReportButtons(stagesContainer);
  }
  
  const modalTitle = document.getElementById('plan-modal-title');
  const submitBtn = document.getElementById('plan-submit-btn');
  const convertBtn = document.getElementById('btn-convert-to-prospect');
  
  const isReadOnly = p.realizada !== 0;
  
  if (modalTitle) {
    if (p.realizada === 1) {
      modalTitle.textContent = 'Detalle de Visita (Realizada)';
    } else if (p.realizada === 2) {
      modalTitle.textContent = 'Detalle de Visita (Cancelada)';
    } else {
      modalTitle.textContent = 'Editar Visita Programada';
    }
  }
  
  if (submitBtn) {
    submitBtn.style.display = isReadOnly ? 'none' : 'inline-block';
    submitBtn.textContent = 'Guardar Cambios';
  }
  
  if (convertBtn) configureProspectConversionButton(p);
  
  // Disable fields if the visit has already been concluded
  const form = document.getElementById('add-plan-form');
  form.querySelectorAll('.form-input').forEach(input => {
    input.disabled = isReadOnly;
  });
  
  openModal('add-plan-modal');
};

async function configureProspectConversionButton(plan) {
  const button = document.getElementById('btn-convert-to-prospect');
  if (!button) return;

  const canConvert = user?.nivel_rol === 'Asesor' && [1, 3].includes(Number(plan.realizada));
  button.style.display = canConvert ? 'inline-block' : 'none';
  button.disabled = true;
  button.textContent = '📋 Pasar a Prospecto';
  button.title = 'Responde al menos una encuesta activa para habilitar esta acción.';
  if (!canConvert) return;

  try {
    const res = await fetch(`${API_URL}/api/planificacion/${plan.id}/prospecto-elegibilidad`, { headers: getHeaders() });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || 'No fue posible validar las encuestas');
    if (data.prospect) {
      button.style.display = 'none';
      return;
    }
    button.disabled = !data.eligible;
    button.title = data.eligible
      ? 'Pasar esta visita al Canal de Ventas como prospecto.'
      : 'Responde al menos una encuesta de las etapas activas antes de continuar.';
  } catch (err) {
    console.error(err);
    button.disabled = true;
    button.title = 'No fue posible validar las encuestas.';
  }
}

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
  if (user?.nivel_rol === 'Administrador' && !id) {
    const selectedAdvisorId = document.getElementById('plan-advisor-filter')?.value;
    if (!selectedAdvisorId || selectedAdvisorId === 'ALL') {
      alert('Selecciona arriba al asesor responsable antes de programar la actividad.');
      return;
    }
    payload.asesor_id = Number(selectedAdvisorId);
  }
  
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
    
    await Promise.all([loadWeeklySchedule(), loadDashboardData()]);
    const savedPlan = id
      ? currentPlanList.find(plan => plan.id === Number(id))
      : currentPlanList.find(plan => plan.id === Number(data.id));

    if (!id && savedPlan && user?.nivel_rol === 'Asesor') {
      openEditPlanModal(savedPlan);
      alert('Visita programada. Ya puedes registrar las encuestas de las etapas activas.');
      return;
    }

    closeModal('add-plan-modal');
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
    
    if (!confirm('¿Pasar esta visita a prospecto? Se enviará al Canal de Ventas sin generar una cotización.')) {
      return;
    }
    
    try {
      const res = await fetch(`${API_URL}/api/planificacion/${id}/convertir-prospecto`, {
        method: 'POST',
        headers: getHeaders()
      });
      
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Failed to convert plan');
      
      closeModal('add-plan-modal');
      await Promise.all([loadWeeklySchedule(), loadCRMBoardData(), loadDashboardData()]);
      alert('La visita se convirtió en prospecto. Ya puedes abrirlo desde Canal de Ventas para cotizarlo.');
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
    await Promise.all([loadWeeklySchedule(), loadDashboardData()]);
    if (statusVal === 1) {
      const completedPlan = currentPlanList.find(plan => Number(plan.id) === Number(id));
      if (completedPlan) window.openEditPlanModal(completedPlan);
    }
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
  
  window.openEditPlanModal(p);
};

window.deletePlanActivity = async function(id) {
  if (!confirm('¿Eliminar esta actividad? La bitácora CRM ya registrada se conservará.')) return;
  
  try {
    const res = await fetch(`${API_URL}/api/planificacion/${id}`, {
      method: 'DELETE',
      headers: getHeaders()
    });
    
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || 'Failed to delete plan');
    
    await Promise.all([loadWeeklySchedule(), loadDashboardData()]);
  } catch (err) {
    alert(err.message);
  }
};

window.deleteSelectedPlanActivities = async function() {
  const ids = Array.from(document.querySelectorAll('.card-select-checkbox:checked'))
    .map(checkbox => Number(checkbox.dataset.id));
  if (ids.length === 0) return;

  if (!confirm(`¿Eliminar ${ids.length} actividad${ids.length === 1 ? '' : 'es'} seleccionada${ids.length === 1 ? '' : 's'}? La bitácora CRM ya registrada se conservará.`)) return;

  const bulkDeleteBtn = document.getElementById('btn-delete-selected-plans');
  if (bulkDeleteBtn) bulkDeleteBtn.disabled = true;
  try {
    const res = await fetch(`${API_URL}/api/planificacion/bulk-delete`, {
      method: 'POST',
      headers: getHeaders(),
      body: JSON.stringify({ ids })
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || 'No fue posible eliminar las actividades');

    await Promise.all([loadWeeklySchedule(), loadDashboardData()]);
    alert(`${data.deleted || ids.length} actividad${ids.length === 1 ? '' : 'es'} eliminada${ids.length === 1 ? '' : 's'}.`);
  } catch (err) {
    alert(err.message);
    updatePlanSelectionControls();
  }
};

document.getElementById('btn-delete-selected-plans')?.addEventListener('click', deleteSelectedPlanActivities);

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
let catalogStageStates = [];
let catalogAdvisorsLoaded = false;
let catalogKeyAccountsLoaded = false;
let catalogEventsBound = false;
let catalogSearchTimer = null;
let catalogRequestController = null;
let catalogPagination = { page: 1, limit: 50, total: 0, totalPages: 1 };

const ADVISOR_STAGE_DEFINITIONS = [
  { code: 'C', label: 'Cosecha', matcher: stage => normalizeStageText(stage).includes('cosecha') || normalizeStageKey(stage) === 'C' },
  { code: 'DV', label: 'Desarrollo Vegetativo', matcher: stage => normalizeStageText(stage).includes('vegetativo') || normalizeStageKey(stage) === 'DV' },
  { code: 'DR', label: 'Desarrollo Reproductivo', matcher: stage => normalizeStageText(stage).includes('reproductivo') || normalizeStageKey(stage) === 'DR' },
  { code: 'V', label: 'Venta', matcher: stage => normalizeStageText(stage).includes('venta') || normalizeStageKey(stage) === 'V' }
];

function escapeAttribute(value) {
  return String(value || '')
    .replace(/&/g, '&amp;')
    .replace(/"/g, '&quot;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
}

function escapeHtml(value) {
  return String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}

function normalizeStageText(stage) {
  return `${stage?.clave || ''} ${stage?.nombre || ''}`
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .trim();
}

function normalizeStageKey(stage) {
  return String(stage?.clave || '').trim().toUpperCase();
}

function parseCatalogDate(value) {
  if (!value) return null;
  const raw = String(value).trim();
  if (!raw) return null;

  const iso = raw.match(/^(\d{4})-(\d{1,2})-(\d{1,2})/);
  if (iso) {
    return new Date(Number(iso[1]), Number(iso[2]) - 1, Number(iso[3]));
  }

  const slash = raw.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
  if (slash) {
    return new Date(Number(slash[3]), Number(slash[1]) - 1, Number(slash[2]));
  }

  const parsed = new Date(raw);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
}

function isSeasonActiveByDate(season) {
  const start = parseCatalogDate(season.fecha_inicio || season.Inicio || season.inicio);
  const end = parseCatalogDate(season.fecha_fin || season.Fin || season.fin);
  if (!start || !end) return false;

  const today = new Date();
  today.setHours(0, 0, 0, 0);
  start.setHours(0, 0, 0, 0);
  end.setHours(23, 59, 59, 999);

  return today >= start && today <= end;
}

function getLocalISODate() {
  const today = new Date();
  const offset = today.getTimezoneOffset() * 60000;
  return new Date(today.getTime() - offset).toISOString().slice(0, 10);
}

function mapStageStates(stages) {
  return ADVISOR_STAGE_DEFINITIONS.map(definition => {
    const activeStage = stages.find(definition.matcher);
    return {
      ...definition,
      active: Boolean(activeStage),
      color: activeStage?.color || '#10b981',
      title: activeStage
        ? `${definition.label}: activo (${activeStage.nombre})`
        : `${definition.label}: fuera de fecha activa`
    };
  });
}

async function loadCatalogStageStates() {
  try {
    const date = getLocalISODate();
    const res = await fetch(`${API_URL}/api/programacion/etapas/activas?fecha=${encodeURIComponent(date)}`, { headers: getHeaders() });
    const stages = await res.json();
    if (!res.ok || !Array.isArray(stages)) throw new Error('Failed to load programming stages');
    catalogStageStates = mapStageStates(stages);
  } catch (err) {
    console.error('Failed to load catalog stage states:', err);
    catalogStageStates = ADVISOR_STAGE_DEFINITIONS.map(stage => ({
      ...stage,
      active: false,
      color: '#94a3b8',
      title: `${stage.label}: sin datos de fecha`
    }));
  }
}

function renderAdvisorStageButtons(onlyV = false) {
  if (user?.nivel_rol !== 'Asesor') return '';
  let stages = catalogStageStates.length > 0
    ? catalogStageStates
    : ADVISOR_STAGE_DEFINITIONS.map(stage => ({ ...stage, active: false, color: '#94a3b8', title: `${stage.label}: cargando` }));

  if (onlyV) {
    stages = stages.filter(s => s.code === 'V');
  }

  const columnsStyle = onlyV ? 'grid-template-columns: 30px; justify-content: flex-end;' : '';

  return `
    <div class="advisor-stage-buttons" aria-label="Etapas activas" style="${columnsStyle}">
      ${stages.map(stage => `
        <button type="button" class="advisor-stage-btn ${stage.active ? 'active' : 'inactive'}" ${stage.active ? `style="--stage-color: ${escapeAttribute(stage.color)};"` : ''} title="${escapeAttribute(stage.title)}" aria-label="${escapeAttribute(stage.title)}" disabled>${stage.code}</button>
      `).join('')}
    </div>
  `;
}

function getPlanStageButtons(plan) {
  const stageCodes = Array.isArray(plan?.activeStageCodes) && plan.activeStageCodes.length > 0
    ? plan.activeStageCodes
    : [];
  const activeStageDetails = Array.isArray(plan?.activeStageDetails) ? plan.activeStageDetails : [];
  const stageColorByCode = Object.fromEntries(activeStageDetails.map(detail => [detail.code, detail.color]));

  const stages = ADVISOR_STAGE_DEFINITIONS.map(definition => {
    const active = stageCodes.includes(definition.code);
    const fallbackColor = catalogStageStates.find(item => item.code === definition.code)?.color || '#10b981';
    return {
      ...definition,
      active,
      color: active ? (stageColorByCode[definition.code] || fallbackColor) : '#94a3b8',
      title: active ? `${definition.label}: activo` : `${definition.label}: inactivo`
    };
  });
  return stages;
}

function renderStageButtonsForPlan(plan) {
  const stages = getPlanStageButtons(plan);
  return `
    <div class="advisor-stage-buttons" aria-label="Botones de reporte por etapa" style="grid-template-columns: repeat(4, 30px); justify-content: flex-end;">
      ${stages.map(stage => `
        <button type="button" class="advisor-stage-btn ${stage.active ? 'active' : 'inactive'}" ${stage.active ? `style="--stage-color: ${escapeAttribute(stage.color)};"` : ''} title="${escapeAttribute(stage.title)}" aria-label="${escapeAttribute(stage.title)}" ${stage.active ? `data-stage-plan-id="${plan.id}" data-stage-code="${stage.code}"` : 'disabled'}>${stage.code}</button>
      `).join('')}
    </div>
  `;
}

function bindStageReportButtons(container) {
  container.querySelectorAll('[data-stage-plan-id]').forEach(button => {
    button.addEventListener('click', async event => {
      event.preventDefault();
      const planId = Number(button.dataset.stagePlanId);
      const stageCode = button.dataset.stageCode;
      window.openStageReportModal(planId, stageCode);
    });
  });
}

window.openStageReportModal = function(planId, stageCode, clientName) {
  const plan = currentPlanList.find(item => item.id === Number(planId))
    || (activePlanModalPlan?.id === Number(planId) ? activePlanModalPlan : null);
  if (!plan) return;
  closeModal('add-plan-modal');
  activeStageReportContext = { plan, stageCode, clientName };
  const title = document.getElementById('stage-report-modal-title');
  if (title) title.textContent = `Reporte ${stageCode} · ${clientName || plan.cliente_nombre || 'Agricultor'}`;

  const form = document.getElementById('stage-report-form');
  const hiddenFields = [
    ['stage-report-plan-id', plan.id],
    ['stage-report-client-id', plan.cliente_id],
    ['stage-report-asesor-id', plan.asesor_id],
    ['stage-report-stage', stageCode]
  ];

  hiddenFields.forEach(([fieldId, value]) => {
    const field = document.getElementById(fieldId);
    if (field) field.value = value;
  });

  const dateField = document.getElementById('stage-report-date');
  if (dateField) {
    dateField.value = plan.fecha_programada;
    dateField.readOnly = true;
  }

  if (form) form.reset();

  hiddenFields.forEach(([fieldId, value]) => {
    const field = document.getElementById(fieldId);
    if (field) field.value = value;
  });
  if (dateField) dateField.value = plan.fecha_programada;

  document.getElementById('stage-report-anomaly-group').style.display = 'none';
  document.getElementById('stage-report-cotizador-action').style.display = 'none';
  document.getElementById('stage-report-hint').textContent = 'Complete la información para dejar seguimiento agrícola trazable.';
  document.getElementById('stage-report-dv-dr-fields').style.display = ['DV', 'DR'].includes(stageCode) ? 'block' : 'none';
  document.getElementById('stage-report-c-fields').style.display = stageCode === 'C' ? 'block' : 'none';
  if (stageCode === 'V') return window.openStageCotizador(plan.id, stageCode, clientName || plan.cliente_nombre);
  openModal('stage-report-modal');
};

window.submitStageReport = async function() {
  const form = document.getElementById('stage-report-form');
  if (!form) return;
  const payload = {
    planificacion_id: Number(document.getElementById('stage-report-plan-id').value),
    cliente_id: Number(document.getElementById('stage-report-client-id').value),
    asesor_id: Number(document.getElementById('stage-report-asesor-id').value),
    etapa_clave: document.getElementById('stage-report-stage').value,
    fecha_reporte: document.getElementById('stage-report-date').value,
    respuestas: {}
  };
  const stageCode = payload.etapa_clave;
  if (stageCode === 'DV' || stageCode === 'DR') {
    payload.respuestas.anomalia = document.querySelector('input[name="stage-report-anomalia"]:checked')?.value || '';
    payload.respuestas.descripcion_situacion = document.getElementById('stage-report-description').value.trim();
    payload.respuestas.comentarios_productor = document.getElementById('stage-report-comments').value.trim();
  } else if (stageCode === 'C') {
    payload.respuestas.hibrido_material = document.getElementById('stage-report-c-hibrido').value.trim();
    payload.respuestas.rendimiento = document.getElementById('stage-report-c-rendimiento').value.trim();
    payload.respuestas.hectareaje = document.getElementById('stage-report-c-hectareaje').value.trim();
    payload.respuestas.comentarios_productor = document.getElementById('stage-report-c-comments').value.trim();
  }
  try {
    const res = await fetch(`${API_URL}/api/reportes-etapa`, {
      method: 'POST',
      headers: getHeaders(),
      body: JSON.stringify(payload)
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || 'Failed to save stage report');
    closeModal('stage-report-modal');
    await loadWeeklySchedule();
    const refreshedPlan = currentPlanList.find(plan => Number(plan.id) === Number(payload.planificacion_id));
    if (refreshedPlan) window.openEditPlanModal(refreshedPlan);
    alert('Reporte guardado correctamente. Ya puedes pasar la visita a prospecto.');
  } catch (err) {
    alert(err.message);
  }
};

window.openStageCotizador = async function(planId, stageCode, clientName) {
  const plan = currentPlanList.find(item => item.id === Number(planId))
    || (activePlanModalPlan?.id === Number(planId) ? activePlanModalPlan : null)
    || activeStageReportContext?.plan;
  if (!plan) return;
  activeStageReportContext = { plan, stageCode, clientName };
  activePlanningQuoteContext = { planId: plan.id, stageCode: String(stageCode || '').trim().toUpperCase() };
  const clientId = plan.cliente_id;
  const clientNameValue = clientName || plan.cliente_nombre;
  closeModal('add-plan-modal');
  const navItems = document.querySelectorAll('.nav-links .nav-item');
  navItems.forEach(i => {
    i.classList.remove('active');
    if (i.getAttribute('data-target') === 'cotizador-view') {
      i.classList.add('active');
    }
  });
  preserveProspectQuoteContext = true;
  try {
    switchView('cotizador-view', 'Cotizador');
    await loadCotizadorConfig();
  } finally {
    preserveProspectQuoteContext = false;
  }
  const clientSelect = document.getElementById('quote-client');
  if (clientSelect) {
    clientSelect.value = clientId;
    if (clientSelect.value !== String(clientId)) {
      const option = Array.from(clientSelect.options).find(opt => Number(opt.value) === Number(clientId));
      if (option) clientSelect.value = option.value;
    }
    if (clientSelect.value) {
      clientSelect.dispatchEvent(new Event('change'));
    }
  }
  const quickDetails = document.getElementById('client-quick-details');
  if (quickDetails) quickDetails.style.display = 'block';
  const quoteNotas = document.getElementById('quote-notas');
  if (quoteNotas) {
    quoteNotas.value = `Venta originada desde la visita programada de ${clientNameValue || 'agricultor'}.`;
  }
};

window.openProspectInCotizador = async function(prospectId) {
  const prospect = allProspects.find(item => Number(item.id) === Number(prospectId));
  if (!prospect) {
    alert('No se encontró el prospecto. Actualiza el Canal de Ventas e inténtalo de nuevo.');
    return;
  }

  activeProspectId = prospect.id;
  preserveProspectQuoteContext = true;
  try {
    switchView('cotizador-view', 'Cotizador');
    await loadCotizadorConfig();
  } finally {
    preserveProspectQuoteContext = false;
  }

  const clientSelect = document.getElementById('quote-client');
  if (clientSelect) {
    clientSelect.value = String(prospect.cliente_id);
    clientSelect.dispatchEvent(new Event('change'));
  }
  const notes = document.getElementById('quote-notas');
  if (notes) notes.value = `Cotización originada desde el prospecto de ${prospect.cliente_nombre}.`;
};

function countWords(value) {
  if (typeof value !== 'string') return 0;
  return value.trim().split(/\s+/).filter(Boolean).length;
}

function bindStageReportFormEvents() {
  if (stageReportFormEventsBound) return;
  stageReportFormEventsBound = true;

  const anomalyRadios = document.querySelectorAll('input[name="stage-report-anomalia"]');
  const anomalyGroup = document.getElementById('stage-report-anomaly-group');
  const description = document.getElementById('stage-report-description');
  const comments = document.getElementById('stage-report-comments');
  const cotizadorAction = document.getElementById('stage-report-cotizador-action');
  const hint = document.getElementById('stage-report-hint');
  const dvDrFields = document.getElementById('stage-report-dv-dr-fields');
  const cFields = document.getElementById('stage-report-c-fields');
  anomalyRadios.forEach(radio => {
    radio.addEventListener('change', () => {
      const showDescription = radio.value === 'Sí';
      anomalyGroup.style.display = showDescription ? 'block' : 'none';
      description.required = showDescription;
      if (!showDescription) {
        description.value = '';
      }
      cotizadorAction.style.display = 'none';
      hint.textContent = showDescription ? 'Registre la situación detectada y guarde el reporte.' : 'Guarde el reporte sin requerir descripción adicional.';
    });
  });
  const form = document.getElementById('stage-report-form');
  if (form) {
    form.addEventListener('submit', async (e) => {
      e.preventDefault();
      const stageCode = document.getElementById('stage-report-stage').value;
      if (stageCode === 'DV' || stageCode === 'DR') {
        if (!document.querySelector('input[name="stage-report-anomalia"]:checked')) {
          alert('Debe responder si hay anomalía para esta etapa.');
          return;
        }
        if (document.querySelector('input[name="stage-report-anomalia"]:checked').value === 'Sí' && !document.getElementById('stage-report-description').value.trim()) {
          alert('Debe definir la situación detectada cuando marque Sí.');
          return;
        }
        if (countWords(description.value) > 40) {
          alert('La descripción de anomalía no puede exceder 40 palabras.');
          return;
        }
        if (countWords(comments.value) < 20 || countWords(comments.value) > 50) {
          alert('Las observaciones del productor deben tener entre 20 y 50 palabras.');
          return;
        }
      } else if (stageCode === 'C') {
        if (!document.getElementById('stage-report-c-hibrido').value.trim()) {
          alert('El campo de híbrido/material es obligatorio.');
          return;
        }
        if (!document.getElementById('stage-report-c-rendimiento').value.trim()) {
          alert('El campo de rendimiento es obligatorio.');
          return;
        }
        if (!document.getElementById('stage-report-c-hectareaje').value.trim()) {
          alert('El campo de hectareaje es obligatorio.');
          return;
        }
        if (countWords(document.getElementById('stage-report-c-comments').value) > 150) {
          alert('Las observaciones del productor no pueden exceder 150 palabras.');
          return;
        }
      }
      await window.submitStageReport();
    });
  }

  const stageField = document.getElementById('stage-report-stage');
  if (stageField) {
    stageField.addEventListener('change', () => {
      const code = stageField.value;
      dvDrFields.style.display = ['DV', 'DR'].includes(code) ? 'block' : 'none';
      cFields.style.display = code === 'C' ? 'block' : 'none';
      if (code === 'V') {
        cotizadorAction.style.display = 'flex';
        hint.textContent = 'La etapa Venta abre directamente el cotizador con el agricultor precargado.';
      } else if (code === 'DV' || code === 'DR') {
        cotizadorAction.style.display = 'none';
        hint.textContent = 'Complete la información y luego puede abrir el cotizador si detecta una anomalía.';
      } else if (code === 'C') {
        cotizadorAction.style.display = 'none';
        hint.textContent = 'Registre los datos de cosecha y observaciones del productor.';
      }
    });
  }
}

function bindCatalogClientEvents() {
  if (catalogEventsBound) return;
  
  const searchInput = document.getElementById('catalog-client-search');
  if (searchInput) {
    searchInput.addEventListener('input', () => {
      window.clearTimeout(catalogSearchTimer);
      catalogSearchTimer = window.setTimeout(() => loadClientesCatalog({ page: 1 }), 250);
    });
  }
  
  const advisorFilter = document.getElementById('catalog-client-advisor-filter');
  if (advisorFilter) {
    advisorFilter.addEventListener('change', () => {
      loadClientesCatalog({ page: 1 });
    });
  }

  const keyAccountFilter = document.getElementById('catalog-client-key-account-filter');
  if (keyAccountFilter) {
    keyAccountFilter.addEventListener('change', () => loadClientesCatalog({ page: 1 }));
  }

  const selectAll = document.getElementById('catalog-select-all-clients');
  if (selectAll) {
    selectAll.addEventListener('change', () => {
      const visibleIds = allCatalogClients.map(c => c.id);
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

  document.getElementById('catalog-page-prev')?.addEventListener('click', () => {
    if (catalogPagination.page > 1) loadClientesCatalog({ page: catalogPagination.page - 1 });
  });
  document.getElementById('catalog-page-next')?.addEventListener('click', () => {
    if (catalogPagination.page < catalogPagination.totalPages) loadClientesCatalog({ page: catalogPagination.page + 1 });
  });
  
  catalogEventsBound = true;
}

function getFilteredCatalogClients() {
  return Array.isArray(allCatalogClients) ? allCatalogClients : [];
}

function updateCatalogSelectionControls(visibleClients = getFilteredCatalogClients()) {
  const isAdmin = user?.nivel_rol === 'Administrador';
  const selectAll = document.getElementById('catalog-select-all-clients');
  const bulkDeleteBtn = document.getElementById('btn-delete-selected-clients');
  const bulkBiddableBtn = document.getElementById('btn-catalog-bulk-biddable');
  const selectedBiddableCount = document.getElementById('selected-biddable-count');
  const selectedCount = document.getElementById('selected-clients-count');
  const associationCount = document.getElementById('selected-association-count');
  const associateButton = document.getElementById('btn-asociar-agricultores');
  const visibleIds = visibleClients.map(c => c.id);
  const checkedVisibleCount = visibleIds.filter(id => selectedCatalogClientIds.has(id)).length;

  if (selectAll) {
    selectAll.style.display = '';
    selectAll.checked = visibleIds.length > 0 && checkedVisibleCount === visibleIds.length;
    selectAll.indeterminate = checkedVisibleCount > 0 && checkedVisibleCount < visibleIds.length;
    selectAll.disabled = visibleIds.length === 0;
  }

  if (bulkDeleteBtn) {
    bulkDeleteBtn.style.display = isAdmin ? 'inline-flex' : 'none';
    bulkDeleteBtn.disabled = selectedCatalogClientIds.size === 0;
  }

  if (bulkBiddableBtn) {
    bulkBiddableBtn.style.display = isAdmin ? 'inline-flex' : 'none';
    bulkBiddableBtn.disabled = selectedCatalogClientIds.size === 0;
  }

  if (selectedBiddableCount) {
    selectedBiddableCount.textContent = selectedCatalogClientIds.size;
  }
  if (selectedCount) {
    selectedCount.textContent = selectedCatalogClientIds.size;
  }
  if (associationCount) {
    associationCount.textContent = selectedCatalogClientIds.size;
  }
  if (associateButton) {
    associateButton.disabled = selectedCatalogClientIds.size < 2;
  }
}

window.makeSelectedCatalogClientsBiddable = async function(isBiddable = true) {
  const selectedIds = Array.from(selectedCatalogClientIds);
  if (selectedIds.length === 0) {
    alert('Por favor selecciona uno o más agricultores usando las casillas de verificación.');
    return;
  }

  const actionText = isBiddable ? 'poner en subasta (pool de pujas)' : 'retirar de subasta';
  if (!confirm(`¿Estás seguro de ${actionText} a los ${selectedIds.length} agricultores seleccionados?`)) {
    return;
  }

  try {
    const res = await fetch(`${API_URL}/api/clientes/bulk-puja-status`, {
      method: 'POST',
      headers: { ...getHeaders(), 'Content-Type': 'application/json' },
      body: JSON.stringify({ ids: selectedIds, disponible_para_puja: isBiddable })
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || 'Error al actualizar estado de subasta');

    alert(`¡${data.count || selectedIds.length} agricultor(es) ${isBiddable ? 'agregados a subasta' : 'retirados de subasta'} con éxito!`);
    selectedCatalogClientIds.clear();
    await loadClientesCatalog();
  } catch (err) {
    console.error('Error al subastar clientes:', err);
    alert(`Error: ${err.message}`);
  }
};

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
        filterSelect.innerHTML += `<option value="${a.id}">${escapeHtml(a.nombre)}</option>`;
      }
    });
    catalogAdvisorsLoaded = true;
  } catch (err) {
    console.error('Failed to load advisor options for client catalog:', err);
  }
}

async function loadCatalogKeyAccountOptions() {
  const filterSelect = document.getElementById('catalog-client-key-account-filter');
  if (!filterSelect || catalogKeyAccountsLoaded) return;
  try {
    const res = await fetch(`${API_URL}/api/cuentas-clave`, { headers: getHeaders() });
    const accounts = await res.json();
    if (!res.ok || !Array.isArray(accounts)) throw new Error('No fue posible cargar las cuentas clave');
    const previousValue = filterSelect.value || 'ALL';
    filterSelect.innerHTML = '<option value="ALL">Todas las Cuentas Clave</option>';
    accounts.forEach(account => {
      filterSelect.innerHTML += `<option value="${account.id}">${escapeHtml(account.tier_name)}</option>`;
    });
    filterSelect.value = Array.from(filterSelect.options).some(option => option.value === previousValue) ? previousValue : 'ALL';
    catalogKeyAccountsLoaded = true;
  } catch (err) {
    console.error('Failed to load key-account filter options:', err);
  }
}

function renderCatalogPagination() {
  const container = document.getElementById('catalog-pagination');
  const summary = document.getElementById('catalog-pagination-summary');
  const current = document.getElementById('catalog-pagination-current');
  const prev = document.getElementById('catalog-page-prev');
  const next = document.getElementById('catalog-page-next');
  if (!container || !summary || !current || !prev || !next) return;

  const { page, limit, total, totalPages } = catalogPagination;
  const from = total === 0 ? 0 : (page - 1) * limit + 1;
  const to = Math.min(page * limit, total);
  container.style.display = total > 0 ? 'flex' : 'none';
  summary.textContent = `${from}-${to} de ${total} agricultores`;
  current.textContent = `Página ${page} de ${totalPages}`;
  prev.disabled = page <= 1;
  next.disabled = page >= totalPages;
}

window.loadClientesCatalog = async function({ page = catalogPagination.page } = {}) {
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
    
    const preloaders = [];
    if (user.nivel_rol === 'Administrador' || user.nivel_rol === 'Coordinador') preloaders.push(loadCatalogClientAdvisorOptions());
    preloaders.push(loadCatalogKeyAccountOptions());
    if (user.nivel_rol === 'Asesor') preloaders.push(loadCatalogStageStates());

    if (catalogRequestController) catalogRequestController.abort();
    catalogRequestController = new AbortController();
    const search = document.getElementById('catalog-client-search')?.value.trim() || '';
    const advisorId = document.getElementById('catalog-client-advisor-filter')?.value || 'ALL';
    const keyAccountId = document.getElementById('catalog-client-key-account-filter')?.value || 'ALL';
    const params = new URLSearchParams({ page: String(page), limit: String(catalogPagination.limit) });
    if (search) params.set('q', search);
    if (user.nivel_rol !== 'Asesor' && advisorId !== 'ALL') params.set('asesor_id', advisorId);
    if (keyAccountId !== 'ALL') params.set('cuenta_clave_id', keyAccountId);

    const [response] = await Promise.all([
      fetch(`${API_URL}/api/clientes?${params.toString()}`, { headers: getHeaders(), signal: catalogRequestController.signal }),
      ...preloaders
    ]);
    const res = response;
    const data = await res.json();
    
    if (!res.ok) {
      if (res.status === 401 || res.status === 403) {
        throw new Error('Sesión vencida. Por favor, cierra sesión e inicia sesión de nuevo.');
      }
      throw new Error(data.error || 'Failed to fetch clients');
    }
    
    if (!Array.isArray(data?.data)) {
      throw new Error('La respuesta del servidor no tiene el formato esperado.');
    }
    
    allCatalogClients = data.data;
    if (Array.isArray(data.data)) {
      data.data.forEach(c => catalogClientsMap.set(c.id, c));
    }
    catalogPagination = {
      page: data.page,
      limit: data.limit,
      total: data.total,
      totalPages: data.totalPages
    };
    renderCatalogClientes();
    renderCatalogPagination();
  } catch (err) {
    if (err.name === 'AbortError') return;
    console.error('Failed to load client catalog:', err);
    if (tbody) {
      tbody.innerHTML = `<tr><td colspan="9" style="text-align: center; color: var(--danger);">Error al cargar: ${err.message}</td></tr>`;
    }
  }
};

let catalogClientsMap = new Map();
let expandedAssociatedGroupIds = new Set();
let associatedClientsByPrincipal = new Map();

async function loadAssociatedClients(parentId) {
  const res = await fetch(`${API_URL}/api/clientes/${parentId}/asociados`, { headers: getHeaders() });
  const data = await res.json();
  if (!res.ok) throw new Error(data.error || 'No fue posible cargar los agricultores asociados.');
  const associatedClients = Array.isArray(data) ? data : [];
  associatedClientsByPrincipal.set(parentId, associatedClients);
  associatedClients.forEach(client => catalogClientsMap.set(client.id, client));
  return associatedClients;
}

window.toggleAssociatedGroup = async function(parentId) {
  if (expandedAssociatedGroupIds.has(parentId)) {
    expandedAssociatedGroupIds.delete(parentId);
  } else {
    try {
      if (!associatedClientsByPrincipal.has(parentId)) {
        await loadAssociatedClients(parentId);
      }
      expandedAssociatedGroupIds.add(parentId);
    } catch (err) {
      alert(`Error al cargar asociados: ${err.message}`);
      return;
    }
  }
  renderCatalogClientes();
};

window.openAsociarModal = async function() {
  const selectedIds = Array.from(selectedCatalogClientIds);
  if (selectedIds.length < 2) {
    alert('Por favor selecciona 2 o más agricultores mediante las casillas de verificación para formar una asociación.');
    return;
  }

  let selectedClients = [];
  try {
    const res = await fetch(`${API_URL}/api/clientes/seleccionados?ids=${encodeURIComponent(selectedIds.join(','))}`, { headers: getHeaders() });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || 'No fue posible cargar los agricultores seleccionados.');
    selectedClients = Array.isArray(data) ? data : [];
  } catch (err) {
    alert(`Error al preparar la asociación: ${err.message}`);
    return;
  }

  if (selectedClients.length !== selectedIds.length) {
    alert('Uno o más agricultores ya no están disponibles. Actualiza el catálogo y vuelve a seleccionarlos.');
    return;
  }

  const container = document.getElementById('asociar-farmers-list');
  if (!container) return;

  container.innerHTML = '';
  selectedClients.forEach((c, idx) => {
    container.innerHTML += `
      <label style="display: flex; align-items: center; gap: 10px; padding: 10px 14px; background: var(--bg-hover, #f8fafc); border-radius: 6px; cursor: pointer; border: 1px solid var(--border);">
        <input type="radio" name="principal_radio" value="${c.id}" ${idx === 0 ? 'checked' : ''}>
        <div>
          <strong style="display: block; font-size: 14px; color: var(--text);">${escapeHtml(c.nombre)}</strong>
          <span style="font-size: 12px; color: var(--text-light);">${escapeHtml(c.ubicacion || 'Sin ubicación')} ${c.asesor_nombre ? ' • ' + escapeHtml(c.asesor_nombre) : ''}</span>
        </div>
      </label>
    `;
  });

  openModal('modal-asociar-agricultores');
};

window.confirmarAsociacion = async function() {
  const selectedRadio = document.querySelector('input[name="principal_radio"]:checked');
  if (!selectedRadio) {
    alert('Por favor selecciona cuál será el Asociado Principal.');
    return;
  }

  const principalId = Number(selectedRadio.value);
  const selectedIds = Array.from(selectedCatalogClientIds);
  const asociadosIds = selectedIds.filter(id => id !== principalId);

  if (asociadosIds.length === 0) {
    alert('Debes seleccionar al menos un agricultor secundario para asociar.');
    return;
  }

  try {
    const res = await fetch(`${API_URL}/api/clientes/asociar`, {
      method: 'POST',
      headers: { ...getHeaders(), 'Content-Type': 'application/json' },
      body: JSON.stringify({ principal_id: principalId, asociados_ids: asociadosIds })
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || 'Failed to associate farmers');

    closeModal('modal-asociar-agricultores');
    selectedCatalogClientIds.clear();
    associatedClientsByPrincipal.clear();
    expandedAssociatedGroupIds.add(principalId);
    alert('¡Agricultores asociados exitosamente!');
    await loadClientesCatalog();
    await loadAssociatedClients(principalId);
    renderCatalogClientes();
  } catch (err) {
    console.error('Error al asociar agricultores:', err);
    alert(`Error: ${err.message}`);
  }
};

window.desasociarCliente = async function(clienteId) {
  if (!confirm('¿Deseas remover este agricultor de la asociación?')) return;
  try {
    const res = await fetch(`${API_URL}/api/clientes/desasociar`, {
      method: 'POST',
      headers: { ...getHeaders(), 'Content-Type': 'application/json' },
      body: JSON.stringify({ cliente_id: clienteId })
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || 'Failed to disassociate farmer');

    associatedClientsByPrincipal.clear();
    await loadClientesCatalog();
  } catch (err) {
    console.error('Error al desasociar agricultor:', err);
    alert(`Error: ${err.message}`);
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
  const filtered = allCatalogClients;
  updateCatalogSelectionControls(filtered);
  
  if (filtered.length === 0) {
    const cols = user.nivel_rol === 'Asesor' ? 8 : 9;
    tbody.innerHTML = `<tr><td colspan="${cols}" style="text-align: center; color: var(--text-light);">No se encontraron agricultores.</td></tr>`;
    return;
  }
  
  // Group clients into hierarchy (Principals with their Associated secondaries)
  const clientMap = new Map();
  const principals = [];
  const secondaries = [];

  filtered.forEach(c => {
    clientMap.set(c.id, { ...c, asociados: [] });
  });

  filtered.forEach(c => {
    const cachedAssociated = associatedClientsByPrincipal.get(c.id);
    if (Array.isArray(cachedAssociated)) {
      clientMap.get(c.id).asociados = cachedAssociated.map(item => ({ ...item, asociados: [] }));
    }
  });

  filtered.forEach(c => {
    const item = clientMap.get(c.id);
    if (c.cliente_principal_id && clientMap.has(c.cliente_principal_id)) {
      secondaries.push(item);
    } else {
      principals.push(item);
    }
  });

  secondaries.forEach(sec => {
    const parent = clientMap.get(sec.cliente_principal_id);
    if (parent && !parent.asociados.some(item => Number(item.id) === Number(sec.id))) {
      parent.asociados.push(sec);
    }
  });

  let catalogHtml = '';
  
  principals.forEach(c => {
    const isSelected = selectedCatalogClientIds.has(c.id);
    const loadedAssociatedCount = Array.isArray(c.asociados) ? c.asociados.length : 0;
    const associatedCount = Math.max(loadedAssociatedCount, Number(c.asociados_count) || 0);
    const hasAsociados = associatedCount > 0;
    const isExpanded = expandedAssociatedGroupIds.has(c.id);

    const accordionToggle = hasAsociados
      ? `<button class="btn btn-secondary icon-action-btn" title="${isExpanded ? 'Contraer asociados' : 'Desglosar asociados'}" style="padding: 2px 6px; font-size: 11px; margin-right: 6px;" onclick="toggleAssociatedGroup(${c.id})">${isExpanded ? '▼' : '▶'}</button>`
      : '';
    const asociadosBadge = hasAsociados
      ? `<span class="badge badge-info" style="font-size: 11px; margin-left: 6px; cursor: pointer;" onclick="toggleAssociatedGroup(${c.id})">🔗 ${associatedCount} ${associatedCount === 1 ? 'asociado' : 'asociados'}</span>`
      : '';
    const belongsToGroupBadge = c.cliente_principal_id && !clientMap.has(c.cliente_principal_id)
      ? `<span class="badge badge-info" style="font-size: 11px; margin-left: 6px;">🔗 Asociado de ${escapeHtml(c.principal_nombre || `#${c.cliente_principal_id}`)}</span>`
      : '';
    const biddableBadge = c.disponible_para_puja === 1
      ? `<span class="badge badge-warning" style="font-size: 11px; margin-left: 6px;" title="Disponible en pool de subasta / pujas">🔔 En Subasta</span>`
      : '';

    let badgeClass = c.estado_status === 'Cliente' ? 'badge-success' : 'badge-warning';
    const selectionControl = `<input type="checkbox" class="catalog-row-checkbox" ${isSelected ? 'checked' : ''} title="Seleccionar agricultor" aria-label="Seleccionar agricultor" onchange="toggleCatalogClientSelection(${c.id}, this.checked)">`;
    
    const deleteButton = user.nivel_rol === 'Administrador'
      ? `<button class="btn btn-secondary icon-action-btn danger" title="Borrar agricultor" aria-label="Borrar agricultor" onclick="deleteCatalogClient(${c.id})">🗑️</button>`
      : '';

    catalogHtml += `
      <tr class="${hasAsociados ? 'principal-farmer-row' : ''}">
        <td>
          <div class="catalog-name-cell">
            ${accordionToggle}
            <strong>${escapeHtml(c.nombre)}</strong>
            ${asociadosBadge}
            ${belongsToGroupBadge}
            ${biddableBadge}
            ${selectionControl}
          </div>
        </td>
        ${user.nivel_rol !== 'Asesor' ? `<td>${escapeHtml(c.asesor_nombre || 'Sin Asesor')}</td>` : ''}
        <td>${escapeHtml(c.cuenta_clave_nombre || '-')}</td>
        <td>${escapeHtml(c.contacto || '-')}</td>
        <td>${escapeHtml(c.telefono || '-')}</td>
        <td>${escapeHtml(c.ubicacion || '-')}</td>
        <td>${escapeHtml(c.superficie_text || '-')}</td>
        <td><span class="badge ${badgeClass}">${escapeHtml(c.estado_status)}</span></td>
        <td style="text-align: center;">
          <div class="catalog-row-actions">
            <button class="btn btn-secondary icon-action-btn" title="Editar agricultor" aria-label="Editar agricultor" onclick="editCatalogClient(${c.id})">✏️</button>
            ${deleteButton}
          </div>
        </td>
      </tr>
    `;

    // Render secondary associated rows indented if expanded
    if (hasAsociados && isExpanded) {
      c.asociados.forEach(sec => {
        const secIsSelected = selectedCatalogClientIds.has(sec.id);
        const secSelectionControl = `<input type="checkbox" class="catalog-row-checkbox" ${secIsSelected ? 'checked' : ''} title="Seleccionar agricultor" aria-label="Seleccionar agricultor" onchange="toggleCatalogClientSelection(${sec.id}, this.checked)">`;
        const secBadgeClass = sec.estado_status === 'Cliente' ? 'badge-success' : 'badge-warning';
        const secBiddableBadge = sec.disponible_para_puja === 1
          ? `<span class="badge badge-warning" style="font-size: 11px; margin-left: 6px;" title="Disponible en pool de subasta / pujas">🔔 En Subasta</span>`
          : '';

        catalogHtml += `
          <tr class="associated-secondary-row" style="background-color: rgba(96, 165, 250, 0.05);">
            <td style="padding-left: 36px;">
              <div class="catalog-name-cell">
                <span style="color: var(--text-light); font-size: 13px; margin-right: 4px;">↳ 🔗</span>
                <span style="font-weight: 500;">${escapeHtml(sec.nombre)}</span>
                ${secBiddableBadge}
                ${secSelectionControl}
              </div>
            </td>
            ${user.nivel_rol !== 'Asesor' ? `<td>${escapeHtml(sec.asesor_nombre || 'Sin Asesor')}</td>` : ''}
            <td>${escapeHtml(sec.cuenta_clave_nombre || '-')}</td>
            <td>${escapeHtml(sec.contacto || '-')}</td>
            <td>${escapeHtml(sec.telefono || '-')}</td>
            <td>${escapeHtml(sec.ubicacion || '-')}</td>
            <td>${escapeHtml(sec.superficie_text || '-')}</td>
            <td><span class="badge ${secBadgeClass}">${escapeHtml(sec.estado_status)}</span></td>
            <td style="text-align: center;">
              <div class="catalog-row-actions">
                <button class="btn btn-secondary icon-action-btn danger" title="Desasociar del grupo" aria-label="Desasociar del grupo" onclick="desasociarCliente(${sec.id})">❌</button>
                <button class="btn btn-secondary icon-action-btn" title="Editar agricultor" aria-label="Editar agricultor" onclick="editCatalogClient(${sec.id})">✏️</button>
              </div>
            </td>
          </tr>
        `;
      });
    }
  });

  tbody.innerHTML = catalogHtml;
};

window.disolverGrupoAsociados = async function(principalId) {
  if (!confirm('¿Estás seguro de disolver esta asociación de grupo?\nTodos los agricultores asociados pasarán a tratarse como individuales.')) return;
  try {
    const res = await fetch(`${API_URL}/api/clientes/disolver-grupo`, {
      method: 'POST',
      headers: { ...getHeaders(), 'Content-Type': 'application/json' },
      body: JSON.stringify({ principal_id: principalId })
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || 'Failed to disband group');

    associatedClientsByPrincipal.clear();
    expandedAssociatedGroupIds.delete(principalId);
    closeModal('add-client-modal');
    alert('¡La asociación de grupo ha sido disuelta! Todos los agricultores ahora son individuales.');
    await loadClientesCatalog();
  } catch (err) {
    console.error('Error al disolver grupo:', err);
    alert(`Error: ${err.message}`);
  }
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

  const assocContainer = document.getElementById('client-association-actions');
  if (assocContainer) {
    const isPrincipal = (c.asociados_count > 0) || (Array.isArray(c.asociados) && c.asociados.length > 0);
    if (isPrincipal) {
      assocContainer.style.display = 'block';
      assocContainer.innerHTML = `
        <div style="background: rgba(239, 68, 68, 0.08); border: 1px solid rgba(239, 68, 68, 0.3); border-radius: 8px; padding: 12px; display: flex; align-items: center; justify-content: space-between; gap: 12px;">
          <div>
            <strong style="color: var(--danger); font-size: 13px; display: block;">🔗 Asociado Principal de Grupo</strong>
            <span style="font-size: 12px; color: var(--text-light);">Este agricultor encabeza un grupo. Al disolver la asociación, todos volverán a tratarse como individuales.</span>
          </div>
          <button type="button" class="btn btn-danger" style="white-space: nowrap; font-size: 12px; padding: 8px 14px;" onclick="disolverGrupoAsociados(${c.id})">🔓 Disolver Grupo</button>
        </div>
      `;
    } else if (c.cliente_principal_id) {
      assocContainer.style.display = 'block';
      assocContainer.innerHTML = `
        <div style="background: rgba(239, 68, 68, 0.08); border: 1px solid rgba(239, 68, 68, 0.3); border-radius: 8px; padding: 12px; display: flex; align-items: center; justify-content: space-between; gap: 12px;">
          <div>
            <strong style="color: var(--danger); font-size: 13px; display: block;">🔗 Pertenece a una Asociación</strong>
            <span style="font-size: 12px; color: var(--text-light);">Al salir de la asociación, este agricultor pasará a tratarse como un agricultor individual.</span>
          </div>
          <button type="button" class="btn btn-danger" style="white-space: nowrap; font-size: 12px; padding: 8px 14px;" onclick="desasociarCliente(${c.id}); closeModal('add-client-modal');">🔓 Salir de Asociación</button>
        </div>
      `;
    } else {
      assocContainer.style.display = 'none';
      assocContainer.innerHTML = '';
    }
  }
  
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
    await loadClientesCatalog({ page: catalogPagination.page });
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
    await loadClientesCatalog({ page: catalogPagination.page });
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
    loadClientesCatalog({ page: catalogPagination.page });
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
    try {
      const metricsRes = await fetch(`${API_URL}/api/asignacion/metricas-AI`, { headers: getHeaders() });
      if (metricsRes.ok) {
        allMatchingMetrics = await metricsRes.json();
      } else {
        allMatchingMetrics = { advisors: [], clients: [] };
      }
    } catch (e) {
      allMatchingMetrics = { advisors: [], clients: [] };
    }
    
    // Bind search input filters
    const searchInput = document.getElementById('assign-search-client');
    const searchAdvisorInput = document.getElementById('assign-search-advisor');
    const onSearchInput = () => {
      if (allMatchingMetrics) {
        const activeAdvisors = (Array.isArray(advisors) ? advisors : []).filter(a => a.activo === 1 && a.nivel_rol === 'Asesor');
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
    renderAsignacionBoard((Array.isArray(advisors) ? advisors : []).filter(a => a.activo === 1 && a.nivel_rol === 'Asesor'));
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
  let filteredClients = Array.isArray(allUnassignedClients) ? allUnassignedClients : [];
  if (searchTerm) {
    filteredClients = filteredClients.filter(c => 
      (c.nombre && c.nombre.toLowerCase().includes(searchTerm)) ||
      (c.contacto && c.contacto.toLowerCase().includes(searchTerm)) ||
      (c.ubicacion && c.ubicacion.toLowerCase().includes(searchTerm))
    );
  }
  
  // Filter advisors
  window.filteredAdvisors = Array.isArray(advisors) ? advisors : [];
  if (advisorSearchTerm) {
    window.filteredAdvisors = window.filteredAdvisors.filter(a => a.nombre && a.nombre.toLowerCase().includes(advisorSearchTerm));
  }
  
  // Separate clients
  const directAssignClients = filteredClients.filter(c => Number(c.disponible_para_puja || 0) === 0);
  const biddablePoolClients = (Array.isArray(allUnassignedClients) ? allUnassignedClients : []).filter(c => Number(c.disponible_para_puja || 0) === 1);
  
  // Update counts
  if (document.getElementById('assign-unassigned-count')) document.getElementById('assign-unassigned-count').textContent = directAssignClients.length;
  if (document.getElementById('assign-biddable-count')) document.getElementById('assign-biddable-count').textContent = biddablePoolClients.length;
  if (document.getElementById('assign-advisors-count')) document.getElementById('assign-advisors-count').textContent = window.filteredAdvisors.length;
  
  // Render column 1: Direct Assign
  unassignedList.innerHTML = '';
  if (directAssignClients.length === 0) {
    unassignedList.innerHTML = '<div style="text-align: center; color: var(--text-light); padding: 30px; border: 1px dashed var(--border); border-radius: var(--radius);">No hay clientes sin asesor para asignación directa.</div>';
  } else {
    directAssignClients.forEach(c => {
      // Find client purchase history
      const cMetric = (allMatchingMetrics?.clients || []).find(cm => cm.cliente_id === c.id);
      const purchaseVol = cMetric ? Number(cMetric.total_purchase_mxn || 0) : 0;
      
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
            <strong style="font-size: 13px; color: var(--text-dark);">${escapeHtml(c.nombre)}</strong>
          </div>
          <button class="btn btn-secondary" style="width: auto; padding: 2px 6px; font-size: 10px; margin: 0; line-height: 1;" onclick="showAISuggestion(${c.id}, '${escapeHtml(c.nombre).replace(/'/g, "\\'")}')" title="Recomendación IA">🤖 IA</button>
        </div>
        <div style="font-size: 11px; color: var(--text-light); margin: 4px 0;">📍 ${escapeHtml(c.ubicacion || 'Sin ubicación')} | 📐 ${escapeHtml(c.superficie_text || '-')}</div>
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
      const clientBids = (Array.isArray(allActiveBids) ? allActiveBids : []).filter(b => b.cliente_id === c.id && b.estatus === 'Pendiente');
      const cMetric = (allMatchingMetrics?.clients || []).find(cm => cm.cliente_id === c.id);
      const purchaseVol = cMetric ? Number(cMetric.total_purchase_mxn || 0) : 0;
      
      const card = document.createElement('div');
      card.className = 'kanban-card';
      card.style.padding = '12px';
      card.style.borderLeft = '4px solid var(--warning)';
      card.style.marginBottom = '12px';
      
      const hasBids = clientBids.length > 0;
      card.innerHTML = `
        <div style="display: flex; justify-content: space-between; align-items: flex-start; gap: 8px; margin-bottom: 6px;">
          <strong style="font-size: 13px; color: var(--text-dark);">${escapeHtml(c.nombre)}</strong>
          <button class="btn btn-secondary" style="width: auto; padding: 2px 6px; font-size: 10px; margin: 0; line-height: 1;" onclick="toggleClientBiddable(${c.id}, false)" title="Quitar del pool">Quitar ✗</button>
        </div>
        <div style="font-size: 11px; color: var(--text-light); margin-bottom: 8px;">📍 ${escapeHtml(c.ubicacion || 'Sin ubicación')} | $${purchaseVol.toLocaleString('es-MX', { maximumFractionDigits: 0 })} MXN</div>
        
        <div style="display: flex; justify-content: space-between; align-items: center; margin-top: 12px; gap: 8px;">
          <span class="badge ${hasBids ? 'badge-warning' : 'badge-secondary'}" style="font-size: 10px; padding: 4px 8px;">${clientBids.length} prop.</span>
          <button class="btn btn-primary" style="width: auto; padding: 4px 8px; font-size: 11px; margin: 0; ${hasBids ? '' : 'opacity: 0.5; pointer-events: none;'}" 
            onclick="openAdminDecisionModal(${c.id}, '${escapeHtml(c.nombre).replace(/'/g, "\\'")}', ${purchaseVol})">
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
      const aMetric = (allMatchingMetrics?.advisors || []).find(am => am.asesor_id === a.id);
      const salesVol = aMetric ? Number(aMetric.total_sales_mxn || 0) : 0;
      const complVisits = aMetric ? Number(aMetric.completed_visits || 0) : 0;
      const totalVisits = aMetric ? Number(aMetric.total_visits || 0) : 0;
      const pendingVisits = aMetric ? Number(aMetric.pending_visits || 0) : 0;
      
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
      
      const advisorKeyBadge = `<span class="badge badge-secondary" style="font-size: 10px; padding: 2px 6px; font-family: monospace; font-weight: 600;">Clave: #${a.id}</span>`;
      const advisorUserRow = (a.usuario && a.usuario !== a.nombre)
        ? `<div style="font-size: 11px; color: var(--text-light); margin-top: 1px;">Usuario: ${escapeHtml(a.usuario)}</div>`
        : '';

      card.innerHTML = `
        <div style="font-weight: bold; font-size: 13px; color: var(--text-dark); display: flex; justify-content: space-between; align-items: center; gap: 8px;">
          <span>👤 ${escapeHtml(a.nombre)}</span>
          ${advisorKeyBadge}
        </div>
        ${advisorUserRow}
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
// ---------------------------------------------------------------------------
// AI Match Score – SINGLE SOURCE OF TRUTH (SDD §4.3 – Weight: 60/40)
// Both the Suggestion modal and the Admin Decision modal MUST call this
// function so that the same advisor/client pair always yields the same score.
// ---------------------------------------------------------------------------
/**
 * Compute the AI Match Score (0-100) for an advisor/client pairing.
 *
 * For high-value clients (> $1,000,000 MXN historical purchases):
 *   → Weight sales performance (60%) and visit compliance (40%)
 * For regular clients:
 *   → Weight calendar availability (60%) and visit compliance (40%)
 *
 * @param {number} salesScore       - Normalised sales score 0-100
 * @param {number} complRate        - Visit compliance rate 0-100
 * @param {number} availabilityScore - Normalised availability score 0-100
 * @param {number} clientPurchase   - Client's total historical purchases in MXN
 * @returns {number} Match score clamped to [10, 100]
 */
function computeAdvisorMatchScore(salesScore, complRate, availabilityScore, clientPurchase) {
  let matchScore;
  if (clientPurchase > 1000000) {
    // High-value client: prioritise commercial track record
    matchScore = Math.round((salesScore * 0.6) + (complRate * 0.4));
  } else {
    // Regular client: prioritise advisor availability and responsiveness
    matchScore = Math.round((availabilityScore * 0.6) + (complRate * 0.4));
  }
  return Math.max(matchScore, 10);
}


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
    const score = computeAdvisorMatchScore(salesScore, complRate, availabilityScore, clientPurchase);
    matchScore = score;
    
    if (clientPurchase > 1000000) {
      const salesDesc = a.total_sales_mxn > 0 ? `$${(a.total_sales_mxn/1000000).toFixed(2)}M MXN` : 'sin ventas';
      if (salesScore >= 80 && complRate >= 80) {
        reasoning = `Excelente recomendación: Líder en ventas comerciales con ${salesDesc} y altísimo nivel de cumplimiento de visitas programadas (${Math.round(complRate)}%), idóneo para retener y desarrollar esta cuenta clave.`;
      } else if (salesScore >= 40) {
        reasoning = `Sólido perfil comercial con ${salesDesc} de facturación y efectividad del ${Math.round(complRate)}% en su agenda semanal. Adecuado para un servicio continuo y de calidad.`;
      } else {
        reasoning = `Mantiene un volumen moderado de ventas (${salesDesc}) y cumplimiento de agenda del ${Math.round(complRate)}%. Opción secundaria viable.`;
      }
    } else {
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
      score: matchScore,
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
      
      // Compute unified AI Match Score using the canonical computeAdvisorMatchScore function
      const matchScore = computeAdvisorMatchScore(salesScore, complRate, availabilityScore, clientPurchase);
      
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
    const allClients = clientsRes.ok ? await clientsRes.json() : [];
    const biddableClients = (Array.isArray(allClients) ? allClients : []).filter(c => Number(c.disponible_para_puja || 0) === 1);
    
    // Fetch my bids
    const bidsRes = await fetch(`${API_URL}/api/asignacion/pujas`, { headers: getHeaders() });
    const myBids = bidsRes.ok ? await bidsRes.json() : [];
    const bidsList = Array.isArray(myBids) ? myBids : [];
    
    // Fetch historical purchase metrics by querying cotizaciones
    const quotesRes = await fetch(`${API_URL}/api/cotizaciones`, { headers: getHeaders() });
    const quotes = quotesRes.ok ? await quotesRes.json() : [];
    const quotesList = Array.isArray(quotes) ? quotes : [];
    
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
        const totalPurchases = quotesList
          .filter(q => q.cliente_id === c.id && (q.estatus === 'Vendido' || q.estatus === 'Entregado'))
          .reduce((sum, q) => sum + Number(q.total_mxn || 0), 0);
          
        const bid = bidsList.find(b => b.cliente_id === c.id && b.asesor_id === user?.id);
        
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
csvContent += "Fecha,Tipo de Movimiento,Producto,Lote,Tamaño,Categoría,Entradas,Salidas,Saldo Resultante,Referencia,Notas,Op. Operación,No. Remisión,No. Movimiento,Precio Venta,Proveedor/Cliente,Cliente,Asesor,Folio Cotización\n";

  allMovements.forEach(m => {
    const date = m.fecha_movimiento.slice(0, 16).replace('T', ' ');
    const type = `"${(m.tipo_movimiento || '').replace(/"/g, '""')}"`;
    const prod = `"${(m.producto_nombre || '').replace(/"/g, '""')}"`;
    const lote = `"${(m.lote || '').replace(/"/g, '""')}"`;
    const tamano = `"${(m.tamano || '').replace(/"/g, '""')}"`;
    const categoria = `"${(m.categoria || '').replace(/"/g, '""')}"`;
    const ent = m.cantidad_entrante || 0;
    const sal = m.cantidad_saliente || 0;
    const balance = m.existencias_resultantes || 0;
    const ref = `"${(m.referencia_factura || '').replace(/"/g, '""')}"`;
    const notes = `"${(m.notas || '').replace(/"/g, '""')}"`;
    const opcionOp = `"${(m.opcion_operacion || '').replace(/"/g, '""')}"`;
    const numRem = `"${(m.numero_remision || '').replace(/"/g, '""')}"`;
    const numMov = `"${(m.numero_movimiento || '').replace(/"/g, '""')}"`;
    const precioVenta = m.precio_venta ? m.precio_venta.toLocaleString('es-MX', { minimumFractionDigits: 2 }) : 0;
    const provCli = `"${(m.proveedor_cliente || '').replace(/"/g, '""')}"`;
    const cliente = `"${(m.cliente_nombre || '').replace(/"/g, '""')}"`;
    const asesor = `"${(m.asesor_nombre || '').replace(/"/g, '""')}"`;
    const folioCot = `"${(m.folio_cotizacion || '').replace(/"/g, '""')}"`;
    csvContent += `${date},${type},${prod},${lote},${tamano},${categoria},${ent},${sal},${balance},${ref},${notes},${opcionOp},${numRem},${numMov},${precioVenta},${provCli},${cliente},${asesor},${folioCot}\n`;
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
    const pv = m.precio_venta > 0 ? '$ ' + m.precio_venta.toLocaleString('es-MX', { minimumFractionDigits: 2 }) : '-';
    rowsHtml += `
      <tr>
        <td>${date}</td>
        <td>${m.tipo_movimiento || '-'}</td>
        <td><strong>${m.producto_nombre || '-'}</strong></td>
        <td>${m.lote || '-'}</td>
        <td>${m.tamano || '-'}</td>
        <td>${m.categoria || '-'}</td>
        <td style="text-align: right;">${ent}</td>
        <td style="text-align: right;">${sal}</td>
        <td style="text-align: right;">${(m.existencias_resultantes || 0).toLocaleString('es-MX', { minimumFractionDigits: 3 })}</td>
        <td>${m.referencia_factura || '-'}</td>
        <td>${m.notas || '-'}</td>
        <td>${m.opcion_operacion || '-'}</td>
        <td>${m.numero_remision || '-'}</td>
        <td>${m.numero_movimiento || '-'}</td>
        <td style="text-align: right;">${pv}</td>
        <td>${m.proveedor_cliente || '-'}</td>
        <td>${m.cliente_nombre || '-'}</td>
        <td>${m.asesor_nombre || '-'}</td>
        <td>${m.folio_cotizacion || '-'}</td>
      </tr>
    `;
  });
  
  printWindow.document.write(`
    <html>
      <head>
        <title>Kardex de Movimientos - AgriSales Pro</title>
        <style>
          body { font-family: 'Helvetica Neue', Helvetica, Arial, sans-serif; color: #333; padding: 20px; }
          @page { size: landscape; margin: 15px; }
          .header { display: flex; justify-content: space-between; align-items: center; border-bottom: 2px solid #10b981; padding-bottom: 15px; margin-bottom: 25px; }
          .title { font-size: 24px; font-weight: bold; color: #10b981; }
          .subtitle { font-size: 14px; color: #666; }
          .table-wrap { overflow-x: auto; }
          table { width: 100%; border-collapse: collapse; margin-top: 15px; font-size: 10px; min-width: 2200px; }
          th { background-color: #f3f4f6; color: #374151; font-weight: 600; text-align: left; padding: 6px 8px; border-bottom: 1px solid #d1d5db; white-space: nowrap; }
          td { padding: 6px 8px; border-bottom: 1px solid #e5e7eb; }
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
        <div class="table-wrap">
        <table>
          <thead>
            <tr>
              <th>Fecha</th>
              <th>Movimiento</th>
              <th>Producto</th>
              <th>Lote</th>
              <th>Tamaño</th>
              <th>Categoría</th>
              <th style="text-align: right;">Entradas</th>
              <th style="text-align: right;">Salidas</th>
              <th style="text-align: right;">Saldo</th>
              <th>Referencia</th>
              <th>Notas</th>
              <th>Op. Operación</th>
              <th>No. Remisión</th>
              <th>No. Movimiento</th>
              <th style="text-align: right;">Precio Venta</th>
              <th>Proveedor/Cliente</th>
              <th>Cliente</th>
              <th>Asesor</th>
              <th>Folio Cotización</th>
            </tr>
          </thead>
          <tbody>
            ${rowsHtml}
          </tbody>
        </table>
        </div>
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

// =============================================================
// PROGRAMACIÓN VIEW (PRECIOS Y ETAPAS) FRONTEND
// =============================================================
let programacionStages = [];
let programacionProducts = [];
let selectedProgramacionProductId = '';
let monthlyPricePropagationStart = null;

async function loadProgramacionView() {
  const isWritable = ['Administrador', 'Coordinador'].includes(user.nivel_rol);

  // Toggle form accessibility
  const formEl = document.getElementById('etapa-form');
  const btnSavePrecios = document.getElementById('btn-save-precios');
  if (formEl) {
    if (isWritable) {
      formEl.style.display = 'block';
    } else {
      formEl.style.display = 'none';
      const descEl = document.getElementById('programacion-stages-card').querySelector('p');
      if (descEl) descEl.textContent = 'Vista de solo lectura de las etapas activas en el ciclo.';
    }
  }
  if (btnSavePrecios) {
    btnSavePrecios.style.display = isWritable ? 'inline-block' : 'none';
  }

  // Load active products first
  await loadProgramacionProducts();
  
  // Load registered stages
  await loadProgramacionStages();

  // Populate products select
  const productSelect = document.getElementById('programacion-product-select');
  if (productSelect) {
    productSelect.innerHTML = '<option value="">-- Seleccione un Producto --</option>';
    programacionProducts.forEach(prod => {
      const opt = document.createElement('option');
      opt.value = prod.id;
      opt.textContent = `${prod.producto} (${prod.tipo_categoria})`;
      if (parseInt(selectedProgramacionProductId) === prod.id) {
        opt.selected = true;
      }
      productSelect.appendChild(opt);
    });
  }

  // Render main timeline table
  renderProgramacionTable();
}

async function loadProgramacionProducts() {
  try {
    const res = await fetch('/api/productos', {
      method: 'GET',
      headers: getHeaders()
    });
    if (!res.ok) throw new Error('Error al cargar productos');
    programacionProducts = await res.json();
  } catch (err) {
    console.error('Error in loadProgramacionProducts:', err);
  }
}

async function loadProgramacionStages() {
  try {
    const res = await fetch('/api/programacion/etapas', {
      method: 'GET',
      headers: getHeaders()
    });
    if (!res.ok) throw new Error('Error al cargar etapas');
    programacionStages = await res.json();
    renderStagesList();
  } catch (err) {
    console.error('Error in loadProgramacionStages:', err);
  }
}

function renderStagesList() {
  const tbody = document.getElementById('etapas-list-tbody');
  if (!tbody) return;

  if (programacionStages.length === 0) {
    tbody.innerHTML = '<tr><td colspan="4" style="text-align: center; color: var(--text-light);">No hay etapas registradas</td></tr>';
    return;
  }

  const isWritable = ['Administrador', 'Coordinador'].includes(user.nivel_rol);

  tbody.innerHTML = '';
  programacionStages.forEach(etapa => {
    const tr = document.createElement('tr');
    tr.innerHTML = `
      <td><span class="badge" style="background-color: ${etapa.color}22; color: ${etapa.color}; border: 1px solid ${etapa.color}; font-weight: bold; font-size: 11px;">${etapa.clave}</span></td>
      <td><strong>${etapa.nombre}</strong></td>
      <td style="font-size: 12px; color: var(--text-light);">
        ${etapa.fecha_inicio} <br/> al ${etapa.fecha_fin}
      </td>
      <td style="text-align: right;">
        ${isWritable ? `
          <button class="btn-icon" onclick="editEtapa(${etapa.id})" title="Editar" style="color: var(--info); font-size: 14px; margin-right: 6px; background: none; border: none; cursor: pointer;">✏️</button>
          <button class="btn-icon" onclick="deleteEtapa(${etapa.id})" title="Eliminar" style="color: var(--danger); font-size: 14px; background: none; border: none; cursor: pointer;">🗑️</button>
        ` : ''}
      </td>
    `;
    tbody.appendChild(tr);
  });
}

// Global functions for inline click handling
window.editEtapa = function(id) {
  const stage = programacionStages.find(s => s.id === id);
  if (!stage) return;

  document.getElementById('etapa-id').value = stage.id;
  document.getElementById('etapa-clave').value = stage.clave;
  document.getElementById('etapa-nombre').value = stage.nombre;
  document.getElementById('etapa-inicio').value = stage.fecha_inicio;
  document.getElementById('etapa-fin').value = stage.fecha_fin;
  document.getElementById('etapa-color').value = stage.color;

  document.getElementById('btn-save-etapa').innerText = 'Actualizar Etapa';
  document.getElementById('btn-cancel-etapa').style.display = 'inline-block';
};

window.deleteEtapa = async function(id) {
  if (!confirm('¿Está seguro de que desea eliminar esta etapa?')) return;
  try {
    const res = await fetch(`/api/programacion/etapas/${id}`, {
      method: 'DELETE',
      headers: getHeaders()
    });
    if (!res.ok) {
      const err = await res.json();
      throw new Error(err.error || 'Error al eliminar etapa');
    }
    await loadProgramacionStages();
    renderProgramacionTable();
  } catch (err) {
    alert(`Error: ${err.message}`);
  }
};

// Pricing programming table loader
async function loadMonthlyPricingTable(productId) {
  if (!productId) {
    const tbody = document.getElementById('programacion-table-tbody');
    if (tbody) {
      tbody.innerHTML = '<tr><td colspan="4" style="text-align: center; color: var(--text-light); padding: 40px;">Por favor, seleccione un producto para ver su programación mensual.</td></tr>';
    }
    return;
  }

  try {
    const res = await fetch(`/api/programacion/precios?producto_id=${productId}`, {
      method: 'GET',
      headers: getHeaders()
    });
    if (!res.ok) throw new Error('Error al cargar la programación de precios');
    const prices = await res.json();
    renderProgramacionTableContent(prices);
  } catch (err) {
    console.error('Error loading monthly pricing table:', err);
  }
}

// Month names list
const monthNames = [
  'Enero', 'Febrero', 'Marzo', 'Abril', 'Mayo', 'Junio',
  'Julio', 'Agosto', 'Septiembre', 'Octubre', 'Noviembre', 'Diciembre'
];

// Helper to check if a month overlaps with stage dates (assuming year 2026 for consistency with local time)
function checkMonthOverlap(monthIndex, startStr, endStr) {
  const start = new Date(startStr);
  const end = new Date(endStr);
  
  // Create start/end range for the month
  const year = 2026;
  const monthStart = new Date(year, monthIndex, 1);
  const monthEnd = new Date(year, monthIndex + 1, 0); // Last day of month

  return start <= monthEnd && end >= monthStart;
}

function renderProgramacionTable() {
  // Update table headers to include active stages
  const headerRow = document.getElementById('programacion-header-row');
  if (!headerRow) return;

  // Clear existing dynamic columns
  while (headerRow.children.length > 4) {
    headerRow.removeChild(headerRow.lastChild);
  }

  // Inject stages as column headers
  programacionStages.forEach(etapa => {
    const th = document.createElement('th');
    th.className = 'stage-header-col';
    th.innerHTML = `
      <div class="stage-header-wrapper" title="${etapa.nombre} (${etapa.fecha_inicio} - ${etapa.fecha_fin})">
        <span class="stage-color-dot" style="background-color: ${etapa.color};"></span>
        <span class="stage-header-text">${etapa.clave}</span>
      </div>
    `;
    headerRow.appendChild(th);
  });

  // Reload current product if selected
  if (selectedProgramacionProductId) {
    loadMonthlyPricingTable(selectedProgramacionProductId);
  } else {
    const tbody = document.getElementById('programacion-table-tbody');
    if (tbody) {
      tbody.innerHTML = `<tr><td colspan="${4 + programacionStages.length}" style="text-align: center; color: var(--text-light); padding: 40px;">Por favor, seleccione un producto para ver su programación mensual.</td></tr>`;
    }
  }
}

function renderProgramacionTableContent(prices) {
  const tbody = document.getElementById('programacion-table-tbody');
  if (!tbody) return;

  tbody.innerHTML = '';
  monthlyPricePropagationStart = null;
  const isWritable = ['Administrador', 'Coordinador'].includes(user.nivel_rol);

  monthNames.forEach((monthName, idx) => {
    const monthNum = idx + 1;
    const priceData = prices.find(p => p.mes === monthNum) || { precio: 0.0, promo_dinero: 0.0, promo_porcentaje: 0.0 };

    const tr = document.createElement('tr');
    
    // Base month and inputs cells
    tr.innerHTML = `
      <td style="font-weight: 600; color: var(--text);">${monthName}</td>
      <td>
        <input type="number" step="0.01" class="form-input pricing-input" data-month="${monthNum}" data-field="precio" value="${priceData.precio}" ${isWritable ? '' : 'disabled'} style="text-align: right; padding: 4px 8px; font-size: 13px; width: 100%;">
      </td>
      <td>
        <input type="number" step="0.01" class="form-input pricing-input" data-month="${monthNum}" data-field="promo_dinero" value="${priceData.promo_dinero}" ${isWritable ? '' : 'disabled'} style="text-align: right; padding: 4px 8px; font-size: 13px; color: var(--accent); width: 100%;">
      </td>
      <td>
        <input type="number" step="0.01" class="form-input pricing-input" data-month="${monthNum}" data-field="promo_porcentaje" value="${priceData.promo_porcentaje}" ${isWritable ? '' : 'disabled'} style="text-align: right; padding: 4px 8px; font-size: 13px; color: var(--success); width: 100%;">
      </td>
    `;

    // Dynamic timeline cells for each stage
    programacionStages.forEach(etapa => {
      const td = document.createElement('td');
      td.className = 'timeline-cell';
      
      const active = checkMonthOverlap(idx, etapa.fecha_inicio, etapa.fecha_fin);
      if (active) {
        const trigger = document.createElement('button');
        trigger.type = 'button';
        trigger.className = 'timeline-bar timeline-report-trigger';
        trigger.style.backgroundColor = `${etapa.color}dd`;
        trigger.style.borderLeftColor = etapa.color;
        trigger.title = `Ver análisis de ${etapa.nombre}`;
        trigger.setAttribute('aria-label', `Ver análisis de ${etapa.nombre}`);
        trigger.innerHTML = `<span class="timeline-bar-text">${escapeHtml(etapa.clave)}</span>`;
        trigger.addEventListener('click', () => window.openStageAnalysis(etapa.id));
        td.appendChild(trigger);
      }
      tr.appendChild(td);
    });

    tbody.appendChild(tr);
  });

  tbody.querySelectorAll('.pricing-input[data-field="precio"]').forEach(input => {
    input.addEventListener('input', () => {
      const startMonth = Number(input.dataset.month);
      const value = input.value;
      monthlyPricePropagationStart = startMonth;
      tbody.querySelectorAll('.pricing-input[data-field="precio"]').forEach(target => {
        if (Number(target.dataset.month) >= startMonth) target.value = value;
      });
    });
  });
}

function stageAnalysisDate(value) {
  const date = new Date(`${value}T00:00:00`);
  return Number.isNaN(date.getTime()) ? value : date.toLocaleDateString('es-MX', { day: '2-digit', month: 'short', year: 'numeric' });
}

function stageAnalysisSummary(stageCode, responses) {
  if (stageCode === 'DV' || stageCode === 'DR') {
    const anomaly = responses.anomalia === 'Sí' ? 'Anomalía reportada' : 'Sin anomalía';
    return `${anomaly}. ${responses.comentarios_productor || 'Sin observaciones.'}`;
  }
  if (stageCode === 'C') {
    return `${responses.hibrido_material || 'Material sin especificar'} · Rendimiento: ${responses.rendimiento || 'sin dato'} · Superficie: ${responses.hectareaje || 'sin dato'}`;
  }
  return 'Etapa de venta: la gestión comercial se consulta en Cotizador.';
}

window.openStageAnalysis = async function(stageId) {
  const stage = programacionStages.find(item => item.id === Number(stageId));
  if (!stage) return;

  const title = document.getElementById('stage-analysis-title');
  const period = document.getElementById('stage-analysis-period');
  const content = document.getElementById('stage-analysis-content');
  if (!title || !period || !content) return;

  title.textContent = `Análisis de ${stage.nombre}`;
  period.textContent = `${stageAnalysisDate(stage.fecha_inicio)} al ${stageAnalysisDate(stage.fecha_fin)}`;
  content.innerHTML = '<div class="stage-analysis-loading">Cargando análisis...</div>';
  openModal('stage-analysis-modal');

  try {
    const res = await fetch(`/api/programacion/etapas/${stage.id}/analisis`, { headers: getHeaders() });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || 'No fue posible cargar el análisis');

    const resumen = data.resumen;
    const pendientes = Math.max(0, resumen.visitas_programadas - resumen.reportes_recibidos);
    const anomalyCopy = ['DV', 'DR'].includes(stage.clave)
      ? `${resumen.anomalias_reportadas} con anomalía reportada`
      : stage.clave === 'C'
        ? 'Datos de cosecha recopilados'
        : 'Seguimiento comercial desde Cotizador';
    const reportRows = data.reportes.map(reporte => `
      <tr>
        <td><strong>${escapeHtml(reporte.cliente_nombre || 'Agricultor sin nombre')}</strong></td>
        <td>${escapeHtml(reporte.asesor_nombre || '-')}</td>
        <td>${escapeHtml(stageAnalysisDate(reporte.fecha_reporte))}</td>
        <td class="stage-analysis-response">${escapeHtml(stageAnalysisSummary(stage.clave, reporte.respuestas || {}))}</td>
      </tr>
    `).join('');

    content.innerHTML = `
      <div class="stage-analysis-metrics">
        <div><span>Visitas programadas</span><strong>${resumen.visitas_programadas}</strong></div>
        <div><span>Reportes recibidos</span><strong>${resumen.reportes_recibidos}</strong></div>
        <div><span>Agricultores con reporte</span><strong>${resumen.agricultores_reportaron}</strong></div>
        <div><span>Pendientes de captura</span><strong class="${pendientes ? 'stage-analysis-warning' : ''}">${pendientes}</strong></div>
      </div>
      <div class="stage-analysis-insight" style="--stage-color: ${escapeAttribute(stage.color)};">
        <strong>${escapeHtml(anomalyCopy)}</strong>
        <span>${resumen.asesores_reportaron} asesores han registrado información en este periodo.</span>
      </div>
      <div class="table-container stage-analysis-table-wrap">
        <table>
          <thead><tr><th>Agricultor</th><th>Asesor</th><th>Fecha</th><th>Información registrada</th></tr></thead>
          <tbody>${reportRows || '<tr><td colspan="4" class="stage-analysis-empty">Aún no hay encuestas registradas en esta etapa.</td></tr>'}</tbody>
        </table>
      </div>
    `;
  } catch (err) {
    content.innerHTML = `<div class="stage-analysis-empty">${escapeHtml(err.message)}</div>`;
  }
};

async function saveMonthlyPricing() {
  if (!selectedProgramacionProductId) {
    alert('Por favor seleccione un producto primero.');
    return;
  }

  const inputs = document.querySelectorAll('.pricing-input');
  const preciosMap = {};

  inputs.forEach(input => {
    const month = parseInt(input.getAttribute('data-month'));
    const field = input.getAttribute('data-field');
    const val = parseFloat(input.value) || 0.0;

    if (!preciosMap[month]) {
      preciosMap[month] = { mes: month };
    }
    preciosMap[month][field] = val;
  });

  const preciosArray = Object.values(preciosMap).sort((a, b) => a.mes - b.mes);

  const btn = document.getElementById('btn-save-precios');
  btn.disabled = true;
  btn.innerText = '💾 Guardando...';

  try {
    const res = await fetch('/api/programacion/precios', {
      method: 'POST',
      headers: getHeaders(),
      body: JSON.stringify({
        producto_id: parseInt(selectedProgramacionProductId),
        precios: preciosArray,
        mes_inicio_propagacion: monthlyPricePropagationStart
      })
    });

    if (!res.ok) {
      const err = await res.json();
      throw new Error(err.error || 'Error al guardar los precios');
    }

    alert('Programación mensual guardada con éxito.');
    await loadMonthlyPricingTable(selectedProgramacionProductId);
  } catch (err) {
    alert(`Error: ${err.message}`);
  } finally {
    btn.disabled = false;
    btn.innerText = '💾 Guardar Cambios';
  }
}

// Bind Programación View event listeners
function bindProgramacionEventListeners() {
  const stagesCard = document.getElementById('programacion-stages-card');
  const stagesToggle = document.getElementById('programacion-stages-toggle');
  if (stagesCard && stagesToggle) {
    const collapsed = localStorage.getItem('agrisalesProgramacionStagesCollapsed') === 'true';
    stagesCard.classList.toggle('is-collapsed', collapsed);
    document.querySelector('.programacion-grid')?.classList.toggle('stages-collapsed', collapsed);
    stagesToggle.setAttribute('aria-expanded', String(!collapsed));
    stagesToggle.setAttribute('title', collapsed ? 'Expandir gestión de etapas' : 'Contraer gestión de etapas');
    stagesToggle.setAttribute('aria-label', collapsed ? 'Expandir gestión de etapas' : 'Contraer gestión de etapas');

    stagesToggle.addEventListener('click', () => {
      const isCollapsed = stagesCard.classList.toggle('is-collapsed');
      document.querySelector('.programacion-grid')?.classList.toggle('stages-collapsed', isCollapsed);
      localStorage.setItem('agrisalesProgramacionStagesCollapsed', String(isCollapsed));
      stagesToggle.setAttribute('aria-expanded', String(!isCollapsed));
      stagesToggle.setAttribute('title', isCollapsed ? 'Expandir gestión de etapas' : 'Contraer gestión de etapas');
      stagesToggle.setAttribute('aria-label', isCollapsed ? 'Expandir gestión de etapas' : 'Contraer gestión de etapas');
    });
  }

  const form = document.getElementById('etapa-form');
  if (form) {
    form.addEventListener('submit', async (e) => {
      e.preventDefault();
      
      const id = document.getElementById('etapa-id').value;
      const clave = document.getElementById('etapa-clave').value;
      const nombre = document.getElementById('etapa-nombre').value;
      const fecha_inicio = document.getElementById('etapa-inicio').value;
      const fecha_fin = document.getElementById('etapa-fin').value;
      const color = document.getElementById('etapa-color').value;

      const btn = document.getElementById('btn-save-etapa');
      btn.disabled = true;

      try {
        const res = await fetch('/api/programacion/etapas', {
          method: 'POST',
          headers: getHeaders(),
          body: JSON.stringify({
            id: id ? parseInt(id) : undefined,
            clave,
            nombre,
            fecha_inicio,
            fecha_fin,
            color
          })
        });

        if (!res.ok) {
          const err = await res.json();
          throw new Error(err.error || 'Error al guardar etapa');
        }

        form.reset();
        document.getElementById('etapa-id').value = '';
        document.getElementById('btn-cancel-etapa').style.display = 'none';
        btn.innerText = 'Guardar Etapa';

        await loadProgramacionStages();
        renderProgramacionTable();
      } catch (err) {
        alert(`Error: ${err.message}`);
      } finally {
        btn.disabled = false;
      }
    });
  }

  const cancelBtn = document.getElementById('btn-cancel-etapa');
  if (cancelBtn) {
    cancelBtn.addEventListener('click', () => {
      const form = document.getElementById('etapa-form');
      if (form) form.reset();
      document.getElementById('etapa-id').value = '';
      cancelBtn.style.display = 'none';
      document.getElementById('btn-save-etapa').innerText = 'Guardar Etapa';
    });
  }

  const productSelect = document.getElementById('programacion-product-select');
  if (productSelect) {
    productSelect.addEventListener('change', (e) => {
      selectedProgramacionProductId = e.target.value;
      loadMonthlyPricingTable(selectedProgramacionProductId);
    });
  }

  const savePreciosBtn = document.getElementById('btn-save-precios');
  if (savePreciosBtn) {
    savePreciosBtn.addEventListener('click', saveMonthlyPricing);
  }
}

// -------------------------------------------------------------
// MÓDULO DE COMISIONES - FRONTEND CONTROLLER
// -------------------------------------------------------------

let currentComisionesReporteData = [];

function switchComisionTab(tabName) {
  const btnReportes = document.getElementById('tab-btn-reportes');
  const btnTabulador = document.getElementById('tab-btn-tabulador');
  const contentReportes = document.getElementById('tab-reportes');
  const contentTabulador = document.getElementById('tab-tabulador');

  if (!contentReportes || !contentTabulador) return;

  if (tabName === 'reportes') {
    if (btnReportes) {
      btnReportes.classList.add('active', 'btn-primary');
      btnReportes.classList.remove('btn-secondary');
    }
    if (btnTabulador) {
      btnTabulador.classList.remove('active', 'btn-primary');
      btnTabulador.classList.add('btn-secondary');
    }
    contentReportes.style.display = 'block';
    contentReportes.classList.add('active');
    contentTabulador.style.display = 'none';
    contentTabulador.classList.remove('active');
    cargarKPIsYReporteComisiones();
  } else {
    if (btnTabulador) {
      btnTabulador.classList.add('active', 'btn-primary');
      btnTabulador.classList.remove('btn-secondary');
    }
    if (btnReportes) {
      btnReportes.classList.remove('active', 'btn-primary');
      btnReportes.classList.add('btn-secondary');
    }
    contentTabulador.style.display = 'block';
    contentTabulador.classList.add('active');
    contentReportes.style.display = 'none';
    contentReportes.classList.remove('active');
    cargarTabuladorComisiones();
  }
}

async function loadComisionesView() {
  const isAuthorized = user && (user.nivel_rol === 'Administrador' || user.nivel_rol === 'Gerente');
  const btnTabulador = document.getElementById('tab-btn-tabulador');
  if (btnTabulador) {
    btnTabulador.style.display = isAuthorized ? 'inline-block' : 'none';
  }
  if (!isAuthorized) {
    switchComisionTab('reportes');
  }

  const mesInput = document.getElementById('comisiones-filtro-mes');
  if (mesInput && !mesInput.value) {
    const today = new Date();
    const month = String(today.getMonth() + 1).padStart(2, '0');
    mesInput.value = `${today.getFullYear()}-${month}`;
  }

  try {
    if (isAuthorized) {
      const resAdvisors = await fetch('/api/asesores', { headers: getHeaders() });
      if (resAdvisors.ok) {
        const advisors = await resAdvisors.json();
        const selAsesor = document.getElementById('comisiones-filtro-asesor');
        if (selAsesor) {
          selAsesor.innerHTML = '<option value="">-- Todos los Asesores --</option>' + 
            advisors.map(a => `<option value="${a.id}">${escapeHtml(a.nombre)}</option>`).join('');
        }
      }
    }

    const resProds = await fetch('/api/productos', { headers: getHeaders() });
    if (resProds.ok) {
      const prods = await resProds.json();
      const selBaseProd = document.getElementById('regla-base-producto-id');
      const selTempProd = document.getElementById('regla-temp-producto-id');
      if (selBaseProd) {
        selBaseProd.innerHTML = prods.map(p => `<option value="${p.id}">${escapeHtml(p.producto)} ($${p.list_price_mxn})</option>`).join('');
      }
      if (selTempProd) {
        selTempProd.innerHTML = '<option value="">-- Aplica a todos --</option>' + 
          prods.map(p => `<option value="${p.id}">${escapeHtml(p.producto)}</option>`).join('');
      }
    }

    const resTemp = await fetch('/api/temporadas', { headers: getHeaders() });
    if (resTemp.ok) {
      const temp = await resTemp.json();
      const selTemp = document.getElementById('regla-temp-temporada-id');
      if (selTemp) {
        selTemp.innerHTML = temp.map(t => `<option value="${t.id}">${escapeHtml(t.actividad)} (${t.estado_operacion} ${t.descuento_porcentaje}%)</option>`).join('');
      }
    }
  } catch (err) {
    console.error('Error loading comisiones dropdowns:', err);
  }

  await cargarKPIsYReporteComisiones();
}

async function cargarKPIsYReporteComisiones() {
  const ciclo = document.getElementById('comisiones-filtro-ciclo')?.value || 'O-I 2026';
  const valMes = document.getElementById('comisiones-filtro-mes')?.value || '';
  let mes = '';
  let anio = '';
  if (valMes) {
    const parts = valMes.split('-');
    anio = parts[0];
    mes = parts[1];
  }
  const asesorId = document.getElementById('comisiones-filtro-asesor')?.value || '';
  const estatus = document.getElementById('comisiones-filtro-estatus')?.value || '';

  try {
    let kpiUrl = `/api/comisiones/kpis?ciclo=${encodeURIComponent(ciclo)}`;
    if (mes) kpiUrl += `&mes=${mes}`;
    if (anio) kpiUrl += `&anio=${anio}`;
    if (asesorId) kpiUrl += `&asesor_id=${asesorId}`;

    const resKpi = await fetch(kpiUrl, { headers: getHeaders() });
    if (resKpi.ok) {
      const kpis = await resKpi.json();
      const elTotal = document.getElementById('kpi-total-mes');
      const elMeta = document.getElementById('kpi-progreso-meta');
      const elBono = document.getElementById('kpi-bono');

      if (elTotal) elTotal.textContent = `$${parseFloat(kpis.total_generado_mes_mxn).toLocaleString('es-MX', {minimumFractionDigits:2, maximumFractionDigits:2})} MXN`;
      if (elMeta) elMeta.textContent = `${kpis.progreso_meta_porcentaje}%`;
      if (elBono) elBono.textContent = `$${parseFloat(kpis.bono_proyectado_mxn).toLocaleString('es-MX', {minimumFractionDigits:2, maximumFractionDigits:2})} MXN`;
    }
  } catch (err) {
    console.error('Error loading KPIs:', err);
  }

  try {
    let repUrl = '/api/comisiones/reporte?';
    if (asesorId) repUrl += `&asesor_id=${asesorId}`;
    if (estatus) repUrl += `&estatus=${encodeURIComponent(estatus)}`;

    const resRep = await fetch(repUrl, { headers: getHeaders() });
    if (resRep.ok) {
      const data = await resRep.json();
      currentComisionesReporteData = data;
      renderTablaComisiones(data);
    }
  } catch (err) {
    console.error('Error loading comisiones report:', err);
  }
}

function renderTablaComisiones(data) {
  const tbody = document.getElementById('tabla-comisiones-body');
  if (!tbody) return;

  if (!data || data.length === 0) {
    tbody.innerHTML = `<tr><td colspan="9" style="text-align: center; color: var(--text-light); padding: 30px;">No se encontraron comisiones registradas.</td></tr>`;
    return;
  }

  const isAdmin = user && (user.nivel_rol === 'Administrador' || user.nivel_rol === 'Gerente');

  tbody.innerHTML = data.map(row => {
    const fechaStr = row.fecha_calculo ? row.fecha_calculo.slice(0, 10) : '-';
    const totalVal = parseFloat(row.total_comision_mxn);
    const isNegative = totalVal < 0;

    let badgeClass = 'badge-secondary';
    if (row.estatus === 'Pagada') badgeClass = 'badge-success';
    else if (row.estatus === 'Pendiente') badgeClass = 'badge-warning';
    else if (row.estatus === 'Cancelada') badgeClass = 'badge-danger';

    const checkboxHtml = isAdmin
      ? `<td style="text-align: center;">${row.estatus === 'Pendiente' ? `<input type="checkbox" class="check-comision-item" value="${row.id}">` : ''}</td>`
      : '';

    return `
      <tr style="${isNegative ? 'background: rgba(220, 53, 69, 0.08);' : ''}">
        ${checkboxHtml}
        <td>${fechaStr}</td>
        <td><strong>${escapeHtml(row.asesor_nombre || 'Asesor')}</strong></td>
        <td>${escapeHtml(row.folio_cotizacion || ('Cot. #' + row.cotizacion_id))}</td>
        <td>${escapeHtml(row.producto_nombre || row.notas || 'Detalle Venta')}</td>
        <td>$${parseFloat(row.monto_base_aplicado).toLocaleString('es-MX', {minimumFractionDigits:2, maximumFractionDigits:2})}</td>
        <td>$${parseFloat(row.monto_temporada_aplicado).toLocaleString('es-MX', {minimumFractionDigits:2, maximumFractionDigits:2})}</td>
        <td style="font-weight: bold; color: ${isNegative ? 'var(--danger, #dc3545)' : 'var(--success, #28a745)'};">
          $${totalVal.toLocaleString('es-MX', {minimumFractionDigits:2, maximumFractionDigits:2})}
        </td>
        <td><span class="badge ${badgeClass}">${row.estatus}</span></td>
      </tr>
    `;
  }).join('');
}

function toggleReglaBaseTargetInput(targetType) {
  const grpProd = document.getElementById('group-regla-base-producto');
  const grpCat = document.getElementById('group-regla-base-categoria');
  if (targetType === 'categoria') {
    if (grpProd) grpProd.style.display = 'none';
    if (grpCat) grpCat.style.display = 'block';
  } else {
    if (grpProd) grpProd.style.display = 'block';
    if (grpCat) grpCat.style.display = 'none';
  }
}

async function guardarReglaBase(e) {
  e.preventDefault();
  const targetType = document.getElementById('regla-base-target-type').value;
  const productoId = targetType === 'producto' ? document.getElementById('regla-base-producto-id').value : null;
  const tipoCategoria = targetType === 'categoria' ? document.getElementById('regla-base-categoria').value : null;
  const condicionPago = document.getElementById('regla-base-condicion-pago').value;
  const tipoValor = document.getElementById('regla-base-tipo-valor').value;
  const valor = document.getElementById('regla-base-valor').value;

  try {
    const res = await fetch('/api/comisiones/reglas/base', {
      method: 'POST',
      headers: getHeaders(),
      body: JSON.stringify({ producto_id: productoId, tipo_categoria: tipoCategoria, condicion_pago: condicionPago, tipo_valor: tipoValor, valor })
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || 'Error al guardar regla');
    alert('Regla base guardada correctamente');
    document.getElementById('form-regla-base').reset();
    cargarTabuladorComisiones();
  } catch (err) {
    alert(`Error: ${err.message}`);
  }
}

async function guardarReglaTemporada(e) {
  e.preventDefault();
  const temporadaId = document.getElementById('regla-temp-temporada-id').value;
  const productoId = document.getElementById('regla-temp-producto-id').value || null;
  const tipoValor = document.getElementById('regla-temp-tipo-valor').value;
  const valor = document.getElementById('regla-temp-valor').value;
  const comportamiento = document.getElementById('regla-temp-comportamiento').value;

  try {
    const res = await fetch('/api/comisiones/reglas/temporada', {
      method: 'POST',
      headers: getHeaders(),
      body: JSON.stringify({ temporada_id: temporadaId, producto_id: productoId, tipo_valor: tipoValor, valor, comportamiento })
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || 'Error al guardar regla');
    alert('Regla de temporada guardada correctamente');
    document.getElementById('form-regla-temporada').reset();
    cargarTabuladorComisiones();
  } catch (err) {
    alert(`Error: ${err.message}`);
  }
}

async function guardarReglaBono(e) {
  e.preventDefault();
  const cicloAgricola = document.getElementById('regla-bono-ciclo').value;
  const pct = document.getElementById('regla-bono-pct').value;
  const bonoMxn = document.getElementById('regla-bono-mxn').value;

  try {
    const res = await fetch('/api/comisiones/bonos', {
      method: 'POST',
      headers: getHeaders(),
      body: JSON.stringify({ ciclo_agricola: cicloAgricola, porcentaje_meta_requerido: pct, bono_mxn: bonoMxn })
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || 'Error al guardar bono');
    alert('Regla de bono guardada correctamente');
    document.getElementById('form-regla-bono').reset();
    cargarTabuladorComisiones();
  } catch (err) {
    alert(`Error: ${err.message}`);
  }
}

async function cargarTabuladorComisiones() {
  try {
    const res = await fetch('/api/comisiones/reglas', { headers: getHeaders() });
    if (!res.ok) return;

    const { base, temporada, bonos } = await res.json();

    const tbodyBase = document.getElementById('tabla-reglas-base-body');
    if (tbodyBase) {
      if (!base || base.length === 0) {
        tbodyBase.innerHTML = '<tr><td colspan="7" style="text-align: center; color: var(--text-light);">No hay reglas base registradas.</td></tr>';
      } else {
        tbodyBase.innerHTML = base.map(r => `
          <tr>
            <td>#${r.id}</td>
            <td><strong>${escapeHtml(r.producto_nombre || ('Categoría: ' + r.tipo_categoria))}</strong></td>
            <td>${escapeHtml(r.condicion_pago || 'Todos')}</td>
            <td>${r.tipo_valor === 'porcentaje' ? 'Porcentaje (%)' : 'Monto Fijo ($)'}</td>
            <td>${r.tipo_valor === 'porcentaje' ? r.valor + '%' : '$' + r.valor}</td>
            <td><span class="badge ${r.activo ? 'badge-success' : 'badge-secondary'}">${r.activo ? 'Activa' : 'Inactiva'}</span></td>
            <td>
              <button class="btn btn-outline" style="padding: 2px 6px; font-size: 11px; margin-right: 4px;" onclick="editarReglaBase(${r.id}, ${r.valor})">✏️ Editar</button>
              <button class="btn btn-danger" style="padding: 2px 6px; font-size: 11px; margin-right: 4px;" onclick="eliminarReglaBase(${r.id})">🗑️ Eliminar</button>
              <button class="btn btn-outline" style="padding: 2px 6px; font-size: 11px;" onclick="toggleEstadoReglaBase(${r.id}, ${r.activo ? 0 : 1})">
                ${r.activo ? 'Desactivar' : 'Activar'}
              </button>
            </td>
          </tr>
        `).join('');
      }
    }

    const tbodyTemp = document.getElementById('tabla-reglas-temporada-body');
    if (tbodyTemp) {
      if (!temporada || temporada.length === 0) {
        tbodyTemp.innerHTML = '<tr><td colspan="8" style="text-align: center; color: var(--text-light);">No hay reglas de temporada registradas.</td></tr>';
      } else {
        tbodyTemp.innerHTML = temporada.map(t => `
          <tr>
            <td>#${t.id}</td>
            <td>${escapeHtml(t.temporada_nombre || 'Temporada')}</td>
            <td>${escapeHtml(t.producto_nombre || 'Todos los productos')}</td>
            <td>${t.tipo_valor === 'porcentaje' ? 'Porcentaje (%)' : 'Monto Fijo ($)'}</td>
            <td>${t.tipo_valor === 'porcentaje' ? t.valor + '%' : '$' + t.valor}</td>
            <td><span class="badge badge-info">${escapeHtml(t.comportamiento)}</span></td>
            <td><span class="badge ${t.activo ? 'badge-success' : 'badge-secondary'}">${t.activo ? 'Activa' : 'Inactiva'}</span></td>
            <td>
              <button class="btn btn-outline" style="padding: 2px 6px; font-size: 11px; margin-right: 4px;" onclick="editarReglaTemporada(${t.id}, ${t.valor})">✏️ Editar</button>
              <button class="btn btn-danger" style="padding: 2px 6px; font-size: 11px;" onclick="eliminarReglaTemporada(${t.id})">🗑️ Eliminar</button>
            </td>
          </tr>
        `).join('');
      }
    }

    const tbodyBonos = document.getElementById('tabla-reglas-bonos-body');
    if (tbodyBonos) {
      if (!bonos || bonos.length === 0) {
        tbodyBonos.innerHTML = '<tr><td colspan="6" style="text-align: center; color: var(--text-light);">No hay escalas de bonos registradas.</td></tr>';
      } else {
        tbodyBonos.innerHTML = bonos.map(b => `
          <tr>
            <td>#${b.id}</td>
            <td>${escapeHtml(b.ciclo_agricola)}</td>
            <td><strong>${b.porcentaje_meta_requerido}%</strong></td>
            <td style="color: var(--success, #28a745); font-weight: bold;">$${parseFloat(b.bono_mxn).toLocaleString('es-MX', {minimumFractionDigits:2})} MXN</td>
            <td><span class="badge ${b.activo ? 'badge-success' : 'badge-secondary'}">${b.activo ? 'Activa' : 'Inactiva'}</span></td>
            <td>
              <button class="btn btn-outline" style="padding: 2px 6px; font-size: 11px; margin-right: 4px;" onclick="editarReglaBono(${b.id}, ${b.porcentaje_meta_requerido}, ${b.bono_mxn})">✏️ Editar</button>
              <button class="btn btn-danger" style="padding: 2px 6px; font-size: 11px;" onclick="eliminarReglaBono(${b.id})">🗑️ Eliminar</button>
            </td>
          </tr>
        `).join('');
      }
    }
  } catch (err) {
    console.error('Error loading tabulador:', err);
  }
}

async function editarReglaBase(id, valorActual) {
  const nuevoValor = prompt('Ingrese el nuevo valor para la regla base (monto o %):', valorActual);
  if (nuevoValor === null || nuevoValor.trim() === '') return;
  const val = parseFloat(nuevoValor);
  if (isNaN(val)) return alert('Ingrese un número válido.');

  try {
    const res = await fetch(`/api/comisiones/reglas/base/${id}`, {
      method: 'PUT',
      headers: getHeaders(),
      body: JSON.stringify({ valor: val })
    });
    if (!res.ok) throw new Error('Error al actualizar regla base');
    alert('Regla base actualizada correctamente');
    cargarTabuladorComisiones();
  } catch (err) {
    alert(`Error: ${err.message}`);
  }
}

async function eliminarReglaBase(id) {
  if (!confirm('¿Está seguro de eliminar esta regla base?')) return;
  try {
    const res = await fetch(`/api/comisiones/reglas/base/${id}`, {
      method: 'DELETE',
      headers: getHeaders()
    });
    if (!res.ok) throw new Error('Error al eliminar regla base');
    alert('Regla base eliminada correctamente');
    cargarTabuladorComisiones();
  } catch (err) {
    alert(`Error: ${err.message}`);
  }
}

async function editarReglaTemporada(id, valorActual) {
  const nuevoValor = prompt('Ingrese el nuevo valor para la regla de temporada (monto o %):', valorActual);
  if (nuevoValor === null || nuevoValor.trim() === '') return;
  const val = parseFloat(nuevoValor);
  if (isNaN(val)) return alert('Ingrese un número válido.');

  try {
    const res = await fetch(`/api/comisiones/reglas/temporada/${id}`, {
      method: 'PUT',
      headers: getHeaders(),
      body: JSON.stringify({ valor: val })
    });
    if (!res.ok) throw new Error('Error al actualizar regla de temporada');
    alert('Regla de temporada actualizada correctamente');
    cargarTabuladorComisiones();
  } catch (err) {
    alert(`Error: ${err.message}`);
  }
}

async function eliminarReglaTemporada(id) {
  if (!confirm('¿Está seguro de eliminar esta regla de temporada?')) return;
  try {
    const res = await fetch(`/api/comisiones/reglas/temporada/${id}`, {
      method: 'DELETE',
      headers: getHeaders()
    });
    if (!res.ok) throw new Error('Error al eliminar regla de temporada');
    alert('Regla de temporada eliminada correctamente');
    cargarTabuladorComisiones();
  } catch (err) {
    alert(`Error: ${err.message}`);
  }
}

async function editarReglaBono(id, pctActual, bonoActual) {
  const nuevoBono = prompt(`Editar monto del bono para ${pctActual}% de meta (MXN):`, bonoActual);
  if (nuevoBono === null || nuevoBono.trim() === '') return;
  const val = parseFloat(nuevoBono);
  if (isNaN(val)) return alert('Ingrese un número válido.');

  try {
    const res = await fetch(`/api/comisiones/bonos/${id}`, {
      method: 'PUT',
      headers: getHeaders(),
      body: JSON.stringify({ bono_mxn: val })
    });
    if (!res.ok) throw new Error('Error al actualizar regla de bono');
    alert('Regla de bono actualizada correctamente');
    cargarTabuladorComisiones();
  } catch (err) {
    alert(`Error: ${err.message}`);
  }
}

async function eliminarReglaBono(id) {
  if (!confirm('¿Está seguro de eliminar esta regla de bono?')) return;
  try {
    const res = await fetch(`/api/comisiones/bonos/${id}`, {
      method: 'DELETE',
      headers: getHeaders()
    });
    if (!res.ok) throw new Error('Error al eliminar regla de bono');
    alert('Regla de bono eliminada correctamente');
    cargarTabuladorComisiones();
  } catch (err) {
    alert(`Error: ${err.message}`);
  }
}

async function toggleEstadoReglaBase(id, nuevoActivo) {
  try {
    const res = await fetch(`/api/comisiones/reglas/base/${id}`, {
      method: 'PUT',
      headers: getHeaders(),
      body: JSON.stringify({ activo: nuevoActivo })
    });
    if (!res.ok) throw new Error('Error al actualizar regla');
    cargarTabuladorComisiones();
  } catch (err) {
    alert(`Error: ${err.message}`);
  }
}

function toggleSelectAllComisiones(masterCheckbox) {
  const checkboxes = document.querySelectorAll('.check-comision-item');
  checkboxes.forEach(cb => cb.checked = masterCheckbox.checked);
}

async function aprobarPagoComisionesSeleccionadas() {
  const checkboxes = document.querySelectorAll('.check-comision-item:checked');
  if (checkboxes.length === 0) {
    alert('Por favor selecciona al menos una comisión pendiente.');
    return;
  }

  const ids = Array.from(checkboxes).map(cb => parseInt(cb.value));

  if (!confirm(`¿Estás seguro de marcar ${ids.length} comisiones como PAGADAS? Esta acción congela el registro contable.`)) {
    return;
  }

  try {
    const res = await fetch('/api/comisiones/pagar', {
      method: 'PUT',
      headers: getHeaders(),
      body: JSON.stringify({ ids_comisiones: ids })
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || 'Error al procesar pago');
    alert(data.message || 'Comisiones pagadas con éxito');
    cargarKPIsYReporteComisiones();
  } catch (err) {
    alert(`Error: ${err.message}`);
  }
}

async function ejecutarCierreCicloComisiones() {
  const ciclo = document.getElementById('comisiones-filtro-ciclo')?.value || 'O-I 2026';
  if (!confirm(`¿Deseas realizar el Cierre de Ciclo Agrícola "${ciclo}"? Se evaluarán las metas de los asesores y se materializarán los bonos ganados.`)) {
    return;
  }

  try {
    const res = await fetch('/api/comisiones/cierre-ciclo', {
      method: 'POST',
      headers: getHeaders(),
      body: JSON.stringify({ ciclo_agricola: ciclo })
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || 'Error al ejecutar cierre de ciclo');
    alert(data.message || 'Cierre de ciclo completado');
    cargarKPIsYReporteComisiones();
  } catch (err) {
    alert(`Error: ${err.message}`);
  }
}

function exportarComisiones(formato) {
  if (!currentComisionesReporteData || currentComisionesReporteData.length === 0) {
    alert('No hay datos de comisiones para exportar.');
    return;
  }

  if (formato === 'csv') {
    const headers = ['Fecha', 'Asesor', 'Folio Venta', 'Producto/Detalle', 'Monto Base MXN', 'Bono Temp MXN', 'Total MXN', 'Estatus', 'Notas'];
    const rows = currentComisionesReporteData.map(r => [
      `"${r.fecha_calculo ? r.fecha_calculo.slice(0, 10) : ''}"`,
      `"${(r.asesor_nombre || '').replace(/"/g, '""')}"`,
      `"${(r.folio_cotizacion || '').replace(/"/g, '""')}"`,
      `"${(r.producto_nombre || r.notas || '').replace(/"/g, '""')}"`,
      r.monto_base_aplicado,
      r.monto_temporada_aplicado,
      r.total_comision_mxn,
      `"${r.estatus}"`,
      `"${(r.notas || '').replace(/"/g, '""')}"`
    ]);

    const csvContent = 'data:text/csv;charset=utf-8,' + [headers.join(','), ...rows.map(e => e.join(','))].join('\n');
    const encodedUri = encodeURI(csvContent);
    const link = document.createElement('a');
    link.setAttribute('href', encodedUri);
    link.setAttribute('download', `reporte_comisiones_${new Date().toISOString().slice(0, 10)}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  } else if (formato === 'pdf') {
    window.print();
  }
}
