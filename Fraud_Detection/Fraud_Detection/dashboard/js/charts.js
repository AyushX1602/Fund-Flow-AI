/* ═══════════════════════════════════════════════════════════════
   FundFlow AI — Chart.js Charts
   Risk distribution, fraud by type, live trend
═══════════════════════════════════════════════════════════════ */

const CHART_DEFAULTS = {
  responsive:          true,
  maintainAspectRatio: false,
  plugins: {
    legend: {
      labels: { color: '#8888bb', font: { family: 'Inter', size: 12 } }
    }
  }
};

let riskDistChart = null;
let fraudTypeChart = null;

function drawRiskDistChart(data) {
  const ctx = document.getElementById('chart-risk-dist').getContext('2d');
  const labels = ['LOW', 'MEDIUM', 'HIGH', 'CRITICAL'];
  const values = labels.map(l => data[l] || 0);
  const colors = ['#00e676', '#ffbb33', '#ff8c42', '#ff3d5a'];
  const glows  = ['rgba(0,230,118,0.3)', 'rgba(255,187,51,0.3)',
                  'rgba(255,140,66,0.3)', 'rgba(255,61,90,0.3)'];

  if (riskDistChart) riskDistChart.destroy();
  riskDistChart = new Chart(ctx, {
    type: 'doughnut',
    data: {
      labels,
      datasets: [{
        data:            values,
        backgroundColor: colors.map(c => c + '33'),
        borderColor:     colors,
        borderWidth:     2,
        hoverOffset:     8,
      }]
    },
    options: {
      ...CHART_DEFAULTS,
      cutout: '65%',
      plugins: {
        ...CHART_DEFAULTS.plugins,
        tooltip: {
          callbacks: {
            label: ctx => ` ${ctx.label}: ${ctx.parsed.toLocaleString('en-IN')}`
          }
        }
      }
    }
  });
}

function drawFraudTypeChart(data) {
  const ctx = document.getElementById('chart-fraud-type').getContext('2d');
  const labels = Object.keys(data);
  const values = Object.values(data);

  if (fraudTypeChart) fraudTypeChart.destroy();
  fraudTypeChart = new Chart(ctx, {
    type: 'bar',
    data: {
      labels,
      datasets: [{
        label:           'Fraud Count',
        data:            values,
        backgroundColor: 'rgba(74,158,255,0.25)',
        borderColor:     '#4a9eff',
        borderWidth:     1,
        borderRadius:    6,
        hoverBackgroundColor: 'rgba(74,158,255,0.4)',
      }]
    },
    options: {
      ...CHART_DEFAULTS,
      plugins: { ...CHART_DEFAULTS.plugins, legend: { display: false } },
      scales: {
        x: {
          grid:  { color: 'rgba(255,255,255,0.03)' },
          ticks: { color: '#8888bb', font: { family: 'Inter' } }
        },
        y: {
          grid:  { color: 'rgba(255,255,255,0.04)' },
          ticks: { color: '#8888bb', font: { family: 'Inter' } }
        }
      }
    }
  });
}
