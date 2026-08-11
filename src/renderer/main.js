'use strict';

const state = {
  auth:null,
  groups:[],
  activeGroupId:null,
  refreshInterval:5000,
  refreshTimer:null,
  refreshing:false,
  highlightedSymbol:null,
  preferences:null,
  marketColors:true,
};

const elements = {
  notice:document.getElementById('notice'), loginView:document.getElementById('login-view'), watchView:document.getElementById('watch-view'),
  loginForm:document.getElementById('login-form'), loginError:document.getElementById('login-error'),
  loginSubmit:document.getElementById('login-submit'), userName:document.getElementById('user-name'), groups:document.getElementById('groups'),
  list:document.getElementById('watchlist'), status:document.getElementById('quote-status'), statusDot:document.getElementById('status-dot'),
  openOverlay:document.getElementById('open-overlay'), logout:document.getElementById('logout'), refresh:document.getElementById('refresh'), targetNote:document.getElementById('target-note'),
  checkUpdate:document.getElementById('check-update'),
  colorToggle:document.getElementById('color-toggle'), colorToggleState:document.getElementById('color-toggle-state'),
  minimizeWindow:document.getElementById('minimize-window'), closeWindow:document.getElementById('close-window'),
};

function showNotice(message, { error = false, action = null } = {}) {
  elements.notice.replaceChildren();
  const text = document.createTextNode(message);
  elements.notice.append(text);
  if (action) {
    const button = document.createElement('button');
    button.className = 'button action'; button.type = 'button'; button.textContent = action.label;
    button.addEventListener('click', action.run);
    elements.notice.append(button);
  }
  elements.notice.hidden = !message;
  elements.notice.classList.toggle('error', error);
}

function parseStored(value, fallback) {
  try { return JSON.parse(value); } catch (_) { return fallback; }
}

function validGroup(group) {
  return group && /^[A-Za-z0-9_-]{1,64}$/.test(group.id) && typeof group.name === 'string' && Array.isArray(group.stocks);
}

function groupsFromConfig(config) {
  const values = config?.values || {};
  const rawGroups = parseStored(values.watchlist_groups_v1, []);
  const groups = Array.isArray(rawGroups) ? rawGroups.filter(validGroup).map(group => ({
    id:group.id,
    name:group.name.trim().slice(0, 20) || '未命名分组',
    stocks:[...new Set(group.stocks.filter(stock => /^[A-Za-z0-9._-]{1,24}$/.test(stock)))],
  })) : [];
  if (groups.length) return groups;
  const stocks = parseStored(values.watchlist_v1, []);
  return [{ id:'default', name:'默认分组', stocks:Array.isArray(stocks) ? [...new Set(stocks.filter(stock => /^[A-Za-z0-9._-]{1,24}$/.test(stock)))] : [] }];
}

function refreshIntervalFromConfig(config) {
  const value = Number(config?.values?.stock_refresh_interval_v1);
  return [1000, 3000, 5000, 10000, 30000, 60000].includes(value) ? value : 5000;
}

function activeGroup() {
  return state.groups.find(group => group.id === state.activeGroupId) || state.groups[0] || null;
}

function setStatus(message, mode = 'idle') {
  elements.status.textContent = message;
  elements.statusDot.className = `status-dot${mode === 'online' ? ' online' : mode === 'offline' ? ' offline' : ''}`;
}

function applyMarketColors(value) {
  state.marketColors = value !== false;
  document.body.classList.toggle('market-colors-off', !state.marketColors);
  elements.colorToggle.setAttribute('aria-pressed', String(state.marketColors));
  elements.colorToggleState.textContent = state.marketColors ? '开' : '关';
}

function renderGroups() {
  elements.groups.replaceChildren();
  for (const group of state.groups) {
    const button = document.createElement('button');
    button.className = `group-button${group.id === state.activeGroupId ? ' active' : ''}`;
    button.type = 'button';
    button.textContent = `${group.name} (${group.stocks.length})`;
    button.addEventListener('click', () => selectGroup(group.id));
    elements.groups.append(button);
  }
}

function signed(value, suffix = '') {
  const number = Number(value);
  if (!Number.isFinite(number)) return '--';
  return `${number > 0 ? '+' : ''}${number.toFixed(2)}${suffix}`;
}

