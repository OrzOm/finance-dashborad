const app = getApp();

const STORAGE_KEY = 'fund_monitor_settings';
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
    refreshInterval: 60000,
    isLoading: false,
    isRefreshing: false,
    error: null,

    activeTab: 'ranking',
    tabs: [
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
    },

    showSettings: false
  },

  refreshTimer: null,

  onLoad() {
    this.loadSettings();
    this.loadPortfolio();
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
          refreshInterval: saved.refreshInterval || 60000,
          activeTab: saved.activeTab || 'ranking',
          sortPeriod: saved.sortPeriod || 'today',
          fundTypeFilter: saved.fundTypeFilter || 'all'
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
        sortPeriod: this.data.sortPeriod,
        fundTypeFilter: this.data.fundTypeFilter
      });
    } catch (e) {
      console.error('保存设置失败:', e);
    }
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
    this.fetchRankingData();
  },

  refreshData() {
    this.fetchRankingData();
  },

  manualRefresh() {
    this.setData({ isRefreshing: true });
    this.fetchRankingData();
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
      { code: '000001', name: '华夏成长混合', type: 'mixed', manager: '张三' },
      { code: '000002', name: '易方达消费行业', type: 'stock', manager: '李四' },
      { code: '000003', name: '中欧行业成长', type: 'mixed', manager: '王五' },
      { code: '000004', name: '富国天惠成长', type: 'mixed', manager: '赵六' },
      { code: '000005', name: '景顺长城新兴成长', type: 'stock', manager: '钱七' },
      { code: '000006', name: '招商中证白酒', type: 'index', manager: '孙八' },
      { code: '000007', name: '国泰中证全指证券', type: 'index', manager: '周九' },
      { code: '000008', name: '华夏沪深300ETF联接', type: 'index', manager: '吴十' },
      { code: '000009', name: '南方中证500ETF联接', type: 'index', manager: '郑一' },
      { code: '000010', name: '易方达中短期债券', type: 'bond', manager: '王二' },
      { code: '000011', name: '广发纳斯达克100', type: 'qdii', manager: '李三' },
      { code: '000012', name: '博时标普500ETF联接', type: 'qdii', manager: '赵四' },
      { code: '000013', name: '工银瑞信前沿医疗', type: 'stock', manager: '钱五' },
      { code: '000014', name: '汇添富中证新能源汽车', type: 'index', manager: '孙六' },
      { code: '000015', name: '华夏芯片ETF', type: 'index', manager: '周七' },
      { code: '000016', name: '天弘中证光伏产业', type: 'index', manager: '吴八' },
      { code: '000017', name: '鹏华中证国防', type: 'index', manager: '郑九' },
      { code: '000018', name: '华安创业板50ETF联接', type: 'index', manager: '王十' },
      { code: '000019', name: '富国中证医药主题', type: 'index', manager: '李一' },
      { code: '000020', name: '易方达上证50', type: 'index', manager: '赵二' },
      { code: '000021', name: '嘉实基本面50', type: 'index', manager: '钱三' },
      { code: '000022', name: '南方成份精选', type: 'mixed', manager: '孙四' },
      { code: '000023', name: '中银持续增长', type: 'mixed', manager: '周五' },
      { code: '000024', name: '大摩资源优选', type: 'mixed', manager: '吴六' },
      { code: '000025', name: '建信核心精选', type: 'mixed', manager: '郑七' },
      { code: '000026', name: '泰达宏利成长', type: 'stock', manager: '王八' },
      { code: '000027', name: '融通深证100', type: 'index', manager: '李九' },
      { code: '000028', name: '天治核心成长', type: 'stock', manager: '赵十' },
      { code: '000029', name: '万家精选', type: 'mixed', manager: '钱一' },
      { code: '000030', name: '长城品牌优选', type: 'stock', manager: '孙二' },
      { code: '000031', name: '华夏回报', type: 'mixed', manager: '周三' },
      { code: '000032', name: '易方达价值精选', type: 'mixed', manager: '吴四' },
      { code: '000033', name: '嘉实增长', type: 'mixed', manager: '郑五' },
      { code: '000034', name: '富国天益价值', type: 'mixed', manager: '王六' },
      { code: '000035', name: '博时主题行业', type: 'mixed', manager: '李七' },
      { code: '000036', name: '华安创新', type: 'mixed', manager: '赵八' },
      { code: '000037', name: '广发聚丰', type: 'mixed', manager: '钱九' },
      { code: '000038', name: '南方稳健成长', type: 'mixed', manager: '孙十' },
      { code: '000039', name: '鹏华价值优势', type: 'mixed', manager: '周一' },
      { code: '000040', name: '工银瑞信核心价值', type: 'mixed', manager: '吴二' },
      { code: '000041', name: '汇添富优势精选', type: 'mixed', manager: '郑三' },
      { code: '000042', name: '华夏红利', type: 'mixed', manager: '王四' },
      { code: '000043', name: '易方达策略成长', type: 'mixed', manager: '李五' },
      { code: '000044', name: '嘉实服务增值', type: 'mixed', manager: '赵六' },
      { code: '000045', name: '富国天瑞强势', type: 'mixed', manager: '钱七' },
      { code: '000046', name: '博时精选', type: 'mixed', manager: '孙八' },
      { code: '000047', name: '华安宝利配置', type: 'mixed', manager: '周二' },
      { code: '000048', name: '广发策略优选', type: 'mixed', manager: '吴三' },
      { code: '000049', name: '南方积极配置', type: 'mixed', manager: '郑四' },
      { code: '000050', name: '鹏华中国50', type: 'index', manager: '王五' }
    ];

    return fundNames.map((fund, index) => {
      const todayChange = (Math.random() * 10 - 3).toFixed(2);
      const change3d = (Math.random() * 15 - 5).toFixed(2);
      const change1w = (Math.random() * 20 - 8).toFixed(2);
      const change1m = (Math.random() * 30 - 10).toFixed(2);
      const change1y = (Math.random() * 80 - 20).toFixed(2);
      const change3y = (Math.random() * 150 - 30).toFixed(2);
      const scale = (Math.random() * 200 + 10).toFixed(2);
      const nav = (Math.random() * 5 + 0.5).toFixed(4);

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
        nav: parseFloat(nav),
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

  switchTab(e) {
    const tab = e.currentTarget.dataset.tab;
    this.setData({ activeTab: tab });
    this.saveSettings();
  },

  setSortPeriod(e) {
    const period = e.currentTarget.dataset.period;
    this.setData({ sortPeriod: period });
    this.saveSettings();
    this.applyRankingFilter();
  },

  setFundTypeFilter(e) {
    const type = e.currentTarget.dataset.type;
    this.setData({ fundTypeFilter: type });
    this.saveSettings();
    this.applyRankingFilter();
  },

  setRefreshInterval(e) {
    const interval = parseInt(e.currentTarget.dataset.interval) || 60000;
    this.setData({ refreshInterval: interval });
    this.startAutoRefresh();
    this.saveSettings();
  },

  toggleSettings() {
    this.setData({ showSettings: !this.data.showSettings });
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
  },

  getChangeClass(value) {
    return parseFloat(value) >= 0 ? 'up' : 'down';
  },

  getChangePrefix(value) {
    return parseFloat(value) >= 0 ? '+' : '';
  }
});