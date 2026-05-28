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

const SECTOR_LIST = [
  { code: '801010', name: '农林牧渔', icon: '🌾' },
  { code: '801020', name: '采掘', icon: '⛏️' },
  { code: '801030', name: '化工', icon: '🧪' },
  { code: '801040', name: '钢铁', icon: '🔩' },
  { code: '801050', name: '有色金属', icon: '🪙' },
  { code: '801080', name: '电子', icon: '💻' },
  { code: '801110', name: '家用电器', icon: '🏠' },
  { code: '801120', name: '食品饮料', icon: '🍜' },
  { code: '801130', name: '纺织服装', icon: '👔' },
  { code: '801140', name: '轻工制造', icon: '📦' },
  { code: '801150', name: '医药生物', icon: '💊' },
  { code: '801160', name: '公用事业', icon: '⚡' },
  { code: '801170', name: '交通运输', icon: '🚛' },
  { code: '801180', name: '房地产', icon: '🏗️' },
  { code: '801200', name: '商业贸易', icon: '🛒' },
  { code: '801210', name: '休闲服务', icon: '✈️' },
  { code: '801230', name: '综合', icon: '📊' },
  { code: '801710', name: '建筑材料', icon: '🧱' },
  { code: '801720', name: '建筑装饰', icon: '🏛️' },
  { code: '801730', name: '电气设备', icon: '💡' },
  { code: '801740', name: '国防军工', icon: '🚀' },
  { code: '801750', name: '计算机', icon: '🖥️' },
  { code: '801760', name: '传媒', icon: '📱' },
  { code: '801770', name: '通信', icon: '📡' },
  { code: '801780', name: '银行', icon: '🏦' },
  { code: '801790', name: '非银金融', icon: '📈' },
  { code: '801880', name: '汽车', icon: '🚗' },
  { code: '801890', name: '机械设备', icon: '⚙️' }
];

