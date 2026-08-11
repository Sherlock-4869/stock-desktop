'use strict';

const state = { auth:null, groups:[], groupId:null, refreshing:false, timer:null, preferences:null };
const elements = {
  settings:document.getElementById('settings'), settingsToggle:document.getElementById('settings-toggle'), groupSelect:document.getElementById('group-select'),
  opacity:document.getElementById('opacity'), opacityValue:document.getElementById('opacity-value'), alwaysOnTop:document.getElementById('always-on-top'),
  width:document.getElementById('width'), height:document.getElementById('height'), applySize:document.getElementById('apply-size'),
  groupName:document.getElementById('group-name'), status:document.getElementById('status'), quotes:document.getElementById('quotes'), refresh:document.getElementById('refresh'), close:document.getElementById('close'),
};

function parseStored(value, fallback) { try { return JSON.parse(value); } catch (_) { return fallback; } }
function validGroup(group) { return group && /^[A-Za-z0-9_-]{1,64}$/.test(group.id) && typeof group.name === 'string' && Array.isArray(group.stocks); }
function groupsFromConfig(config) {
  const values = config?.values || {};
  const parsed = parseStored(values.watchlist_groups_v1, []);
  const groups = Array.isArray(parsed) ? parsed.filter(validGroup).map(group => ({ id:group.id, name:group.name.slice(0, 20) || '未命名分组', stocks:[...new Set(group.stocks.filter(stock => /^[A-Za-z0-9._-]{1,24}$/.test(stock)))] })) : [];
  if (groups.length) return groups;
  const stocks = parseStored(values.watchlist_v1, []);
  return [{ id:'default', name:'默认分组', stocks:Array.isArray(stocks) ? stocks.filter(stock => /^[A-Za-z0-9._-]{1,24}$/.test(stock)) : [] }];
}
function currentGroup() { return state.groups.find(group => group.id === state.groupId) || state.groups[0] || null; }
function refreshInterval(config) { const value = Number(config?.values?.stock_refresh_interval_v1); return [1000,3000,5000,10000,30000,60000].includes(value) ? value : 5000; }
function setStatus(value) { elements.status.textContent = value; }
function setSizeFields() { elements.width.value = window.innerWidth; elements.height.value = window.innerHeight; }

