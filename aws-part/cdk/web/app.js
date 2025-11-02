async function fetchDataByDevice(deviceId, { limit } = {}) {
  const base = window.DASHBOARD_CONFIG.apiBase.replace(/\/?$/, '/');
  const url = new URL(base + 'data/' + encodeURIComponent(deviceId));
  if (limit) url.searchParams.set('limit', String(limit));
  const res = await fetch(url.toString());
  if (!res.ok) throw new Error('API error: ' + res.status);
  return res.json();
}

function setStatus(text) {
  const el = document.getElementById('status');
  if (el) el.textContent = text || '';
}

function createCard(item) {
  const div = document.createElement('div');
  div.className = 'card';
  const img = document.createElement('img');
  // 画像URL: imageBase/{device_id}/{image_id}
  const imgBase = (window.DASHBOARD_CONFIG.imageBase || '').replace(/\/?$/, '/');
  img.src = imgBase + encodeURIComponent(item.device_id) + '/' + encodeURIComponent(item.image_id);
  const meta = document.createElement('div');
  meta.className = 'meta';
  const ts = new Date(item.timestamp).toLocaleString();
  meta.innerText = `${ts}\n温度: ${item.temperature ?? '-'}\n要約: ${(item.description || '').slice(0, 60)}`;
  div.appendChild(img);
  div.appendChild(meta);
  return div;
}

let lastItems = [];

function openModal(item) {
  const modal = document.getElementById('modal');
  document.getElementById('modalTimestamp').textContent = new Date(item.timestamp).toLocaleString();
  document.getElementById('modalTemp').textContent = (item.temperature ?? '-');
  document.getElementById('modalSummary').textContent = item.bedrock_text || '';
  const imgUrl = (window.DASHBOARD_CONFIG.imageBase || '').replace(/\/?$/, '/') + encodeURIComponent(item.device_id) + '/' + encodeURIComponent(item.image_id);
  document.getElementById('modalImage').src = imgUrl;
  modal.classList.remove('hidden');
}

function closeModal() {
  document.getElementById('modal').classList.add('hidden');
}

document.getElementById('modalClose').addEventListener('click', closeModal);
// overlayクリックでも閉じる
document.querySelector('#modal .overlay').addEventListener('click', closeModal);

function drawChart(ctx, items) {
  const sorted = [...items].sort((a,b)=>a.timestamp-b.timestamp);
  const labels = sorted.map(i => new Date(i.timestamp).toLocaleTimeString());
  const temps = sorted.map(i => typeof i.temperature === 'number' ? i.temperature : null);
  if (window.tempChartInstance && typeof window.tempChartInstance.destroy === 'function') {
    window.tempChartInstance.destroy();
  }
  window.tempChartInstance = new Chart(ctx, {
    type: 'line',
    data: {
      labels,
      datasets: [{ label: '温度(°C)', data: temps, borderColor: '#0b5fff', tension: 0.2, spanGaps: true, pointRadius: 4, pointHoverRadius: 6 }]
    },
    options: {
      responsive: true,
      scales: { y: { beginAtZero: false } },
      onClick: (e) => {
        const points = window.tempChartInstance.getElementsAtEventForMode(e, 'nearest', { intersect: true }, true);
        if (points.length) {
          const idx = points[0].index;
          const item = sorted[idx];
          openModal(item);
        }
      }
    }
  });
}

async function load() {
  try {
    setStatus('読み込み中...');
    const deviceId = (document.getElementById('deviceId').value || '').trim();
    const limitVal = Number(document.getElementById('limit').value || 50);
    if (!deviceId) throw new Error('device_id を入力してください');
    const data = await fetchDataByDevice(deviceId, { limit: limitVal });
    const items = (data && data.items) ? data.items : [];
    lastItems = items;
    const grid = document.getElementById('list');
    grid.innerHTML = '';
    items.forEach(i => grid.appendChild(createCard(i)));
    if (items.length) {
      drawChart(document.getElementById('tempChart'), items);
      setStatus(`${items.length} 件のデータ`);
    } else {
      if (window.tempChartInstance && typeof window.tempChartInstance.destroy === 'function') {
        window.tempChartInstance.destroy();
        window.tempChartInstance = null;
      }
      setStatus('データがありません');
    }
  } catch (e) {
    console.error(e);
    setStatus('取得に失敗しました: ' + e.message);
  }
}

document.getElementById('load').addEventListener('click', () => load());
window.addEventListener('load', () => {
  const di = document.getElementById('deviceId');
  if (di && !di.value) di.value = '01';
});
