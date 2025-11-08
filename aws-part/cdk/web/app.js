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
  if (item.image_url) {
    img.src = item.image_url;
  } else {
    getImageUrl(item.device_id, item.image_id)
      .then((u)=> img.src = u)
      .catch(()=> img.alt = '画像取得失敗');
  }
  const meta = document.createElement('div');
  meta.className = 'meta';
  const ts = new Date(item.timestamp).toLocaleString();
  meta.innerText = `${ts}\n温度: ${item.temperature ?? '-'}\n要約: ${(item.description || '').slice(0, 60)}`;
  div.appendChild(img);
  div.appendChild(meta);
  div.addEventListener('click', () => openModal(item));
  return div;
}

let lastItems = [];

function openModal(item) {
  const modal = document.getElementById('modal');
  document.getElementById('modalTimestamp').textContent = new Date(item.timestamp).toLocaleString();
  document.getElementById('modalTemp').textContent = (item.temperature ?? '-');
  document.getElementById('modalSummary').textContent = item.description || item.bedrock_text || '';
  const modalImg = document.getElementById('modalImage');
  if (item.image_url) {
    modalImg.src = item.image_url;
  } else {
    getImageUrl(item.device_id, item.image_id)
      .then((u)=> modalImg.src = u)
      .catch(()=> modalImg.alt = '画像取得失敗');
  }
  modal.classList.remove('hidden');
}

function closeModal() {
  document.getElementById('modal').classList.add('hidden');
}

document.getElementById('modalClose').addEventListener('click', closeModal);
document.querySelector('#modal .overlay').addEventListener('click', closeModal);

function drawChart(ctx, items) {
  const sorted = [...items].sort((a,b)=>a.timestamp-b.timestamp);
  const labels = sorted.map(i => new Date(i.timestamp).toLocaleTimeString());
  const temps = sorted.map(i => typeof i.temperature === 'number' ? i.temperature : null);
  const hums  = sorted.map(i => typeof i.humidity === 'number' ? i.humidity : null);
  const co2s  = sorted.map(i => typeof i.co2 === 'number' ? i.co2 : null);
  if (window.tempChartInstance && typeof window.tempChartInstance.destroy === 'function') {
    window.tempChartInstance.destroy();
  }
  window.tempChartInstance = new Chart(ctx, {
    type: 'line',
    data: {
      labels,
      datasets: [
        { label: '温度(°C)', data: temps, yAxisID: 'yTemp', borderColor: '#0b5fff', backgroundColor: '#0b5fff', tension: 0.2, spanGaps: true, pointRadius: 3, pointHoverRadius: 5 },
        { label: '湿度(%)',  data: hums,  yAxisID: 'yHum',  borderColor: '#16a34a', backgroundColor: '#16a34a', tension: 0.2, spanGaps: true, pointRadius: 3, pointHoverRadius: 5 },
        { label: 'CO₂(ppm)', data: co2s,  yAxisID: 'yCo2',  borderColor: '#f97316', backgroundColor: '#f97316', tension: 0.2, spanGaps: true, pointRadius: 3, pointHoverRadius: 5 }
      ]
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      scales: {
        yTemp: { type: 'linear', position: 'left', title: { display: true, text: '温度(°C)' }, beginAtZero: false },
        yHum:  { type: 'linear', position: 'right', title: { display: true, text: '湿度(%)' }, grid: { drawOnChartArea: false }, min: 0, max: 100 },
        yCo2:  { type: 'linear', position: 'right', title: { display: true, text: 'CO₂(ppm)' }, grid: { drawOnChartArea: false }, offset: true }
      },
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

function getImageUrl(deviceId, imageId) {
  const base = window.DASHBOARD_CONFIG.apiBase.replace(/\/?$/, '/');
  const url = `${base}image-url/${encodeURIComponent(deviceId)}/${encodeURIComponent(imageId)}`;
  return fetch(url).then(async (r) => {
    if (!r.ok) throw new Error('failed to get image url');
    const j = await r.json();
    return j.url;
  });
}