function quoteRows(text) {
  const records = new Map();
  for (const line of String(text || '').split('\n')) {
    const match = line.match(/^v_([A-Za-z0-9._-]+)="([^"]*)"/);
    if (match) records.set(match[1], match[2].split('~'));
  }
  return records;
}

function renderRows(records = new Map()) {
  elements.list.replaceChildren();
  const group = activeGroup();
  if (!group?.stocks.length) {
    const row = document.createElement('tr'); const cell = document.createElement('td');
    cell.colSpan = 6; cell.className = 'empty'; cell.textContent = '当前分组暂无自选股，请在网页端添加后刷新。';
    row.append(cell); elements.list.append(row); return;
  }
  for (const symbol of group.stocks) {
    const fields = records.get(symbol);
    const change = Number(fields?.[31]);
    const tone = change > 0 ? 'up' : change < 0 ? 'down' : 'flat';
    const row = document.createElement('tr');
    if (symbol === state.highlightedSymbol) row.className = 'target';
    const cells = [
      [symbol, 'small'], [fields?.[1] || '--', 'name'], [fields?.[3] || '--', tone],
      [signed(fields?.[31]), tone], [signed(fields?.[32], '%'), tone], [fields?.[30] || '--', 'small'],
    ];
    for (const [value, className] of cells) {
      const cell = document.createElement('td'); cell.className = className; cell.textContent = value; row.append(cell);
    }
    elements.list.append(row);
  }
}

async function refreshQuotes() {
  const group = activeGroup();
  if (!state.auth || !group || state.refreshing) return;
  if (!group.stocks.length) { renderRows(); setStatus('当前分组暂无自选股'); return; }
  state.refreshing = true;
  setStatus('刷新中…');
  try {
    const result = await window.desktop.request({ method:'GET', path:`/api/quote?symbols=${encodeURIComponent(group.stocks.join(','))}` });
    renderRows(quoteRows(result));
    setStatus(`已更新 ${new Date().toLocaleTimeString('zh-CN', { hour:'2-digit', minute:'2-digit', second:'2-digit' })}`, 'online');
  } catch (error) {
    setStatus('离线：保留最近显示数据', 'offline');
    showNotice(error.message, { error:true });
  } finally { state.refreshing = false; }
}

function startRefreshTimer() {
  clearInterval(state.refreshTimer);
  if (state.auth) state.refreshTimer = setInterval(refreshQuotes, state.refreshInterval);
}

async function selectGroup(groupId) {
  if (!state.groups.some(group => group.id === groupId)) return;
  state.activeGroupId = groupId;
  state.highlightedSymbol = null;
  renderGroups(); renderRows();
  try { await window.desktop.updateOverlay({ groupId }); } catch (_) {}
  refreshQuotes();
}

function renderAuthenticated(auth, settings) {
  state.preferences = settings || state.preferences;
  state.auth = auth;
  state.groups = groupsFromConfig(auth.config);
  state.refreshInterval = refreshIntervalFromConfig(auth.config);
  const configuredActive = auth.config?.values?.watchlist_active_group_v1;
  const preferred = state.preferences?.overlay?.groupId || configuredActive;
  state.activeGroupId = state.groups.some(group => group.id === preferred) ? preferred : state.groups[0]?.id || null;
  elements.userName.textContent = auth.user?.displayName || '账户';
  elements.loginView.hidden = true; elements.watchView.hidden = false;
  elements.openOverlay.disabled = false; elements.openOverlay.hidden = false; elements.logout.hidden = false;
  elements.colorToggle.hidden = false; elements.checkUpdate.hidden = false;
  applyMarketColors(state.preferences?.marketColors);
  renderGroups(); renderRows(); startRefreshTimer(); refreshQuotes();
}

function renderLoggedOut(settings, offline = false) {
  state.preferences = settings || state.preferences;
  state.auth = null; state.groups = []; state.activeGroupId = null; clearInterval(state.refreshTimer);
  elements.watchView.hidden = true; elements.loginView.hidden = false;
  elements.openOverlay.disabled = true; elements.openOverlay.hidden = true; elements.logout.hidden = true;
  elements.colorToggle.hidden = true; elements.checkUpdate.hidden = true;
  if (offline) showNotice('暂时无法连接股票服务，请检查网络后重试。', { error:true });
}

