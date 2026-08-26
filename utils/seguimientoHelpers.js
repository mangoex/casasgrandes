/**
 * Helper functions for Salesforce-style Tracking & Performance Analytics
 */

function calculateComplianceRate(completed, total) {
  const comp = Number(completed) || 0;
  const tot = Number(total) || 0;
  if (tot <= 0) return 0;
  const rate = (comp / tot) * 100;
  return Math.min(100, Math.max(0, Math.round(rate * 10) / 10));
}

function calculateWinRate(wonCount, totalCount) {
  const won = Number(wonCount) || 0;
  const total = Number(totalCount) || 0;
  if (total <= 0) return 0;
  const rate = (won / total) * 100;
  return Math.min(100, Math.max(0, Math.round(rate * 10) / 10));
}

function calculateAverageDealValue(totalAmount, dealCount) {
  const amount = Number(totalAmount) || 0;
  const count = Number(dealCount) || 0;
  if (count <= 0) return 0;
  return Math.round((amount / count) * 100) / 100;
}

function classifyActivityStatus(activity, referenceDateStr) {
  const refDate = referenceDateStr ? new Date(referenceDateStr + 'T23:59:59') : new Date();
  const planDateStr = activity.fecha_programada || activity.fecha;
  const realizada = Number(activity.realizada);

  if (realizada === 1) {
    return { statusKey: 'completada', label: 'Realizada', color: '#2e844a', badgeClass: 'badge-success' };
  }

  if (planDateStr) {
    const planDate = new Date(planDateStr + 'T23:59:59');
    const diffDays = Math.floor((refDate - planDate) / (1000 * 60 * 60 * 24));
    
    if (realizada === 3 || diffDays > 7) {
      return { 
        statusKey: 'vencida', 
        label: 'Vencida', 
        daysLate: Math.max(diffDays, 1),
        color: '#ea001e', 
        badgeClass: 'badge-danger' 
      };
    }

    if (diffDays > 0) {
      return { 
        statusKey: 'atrasada', 
        label: `Atrasada (${diffDays}d)`, 
        daysLate: diffDays,
        color: '#fe9339', 
        badgeClass: 'badge-warning' 
      };
    }
  }

  return { statusKey: 'pendiente', label: 'Programada', color: '#0176d3', badgeClass: 'badge-info' };
}

function buildPipelineFunnel(quotes = [], prospectCount = 0, prospectMonto = 0) {
  let borradorCount = 0;
  let borradorMonto = 0;
  let autorizadaCount = 0;
  let autorizadaMonto = 0;
  let ganadoCount = 0;
  let ganadoMonto = 0;
  let perdidoCount = 0;
  let perdidoMonto = 0;

  quotes.forEach(q => {
    const total = Number(q.total_mxn) || 0;
    const estatus = String(q.estatus || '').trim();

    if (estatus === 'Borrador') {
      borradorCount++;
      borradorMonto += total;
    } else if (estatus === 'Autorizada') {
      autorizadaCount++;
      autorizadaMonto += total;
    } else if (estatus === 'Vendido' || estatus === 'Entregado') {
      ganadoCount++;
      ganadoMonto += total;
    } else if (estatus === 'Cancelada' || estatus === 'Rechazada') {
      perdidoCount++;
      perdidoMonto += total;
    }
  });

  const totalQuotes = quotes.length;
  const totalWonMonto = ganadoMonto;
  const pipelineActiveMonto = borradorMonto + autorizadaMonto;

  const stages = [
    {
      key: 'prospeccion',
      name: '1. Planificación & Prospectos',
      count: prospectCount,
      monto_mxn: Math.round(prospectMonto * 100) / 100,
      color: '#60a5fa'
    },
    {
      key: 'borrador',
      name: '2. Cotizaciones Emitidas',
      count: borradorCount,
      monto_mxn: Math.round(borradorMonto * 100) / 100,
      color: '#818cf8'
    },
    {
      key: 'autorizada',
      name: '3. Negociación / Autorizadas',
      count: autorizadaCount,
      monto_mxn: Math.round(autorizadaMonto * 100) / 100,
      color: '#a78bfa'
    },
    {
      key: 'ganado',
      name: '4. Cerrado Ganado (Ventas)',
      count: ganadoCount,
      monto_mxn: Math.round(ganadoMonto * 100) / 100,
      color: '#2e844a'
    },
    {
      key: 'perdido',
      name: '5. Cerrado Perdido / Cancelado',
      count: perdidoCount,
      monto_mxn: Math.round(perdidoMonto * 100) / 100,
      color: '#94a3b8'
    }
  ];

  return {
    stages,
    totalQuotes,
    totalWonMonto: Math.round(totalWonMonto * 100) / 100,
    pipelineActiveMonto: Math.round(pipelineActiveMonto * 100) / 100,
    winRate: calculateWinRate(ganadoCount, (ganadoCount + perdidoCount) || totalQuotes)
  };
}

function resolveDateRange(preset, customStart, customEnd, baseDateStr) {
  const base = baseDateStr ? new Date(baseDateStr + 'T12:00:00') : new Date();
  const formatDate = (d) => d.toISOString().split('T')[0];

  if (preset === 'hoy') {
    const todayStr = formatDate(base);
    return { fecha_inicio: todayStr, fecha_fin: todayStr, label: 'Hoy' };
  }

  if (preset === 'semana') {
    const day = base.getDay(); // 0 is Sunday, 1 is Monday
    const diffToMonday = (day === 0 ? -6 : 1) - day;
    const monday = new Date(base);
    monday.setDate(base.getDate() + diffToMonday);
    const sunday = new Date(monday);
    sunday.setDate(monday.getDate() + 6);
    return { fecha_inicio: formatDate(monday), fecha_fin: formatDate(sunday), label: 'Esta Semana' };
  }

  if (preset === 'mes') {
    const firstDay = new Date(base.getFullYear(), base.getMonth(), 1);
    const lastDay = new Date(base.getFullYear(), base.getMonth() + 1, 0);
    return { fecha_inicio: formatDate(firstDay), fecha_fin: formatDate(lastDay), label: 'Este Mes' };
  }

  if (preset === 'ultimos_30') {
    const start = new Date(base);
    start.setDate(base.getDate() - 30);
    return { fecha_inicio: formatDate(start), fecha_fin: formatDate(base), label: 'Últimos 30 días' };
  }

  if (preset === 'personalizado' && customStart && customEnd) {
    return { fecha_inicio: customStart, fecha_fin: customEnd, label: `${customStart} a ${customEnd}` };
  }

  return { fecha_inicio: null, fecha_fin: null, label: 'Todo el Ciclo' };
}

module.exports = {
  calculateComplianceRate,
  calculateWinRate,
  calculateAverageDealValue,
  classifyActivityStatus,
  buildPipelineFunnel,
  resolveDateRange
};
