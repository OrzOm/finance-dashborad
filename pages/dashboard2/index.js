const app = getApp();

const STORAGE_KEY = 'volatility_dashboard_settings';

const ETF_LIST = [
  { code: 'sh510050', name: '50ETF', shortName: '50', sinaCate: '50ETF', exchange: 'SSE', hasOption: true },
  { code: 'sh510300', name: '沪深300ETF', shortName: '300', sinaCate: '300ETF', exchange: 'SSE', hasOption: true },
  { code: 'sh510500', name: '中证500ETF', shortName: '500', sinaCate: '500ETF', exchange: 'SSE', hasOption: true },
  { code: 'sh588000', name: '科创50ETF', shortName: '科创50', sinaCate: 'STAR50', exchange: 'SSE', hasOption: false },
  { code: 'sh588080', name: '科创板50ETF', shortName: '科创板50', sinaCate: 'STAR50', exchange: 'SSE', hasOption: false },
  { code: 'sz159919', name: '沪深300ETF', shortName: '300深', sinaCate: '300ETF', exchange: 'SZSE', hasOption: false },
  { code: 'sz159922', name: '中证500ETF', shortName: '500深', sinaCate: '500ETF', exchange: 'SZSE', hasOption: false },
  { code: 'sz159915', name: '创业板ETF', shortName: '创业板', sinaCate: 'GEM', exchange: 'SZSE', hasOption: false },
  { code: 'sz159901', name: '深证100ETF', shortName: '深100', sinaCate: 'SZ100', exchange: 'SZSE', hasOption: false }
];

const HV_PERIODS = [
  { days: 20, label: '20日' },
  { days: 30, label: '30日' },
  { days: 60, label: '60日' },
  { days: 90, label: '90日' },
  { days: 120, label: '120日' },
  { days: 250, label: '250日' }
];

