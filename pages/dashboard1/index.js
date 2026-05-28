const app = getApp();

const SINA_INDEX_CODES = {
  'IF': 'sh000300',
  'IH': 'sh000016',
  'IC': 'sh000905',
  'IM': 'sh000852'
};

function getCurrentFuturesCodes() {
  const now = new Date();
  const year = now.getFullYear();
  const month = now.getMonth() + 1;

  const formatCode = (y, m) => `${(y % 100).toString().padStart(2, '0')}${m.toString().padStart(2, '0')}`;

  const quarterMonths = [3, 6, 9, 12];

  const getNextQuarterMonth = (currentMonth) => {
    for (const qm of quarterMonths) {
      if (qm > currentMonth) return qm;
    }
    return quarterMonths[0];
  };

  const contracts = [];

  const firstMonth = month === 12 ? 1 : month + 1;
  const firstYear = month === 12 ? year + 1 : year;
  contracts.push(formatCode(firstYear, firstMonth));

  const secondMonth = month === 11 ? 1 : (month === 12 ? 2 : month + 2);
  const secondYear = month >= 11 ? year + 1 : year;
  contracts.push(formatCode(secondYear, secondMonth));

  const thirdQuarterMonth = getNextQuarterMonth(secondMonth);
  const thirdQuarterYear = thirdQuarterMonth <= secondMonth ? secondYear + 1 : secondYear;
  contracts.push(formatCode(thirdQuarterYear, thirdQuarterMonth));

  const fourthQuarterMonth = getNextQuarterMonth(thirdQuarterMonth);
  const fourthQuarterYear = fourthQuarterMonth <= thirdQuarterMonth ? thirdQuarterYear + 1 : thirdQuarterYear;
  contracts.push(formatCode(fourthQuarterYear, fourthQuarterMonth));

  const types = ['IF', 'IH', 'IC', 'IM'];
  const codes = {};

  types.forEach(type => {
    codes[type] = contracts.map(c => `nf_${type}${c}`);
  });

  return codes;
}

const SINA_FUTURES_CODES = getCurrentFuturesCodes();

const STORAGE_KEY = 'futures_dashboard_settings';

const DEFAULT_SETTINGS = {
  refreshInterval: 5000,
  thresholds: {
    'IF': 5.0,
    'IH': 5.0,
    'IC': 5.0,
    'IM': 5.0
  },
  columns: {
    symbol: true,
    price: true,
    change: true,
    premium: true,
    basis: true,
    annualBasis: true,
    deliveryDays: true,
    expireTime: true
  }
};