async function handleLogin(event) {
  event.preventDefault();
  elements.loginError.textContent = ''; elements.loginSubmit.disabled = true; elements.loginSubmit.textContent = '登录中…';
  const form = new FormData(elements.loginForm);
  try {
    const result = await window.desktop.login({ username:form.get('username'), password:form.get('password') });
    elements.loginForm.querySelector('#password').value = '';
    renderAuthenticated(result.payload, state.preferences);
    showNotice(result.persisted ? '登录成功，桌面会话已受系统安全存储保护。' : '登录成功；当前系统安全存储不可用，关闭应用后需要重新登录。', { error:!result.persisted });
  } catch (error) {
    elements.loginError.textContent = error.message;
  } finally { elements.loginSubmit.disabled = false; elements.loginSubmit.textContent = '登录'; }
}

async function handleDeepLink(target) {
  if (!state.auth || !target) return;
  if (target.type === 'group' && state.groups.some(group => group.id === target.groupId)) {
    await selectGroup(target.groupId);
    elements.targetNote.hidden = true;
  } else if (target.type === 'stock') {
    const owner = state.groups.find(group => group.stocks.includes(target.symbol));
    if (owner) await selectGroup(owner.id);
    state.highlightedSymbol = target.symbol;
    renderRows();
    elements.targetNote.textContent = owner ? `已定位股票：${target.symbol}` : `未在当前自选中找到：${target.symbol}`;
    elements.targetNote.hidden = false;
  }
}

function handleUpdateStatus(update) {
  if (update.status === 'available') {
    showNotice(`发现新版本 ${update.version}。`, { action:{ label:'下载更新', run:() => window.desktop.downloadUpdate() } });
  } else if (update.status === 'downloaded') {
    showNotice(`版本 ${update.version} 已下载。`, { action:{ label:'重启并更新', run:() => window.desktop.installUpdate() } });
  } else if (update.status === 'error') {
    showNotice(update.message, { error:true });
  } else if (update.status === 'current') {
    showNotice('已是最新版本。');
  }
}

elements.loginForm.addEventListener('submit', handleLogin);
elements.openOverlay.addEventListener('click', () => window.desktop.openOverlay().catch(error => showNotice(error.message, { error:true })));
elements.refresh.addEventListener('click', refreshQuotes);
elements.colorToggle.addEventListener('click', async () => {
  const next = !state.marketColors;
  applyMarketColors(next);
  try {
    const result = await window.desktop.setMarketColors(next);
    state.preferences = { ...(state.preferences || {}), marketColors:result.marketColors };
  } catch (error) {
    applyMarketColors(!next);
    showNotice(error.message, { error:true });
  }
});
elements.logout.addEventListener('click', async () => {
  try { await window.desktop.logout(); renderLoggedOut(state.preferences); showNotice('已退出桌面端登录。'); }
  catch (error) { showNotice(error.message, { error:true }); }
});
elements.checkUpdate.addEventListener('click', async () => {
  try { await window.desktop.checkForUpdates(); } catch (error) { showNotice(error.message, { error:true }); }
});
elements.minimizeWindow.addEventListener('click', () => window.desktop.minimizeMain());
elements.closeWindow.addEventListener('click', () => window.desktop.quitApp());
window.desktop.onNavigate(handleDeepLink);
window.desktop.onMarketColors(applyMarketColors);
window.desktop.onUpdateStatus(handleUpdateStatus);
window.desktop.onSessionRefreshed(({ auth, secureStorageAvailable }) => {
  if (auth) renderAuthenticated(auth);
  if (!secureStorageAvailable) showNotice('系统安全存储暂时不可用，关闭应用后需要重新登录。', { error:true });
});

(async () => {
  try {
    const result = await window.desktop.bootstrap();
    if (result.auth) {
      renderAuthenticated(result.auth, result.settings);
      if (result.secureStorageAvailable === false) showNotice('系统安全存储暂时不可用，关闭应用后需要重新登录。', { error:true });
    } else {
      renderLoggedOut(result.settings, result.offline);
    }
  } catch (error) {
    renderLoggedOut({}, true);
  }
})();