Page({
  data: {
    lastUpdateTime: '--:--:--',
    refreshInterval: 30000,
    isLoading: false,
    isRefreshing: false,
    error: null,
    showSettings: false,

    selectedETF: 'sh510050',
    selectedETFName: '50ETF',
    etfList: ETF_LIST,

    etfQuote: {
      price: 0,
      change: 0,
      changePercent: 0,
      volume: 0,
      amount: 0,
      high: 0,
      low: 0,
      open: 0,
      prevClose: 0
    },

    contractMonths: [],
    selectedMonth: '',
    selectedMonthIndex: 0,
    expireDay: '',
    remainDays: 0,

    optionsChain: [],

    ivStats: {
      avgIV: 0,
      maxIV: 0,
      minIV: 0,
      skew: 0
    },

    hvData: [],
    selectedPeriod: 20,

    activeTab: 'chain',
    tabs: [
      { key: 'chain', name: '期权链' },
      { key: 'skew', name: '偏斜' },
      { key: 'hv', name: 'HV' }
    ],

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
      const selectedETF = (saved && saved.selectedETF) || 'sh510050';
      const etf = ETF_LIST.find(t => t.code === selectedETF);
      
      let activeTab = 'chain';
      if (etf && !etf.hasOption) {
        activeTab = 'hv';
      } else if (saved && saved.activeTab) {
        activeTab = saved.activeTab;
      }

      this.setData({
        refreshInterval: (saved && saved.refreshInterval) || 30000,
        selectedETF: selectedETF,
        selectedPeriod: (saved && saved.selectedPeriod) || 20,
        activeTab: activeTab,
        selectedETFName: etf ? etf.name : '50ETF'
      });
    } catch (e) {
      console.error('加载设置失败:', e);
    }
  },

  saveSettings() {
    try {
      wx.setStorageSync(STORAGE_KEY, {
        refreshInterval: this.data.refreshInterval,
        selectedETF: this.data.selectedETF,
        selectedPeriod: this.data.selectedPeriod,
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

    const etfCode = this.data.selectedETF;
    const etf = ETF_LIST.find(t => t.code === etfCode);

    const promises = [
      this.fetchETFQuote(etfCode),
      this.fetchETFKlineData(etfCode, 250)
    ];

    if (etf.hasOption) {
      promises.push(this.fetchContractMonths(etf.sinaCate));
    }

    Promise.all(promises)
      .then((results) => {
        const quote = results[0];
        const klineData = results[1];
        const months = etf.hasOption ? results[2] : [];

        const now = new Date();
        const timeStr = `${now.getHours().toString().padStart(2, '0')}:${now.getMinutes().toString().padStart(2, '0')}:${now.getSeconds().toString().padStart(2, '0')}`;

        const hvResults = this.calculateHV(klineData);

        let selectedMonth = this.data.selectedMonth;
        if (!selectedMonth && months.length > 0) {
          selectedMonth = months[0];
        }

        this.setData({
          lastUpdateTime: timeStr,
          etfQuote: quote,
          contractMonths: months,
          selectedMonth: selectedMonth,
          hvData: hvResults,
          optionsChain: etf.hasOption ? this.data.optionsChain : [],
          isLoading: false,
          isRefreshing: false,
          error: null
        });

        if (selectedMonth && etf.hasOption) {
          this.fetchOptionsData(etfCode, selectedMonth);
        }

        if (this.data.activeTab === 'hv') {
          setTimeout(() => {
            this.drawHVChart();
          }, 500);
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

  fetchETFQuote(etfCode) {
    return new Promise((resolve, reject) => {
      const url = `https://hq.sinajs.cn/list=${etfCode}`;

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

          try {
            const data = typeof res.data === 'string' ? res.data : String(res.data);
            const match = data.match(/var hq_str_[^=]+="([^"]*)"/);

            if (match && match[1]) {
              const parts = match[1].split(',');
              if (parts.length >= 32) {
                const price = parseFloat(parts[3]) || 0;
                const prevClose = parseFloat(parts[2]) || 0;
                const volume = parseFloat(parts[8]) || 0;
                const amount = parseFloat(parts[9]) || 0;
                let change = 0;
                let changePercent = 0;
                
                if (prevClose > 0) {
                  change = price - prevClose;
                  changePercent = (change / prevClose * 100);
                }

                const quote = {
                  name: parts[0],
                  open: parseFloat(parts[1]) || 0,
                  prevClose: prevClose,
                  price: price,
                  high: parseFloat(parts[4]) || 0,
                  low: parseFloat(parts[5]) || 0,
                  volume: volume,
                  amount: amount,
                  volumeStr: volume >= 10000 ? (volume / 10000).toFixed(0) + '万' : volume.toFixed(0),
                  amountStr: amount >= 100000000 ? (amount / 100000000).toFixed(2) + '亿' : (amount / 10000).toFixed(0) + '万',
                  change: change,
                  changePercent: changePercent,
                  changePercentStr: changePercent.toFixed(2),
                  changeStr: change.toFixed(3)
                };
                resolve(quote);
                return;
              }
            }
            reject(new Error('数据解析失败'));
          } catch (e) {
            console.error('ETF行情解析失败:', e);
            reject(e);
          }
        },
        fail: (err) => {
          console.error('ETF行情请求失败:', err);
          reject(err);
        }
      });
    });
  },

  fetchContractMonths(cate) {
    return new Promise((resolve, reject) => {
      const url = `https://stock.finance.sina.com.cn/futures/api/openapi.php/StockOptionService.getStockName?exchange=null&cate=${cate}`;

      wx.request({
        url: url,
        method: 'GET',
        responseType: 'text',
        timeout: 10000,
        success: (res) => {
          if (res.statusCode !== 200 || !res.data) {
            reject(new Error('请求失败'));
            return;
          }

          try {
            const data = typeof res.data === 'string' ? JSON.parse(res.data) : res.data;

            if (data && data.result && data.result.data) {
              const months = data.result.data.contractMonth || [];
              const uniqueMonths = [...new Set(months)].sort();
              resolve(uniqueMonths);
              return;
            }
            reject(new Error('数据解析失败'));
          } catch (e) {
            console.error('合约月份解析失败:', e);
            reject(e);
          }
        },
        fail: (err) => {
          console.error('合约月份请求失败:', err);
          reject(err);
        }
      });
    });
  },

  fetchOptionsData(etfCode, month) {
    const etf = ETF_LIST.find(t => t.code === etfCode);
    const stockId = etfCode.substring(2);
    const monthParts = month.split('-');
    const monthStr = monthParts[0].substring(2) + monthParts[1];

    Promise.all([
      this.fetchOptionCodes(stockId, monthStr, 'UP'),
      this.fetchOptionCodes(stockId, monthStr, 'DOWN')
    ])
      .then(([callCodes, putCodes]) => {
        console.log('期权代码:', { callCodes: callCodes.length, putCodes: putCodes.length });
        return Promise.all([
          this.fetchOptionQuotes(callCodes),
          this.fetchOptionQuotes(putCodes)
        ]).then(([callData, putData]) => {
          console.log('期权行情:', { callData: callData.length, putData: putData.length });
          return this.buildOptionsChain(callData, putData);
        });
      })
      .then(chain => {
        console.log('期权链:', chain.length);
        const ivs = chain.filter(o => o.callIV > 0).map(o => o.callIV);
        const putIVs = chain.filter(o => o.putIV > 0).map(o => o.putIV);
        const allIVs = [...ivs, ...putIVs];

        const ivStats = {
          avgIV: allIVs.length > 0 ? (allIVs.reduce((s, v) => s + v, 0) / allIVs.length).toFixed(2) : 0,
          maxIV: allIVs.length > 0 ? Math.max(...allIVs).toFixed(2) : 0,
          minIV: allIVs.length > 0 ? Math.min(...allIVs).toFixed(2) : 0,
          skew: (ivs.length > 0 && putIVs.length > 0) ?
            (putIVs.reduce((s, v) => s + v, 0) / putIVs.length - ivs.reduce((s, v) => s + v, 0) / ivs.length).toFixed(2) : 0
        };

        this.setData({
          optionsChain: chain,
          ivStats: ivStats
        });

        if (this.data.activeTab === 'skew') {
          this.drawSkewChart();
        }
      })
      .catch(error => {
        console.error('获取期权数据失败:', error);
      });
  },

  fetchOptionCodes(stockId, month, direction) {
    return new Promise((resolve, reject) => {
      const url = `https://hq.sinajs.cn/list=OP_${direction}_${stockId}${month}`;
      console.log('获取期权代码:', url);

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
            console.error('期权代码HTTP错误:', res.statusCode);
            resolve([]);
            return;
          }

          try {
            const data = typeof res.data === 'string' ? res.data : String(res.data);
            const match = data.match(/var hq_str_[^=]+="([^"]*)"/);

            if (match && match[1]) {
              const codes = match[1].split(',').filter(c => c.trim());
              console.log('期权代码数量:', direction, codes.length);
              resolve(codes);
              return;
            }
            console.log('期权代码为空:', direction);
            resolve([]);
          } catch (e) {
            console.error('期权代码解析失败:', e);
            resolve([]);
          }
        },
        fail: (err) => {
          console.error('期权代码请求失败:', err);
          resolve([]);
        }
      });
    });
  },

  fetchOptionQuotes(codes) {
    if (!codes || codes.length === 0) {
      return Promise.resolve([]);
    }

    return new Promise((resolve, reject) => {
      const codesParam = codes.join(',');
      const url = `https://hq.sinajs.cn/list=${codesParam}`;

      wx.request({
        url: url,
        method: 'GET',
        header: {
          'Referer': 'https://finance.sina.com.cn/'
        },
        responseType: 'text',
        timeout: 15000,
        success: (res) => {
          if (res.statusCode !== 200 || !res.data) {
            console.error('期权行情HTTP错误:', res.statusCode);
            resolve([]);
            return;
          }

          try {
            const data = typeof res.data === 'string' ? res.data : String(res.data);
            const results = [];

            const varMatches = data.match(/var hq_str_[^=]+=("[^"]*"|""|"");/g);
            if (varMatches) {
              varMatches.forEach(varStr => {
                const codeMatch = varStr.match(/var hq_str_([^=]+)="([^"]*)"/);
                if (codeMatch && codeMatch[2] && codeMatch[2].length > 10) {
                  const code = codeMatch[1];
                  const parts = codeMatch[2].split(',');

                  if (parts.length >= 30) {
                    results.push({
                      code: code,
                      buyPrice: parseFloat(parts[1]) || 0,
                      price: parseFloat(parts[2]) || 0,
                      sellPrice: parseFloat(parts[3]) || 0,
                      volume: parseInt(parts[5]) || 0,
                      change: parseFloat(parts[6]) || 0,
                      strike: parseFloat(parts[7]) || 0,
                      prevClose: parseFloat(parts[8]) || 0,
                      open: parseFloat(parts[9]) || 0,
                      iv: parts.length > 42 ? (parseFloat(parts[42]) || 0) : 0,
                      delta: parts.length > 43 ? (parseFloat(parts[43]) || 0) : 0,
                      gamma: parts.length > 44 ? (parseFloat(parts[44]) || 0) : 0,
                      theta: parts.length > 45 ? (parseFloat(parts[45]) || 0) : 0,
                      vega: parts.length > 46 ? (parseFloat(parts[46]) || 0) : 0
                    });
                  }
                }
              });
            }

            console.log('期权行情解析结果数量:', results.length);
            resolve(results);
          } catch (e) {
            console.error('期权行情解析失败:', e);
            resolve([]);
          }
        },
        fail: (err) => {
          console.error('期权行情请求失败:', err);
          resolve([]);
        }
      });
    });
  },

  buildOptionsChain(callData, putData) {
    console.log('buildOptionsChain:', { callCount: callData.length, putCount: putData.length });
    const chain = [];
    const strikes = new Set();

    callData.forEach(opt => strikes.add(opt.strike));
    putData.forEach(opt => strikes.add(opt.strike));

    const sortedStrikes = Array.from(strikes).sort((a, b) => a - b);

    sortedStrikes.forEach(strike => {
      const call = callData.find(o => o.strike === strike) || {};
      const put = putData.find(o => o.strike === strike) || {};

      chain.push({
        strike: strike,
        callCode: call.code || '',
        callPrice: call.price || 0,
        callIV: call.iv || 0,
        callDelta: call.delta || 0,
        callChange: call.change || 0,
        callVolume: call.volume || 0,
        putCode: put.code || '',
        putPrice: put.price || 0,
        putIV: put.iv || 0,
        putDelta: put.delta || 0,
        putChange: put.change || 0,
        putVolume: put.volume || 0
      });
    });

    return chain;
  },

  fetchETFKlineData(etfCode, days) {
    return new Promise((resolve, reject) => {
      const url = `https://web.ifzq.gtimg.cn/appstock/app/fqkline/get?param=${etfCode},day,,,${days},qfq`;

      wx.request({
        url: url,
        method: 'GET',
        responseType: 'text',
        timeout: 15000,
        success: (res) => {
          if (res.statusCode !== 200 || !res.data) {
            reject(new Error('K线请求失败'));
            return;
          }

          try {
            const data = typeof res.data === 'string' ? JSON.parse(res.data) : res.data;

            if (data && data.data) {
              const stockData = data.data[etfCode] || Object.values(data.data)[0];
              if (!stockData) {
                reject(new Error('K线数据解析失败'));
                return;
              }
              const klineData = stockData.day || stockData.qfqday;

              if (klineData && klineData.length > 0) {
                const closes = klineData.map(item => parseFloat(item[2]));
                resolve(closes);
                return;
              }
            }
            reject(new Error('K线数据解析失败'));
          } catch (e) {
            console.error('K线数据解析失败:', e);
            reject(e);
          }
        },
        fail: (err) => {
          console.error('K线请求失败:', err);
          reject(err);
        }
      });
    });
  },

  calculateHV(closes) {
    if (!closes || closes.length < 2) {
      return [];
    }

    const returns = [];
    for (let i = 1; i < closes.length; i++) {
      if (closes[i - 1] > 0) {
        returns.push(Math.log(closes[i] / closes[i - 1]));
      }
    }

    const results = [];

    HV_PERIODS.forEach(period => {
      if (returns.length >= period.days) {
        const periodReturns = returns.slice(-period.days);
        const mean = periodReturns.reduce((sum, r) => sum + r, 0) / periodReturns.length;
        const squaredDiffs = periodReturns.map(r => Math.pow(r - mean, 2));
        const variance = squaredDiffs.reduce((sum, d) => sum + d, 0) / (periodReturns.length - 1);
        const hv = Math.sqrt(variance) * Math.sqrt(250) * 100;

        results.push({
          days: period.days,
          label: period.label,
          value: hv.toFixed(2)
        });
      }
    });

    return results;
  },

  onETFChange(e) {
    const index = e.detail.value;
    const etf = ETF_LIST[index];
    const activeTab = etf.hasOption ? this.data.activeTab : 'hv';
    this.setData({
      selectedETF: etf.code,
      selectedETFName: etf.name,
      selectedMonth: '',
      optionsChain: [],
      activeTab: activeTab
    });
    this.saveSettings();
    this.fetchAllData();
  },

  selectETF(e) {
    const { code, name } = e.currentTarget.dataset;
    const etf = ETF_LIST.find(t => t.code === code);
    const activeTab = etf.hasOption ? this.data.activeTab : 'hv';
    this.setData({
      selectedETF: code,
      selectedETFName: name,
      selectedMonth: '',
      optionsChain: [],
      activeTab: activeTab
    });
    this.saveSettings();
    this.fetchAllData();
  },

  onMonthChange(e) {
    const index = e.detail.value;
    const month = this.data.contractMonths[index];
    this.setData({
      selectedMonth: month,
      selectedMonthIndex: index
    });

    const etfCode = this.data.selectedETF;
    this.fetchOptionsData(etfCode, month);
  },

  switchTab(e) {
    const tab = e.currentTarget.dataset.tab;
    const etf = ETF_LIST.find(t => t.code === this.data.selectedETF);
    
    if (!etf.hasOption && tab !== 'hv') {
      return;
    }
    
    this.setData({ activeTab: tab });
    this.saveSettings();

    setTimeout(() => {
      if (tab === 'skew' && this.data.optionsChain.length > 0) {
        this.drawSkewChart();
      }
      if (tab === 'hv') {
        this.drawHVChart();
      }
    }, 300);
  },

  setRefreshInterval(e) {
    const interval = parseInt(e.currentTarget.dataset.interval) || 30000;
    this.setData({ refreshInterval: interval });
    this.startAutoRefresh();
    this.saveSettings();
  },

  selectPeriod(e) {
    const period = parseInt(e.currentTarget.dataset.period);
    this.setData({ selectedPeriod: period });
    this.saveSettings();
    setTimeout(() => {
      this.drawHVChart();
    }, 100);
  },

  toggleSettings() {
    this.setData({ showSettings: !this.data.showSettings });
  },

  drawSkewChart() {
    const query = wx.createSelectorQuery();
    query.select('#skewChart')
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

        this.drawSkewChartContent(ctx, width, height);
      });
  },

  drawSkewChartContent(ctx, width, height) {
    const { optionsChain } = this.data;
    if (!optionsChain || optionsChain.length === 0) return;

    const data = optionsChain.filter(d => d.callIV > 0 || d.putIV > 0);
    if (data.length === 0) return;

    const padding = { top: 30, right: 20, bottom: 50, left: 60 };
    const chartWidth = width - padding.left - padding.right;
    const chartHeight = height - padding.top - padding.bottom;

    const allIVs = data.flatMap(d => [d.callIV, d.putIV]).filter(v => v > 0);
    const minIV = Math.min(...allIVs) - 2;
    const maxIV = Math.max(...allIVs) + 2;
    const ivRange = maxIV - minIV;

    const getX = (i) => padding.left + (i / (data.length - 1)) * chartWidth;
    const getY = (iv) => padding.top + (1 - (iv - minIV) / ivRange) * chartHeight;

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
      const value = maxIV - (i / 5) * ivRange;
      ctx.fillText(value.toFixed(1) + '%', padding.left - 5, y + 4);
    }

    ctx.textAlign = 'center';
    data.forEach((d, i) => {
      if (i % Math.ceil(data.length / 10) === 0) {
        ctx.fillText(d.strike.toFixed(2), getX(i), height - padding.bottom + 15);
      }
    });

    if (data.some(d => d.callIV > 0)) {
      ctx.strokeStyle = '#3b82f6';
      ctx.lineWidth = 2;
      ctx.beginPath();
      let started = false;
      data.forEach((d, i) => {
        if (d.callIV > 0) {
          const x = getX(i);
          const y = getY(d.callIV);
          if (!started) {
            ctx.moveTo(x, y);
            started = true;
          } else {
            ctx.lineTo(x, y);
          }
        }
      });
      ctx.stroke();
    }

    if (data.some(d => d.putIV > 0)) {
      ctx.strokeStyle = '#ef4444';
      ctx.lineWidth = 2;
      ctx.beginPath();
      let started = false;
      data.forEach((d, i) => {
        if (d.putIV > 0) {
          const x = getX(i);
          const y = getY(d.putIV);
          if (!started) {
            ctx.moveTo(x, y);
            started = true;
          } else {
            ctx.lineTo(x, y);
          }
        }
      });
      ctx.stroke();
    }

    const legendX = width - padding.right - 120;
    const legendY = padding.top + 10;

    ctx.fillStyle = '#3b82f6';
    ctx.fillRect(legendX, legendY, 12, 12);
    ctx.fillStyle = '#333';
    ctx.font = '11px sans-serif';
    ctx.textAlign = 'left';
    ctx.fillText('Call IV', legendX + 16, legendY + 10);

    ctx.fillStyle = '#ef4444';
    ctx.fillRect(legendX, legendY + 18, 12, 12);
    ctx.fillStyle = '#333';
    ctx.fillText('Put IV', legendX + 16, legendY + 28);
  },

  drawHVChart(retryCount) {
    const count = retryCount || 0;
    if (count > 5) {
      console.log('drawHVChart: canvas not found after retries');
      return;
    }

    const query = wx.createSelectorQuery();
    query.select('#hvChart')
      .fields({ node: true, size: true })
      .exec((res) => {
        if (!res || !res[0] || !res[0].node) {
          console.log('drawHVChart: canvas not found, retry', count);
          setTimeout(() => this.drawHVChart(count + 1), 200);
          return;
        }

        const canvas = res[0].node;
        const ctx = canvas.getContext('2d');
        const dpr = wx.getSystemInfoSync().pixelRatio;
        const width = res[0].width;
        const height = res[0].height;

        canvas.width = width * dpr;
        canvas.height = height * dpr;
        ctx.scale(dpr, dpr);

        this.drawHVChartContent(ctx, width, height);
      });
  },

  drawHVChartContent(ctx, width, height) {
    const { hvData, selectedPeriod } = this.data;
    if (!hvData || hvData.length === 0) return;

    const padding = { top: 30, right: 20, bottom: 50, left: 60 };
    const chartWidth = width - padding.left - padding.right;
    const chartHeight = height - padding.top - padding.bottom;

    const values = hvData.map(d => parseFloat(d.value));
    const minVal = Math.min(...values) - 2;
    const maxVal = Math.max(...values) + 2;
    const range = maxVal - minVal;

    const getX = (i) => padding.left + (i / (hvData.length - 1)) * chartWidth;
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
      ctx.fillText(value.toFixed(1) + '%', padding.left - 5, y + 4);
    }

    ctx.textAlign = 'center';
    hvData.forEach((d, i) => {
      ctx.fillText(d.label, getX(i), height - padding.bottom + 15);
    });

    ctx.strokeStyle = '#3b82f6';
    ctx.lineWidth = 2.5;
    ctx.beginPath();
    hvData.forEach((d, i) => {
      const x = getX(i);
      const y = getY(parseFloat(d.value));
      if (i === 0) ctx.moveTo(x, y);
      else ctx.lineTo(x, y);
    });
    ctx.stroke();

    const gradient = ctx.createLinearGradient(0, padding.top, 0, height - padding.bottom);
    gradient.addColorStop(0, 'rgba(59, 130, 246, 0.2)');
    gradient.addColorStop(1, 'rgba(59, 130, 246, 0.02)');
    ctx.fillStyle = gradient;
    ctx.beginPath();
    ctx.moveTo(getX(0), getY(parseFloat(hvData[0].value)));
    hvData.forEach((d, i) => {
      ctx.lineTo(getX(i), getY(parseFloat(d.value)));
    });
    ctx.lineTo(getX(hvData.length - 1), height - padding.bottom);
    ctx.lineTo(getX(0), height - padding.bottom);
    ctx.closePath();
    ctx.fill();

    hvData.forEach((d, i) => {
      const x = getX(i);
      const y = getY(parseFloat(d.value));
      const isSelected = d.days === selectedPeriod;

      ctx.fillStyle = isSelected ? '#ef4444' : '#3b82f6';
      ctx.beginPath();
      ctx.arc(x, y, isSelected ? 6 : 4, 0, Math.PI * 2);
      ctx.fill();

      if (isSelected) {
        ctx.strokeStyle = '#ef4444';
        ctx.lineWidth = 1;
        ctx.beginPath();
        ctx.arc(x, y, 8, 0, Math.PI * 2);
        ctx.stroke();
      }

      ctx.fillStyle = isSelected ? '#ef4444' : '#333';
      ctx.font = isSelected ? 'bold 12px sans-serif' : '11px sans-serif';
      ctx.textAlign = 'center';
      ctx.fillText(d.value + '%', x, y - 12);
    });
  }
});