Page({
  data: {
    lastUpdateTime: '--:--:--',
    refreshInterval: 5000,
    futuresTypes: [
      { name: '上证50', type: 'IH', threshold: 5.0, alarm: false },
      { name: '沪深300', type: 'IF', threshold: 5.0, alarm: false },
      { name: '中证500', type: 'IC', threshold: 5.0, alarm: false },
      { name: '中证1000', type: 'IM', threshold: 5.0, alarm: false }
    ],
    futuresData: [],
    filteredData: [],
    indexPrices: {},
    activeFilter: 'all',
    futuresTypesMap: {},
    isLoading: false,
    isRefreshing: false,
    error: null,
    showSettings: false,
    showColumns: false,
    selectedIndex: null,
    trendData: [],
    chartLoading: false,
    chartError: null,
    columnDefs: [
      { key: 'symbol', label: '品种/合约', visible: true },
      { key: 'price', label: '实时点位', visible: true },
      { key: 'change', label: '涨跌幅', visible: true },
      { key: 'premium', label: '升贴水', visible: true },
      { key: 'basis', label: '基差', visible: true },
      { key: 'annualBasis', label: '年化基差', visible: true },
      { key: 'deliveryDays', label: '剩余天数', visible: true },
      { key: 'expireTime', label: '到期时间', visible: true }
    ]
  },

  refreshTimer: null,

  onLoad() {
    this.loadSettings();
    this.initFuturesTypesMap();
    this.initData();
    this.startAutoRefresh();
  },

  onShow() {
    if (this.refreshTimer) {
      this.startAutoRefresh();
    }
  },

  onHide() {
    this.stopAutoRefresh();
  },

  onUnload() {
    this.stopAutoRefresh();
  },

  loadSettings() {
    try {
      const saved = wx.getStorageSync(STORAGE_KEY);
      if (saved) {
        const settings = Object.assign({}, DEFAULT_SETTINGS, saved);
        const futuresTypes = this.data.futuresTypes.map(item => {
          const threshold = settings.thresholds[item.type] || DEFAULT_SETTINGS.thresholds[item.type];
          return Object.assign({}, item, { threshold: threshold });
        });
        const columnDefs = this.data.columnDefs.map(col => {
          const visible = settings.columns[col.key] !== undefined ? settings.columns[col.key] : DEFAULT_SETTINGS.columns[col.key];
          return Object.assign({}, col, { visible: visible });
        });
        this.setData({
          refreshInterval: settings.refreshInterval,
          futuresTypes,
          columnDefs
        });
      }
    } catch (e) {
      console.error('加载设置失败:', e);
    }
  },

  saveSettings() {
    try {
      const { refreshInterval, futuresTypes, columnDefs } = this.data;
      const thresholds = {};
      futuresTypes.forEach(item => {
        thresholds[item.type] = item.threshold;
      });
      const columns = {};
      columnDefs.forEach(col => {
        columns[col.key] = col.visible;
      });
      wx.setStorageSync(STORAGE_KEY, {
        refreshInterval,
        thresholds,
        columns
      });
    } catch (e) {
      console.error('保存设置失败:', e);
    }
  },

  initFuturesTypesMap() {
    const map = {};
    this.data.futuresTypes.forEach(item => {
      map[item.type] = item;
    });
    this.setData({ futuresTypesMap: map });
  },

  initData() {
    this.fetchSinaData();
  },

  startAutoRefresh() {
    this.stopAutoRefresh();
    const { refreshInterval } = this.data;
    this.refreshTimer = setInterval(() => {
      this.refreshData();
    }, refreshInterval);
  },

  stopAutoRefresh() {
    if (this.refreshTimer) {
      clearInterval(this.refreshTimer);
      this.refreshTimer = null;
    }
  },

  setRefreshInterval(e) {
    const interval = parseInt(e.currentTarget.dataset.interval) || 5000;
    this.setData({ refreshInterval: interval });
    this.startAutoRefresh();
    this.saveSettings();
  },

  setThreshold(e) {
    const type = e.currentTarget.dataset.type;
    const value = parseFloat(e.detail.value) || 0;
    const futuresTypes = this.data.futuresTypes.map(item => {
      if (item.type === type) {
        return Object.assign({}, item, { threshold: value });
      }
      return item;
    });
    this.setData({ futuresTypes });
    this.initFuturesTypesMap();
    this.processAndSetData(this.data.futuresData);
    this.saveSettings();
  },

  toggleSettings() {
    this.setData({ showSettings: !this.data.showSettings, showColumns: false });
  },

  toggleColumns() {
    this.setData({ showColumns: !this.data.showColumns, showSettings: false });
  },

  toggleColumn(e) {
    const key = e.currentTarget.dataset.key;
    const columnDefs = this.data.columnDefs.map(col => {
      if (col.key === key) {
        return Object.assign({}, col, { visible: !col.visible });
      }
      return col;
    });
    this.setData({ columnDefs });
    this.saveSettings();
  },

  isColumnVisible(key) {
    const col = this.data.columnDefs.find(c => c.key === key);
    return col ? col.visible : true;
  },

  fetchSinaData(isManual = false) {
    if (this.data.isLoading) return;

    if (isManual) {
      this.setData({ isRefreshing: true, error: null });
    } else {
      this.setData({ isLoading: true, error: null });
    }

    const futuresPromise = this.fetchFuturesData();
    const indexPromise = this.fetchIndexData();

    Promise.all([futuresPromise, indexPromise])
      .then(([futuresData, indexData]) => {
        const enrichedData = this.enrichData(futuresData, indexData);
        const indexPrices = {};
        for (const [code, data] of Object.entries(indexData)) {
          const type = Object.keys(SINA_INDEX_CODES).find(k => SINA_INDEX_CODES[k] === code);
          if (type) {
            const price = data.price;
            const changePct = data.changePercent || 0;
            const absPct = Math.min(Math.abs(changePct), 10);
            const intensity = absPct / 10;
            let bg, txtColor;
            if (changePct >= 0) {
              const r = 255;
              const g = Math.round(245 - intensity * 160);
              const b = Math.round(245 - intensity * 180);
              bg = `rgb(${r},${g},${b})`;
              txtColor = intensity > 0.3 ? '#fff' : '#991b1b';
            } else {
              const r = Math.round(240 - intensity * 130);
              const g = Math.round(253 - intensity * 80);
              const b = Math.round(244 - intensity * 110);
              bg = `rgb(${r},${g},${b})`;
              txtColor = intensity > 0.3 ? '#fff' : '#14532d';
            }
            var borderColor = changePct >= 0 ? '#dc2626' : '#16a34a';
            indexPrices[type] = {
              name: this.getSymbolName(type),
              price: price.toFixed(2),
              prevClose: data.prevClose || 0,
              changePercent: changePct,
              changePercentStr: (changePct >= 0 ? '+' : '') + changePct.toFixed(2) + '%',
              bgStyle: 'background:' + bg,
              priceStyle: 'color:' + txtColor,
              selectedBorderStyle: 'border-color:' + borderColor + ';box-shadow:0 0 0 2rpx ' + borderColor + '33'
            };
          }
        }
        this.processAndSetData(enrichedData, indexPrices);
      })
      .catch((error) => {
        console.error('获取新浪数据失败:', error);
        this.setData({ error: '数据获取失败' });
      })
      .finally(() => {
        this.setData({ isLoading: false, isRefreshing: false });
      });
  },

  fetchFuturesData() {
    return new Promise((resolve, reject) => {
      const allCodes = Object.values(SINA_FUTURES_CODES).flat();
      const codesParam = allCodes.join(',');
      const url = `https://hq.sinajs.cn/list=${codesParam}`;

      wx.request({
        url: url,
        method: 'GET',
        header: {
          'Referer': 'https://finance.sina.com.cn/'
        },
        responseType: 'text',
        timeout: 10000,
        success: (res) => {
          if (res.statusCode !== 200 || !res.data) {
            reject(new Error('请求失败'));
            return;
          }

          const data = typeof res.data === 'string' ? res.data : String(res.data);
          const results = [];

          const dataMap = {};
          const varMatches = data.match(/var hq_str_(\w+)="([^"]*)"/g);
          if (varMatches) {
            varMatches.forEach(varStr => {
              const codeMatch = varStr.match(/var hq_str_(\w+)="([^"]*)"/);
              if (codeMatch && codeMatch[2]) {
                dataMap[codeMatch[1]] = codeMatch[2];
              }
            });
          }

          for (const [type, codes] of Object.entries(SINA_FUTURES_CODES)) {
            for (const code of codes) {
              const rawData = dataMap[code];
              if (rawData) {
                const parts = rawData.split(',');
                if (parts.length > 1) {
                  const match = code.match(/nf_(\w{2})(\d+)/);
                  if (match) {
                    const [, typeMatch, contract] = match;
                    if (typeMatch === type) {
                      const price = parseFloat(parts[3]) || 0;
                      const openPrice = parseFloat(parts[0]) || 0;
                      const prevClose = parseFloat(parts[13]) || openPrice;
                      const change = price - prevClose;
                      const changePercent = prevClose !== 0 ? ((change / prevClose) * 100).toFixed(2) : '0.00';

                      results.push({
                        type: typeMatch,
                        contract: contract,
                        symbol: this.getSymbolName(typeMatch),
                        price: price,
                        change: change,
                        changePercent: changePercent + '%',
                        rawData: rawData
                      });
                    }
                  }
                }
              }
            }
          }

          resolve(results);
        },
        fail: (err) => {
          console.error('请求失败:', err);
          reject(err);
        }
      });
    });
  },

  fetchIndexData() {
    return new Promise((resolve, reject) => {
      const codes = Object.values(SINA_INDEX_CODES).join(',');
      const url = `https://hq.sinajs.cn/list=${codes}`;

      wx.request({
        url: url,
        method: 'GET',
        header: {
          'Referer': 'https://finance.sina.com.cn/'
        },
        responseType: 'text',
        timeout: 10000,
        success: (res) => {
          if (res.statusCode !== 200 || !res.data) {
            reject(new Error('指数数据请求失败'));
            return;
          }

          const data = typeof res.data === 'string' ? res.data : String(res.data);
          const indexMap = {};

          const varMatches = data.match(/var hq_str_(\w+)="([^"]*)"/g);
          if (varMatches) {
            varMatches.forEach(varStr => {
              const codeMatch = varStr.match(/var hq_str_(\w+)="([^"]*)"/);
              if (codeMatch && codeMatch[2]) {
                const code = codeMatch[1];
                const parts = codeMatch[2].split(',');
                if (parts.length > 5) {
                  const price = parseFloat(parts[3]) || 0;
                  const prevClose = parseFloat(parts[2]) || 0;
                  const changePct = prevClose !== 0 ? (price - prevClose) / prevClose * 100 : 0;
                  indexMap[code] = {
                    name: parts[0],
                    price: price,
                    open: parseFloat(parts[1]) || 0,
                    prevClose: prevClose,
                    high: parseFloat(parts[4]) || 0,
                    low: parseFloat(parts[5]) || 0,
                    changePercent: changePct
                  };
                }
              }
            });
          }

          resolve(indexMap);
        },
        fail: (err) => {
          console.error('指数请求失败:', err);
          reject(err);
        }
      });
    });
  },

  enrichData(futuresData, indexData) {
    const { futuresTypesMap } = this.data;

    return futuresData.map(item => {
      const indexCode = SINA_INDEX_CODES[item.type];
      const indexInfo = indexData[indexCode];
      const indexPrice = indexInfo ? indexInfo.price : 0;

      const premiumValue = item.price - indexPrice;
      const basisDiff = indexPrice - item.price;

      const premiumTag = premiumValue > 0.005 ? '升水' : (premiumValue < -0.005 ? '贴水' : '平水');
      const premiumTagCls = premiumValue > 0.005 ? 'tag-up' : (premiumValue < -0.005 ? 'tag-down' : 'tag-flat');

      const deliveryInfo = this.getDeliveryInfo(item.type, item.contract);
      const deliveryDays = deliveryInfo.days;
      const annualBasis = deliveryDays > 0 && indexPrice > 0
        ? ((basisDiff / indexPrice) * (365 / deliveryDays) * 100).toFixed(2)
        : '0.00';

      return {
        id: `${item.type}_${item.contract}`,
        symbol: item.symbol,
        type: item.type,
        contract: item.contract,
        price: item.price,
        change: item.change,
        changePercent: item.changePercent,
        premium: premiumValue.toFixed(2),
        premiumTag: premiumTag,
        premiumTagCls: premiumTagCls,
        basisDiff: basisDiff.toFixed(2),
        annualBasis: annualBasis + '%',
        deliveryDays: deliveryDays,
        expireTime: deliveryInfo.dateStr,
        alarm: false
      };
    });
  },

  getDeliveryInfo(type, contract) {
    const now = new Date();
    const contractMonth = parseInt(contract.substring(2, 4));
    const contractYear = parseInt('20' + contract.substring(0, 2));

    const weekdays = ['周日', '周一', '周二', '周三', '周四', '周五', '周六'];

    const calcThirdFriday = (y, m) => {
      const firstDay = new Date(y, m - 1, 1);
      const dayOfWeek = firstDay.getDay();
      const daysUntilFriday = (5 - dayOfWeek + 7) % 7;
      const firstFriday = new Date(y, m - 1, 1 + daysUntilFriday);
      return new Date(y, m - 1, firstFriday.getDate() + 14);
    };

    let thirdFriday = calcThirdFriday(contractYear, contractMonth);

    if (thirdFriday.getTime() < now.getTime()) {
      thirdFriday = calcThirdFriday(contractYear + 1, contractMonth);
    }

    const diffTime = thirdFriday.getTime() - now.getTime();
    const diffDays = Math.max(0, Math.round(diffTime / (1000 * 60 * 60 * 24)));

    const m = thirdFriday.getMonth() + 1;
    const d = thirdFriday.getDate();
    const w = weekdays[thirdFriday.getDay()];

    return {
      days: diffDays,
      date: thirdFriday,
      dateStr: diffDays <= 0 ? '已到期' : `${m}月${d}日(${w})`
    };
  },

  processAndSetData(futuresData, indexPrices) {
    const futuresTypesMap = this.data.futuresTypesMap;

    const futuresWithAlarm = futuresData.map(item => {
      const typeConfig = futuresTypesMap[item.type];
      if (!typeConfig) return item;

      const threshold = typeConfig.threshold || 5.0;
      const annualBasisValue = parseFloat(item.annualBasis) || 0;
      const alarm = Math.abs(annualBasisValue) > threshold;

      return Object.assign({}, item, { alarm: alarm });
    });

    const futuresOrder = {};
    this.data.futuresTypes.forEach(function(item, idx) { futuresOrder[item.type] = idx; });

    const sortedData = futuresWithAlarm.sort((a, b) => {
      const orderA = futuresOrder[a.type] !== undefined ? futuresOrder[a.type] : 99;
      const orderB = futuresOrder[b.type] !== undefined ? futuresOrder[b.type] : 99;
      if (orderA !== orderB) return orderA - orderB;
      return a.contract.localeCompare(b.contract);
    });

    const now = new Date();
    const timeStr = `${now.getHours().toString().padStart(2, '0')}:${now.getMinutes().toString().padStart(2, '0')}:${now.getSeconds().toString().padStart(2, '0')}`;

    const setData = {
      futuresData: sortedData,
      lastUpdateTime: timeStr,
      error: null
    };
    if (indexPrices) {
      setData.indexPrices = indexPrices;
    }
    this.setData(setData);
    this.applyFilter();
  },

  getSymbolName(type) {
    const nameMap = { 'IF': '沪深300', 'IH': '上证50', 'IC': '中证500', 'IM': '中证1000' };
    return nameMap[type] || type;
  },

  setFilter(e) {
    const filter = e.currentTarget.dataset.filter;
    this.setData({ activeFilter: filter });
    this.applyFilter();
  },

  applyFilter() {
    const { futuresData, activeFilter } = this.data;
    const filtered = activeFilter === 'all'
      ? futuresData
      : futuresData.filter(item => item.type === activeFilter);
    this.setData({ filteredData: filtered });
  },

  getPremiumTag(premiumValue) {
    const val = parseFloat(premiumValue);
    if (val > 0.005) return { text: '升水', cls: 'tag-up' };
    if (val < -0.005) return { text: '贴水', cls: 'tag-down' };
    return { text: '平水', cls: 'tag-flat' };
  },

  refreshData() {
    this.fetchSinaData();
  },

  manualRefresh() {
    this.fetchSinaData(true);
  },

  onIndexTap(e) {
    const type = e.currentTarget.dataset.type;
    if (this.data.selectedIndex === type) {
      this.setData({ selectedIndex: null, trendData: [], chartError: null });
      return;
    }
    this.setData({ selectedIndex: type, trendData: [], chartLoading: true, chartError: null });
    this.fetchIndexTrend(type);
  },

  fetchIndexTrend(type) {
    const symbol = SINA_INDEX_CODES[type];
    const url = 'https://web.ifzq.gtimg.cn/appstock/app/minute/query?_var=min_data_' + symbol + '&code=' + symbol;

    wx.request({
      url: url,
      method: 'GET',
      responseType: 'text',
      timeout: 10000,
      success: (res) => {
        if (res.statusCode !== 200 || !res.data) {
          this.setData({ chartError: '走势数据获取失败', chartLoading: false });
          return;
        }
        try {
          const raw = typeof res.data === 'string' ? res.data : String(res.data);
          const jsonStr = raw.replace(/^[^{]*/, '').replace(/;?\s*$/, '');
          const resp = JSON.parse(jsonStr);
          const minuteData = resp && resp.data && resp.data[symbol] && resp.data[symbol].data && resp.data[symbol].data.data;
          if (!minuteData || minuteData.length === 0) {
            this.setData({ chartError: '暂无走势数据', chartLoading: false });
            return;
          }
          const parsed = minuteData.map(function(item) {
            const parts = item.split(' ');
            return { time: parts[0], close: parts[1] };
          });
          this.setData({ trendData: parsed, chartLoading: false });
          setTimeout(() => this.drawChart(), 150);
        } catch (e) {
          console.error('走势数据解析失败:', e);
          this.setData({ chartError: '数据解析失败', chartLoading: false });
        }
      },
      fail: (err) => {
        console.error('走势数据请求失败:', err);
        this.setData({ chartError: '网络请求失败', chartLoading: false });
      }
    });
  },

  drawChart() {
    const query = wx.createSelectorQuery();
    query.select('#trendChart')
      .fields({ node: true, size: true })
      .exec((res) => {
        if (!res || !res[0] || !res[0].node) return;
        const canvas = res[0].node;
        const ctx = canvas.getContext('2d');
        const dpr = wx.getSystemInfoSync().pixelRatio;
        const width = res[0].width;
        const height = res[0].height;
        canvas.width = width * dpr;
        canvas.height = height * dpr;
        ctx.scale(dpr, dpr);
        const { trendData, selectedIndex, indexPrices } = this.data;
        const info = indexPrices[selectedIndex];
        const prevClose = info ? info.prevClose : 0;
        this.drawTrendChart(ctx, width, height, trendData, prevClose);
      });
  },

  drawTrendChart(ctx, width, height, data, prevClose) {
    if (!data || data.length === 0) return;

    const pad = { top: 24, right: 64, bottom: 28, left: 10 };
    const cw = width - pad.left - pad.right;
    const ch = height - pad.top - pad.bottom;

    const prices = data.map(function(d) { return parseFloat(d.close); });
    var maxDiff = 0;
    for (var i = 0; i < prices.length; i++) {
      var diff = Math.abs(prices[i] - prevClose);
      if (diff > maxDiff) maxDiff = diff;
    }
    if (maxDiff < 1) maxDiff = prevClose * 0.01;
    var pMin = prevClose - maxDiff * 1.15;
    var pMax = prevClose + maxDiff * 1.15;
    var pRange = pMax - pMin;

    function xP(i) { return pad.left + (i / (data.length - 1)) * cw; }
    function yP(p) { return pad.top + (1 - (p - pMin) / pRange) * ch; }

    ctx.clearRect(0, 0, width, height);

    var lastPrice = prices[prices.length - 1];
    var isUp = lastPrice >= prevClose;
    var lineCol = isUp ? '#ef4444' : '#10b981';
    var fillCol = isUp ? 'rgba(239,68,68,0.08)' : 'rgba(16,185,129,0.08)';

    ctx.strokeStyle = '#f0f0f0';
    ctx.lineWidth = 0.5;
    for (var gi = 0; gi <= 4; gi++) {
      var gy = pad.top + (gi / 4) * ch;
      ctx.beginPath();
      ctx.moveTo(pad.left, gy);
      ctx.lineTo(width - pad.right, gy);
      ctx.stroke();
    }

    var prevY = yP(prevClose);
    ctx.strokeStyle = '#bbb';
    ctx.lineWidth = 1;
    ctx.setLineDash([4, 3]);
    ctx.beginPath();
    ctx.moveTo(pad.left, prevY);
    ctx.lineTo(width - pad.right, prevY);
    ctx.stroke();
    ctx.setLineDash([]);

    ctx.beginPath();
    ctx.moveTo(xP(0), yP(prices[0]));
    for (var ai = 1; ai < prices.length; ai++) {
      ctx.lineTo(xP(ai), yP(prices[ai]));
    }
    ctx.lineTo(xP(prices.length - 1), prevY);
    ctx.lineTo(xP(0), prevY);
    ctx.closePath();
    ctx.fillStyle = fillCol;
    ctx.fill();

    ctx.strokeStyle = lineCol;
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.moveTo(xP(0), yP(prices[0]));
    for (var li = 1; li < prices.length; li++) {
      ctx.lineTo(xP(li), yP(prices[li]));
    }
    ctx.stroke();

    var lx = xP(prices.length - 1);
    var ly = yP(lastPrice);
    ctx.fillStyle = lineCol;
    ctx.beginPath();
    ctx.arc(lx, ly, 3, 0, Math.PI * 2);
    ctx.fill();

    var maxIdx = 0, minIdx = 0;
    for (var mi = 1; mi < prices.length; mi++) {
      if (prices[mi] > prices[maxIdx]) maxIdx = mi;
      if (prices[mi] < prices[minIdx]) minIdx = mi;
    }

    var labelFont = '10px sans-serif';
    var dotR = 2.5;

    if (maxIdx !== minIdx || (maxIdx === minIdx && prices.length > 1)) {
      var hx = xP(maxIdx), hy = yP(prices[maxIdx]);
      ctx.fillStyle = '#ef4444';
      ctx.beginPath();
      ctx.arc(hx, hy, dotR, 0, Math.PI * 2);
      ctx.fill();
      ctx.font = labelFont;
      ctx.textAlign = maxIdx > prices.length * 0.8 ? 'right' : 'center';
      var hLabelX = maxIdx > prices.length * 0.8 ? hx - 6 : hx;
      ctx.fillText(prices[maxIdx].toFixed(2), hLabelX, hy - 6);

      var lowX = xP(minIdx), lowY = yP(prices[minIdx]);
      ctx.fillStyle = '#10b981';
      ctx.beginPath();
      ctx.arc(lowX, lowY, dotR, 0, Math.PI * 2);
      ctx.fill();
      ctx.textAlign = minIdx > prices.length * 0.8 ? 'right' : 'center';
      var lLabelX = minIdx > prices.length * 0.8 ? lowX - 6 : lowX;
      ctx.fillText(prices[minIdx].toFixed(2), lLabelX, lowY + 12);
    }

    ctx.fillStyle = lineCol;
    ctx.font = '11px sans-serif';
    ctx.textAlign = 'left';
    ctx.fillText(lastPrice.toFixed(2), width - pad.right + 4, ly + 4);

    ctx.fillStyle = '#999';
    ctx.fillText(prevClose.toFixed(2), width - pad.right + 4, prevY + 4);

    ctx.fillStyle = '#bbb';
    ctx.font = '10px sans-serif';
    ctx.textAlign = 'center';
    var timeLabels = ['09:30', '10:30', '11:30/13:00', '14:00', '15:00'];
    var timePos = [0, 0.25, 0.5, 0.75, 1];
    for (var ti = 0; ti < timeLabels.length; ti++) {
      ctx.fillText(timeLabels[ti], pad.left + timePos[ti] * cw, height - 6);
    }
  }
});