const HOT_THEMES = [
  { name: '人工智能', related: ['计算机', '电子', '通信', '传媒'] },
  { name: '新能源', related: ['电气设备', '汽车', '化工'] },
  { name: '半导体', related: ['电子', '计算机'] },
  { name: '医药生物', related: ['医药生物'] },
  { name: '消费复苏', related: ['食品饮料', '家用电器', '商业贸易', '休闲服务'] },
  { name: '一带一路', related: ['建筑装饰', '交通运输', '机械设备'] }
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
      { key: 'theme', name: '热门板块' },
      { key: 'etf', name: 'ETF资金' },
      { key: 'fund', name: '基金监控' }
    ],

    sortField: 'netFlow',
    sortOrder: 'desc',

    industryData: [],
    filteredIndustryData: [],

    themeData: [],

    etfData: [],

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
      this.fetchThemeData(),
      this.fetchETFData()
    ])
      .then(([industryData, themeData, etfData]) => {
        const now = new Date();
        const timeStr = `${now.getHours().toString().padStart(2, '0')}:${now.getMinutes().toString().padStart(2, '0')}:${now.getSeconds().toString().padStart(2, '0')}`;

        const summary = this.calculateSummary(industryData);

        this.setData({
          lastUpdateTime: timeStr,
          industryData: industryData,
          themeData: themeData,
          etfData: etfData,
          summary: summary,
          isLoading: false,
          isRefreshing: false,
          error: null
        });

        this.applySort();
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
    return new Promise((resolve) => {
      const mockData = SECTOR_LIST.map(sector => {
        const netFlow = (Math.random() * 200 - 100).toFixed(2);
        const inflow = (Math.random() * 500 + 100).toFixed(2);
        const outflow = (parseFloat(inflow) - parseFloat(netFlow)).toFixed(2);
        const changePercent = (Math.random() * 6 - 3).toFixed(2);
        const riseCount = Math.floor(Math.random() * 100) + 10;
        const fallCount = Math.floor(Math.random() * 80) + 10;

        return {
          ...sector,
          netFlow: parseFloat(netFlow),
          inflow: parseFloat(inflow),
          outflow: parseFloat(outflow),
          changePercent: parseFloat(changePercent),
          riseCount: riseCount,
          fallCount: fallCount,
          totalCount: riseCount + fallCount,
          riseRatio: (riseCount / (riseCount + fallCount) * 100).toFixed(1),
          mainFlow: (Math.random() * 100 - 50).toFixed(2),
          superLargeFlow: (Math.random() * 60 - 30).toFixed(2),
          largeFlow: (Math.random() * 40 - 20).toFixed(2),
          mediumFlow: (Math.random() * 30 - 15).toFixed(2),
          smallFlow: (Math.random() * 20 - 10).toFixed(2)
        };
      });

      resolve(mockData);
    });
  },

  fetchThemeData() {
    return new Promise((resolve) => {
      const mockThemes = HOT_THEMES.map(theme => {
        const changePercent = (Math.random() * 8 - 2).toFixed(2);
        const netFlow = (Math.random() * 300 - 100).toFixed(2);
        const riseCount = Math.floor(Math.random() * 50) + 10;
        const fallCount = Math.floor(Math.random() * 30) + 5;
        const leaderName = theme.related[0] || '';

        return {
          name: theme.name,
          related: theme.related,
          changePercent: parseFloat(changePercent),
          netFlow: parseFloat(netFlow),
          riseCount: riseCount,
          fallCount: fallCount,
          leaderName: leaderName,
          leaderChange: (Math.random() * 10).toFixed(2),
          hot: Math.random() > 0.5
        };
      });

      resolve(mockThemes);
    });
  },

  fetchETFData() {
    return new Promise((resolve) => {
      const etfList = [
        { code: '510300', name: '沪深300ETF', shortName: '300ETF' },
        { code: '510050', name: '上证50ETF', shortName: '50ETF' },
        { code: '510500', name: '中证500ETF', shortName: '500ETF' },
        { code: '159915', name: '创业板ETF', shortName: '创业板' },
        { code: '512880', name: '证券ETF', shortName: '证券' },
        { code: '512010', name: '医药ETF', shortName: '医药' },
        { code: '515790', name: '光伏ETF', shortName: '光伏' },
        { code: '516160', name: '新能源ETF', shortName: '新能源' },
        { code: '159941', name: '纳指ETF', shortName: '纳指' },
        { code: '513100', name: '纳指100ETF', shortName: '纳指100' }
      ];

      const mockETFs = etfList.map(etf => {
        const changePercent = (Math.random() * 4 - 2).toFixed(2);
        const netFlow = (Math.random() * 50 - 25).toFixed(2);
        const volume = (Math.random() * 100 + 10).toFixed(2);
        const amount = (Math.random() * 1000 + 100).toFixed(2);

        return {
          ...etf,
          changePercent: parseFloat(changePercent),
          netFlow: parseFloat(netFlow),
          volume: parseFloat(volume),
          amount: parseFloat(amount),
          premium: (Math.random() * 2 - 1).toFixed(3),
          sharesChange: (Math.random() * 10 - 5).toFixed(2)
        };
      });

      resolve(mockETFs);
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

    const mockFunds = this.generateMockFunds();

    setTimeout(() => {
      const now = new Date();
      const timeStr = `${now.getHours().toString().padStart(2, '0')}:${now.getMinutes().toString().padStart(2, '0')}:${now.getSeconds().toString().padStart(2, '0')}`;

      this.setData({
        lastUpdateTime: timeStr,
        rankingList: mockFunds,
        isLoading: false,
        isRefreshing: false,
        error: null
      });

      this.applyRankingFilter();
    }, 500);
  },

  generateMockFunds() {
    const fundNames = [
      { code: '000001', name: '华夏成长混合', type: 'mixed' },
      { code: '000002', name: '易方达消费行业', type: 'stock' },
      { code: '000003', name: '中欧行业成长', type: 'mixed' },
      { code: '000004', name: '富国天惠成长', type: 'mixed' },
      { code: '000005', name: '景顺长城新兴成长', type: 'stock' },
      { code: '000006', name: '招商中证白酒', type: 'index' },
      { code: '000007', name: '国泰中证全指证券', type: 'index' },
      { code: '000008', name: '华夏沪深300ETF联接', type: 'index' },
      { code: '000009', name: '南方中证500ETF联接', type: 'index' },
      { code: '000010', name: '易方达中短期债券', type: 'bond' },
      { code: '000011', name: '广发纳斯达克100', type: 'qdii' },
      { code: '000012', name: '博时标普500ETF联接', type: 'qdii' },
      { code: '000013', name: '工银瑞信前沿医疗', type: 'stock' },
      { code: '000014', name: '汇添富中证新能源汽车', type: 'index' },
      { code: '000015', name: '华夏芯片ETF', type: 'index' },
      { code: '000016', name: '天弘中证光伏产业', type: 'index' },
      { code: '000017', name: '鹏华中证国防', type: 'index' },
      { code: '000018', name: '华安创业板50ETF联接', type: 'index' },
      { code: '000019', name: '富国中证医药主题', type: 'index' },
      { code: '000020', name: '易方达上证50', type: 'index' },
      { code: '000021', name: '嘉实基本面50', type: 'index' },
      { code: '000022', name: '南方成份精选', type: 'mixed' },
      { code: '000023', name: '中银持续增长', type: 'mixed' },
      { code: '000024', name: '大摩资源优选', type: 'mixed' },
      { code: '000025', name: '建信核心精选', type: 'mixed' },
      { code: '000026', name: '泰达宏利成长', type: 'stock' },
      { code: '000027', name: '融通深证100', type: 'index' },
      { code: '000028', name: '天治核心成长', type: 'stock' },
      { code: '000029', name: '万家精选', type: 'mixed' },
      { code: '000030', name: '长城品牌优选', type: 'stock' },
      { code: '000031', name: '华夏回报', type: 'mixed' },
      { code: '000032', name: '易方达价值精选', type: 'mixed' },
      { code: '000033', name: '嘉实增长', type: 'mixed' },
      { code: '000034', name: '富国天益价值', type: 'mixed' },
      { code: '000035', name: '博时主题行业', type: 'mixed' },
      { code: '000036', name: '华安创新', type: 'mixed' },
      { code: '000037', name: '广发聚丰', type: 'mixed' },
      { code: '000038', name: '南方稳健成长', type: 'mixed' },
      { code: '000039', name: '鹏华价值优势', type: 'mixed' },
      { code: '000040', name: '工银瑞信核心价值', type: 'mixed' },
      { code: '000041', name: '汇添富优势精选', type: 'mixed' },
      { code: '000042', name: '华夏红利', type: 'mixed' },
      { code: '000043', name: '易方达策略成长', type: 'mixed' },
      { code: '000044', name: '嘉实服务增值', type: 'mixed' },
      { code: '000045', name: '富国天瑞强势', type: 'mixed' },
      { code: '000046', name: '博时精选', type: 'mixed' },
      { code: '000047', name: '华安宝利配置', type: 'mixed' },
      { code: '000048', name: '广发策略优选', type: 'mixed' },
      { code: '000049', name: '南方积极配置', type: 'mixed' },
      { code: '000050', name: '鹏华中国50', type: 'index' }
    ];

    return fundNames.map((fund, index) => {
      const todayChange = (Math.random() * 10 - 3).toFixed(2);
      const change3d = (Math.random() * 15 - 5).toFixed(2);
      const change1w = (Math.random() * 20 - 8).toFixed(2);
      const change1m = (Math.random() * 30 - 10).toFixed(2);
      const change1y = (Math.random() * 80 - 20).toFixed(2);
      const change3y = (Math.random() * 150 - 30).toFixed(2);
      const scale = (Math.random() * 200 + 10).toFixed(2);

      return {
        ...fund,
        rank: index + 1,
        todayChange: parseFloat(todayChange),
        change3d: parseFloat(change3d),
        change1w: parseFloat(change1w),
        change1m: parseFloat(change1m),
        change1y: parseFloat(change1y),
        change3y: parseFloat(change3y),
        scale: parseFloat(scale),
        typeName: FUND_TYPES.find(t => t.code === fund.type)?.name || ''
      };
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
      const mockOCRResult = this.generateMockOCRResult();
      this.setData({
        ocrProgress: 100,
        ocrResult: mockOCRResult
      });
    }, 1500);
  },

  generateMockOCRResult() {
    const mockFunds = [
      { code: '000001', name: '华夏成长混合', shares: '1000.00', costNav: '1.5000', marketValue: '1725.00', profit: '225.00', profitRate: '15.00' },
      { code: '000002', name: '易方达消费行业', shares: '500.00', costNav: '3.2000', marketValue: '1750.00', profit: '150.00', profitRate: '9.38' },
      { code: '000006', name: '招商中证白酒', shares: '2000.00', costNav: '1.8000', marketValue: '4000.00', profit: '400.00', profitRate: '11.11' }
    ];

    return {
      funds: mockFunds,
      totalAssets: mockFunds.reduce((sum, f) => sum + parseFloat(f.marketValue), 0).toFixed(2),
      totalProfit: mockFunds.reduce((sum, f) => sum + parseFloat(f.profit), 0).toFixed(2)
    };
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
    const marketValue = shares * costNav * (1 + Math.random() * 0.2);
    const profit = marketValue - shares * costNav;
    const profitRate = (profit / (shares * costNav) * 100);

    const fund = {
      code: newFund.code,
      name: newFund.name,
      shares: shares,
      costNav: costNav,
      currentNav: (costNav * (1 + profitRate / 100)).toFixed(4),
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

    const updatedFunds = portfolio.funds.map(fund => {
      const change = (Math.random() * 0.04 - 0.02);
      const currentNav = fund.costNav * (1 + parseFloat(fund.profitRate) / 100 + change);
      const marketValue = fund.shares * currentNav;
      const profit = marketValue - fund.shares * fund.costNav;
      const profitRate = (profit / (fund.shares * fund.costNav) * 100);

      return {
        ...fund,
        currentNav: currentNav.toFixed(4),
        marketValue: marketValue.toFixed(2),
        profit: profit.toFixed(2),
        profitRate: profitRate.toFixed(2)
      };
    });

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
  }
});