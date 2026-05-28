const app = getApp();

const STORAGE_KEY = 'cross_market_settings';

const MARKET_INDICES = {
  'sh000001': { name: '上证指数', shortName: '上证', market: 'A股' },
  'sz399001': { name: '深证成指', shortName: '深证', market: 'A股' },
  'sz399006': { name: '创业板指', shortName: '创业板', market: 'A股' },
  'HSI': { name: '恒生指数', shortName: '恒指', market: '港股' },
  'HSTECH': { name: '恒生科技', shortName: '恒生科技', market: '港股' },
  'DJI': { name: '道琼斯', shortName: '道指', market: '美股' },
  'IXIC': { name: '纳斯达克', shortName: '纳指', market: '美股' },
  'SPX': { name: '标普500', shortName: '标普', market: '美股' }
};

const BOND_INDICES = {
  'CGB01Y': { name: '1年国债', shortName: '1Y' },
  'CGB02Y': { name: '2年国债', shortName: '2Y' },
  'CGB05Y': { name: '5年国债', shortName: '5Y' },
  'CGB10Y': { name: '10年国债', shortName: '10Y' },
  'CGB30Y': { name: '30年国债', shortName: '30Y' }
};

Page({
  data: {
    lastUpdateTime: '--:--:--',
    refreshInterval: 15000,
    isLoading: false,
    isRefreshing: false,
    error: null,
    showSettings: false,

    activeTab: 'overview',
    tabs: [
      { key: 'overview', name: '总览' },
      { key: 'ah', name: 'AH溢价' },
      { key: 'north', name: '北向资金' }
    ],

    marketData: [],
    ahPremiumIndex: null,
    ahPremiumChange: 0,
    ahPremiumHistory: [],

    northboundFlow: {
      total: 0,
      shConnect: 0,
      szConnect: 0,
      change: 0,
      history: []
    },

    bondYields: {
      current: [],
      history: []
    },

    exchangeRate: {
      usdcnh: 0,
      change: 0,
      history: []
    },

    correlationData: {
      ashk: 0,
      asus: 0
    },

    chartType: 'ah',
    chartData: [],
    chartLoading: false
  },

  refreshTimer: null,

  onLoad() {
    this.loadSettings();
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
        this.setData({
          refreshInterval: saved.refreshInterval || 15000,
          activeTab: saved.activeTab || 'overview'
        });
      }
    } catch (e) {
      console.error('加载设置失败:', e);
    }
  },

  saveSettings() {
    try {
      wx.setStorageSync(STORAGE_KEY, {
        refreshInterval: this.data.refreshInterval,
        activeTab: this.data.activeTab
      });
    } catch (e) {
      console.error('保存设置失败:', e);
    }
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

  initData() {
    this.fetchAllData();
  },

  refreshData() {
    this.fetchAllData();
  },

  manualRefresh() {
    this.setData({ isRefreshing: true });
    this.fetchAllData();
  },

  fetchAllData() {
    if (this.data.isLoading) return;

    this.setData({ isLoading: true, error: null });

    Promise.all([
      this.fetchMarketData(),
      this.fetchNorthboundData(),
      this.fetchBondData(),
      this.fetchExchangeRate()
    ])
      .then(([marketData, northboundData, bondData, exchangeRate]) => {
        const now = new Date();
        const timeStr = `${now.getHours().toString().padStart(2, '0')}:${now.getMinutes().toString().padStart(2, '0')}:${now.getSeconds().toString().padStart(2, '0')}`;

        const ahPremium = this.calculateAHPremium(marketData);
        const correlation = this.calculateCorrelation(marketData);

        this.setData({
          lastUpdateTime: timeStr,
          marketData: marketData,
          ahPremiumIndex: ahPremium.index,
          ahPremiumChange: ahPremium.change,
          ahPremiumHistory: ahPremium.history,
          northboundFlow: northboundData,
          bondYields: bondData,
          exchangeRate: exchangeRate,
          correlationData: correlation,
          isLoading: false,
          isRefreshing: false,
          error: null
        });

        if (this.data.activeTab === 'ah') {
          this.drawAHChart();
        }
      })
      .catch((error) => {
        console.error('获取数据失败:', error);
        this.setData({
          error: '数据获取失败，请重试',
          isLoading: false,
          isRefreshing: false
        });
      });
  },

  fetchMarketData() {
    return new Promise((resolve, reject) => {
      const codes = Object.keys(MARKET_INDICES).filter(c => c.startsWith('s'));
      const url = `https://hq.sinajs.cn/list=${codes.join(',')}`;

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
            resolve(this.getMockMarketData());
            return;
          }

          try {
            const data = typeof res.data === 'string' ? res.data : String(res.data);
            const results = [];
            const varMatches = data.match(/var hq_str_(\w+)="([^"]*)"/g);

            if (varMatches) {
              varMatches.forEach(varStr => {
                const match = varStr.match(/var hq_str_(\w+)="([^"]*)"/);
                if (match && match[2]) {
                  const code = match[1];
                  const parts = match[2].split(',');
                  if (parts.length >= 4) {
                    const indexInfo = MARKET_INDICES[code];
                    if (indexInfo) {
                      const price = parseFloat(parts[3]) || 0;
                      const prevClose = parseFloat(parts[2]) || 0;
                      const change = price - prevClose;
                      const changePercent = prevClose !== 0 ? (change / prevClose * 100) : 0;

                      results.push({
                        code: code,
                        name: indexInfo.name,
                        shortName: indexInfo.shortName,
                        market: indexInfo.market,
                        price: price.toFixed(2),
                        change: change.toFixed(2),
                        changePercent: changePercent.toFixed(2),
                        prevClose: prevClose.toFixed(2)
                      });
                    }
                  }
                }
              });
            }

            resolve(results.length > 0 ? results : this.getMockMarketData());
          } catch (e) {
            console.error('市场数据解析失败:', e);
            resolve(this.getMockMarketData());
          }
        },
        fail: (err) => {
          console.error('市场数据请求失败:', err);
          resolve(this.getMockMarketData());
        }
      });
    });
  },

  getMockMarketData() {
    const mockData = [
      { code: 'sh000001', name: '上证指数', shortName: '上证', market: 'A股', price: '3150.25', change: '15.30', changePercent: '0.49', prevClose: '3134.95' },
      { code: 'sz399001', name: '深证成指', shortName: '深证', market: 'A股', price: '10500.12', change: '-25.60', changePercent: '-0.24', prevClose: '10525.72' },
      { code: 'sz399006', name: '创业板指', shortName: '创业板', market: 'A股', price: '2100.50', change: '8.20', changePercent: '0.39', prevClose: '2092.30' },
      { code: 'HSI', name: '恒生指数', shortName: '恒指', market: '港股', price: '18500.00', change: '-120.50', changePercent: '-0.65', prevClose: '18620.50' },
      { code: 'HSTECH', name: '恒生科技', shortName: '恒生科技', market: '港股', price: '4200.00', change: '35.20', changePercent: '0.84', prevClose: '4164.80' },
      { code: 'DJI', name: '道琼斯', shortName: '道指', market: '美股', price: '38500.00', change: '150.00', changePercent: '0.39', prevClose: '38350.00' },
      { code: 'IXIC', name: '纳斯达克', shortName: '纳指', market: '美股', price: '16800.00', change: '200.00', changePercent: '1.20', prevClose: '16600.00' },
      { code: 'SPX', name: '标普500', shortName: '标普', market: '美股', price: '5200.00', change: '25.00', changePercent: '0.48', prevClose: '5175.00' }
    ];

    return mockData.map(item => ({
      ...item,
      change: (Math.random() * 100 - 50).toFixed(2),
      changePercent: (Math.random() * 4 - 2).toFixed(2)
    }));
  },

  calculateAHPremium(marketData) {
    const mockPremium = 120 + Math.random() * 20;
    const mockChange = (Math.random() * 4 - 2).toFixed(2);
    const history = [];

    for (let i = 29; i >= 0; i--) {
      const date = new Date();
      date.setDate(date.getDate() - i);
      const dateStr = `${(date.getMonth() + 1).toString().padStart(2, '0')}-${date.getDate().toString().padStart(2, '0')}`;
      history.push({
        date: dateStr,
        value: (mockPremium + (Math.random() - 0.5) * 10).toFixed(2)
      });
    }

    return {
      index: mockPremium.toFixed(2),
      change: mockChange,
      history: history
    };
  },

  calculateCorrelation(marketData) {
    return {
      ashk: (0.7 + Math.random() * 0.2).toFixed(2),
      asus: (0.3 + Math.random() * 0.3).toFixed(2)
    };
  },

  fetchNorthboundData() {
    return new Promise((resolve) => {
      const mockTotal = (Math.random() * 200 - 100).toFixed(2);
      const mockSh = (Math.random() * 100 - 50).toFixed(2);
      const mockSz = (mockTotal - mockSh).toFixed(2);
      const history = [];

      for (let i = 19; i >= 0; i--) {
        const date = new Date();
        date.setDate(date.getDate() - i);
        const dateStr = `${(date.getMonth() + 1).toString().padStart(2, '0')}-${date.getDate().toString().padStart(2, '0')}`;
        history.push({
          date: dateStr,
          value: (Math.random() * 200 - 100).toFixed(2)
        });
      }

      resolve({
        total: parseFloat(mockTotal),
        shConnect: parseFloat(mockSh),
        szConnect: parseFloat(mockSz),
        change: (Math.random() * 4 - 2).toFixed(2),
        history: history
      });
    });
  },

  fetchBondData() {
    return new Promise((resolve) => {
      const baseYield = 2.5;
      const current = Object.entries(BOND_INDICES).map(([code, info]) => ({
        code: code,
        name: info.name,
        shortName: info.shortName,
        yield: (baseYield + Math.random() * 1.5).toFixed(3),
        change: (Math.random() * 0.05 - 0.025).toFixed(4)
      }));

      const history = [];
      for (let i = 29; i >= 0; i--) {
        const date = new Date();
        date.setDate(date.getDate() - i);
        const dateStr = `${(date.getMonth() + 1).toString().padStart(2, '0')}-${date.getDate().toString().padStart(2, '0')}`;
        history.push({
          date: dateStr,
          y10: (baseYield + 1 + (Math.random() - 0.5) * 0.3).toFixed(3)
        });
      }

      resolve({
        current: current,
        history: history
      });
    });
  },

  fetchExchangeRate() {
    return new Promise((resolve) => {
      const mockRate = 7.2 + Math.random() * 0.1;
      const history = [];

      for (let i = 29; i >= 0; i--) {
        const date = new Date();
        date.setDate(date.getDate() - i);
        const dateStr = `${(date.getMonth() + 1).toString().padStart(2, '0')}-${date.getDate().toString().padStart(2, '0')}`;
        history.push({
          date: dateStr,
          value: (mockRate + (Math.random() - 0.5) * 0.1).toFixed(4)
        });
      }

      resolve({
        usdcnh: mockRate.toFixed(4),
        change: (Math.random() * 0.02 - 0.01).toFixed(4),
        history: history
      });
    });
  },

  switchTab(e) {
    const tab = e.currentTarget.dataset.tab;
    this.setData({ activeTab: tab });
    this.saveSettings();

    if (tab === 'ah') {
      setTimeout(() => this.drawAHChart(), 100);
    } else if (tab === 'north') {
      setTimeout(() => this.drawNorthChart(), 100);
    }
  },

  setRefreshInterval(e) {
    const interval = parseInt(e.currentTarget.dataset.interval) || 15000;
    this.setData({ refreshInterval: interval });
    this.startAutoRefresh();
    this.saveSettings();
  },

  toggleSettings() {
    this.setData({ showSettings: !this.data.showSettings });
  },

  getChangeClass(value) {
    const num = parseFloat(value);
    return num >= 0 ? 'up' : 'down';
  },

  getChangePrefix(value) {
    const num = parseFloat(value);
    return num >= 0 ? '+' : '';
  },

  drawAHChart() {
    const query = wx.createSelectorQuery();
    query.select('#ahChart')
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

        this.drawLineChart(ctx, width, height, this.data.ahPremiumHistory, '#3b82f6', 'AH溢价指数');
      });
  },

  drawNorthChart() {
    const query = wx.createSelectorQuery();
    query.select('#northChart')
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

        this.drawBarChart(ctx, width, height, this.data.northboundFlow.history);
      });
  },

  drawLineChart(ctx, width, height, data, color, title) {
    if (!data || data.length === 0) return;

    const padding = { top: 30, right: 20, bottom: 40, left: 60 };
    const chartWidth = width - padding.left - padding.right;
    const chartHeight = height - padding.top - padding.bottom;

    const values = data.map(d => parseFloat(d.value));
    const minVal = Math.min(...values) - 5;
    const maxVal = Math.max(...values) + 5;
    const range = maxVal - minVal;

    const getX = (i) => padding.left + (i / (data.length - 1)) * chartWidth;
    const getY = (v) => padding.top + (1 - (v - minVal) / range) * chartHeight;

    ctx.clearRect(0, 0, width, height);

    ctx.strokeStyle = '#f0f0f0';
    ctx.lineWidth = 0.5;
    for (let i = 0; i <= 5; i++) {
      const y = padding.top + (i / 5) * chartHeight;
      ctx.beginPath();
      ctx.moveTo(padding.left, y);
      ctx.lineTo(width - padding.right, y);
      ctx.stroke();
    }

    ctx.fillStyle = '#666';
    ctx.font = '10px sans-serif';
    ctx.textAlign = 'right';
    for (let i = 0; i <= 5; i++) {
      const y = padding.top + (i / 5) * chartHeight;
      const value = maxVal - (i / 5) * range;
      ctx.fillText(value.toFixed(1), padding.left - 5, y + 4);
    }

    ctx.textAlign = 'center';
    for (let i = 0; i < data.length; i += 5) {
      ctx.fillText(data[i].date, getX(i), height - padding.bottom + 15);
    }

    const gradient = ctx.createLinearGradient(0, padding.top, 0, height - padding.bottom);
    gradient.addColorStop(0, color + '20');
    gradient.addColorStop(1, color + '05');

    ctx.beginPath();
    ctx.moveTo(getX(0), getY(values[0]));
    for (let i = 1; i < values.length; i++) {
      ctx.lineTo(getX(i), getY(values[i]));
    }
    ctx.lineTo(getX(values.length - 1), height - padding.bottom);
    ctx.lineTo(getX(0), height - padding.bottom);
    ctx.closePath();
    ctx.fillStyle = gradient;
    ctx.fill();

    ctx.strokeStyle = color;
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(getX(0), getY(values[0]));
    for (let i = 1; i < values.length; i++) {
      ctx.lineTo(getX(i), getY(values[i]));
    }
    ctx.stroke();

    const lastX = getX(values.length - 1);
    const lastY = getY(values[values.length - 1]);
    ctx.fillStyle = color;
    ctx.beginPath();
    ctx.arc(lastX, lastY, 4, 0, Math.PI * 2);
    ctx.fill();

    ctx.fillStyle = color;
    ctx.font = '12px sans-serif';
    ctx.textAlign = 'left';
    ctx.fillText(values[values.length - 1].toFixed(2), lastX + 8, lastY + 4);
  },

  drawBarChart(ctx, width, height, data) {
    if (!data || data.length === 0) return;

    const padding = { top: 30, right: 20, bottom: 40, left: 60 };
    const chartWidth = width - padding.left - padding.right;
    const chartHeight = height - padding.top - padding.bottom;

    const values = data.map(d => parseFloat(d.value));
    const maxAbsVal = Math.max(...values.map(v => Math.abs(v))) * 1.2;
    const minVal = -maxAbsVal;
    const maxVal = maxAbsVal;
    const range = maxVal - minVal;

    const barWidth = chartWidth / data.length * 0.7;
    const gap = chartWidth / data.length * 0.3;

    const getX = (i) => padding.left + (i / data.length) * chartWidth + gap / 2;
    const getY = (v) => padding.top + (1 - (v - minVal) / range) * chartHeight;
    const zeroY = getY(0);

    ctx.clearRect(0, 0, width, height);

    ctx.strokeStyle = '#f0f0f0';
    ctx.lineWidth = 0.5;
    for (let i = 0; i <= 5; i++) {
      const y = padding.top + (i / 5) * chartHeight;
      ctx.beginPath();
      ctx.moveTo(padding.left, y);
      ctx.lineTo(width - padding.right, y);
      ctx.stroke();
    }

    ctx.strokeStyle = '#ddd';
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(padding.left, zeroY);
    ctx.lineTo(width - padding.right, zeroY);
    ctx.stroke();

    ctx.fillStyle = '#666';
    ctx.font = '10px sans-serif';
    ctx.textAlign = 'right';
    for (let i = 0; i <= 5; i++) {
      const y = padding.top + (i / 5) * chartHeight;
      const value = maxVal - (i / 5) * range;
      ctx.fillText(value.toFixed(0), padding.left - 5, y + 4);
    }

    ctx.textAlign = 'center';
    for (let i = 0; i < data.length; i += 4) {
      ctx.fillText(data[i].date, getX(i) + barWidth / 2, height - padding.bottom + 15);
    }

    data.forEach((d, i) => {
      const value = parseFloat(d.value);
      const x = getX(i);
      const y = getY(value);
      const barHeight = Math.abs(y - zeroY);

      ctx.fillStyle = value >= 0 ? '#ef4444' : '#10b981';
      if (value >= 0) {
        ctx.fillRect(x, y, barWidth, barHeight);
      } else {
        ctx.fillRect(x, zeroY, barWidth, barHeight);
      }
    });
  }
});