function renderGroups() {
  elements.groupSelect.replaceChildren();
  for (const group of state.groups) {
    const option = document.createElement('option'); option.value = group.id; option.textContent = `${group.name} (${group.stocks.length})`; elements.groupSelect.append(option);
  }
  elements.groupSelect.value = state.groupId || '';
  elements.groupName.textContent = currentGroup()?.name || '当前分组';
}
function parseQuotes(text) {
  const quotes = new Map();
  for (const line of String(text || '').split('\n')) { const match = line.match(/^v_([A-Za-z0-9._-]+)="([^"]*)"/); if (match) quotes.set(match[1], match[2].split('~')); }
  return quotes;
}
function number(value, suffix = '') { const parsed = Number(value); return Number.isFinite(parsed) ? `${parsed > 0 ? '+' : ''}${parsed.toFixed(2)}${suffix}` : '--'; }
function tone(value) { const parsed = Number(value); return parsed > 0 ? 'up' : parsed < 0 ? 'down' : 'flat'; }
function renderQuotes(records = new Map()) {
  elements.quotes.replaceChildren();
  const group = currentGroup();
  if (!group?.stocks.length) { const empty = document.createElement('div'); empty.className = 'empty'; empty.textContent = '当前分组暂无自选股'; elements.quotes.append(empty); return; }
  for (const symbol of group.stocks) {
    const fields = records.get(symbol); const row = document.createElement('div'); row.className = 'quote-row';
    const stock = document.createElement('span'); stock.className = 'stock'; stock.textContent = fields?.[1] || symbol; const code = document.createElement('small'); code.textContent = symbol; stock.append(code);
    const price = document.createElement('span'); price.className = tone(fields?.[31]); price.textContent = fields?.[3] || '--';
    const change = document.createElement('span'); change.className = tone(fields?.[31]); change.textContent = number(fields?.[31]);
    const pct = document.createElement('span'); pct.className = tone(fields?.[32]); pct.textContent = number(fields?.[32], '%');
    row.append(stock, price, change, pct); elements.quotes.append(row);
  }
}
async function refreshQuotes() {
  const group = currentGroup(); if (!state.auth || !group || state.refreshing) return;
  if (!group.stocks.length) { renderQuotes(); setStatus('暂无自选股'); return; }
  state.refreshing = true; setStatus('刷新中…');
  try { const text = await window.desktop.request({ method:'GET', path:`/api/quote?symbols=${encodeURIComponent(group.stocks.join(','))}` }); renderQuotes(parseQuotes(text)); setStatus(`更新于 ${new Date().toLocaleTimeString('zh-CN', { hour:'2-digit', minute:'2-digit', second:'2-digit' })}`); }
  catch (_) { setStatus('离线：显示最近数据'); }
  finally { state.refreshing = false; }
}
function startTimer() { clearInterval(state.timer); state.timer = setInterval(refreshQuotes, refreshInterval(state.auth?.config)); }
async function setGroup(groupId) {
  if (!state.groups.some(group => group.id === groupId)) return;
  state.groupId = groupId; renderGroups(); renderQuotes();
  try { state.preferences = await window.desktop.updateOverlay({ groupId }); } catch (_) {}
  refreshQuotes();
}
async function applySize() {
  const width = Number(elements.width.value), height = Number(elements.height.value);
  if (!Number.isInteger(width) || !Number.isInteger(height) || width < 360 || width > 1600 || height < 230 || height > 1200) { setStatus('尺寸范围为 360-1600 × 230-1200'); return; }
  try { state.preferences = await window.desktop.updateOverlay({ bounds:{ x:window.screenX, y:window.screenY, width, height } }); }
  catch (error) { setStatus(error.message); }
}
function applyPreferences(preferences) {
  state.preferences = preferences;
  elements.opacity.value = String(Math.round(preferences.opacity * 100)); elements.opacityValue.textContent = `${elements.opacity.value}%`;
  elements.alwaysOnTop.checked = preferences.alwaysOnTop !== false; setSizeFields();
}

elements.settingsToggle.addEventListener('click', () => { elements.settings.hidden = !elements.settings.hidden; setSizeFields(); });
elements.refresh.addEventListener('click', refreshQuotes); elements.close.addEventListener('click', () => window.desktop.closeOverlay());
elements.groupSelect.addEventListener('change', event => setGroup(event.target.value));
elements.opacity.addEventListener('input', event => { elements.opacityValue.textContent = `${event.target.value}%`; });
elements.opacity.addEventListener('change', event => window.desktop.updateOverlay({ opacity:Number(event.target.value) / 100 }).then(value => { state.preferences = value; }));
elements.alwaysOnTop.addEventListener('change', event => window.desktop.updateOverlay({ alwaysOnTop:event.target.checked }).then(value => { state.preferences = value; }));
elements.applySize.addEventListener('click', applySize); window.addEventListener('resize', setSizeFields);
window.desktop.onOverlayGroup(groupId => { if (groupId !== state.groupId) setGroup(groupId); });

(async () => {
  const result = await window.desktop.bootstrap();
  if (!result.auth) { setStatus(result.offline ? '暂时离线' : '请先在主窗口登录'); return; }
  state.auth = result.auth; state.groups = groupsFromConfig(result.auth.config);
  const desired = result.settings?.overlay?.groupId || result.auth.config?.values?.watchlist_active_group_v1;
  state.groupId = state.groups.some(group => group.id === desired) ? desired : state.groups[0]?.id || null;
  applyPreferences(result.settings.overlay); renderGroups(); renderQuotes(); startTimer(); refreshQuotes();
})().catch(() => setStatus('初始化失败'));
