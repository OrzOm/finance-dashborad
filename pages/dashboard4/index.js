const app = getApp();

const STORAGE_KEY = 'sector_flow_settings';
const PORTFOLIO_KEY = 'my_fund_portfolio';

const FUND_TYPES = [
  { code: 'all', name: '全部' },
  { code: 'stock', name: '股票型' },
  { code: 'mixed', name: '混合型' },
  { code: 'bond', name: '债券型' },
  { code: 'index', name: '指数型' },
  { code: 'qdii', name: 'QDII' }
];

const SORT_PERIODS = [
  { code: 'today', name: '今日', key: 'todayChange' },
  { code: '3d', name: '3日', key: 'change3d' },
  { code: '1w', name: '1周', key: 'change1w' },
  { code: '1m', name: '1月', key: 'change1m' },
  { code: '1y', name: '1年', key: 'change1y' },
  { code: '3y', name: '3年', key: 'change3y' }
];

Page({
  data: {
    lastUpdateTime: '--:--:--',
    refreshInterval: 30000,
    isLoading: false,
    isRefreshing: false,
    error: null,
    showSettings: false,

    activeTab: 'industry',
    tabs: [
      { key: 'industry', name: '行业资金' },
      { key: 'etf', name: 'ETF资金' },
      { key: 'fund', name: '基金监控' }
    ],

    sortField: 'changePercent',
    sortOrder: 'desc',

    industryData: [],
    filteredIndustryData: [],

    etfData: [],
    filteredETFData: [],
    etfSortField: 'changePercent',
    etfSortOrder: 'desc',

    summary: {
      totalInflow: 0,
      totalOutflow: 0,
      netFlow: 0,
      topInflow: { name: '', value: 0 },
      topOutflow: { name: '', value: 0 }
    },

    chartType: 'bar',
    chartData: [],
    chartLoading: false,

    fundTab: 'ranking',
    fundTabs: [
      { key: 'ranking', name: '基金排行' },
      { key: 'portfolio', name: '我的持仓' }
    ],
    rankingList: [],
    filteredRanking: [],
    sortPeriod: 'today',
    fundTypeFilter: 'all',
    portfolio: {
      funds: [],
      totalAssets: 0,
      totalProfit: 0,
      totalProfitRate: 0
    },
    showOCR: false,
    ocrProgress: 0,
    ocrResult: null,
    ocrImage: '',
    showAddFund: false,
    newFund: {
      code: '',
      name: '',
      shares: '',
      costNav: ''
    }
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
          refreshInterval: saved.refreshInterval || 30000,
          activeTab: saved.activeTab || 'industry',
          sortField: saved.sortField || 'netFlow',
          sortOrder: saved.sortOrder || 'desc'
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
        activeTab: this.data.activeTab,
        sortField: this.data.sortField,
        sortOrder: this.data.sortOrder
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
      this.fetchIndustryData(),
      this.fetchETFData()
    ])
      .then(([industryData, etfData]) => {
        const now = new Date();
        const timeStr = `${now.getHours().toString().padStart(2, '0')}:${now.getMinutes().toString().padStart(2, '0')}:${now.getSeconds().toString().padStart(2, '0')}`;

        const summary = this.calculateSummary(industryData);

        this.setData({
          lastUpdateTime: timeStr,
          industryData: industryData,
          etfData: etfData,
          summary: summary,
          isLoading: false,
          isRefreshing: false,
          error: null
        });

        this.applySort();
        this.applyETFSort();
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

  fetchIndustryData() {
    return new Promise((resolve, reject) => {
      const url = 'https://push2.eastmoney.com/api/qt/clist/get?cb=&fid=f3&po=1&pz=50&pn=1&np=1&fltt=2&invt=2&fs=m:90+t:2&fields=f2,f3,f8,f12,f14,f62,f104,f105,f106,f184,f66,f69,f72,f75,f78,f81,f84,f87,f124';

      wx.request({
        url: url,
        method: 'GET',
        timeout: 15000,
        success: (res) => {
          if (res.statusCode !== 200 || !res.data) {
            reject(new Error('请求失败'));
            return;
          }

          try {
            const data = res.data;
            const records = data?.data?.diff || [];

            const ICON_MAP = {
              '农林牧渔': '🌾', '采掘': '⛏️', '化工': '🧪', '钢铁': '🔩',
              '有色金属': '🪙', '电子': '💻', '家用电器': '🏠', '食品饮料': '🍜',
              '纺织服装': '👔', '轻工制造': '📦', '医药生物': '💊', '公用事业': '⚡',
              '交通运输': '🚛', '房地产': '🏗️', '商业贸易': '🛒', '休闲服务': '✈️',
              '综合': '📊', '建筑材料': '🧱', '建筑装饰': '🏛️', '电气设备': '💡',
              '国防军工': '🚀', '计算机': '🖥️', '传媒': '📱', '通信': '📡',
              '银行': '🏦', '非银金融': '📈', '汽车': '🚗', '机械设备': '⚙️',
              '煤炭': '🪨', '石油石化': '🛢️', '美容护理': '💅', '电力设备': '🔋',
              '环保': '♻️', '社会服务': '🎓', '煤炭开采': '🪨'
            };

            const results = records.map((item, index) => {
              const code = item.f12 || '';
              const name = item.f14 || '';
              const changePercent = (item.f3 || 0);
              const turnoverRate = (item.f8 || 0);
              const netFlow = (item.f62 || 0) / 100000000;
              const riseCount = parseInt(item.f104) || 0;
              const fallCount = parseInt(item.f105) || 0;
              const totalCount = parseInt(item.f106) || (riseCount + fallCount);
              const riseRatio = totalCount > 0 ? (riseCount / totalCount * 100).toFixed(1) : '0.0';
              const mainFlow = ((item.f66 || 0) + (item.f69 || 0)) / 100000000;
              const superLargeFlow = (item.f66 || 0) / 100000000;
              const largeFlow = (item.f72 || 0) / 100000000;
              const mediumFlow = (item.f78 || 0) / 100000000;
              const smallFlow = (item.f84 || 0) / 100000000;

              const icon = Object.keys(ICON_MAP).find(key => name.includes(key)) 
                ? ICON_MAP[Object.keys(ICON_MAP).find(key => name.includes(key))]
                : '📊';

              return {
                code: code,
                name: name,
                icon: icon,
                rank: index + 1,
                changePercent: parseFloat(changePercent.toFixed(2)),
                turnoverRate: parseFloat(turnoverRate.toFixed(2)),
                netFlow: parseFloat(netFlow.toFixed(2)),
                inflow: parseFloat((netFlow > 0 ? netFlow : 0).toFixed(2)),
                outflow: parseFloat((netFlow < 0 ? Math.abs(netFlow) : 0).toFixed(2)),
                riseCount: riseCount,
                fallCount: fallCount,
                totalCount: totalCount,
                riseRatio: riseRatio,
                mainFlow: parseFloat(mainFlow.toFixed(2)),
                superLargeFlow: parseFloat(superLargeFlow.toFixed(2)),
                largeFlow: parseFloat(largeFlow.toFixed(2)),
                mediumFlow: parseFloat(mediumFlow.toFixed(2)),
                smallFlow: parseFloat(smallFlow.toFixed(2))
              };
            });

            resolve(results);
          } catch (e) {
            console.error('行业资金数据解析失败:', e);
            reject(e);
          }
        },
        fail: (err) => {
          console.error('行业资金数据请求失败:', err);
          reject(err);
        }
      });
    });
  },

  fetchETFData() {
    return new Promise((resolve, reject) => {
      const etfSecIds = [
        '1.510300', '1.510050', '1.510500', '0.159915', '1.512880', '1.512010',
        '1.515790', '1.516160', '0.159941', '1.513100', '1.518880', '1.512000',
        '1.510880', '0.159919', '0.159922', '0.159925', '0.159938', '0.159952',
        '0.159956', '0.159957'
      ];

      const promises = etfSecIds.map(secid => {
        return new Promise((res) => {
          const url = `https://push2.eastmoney.com/api/qt/stock/get?secid=${secid}&fields=f57,f58,f43,f169,f170,f46,f44,f51,f168,f47,f164,f116,f117`;
          wx.request({
            url: url,
            method: 'GET',
            timeout: 10000,
            success: (resp) => {
              if (resp.statusCode === 200 && resp.data && resp.data.rc === 0 && resp.data.data) {
                const d = resp.data.data;
                const code = d.f57 || '';
                const name = d.f58 || '';
                const price = (d.f43 || 0) / 1000;
                const prevClose = (d.f46 || 0) / 1000;
                const changePercent = (d.f170 || 0) / 100;
                const amount = (d.f47 || 0) / 100000000;
                const volume = (d.f44 || 0);
                const netFlow = (d.f116 || 0) / 100000000;
                const turnoverRate = (d.f168 || 0) / 100;

                res({
                  code: code,
                  name: name,
                  shortName: name.replace('ETF', '').replace('LOF', ''),
                  price: price.toFixed(3),
                  changePercent: parseFloat(changePercent.toFixed(2)),
                  netFlow: parseFloat(netFlow.toFixed(2)),
                  volume: volume,
                  amount: parseFloat(amount.toFixed(2)),
                  turnoverRate: parseFloat(turnoverRate.toFixed(2)),
                  premium: '0.000'
                });
              } else {
                res(null);
              }
            },
            fail: () => {
              res(null);
            }
          });
        });
      });

      Promise.all(promises).then(results => {
        const validResults = results.filter(item => item !== null);
        resolve(validResults.length > 0 ? validResults : []);
      });
    });
  },

  calculateSummary(industryData) {
    let totalInflow = 0;
    let totalOutflow = 0;
    let topInflow = { name: '', value: -Infinity };
    let topOutflow = { name: '', value: Infinity };

    industryData.forEach(item => {
      if (item.netFlow > 0) {
        totalInflow += item.netFlow;
      } else {
        totalOutflow += Math.abs(item.netFlow);
      }

      if (item.netFlow > topInflow.value) {
        topInflow = { name: item.name, value: item.netFlow };
      }

      if (item.netFlow < topOutflow.value) {
        topOutflow = { name: item.name, value: item.netFlow };
      }
    });

    return {
      totalInflow: totalInflow.toFixed(2),
      totalOutflow: totalOutflow.toFixed(2),
      netFlow: (totalInflow - totalOutflow).toFixed(2),
      topInflow: topInflow,
      topOutflow: topOutflow
    };
  },

  switchTab(e) {
    const tab = e.currentTarget.dataset.tab;
    this.setData({ activeTab: tab });
    this.saveSettings();
  },

  setSortField(e) {
    const field = e.currentTarget.dataset.field;
    const { sortField, sortOrder } = this.data;

    let newOrder = 'desc';
    if (sortField === field) {
      newOrder = sortOrder === 'desc' ? 'asc' : 'desc';
    }

    this.setData({
      sortField: field,
      sortOrder: newOrder
    });

    this.saveSettings();
    this.applySort();
  },

  applySort() {
    const { industryData, sortField, sortOrder } = this.data;

    const sorted = [...industryData].sort((a, b) => {
      const valueA = parseFloat(a[sortField]) || 0;
      const valueB = parseFloat(b[sortField]) || 0;

      return sortOrder === 'desc' ? valueB - valueA : valueA - valueB;
    });

    this.setData({ filteredIndustryData: sorted });
  },

  setETFSortField(e) {
    const field = e.currentTarget.dataset.field;
    const { etfSortField, etfSortOrder } = this.data;

    let newOrder = 'desc';
    if (etfSortField === field) {
      newOrder = etfSortOrder === 'desc' ? 'asc' : 'desc';
    }

    this.setData({
      etfSortField: field,
      etfSortOrder: newOrder
    });

    this.applyETFSort();
  },

  applyETFSort() {
    const { etfData, etfSortField, etfSortOrder } = this.data;

    const sorted = [...etfData].sort((a, b) => {
      const valueA = parseFloat(a[etfSortField]) || 0;
      const valueB = parseFloat(b[etfSortField]) || 0;

      return etfSortOrder === 'desc' ? valueB - valueA : valueA - valueB;
    });

    this.setData({ filteredETFData: sorted });
  },

  setRefreshInterval(e) {
    const interval = parseInt(e.currentTarget.dataset.interval) || 30000;
    this.setData({ refreshInterval: interval });
    this.startAutoRefresh();
    this.saveSettings();
  },

  toggleSettings() {
    this.setData({ showSettings: !this.data.showSettings });
  },

  getFlowColor(value) {
    const num = parseFloat(value);
    return num >= 0 ? '#ef4444' : '#10b981';
  },

  getFlowClass(value) {
    const num = parseFloat(value);
    return num >= 0 ? 'up' : 'down';
  },

  getFlowPrefix(value) {
    const num = parseFloat(value);
    return num >= 0 ? '+' : '';
  },

  formatFlow(value) {
    const num = parseFloat(value);
    if (Math.abs(num) >= 10000) {
      return (num / 10000).toFixed(2) + '万';
    }
    return num.toFixed(2);
  },

  switchFundTab(e) {
    const tab = e.currentTarget.dataset.tab;
    this.setData({ fundTab: tab });
    if (tab === 'ranking' && this.data.rankingList.length === 0) {
      this.fetchRankingData();
    }
    if (tab === 'portfolio') {
      this.loadPortfolio();
    }
  },

  fetchRankingData() {
    if (this.data.isLoading) return;
    this.setData({ isLoading: true, error: null });

    const url = 'https://fund.eastmoney.com/data/rankhandler.aspx?op=ph&dt=kf&ft=all&rs=&gs=0&sc=1nzf&st=desc&pi=1&pn=50&dx=1';

    wx.request({
      url: url,
      method: 'GET',
      header: {
        'Referer': 'https://fund.eastmoney.com/data/fundranking.html'
      },
      responseType: 'text',
      timeout: 15000,
      success: (res) => {
        if (res.statusCode !== 200 || !res.data) {
          this.setData({
            error: '基金排行数据获取失败',
            isLoading: false,
            isRefreshing: false
          });
          return;
        }

        try {
          const data = typeof res.data === 'string' ? res.data : String(res.data);
          const match = data.match(/var rankData = (\{.*?\});/s);

          if (match && match[1]) {
            const rankData = JSON.parse(match[1]);
            const records = rankData.datas || [];

            const results = records.map((item, index) => {
              const parts = item.split(',');
              const code = parts[0] || '';
              const name = parts[1] || '';
              const todayChange = parseFloat(parts[4]) || 0;
              const change1w = parseFloat(parts[10]) || 0;
              const change1m = parseFloat(parts[11]) || 0;
              const change3m = parseFloat(parts[12]) || 0;
              const change6m = parseFloat(parts[13]) || 0;
              const change1y = parseFloat(parts[14]) || 0;
              const change2y = parseFloat(parts[15]) || 0;
              const change3y = parseFloat(parts[16]) || 0;
              const scale = parseFloat(parts[19]) || 0;

              let type = 'mixed';
              if (name.includes('指数') || name.includes('ETF')) type = 'index';
              else if (name.includes('债') || name.includes('纯债')) type = 'bond';
              else if (name.includes('QDII') || name.includes('纳指') || name.includes('标普')) type = 'qdii';
              else if (name.includes('股票') || name.includes('成长') || name.includes('价值')) type = 'stock';

              return {
                code: code,
                name: name,
                type: type,
                rank: index + 1,
                todayChange: todayChange,
                change3d: change1w / 5,
                change1w: change1w,
                change1m: change1m,
                change1y: change1y,
                change3y: change3y,
                scale: scale,
                typeName: FUND_TYPES.find(t => t.code === type)?.name || ''
              };
            });

            const now = new Date();
            const timeStr = `${now.getHours().toString().padStart(2, '0')}:${now.getMinutes().toString().padStart(2, '0')}:${now.getSeconds().toString().padStart(2, '0')}`;

            this.setData({
              lastUpdateTime: timeStr,
              rankingList: results,
              isLoading: false,
              isRefreshing: false,
              error: null
            });

            this.applyRankingFilter();
          } else {
            this.setData({
              error: '基金排行数据解析失败',
              isLoading: false,
              isRefreshing: false
            });
          }
        } catch (e) {
          console.error('基金排行数据解析失败:', e);
          this.setData({
            error: '基金排行数据解析失败',
            isLoading: false,
            isRefreshing: false
          });
        }
      },
      fail: (err) => {
        console.error('基金排行数据请求失败:', err);
        this.setData({
          error: '基金排行数据请求失败',
          isLoading: false,
          isRefreshing: false
        });
      }
    });
  },

  applyRankingFilter() {
    const { rankingList, sortPeriod, fundTypeFilter } = this.data;
    const periodKey = SORT_PERIODS.find(p => p.code === sortPeriod)?.key || 'todayChange';

    let filtered = [...rankingList];

    if (fundTypeFilter !== 'all') {
      filtered = filtered.filter(f => f.type === fundTypeFilter);
    }

    filtered.sort((a, b) => b[periodKey] - a[periodKey]);

    filtered.forEach((fund, index) => {
      fund.rank = index + 1;
    });

    this.setData({ filteredRanking: filtered.slice(0, 50) });
  },

  setSortPeriod(e) {
    const period = e.currentTarget.dataset.period;
    this.setData({ sortPeriod: period });
    this.applyRankingFilter();
  },

  setFundTypeFilter(e) {
    const type = e.currentTarget.dataset.type;
    this.setData({ fundTypeFilter: type });
    this.applyRankingFilter();
  },

  loadPortfolio() {
    try {
      const saved = wx.getStorageSync(PORTFOLIO_KEY);
      if (saved) {
        this.setData({ portfolio: saved });
        this.updatePortfolioData();
      }
    } catch (e) {
      console.error('加载持仓失败:', e);
    }
  },

  savePortfolio() {
    try {
      wx.setStorageSync(PORTFOLIO_KEY, this.data.portfolio);
    } catch (e) {
      console.error('保存持仓失败:', e);
    }
  },

  chooseOCRImage() {
    wx.chooseMedia({
      count: 1,
      mediaType: ['image'],
      sourceType: ['album', 'camera'],
      success: (res) => {
        const tempFilePath = res.tempFiles[0].tempFilePath;
        this.setData({
          ocrImage: tempFilePath,
          showOCR: true,
          ocrProgress: 0
        });
        this.processOCR(tempFilePath);
      }
    });
  },

  processOCR(imagePath) {
    this.setData({ ocrProgress: 10 });

    setTimeout(() => {
      this.setData({ ocrProgress: 50 });
    }, 500);

    setTimeout(() => {
      this.setData({ ocrProgress: 80 });
    }, 1000);

    setTimeout(() => {
      wx.showToast({
        title: 'OCR功能需要后端服务支持',
        icon: 'none',
        duration: 2000
      });
      this.setData({
        ocrProgress: 100,
        showOCR: false,
        ocrResult: null,
        ocrImage: ''
      });
    }, 1500);
  },

  confirmOCRResult() {
    const { ocrResult, portfolio } = this.data;
    if (!ocrResult || !ocrResult.funds) return;

    const existingCodes = portfolio.funds.map(f => f.code);
    const newFunds = ocrResult.funds.filter(f => !existingCodes.includes(f.code));

    const updatedFunds = [...portfolio.funds, ...newFunds.map(f => ({
      ...f,
      shares: parseFloat(f.shares),
      costNav: parseFloat(f.costNav),
      marketValue: parseFloat(f.marketValue),
      profit: parseFloat(f.profit),
      profitRate: parseFloat(f.profitRate),
      updateDate: new Date().toISOString().split('T')[0]
    }))];

    const totalAssets = updatedFunds.reduce((sum, f) => sum + f.marketValue, 0);
    const totalProfit = updatedFunds.reduce((sum, f) => sum + f.profit, 0);

    const updatedPortfolio = {
      funds: updatedFunds,
      totalAssets: totalAssets.toFixed(2),
      totalProfit: totalProfit.toFixed(2),
      totalProfitRate: totalAssets > 0 ? (totalProfit / (totalAssets - totalProfit) * 100).toFixed(2) : '0.00'
    };

    this.setData({
      portfolio: updatedPortfolio,
      showOCR: false,
      ocrResult: null,
      ocrImage: ''
    });

    this.savePortfolio();
    wx.showToast({ title: '持仓已更新', icon: 'success' });
  },

  cancelOCR() {
    this.setData({
      showOCR: false,
      ocrResult: null,
      ocrImage: ''
    });
  },

  showAddFundDialog() {
    this.setData({
      showAddFund: true,
      newFund: { code: '', name: '', shares: '', costNav: '' }
    });
  },

  hideAddFundDialog() {
    this.setData({ showAddFund: false });
  },

  onNewFundInput(e) {
    const field = e.currentTarget.dataset.field;
    const value = e.detail.value;
    this.setData({ [`newFund.${field}`]: value });
  },

  confirmAddFund() {
    const { newFund, portfolio } = this.data;

    if (!newFund.code || !newFund.name || !newFund.shares || !newFund.costNav) {
      wx.showToast({ title: '请填写完整信息', icon: 'none' });
      return;
    }

    const shares = parseFloat(newFund.shares);
    const costNav = parseFloat(newFund.costNav);

    const url = `https://fundgz.1702.com/js/${newFund.code}.js`;
    wx.request({
      url: url,
      method: 'GET',
      responseType: 'text',
      timeout: 10000,
      success: (res) => {
        let currentNav = costNav;
        if (res.statusCode === 200 && res.data) {
          try {
            const data = typeof res.data === 'string' ? res.data : String(res.data);
            const match = data.match(/jsonpgz\((.*)\)/);
            if (match && match[1]) {
              const navData = JSON.parse(match[1]);
              currentNav = parseFloat(navData.gsz) || costNav;
            }
          } catch (e) {
            console.error('获取基金净值失败:', e);
          }
        }

        const marketValue = shares * currentNav;
        const profit = marketValue - shares * costNav;
        const profitRate = (profit / (shares * costNav) * 100);

        const fund = {
          code: newFund.code,
          name: newFund.name,
          shares: shares,
          costNav: costNav,
          currentNav: currentNav.toFixed(4),
          marketValue: marketValue.toFixed(2),
          profit: profit.toFixed(2),
          profitRate: profitRate.toFixed(2),
          updateDate: new Date().toISOString().split('T')[0]
        };

        const updatedFunds = [...portfolio.funds, fund];
        const totalAssets = updatedFunds.reduce((sum, f) => sum + parseFloat(f.marketValue), 0);
        const totalProfit = updatedFunds.reduce((sum, f) => sum + parseFloat(f.profit), 0);

        const updatedPortfolio = {
          funds: updatedFunds,
          totalAssets: totalAssets.toFixed(2),
          totalProfit: totalProfit.toFixed(2),
          totalProfitRate: totalAssets > 0 ? (totalProfit / (totalAssets - totalProfit) * 100).toFixed(2) : '0.00'
        };

        this.setData({
          portfolio: updatedPortfolio,
          showAddFund: false
        });

        this.savePortfolio();
        wx.showToast({ title: '添加成功', icon: 'success' });
      },
      fail: () => {
        const marketValue = shares * costNav;
        const profit = 0;
        const profitRate = 0;

        const fund = {
          code: newFund.code,
          name: newFund.name,
          shares: shares,
          costNav: costNav,
          currentNav: costNav.toFixed(4),
          marketValue: marketValue.toFixed(2),
          profit: profit.toFixed(2),
          profitRate: profitRate.toFixed(2),
          updateDate: new Date().toISOString().split('T')[0]
        };

        const updatedFunds = [...portfolio.funds, fund];
        const totalAssets = updatedFunds.reduce((sum, f) => sum + parseFloat(f.marketValue), 0);
        const totalProfit = updatedFunds.reduce((sum, f) => sum + parseFloat(f.profit), 0);

        const updatedPortfolio = {
          funds: updatedFunds,
          totalAssets: totalAssets.toFixed(2),
          totalProfit: totalProfit.toFixed(2),
          totalProfitRate: totalAssets > 0 ? (totalProfit / (totalAssets - totalProfit) * 100).toFixed(2) : '0.00'
        };

        this.setData({
          portfolio: updatedPortfolio,
          showAddFund: false
        });

        this.savePortfolio();
        wx.showToast({ title: '添加成功（净值获取失败）', icon: 'none' });
      }
    });
  },

  deleteFund(e) {
    const index = e.currentTarget.dataset.index;
    const { portfolio } = this.data;

    wx.showModal({
      title: '确认删除',
      content: `确定要删除 ${portfolio.funds[index].name} 吗？`,
      success: (res) => {
        if (res.confirm) {
          const updatedFunds = portfolio.funds.filter((_, i) => i !== index);
          const totalAssets = updatedFunds.reduce((sum, f) => sum + parseFloat(f.marketValue), 0);
          const totalProfit = updatedFunds.reduce((sum, f) => sum + parseFloat(f.profit), 0);

          const updatedPortfolio = {
            funds: updatedFunds,
            totalAssets: totalAssets.toFixed(2),
            totalProfit: totalProfit.toFixed(2),
            totalProfitRate: totalAssets > 0 ? (totalProfit / (totalAssets - totalProfit) * 100).toFixed(2) : '0.00'
          };

          this.setData({ portfolio: updatedPortfolio });
          this.savePortfolio();
          wx.showToast({ title: '已删除', icon: 'success' });
        }
      }
    });
  },

  updatePortfolioData() {
    const { portfolio } = this.data;
    if (!portfolio.funds || portfolio.funds.length === 0) return;

    const promises = portfolio.funds.map(fund => {
      return new Promise((resolve) => {
        const url = `https://fundgz.1702.com/js/${fund.code}.js`;
        wx.request({
          url: url,
          method: 'GET',
          responseType: 'text',
          timeout: 10000,
          success: (res) => {
            if (res.statusCode === 200 && res.data) {
              try {
                const data = typeof res.data === 'string' ? res.data : String(res.data);
                const match = data.match(/jsonpgz\((.*)\)/);
                if (match && match[1]) {
                  const navData = JSON.parse(match[1]);
                  const currentNav = parseFloat(navData.gsz) || fund.costNav;
                  const marketValue = fund.shares * currentNav;
                  const profit = marketValue - fund.shares * fund.costNav;
                  const profitRate = (profit / (fund.shares * fund.costNav) * 100);

                  resolve({
                    ...fund,
                    currentNav: currentNav.toFixed(4),
                    marketValue: marketValue.toFixed(2),
                    profit: profit.toFixed(2),
                    profitRate: profitRate.toFixed(2)
                  });
                  return;
                }
              } catch (e) {
                console.error('基金净值解析失败:', fund.code, e);
              }
            }
            resolve(fund);
          },
          fail: () => {
            resolve(fund);
          }
        });
      });
    });

    Promise.all(promises).then(updatedFunds => {
      const totalAssets = updatedFunds.reduce((sum, f) => sum + parseFloat(f.marketValue), 0);
      const totalProfit = updatedFunds.reduce((sum, f) => sum + parseFloat(f.profit), 0);

      this.setData({
        portfolio: {
          funds: updatedFunds,
          totalAssets: totalAssets.toFixed(2),
          totalProfit: totalProfit.toFixed(2),
          totalProfitRate: totalAssets > 0 ? (totalProfit / (totalAssets - totalProfit) * 100).toFixed(2) : '0.00'
        }
      });
    });
  }
});