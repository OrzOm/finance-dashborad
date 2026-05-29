const app = getApp();

const STORAGE_KEY = 'stock_alert_settings';

const BOARD_TYPES = [
  { code: 'all', name: '全部' },
  { code: 'sh', name: '沪主板' },
  { code: 'sz', name: '深主板' },
  { code: 'cyb', name: '创业板' },
  { code: 'kcb', name: '科创板' },
  { code: 'bj', name: '北交所' }
];

const ALERT_TYPES = [
  { code: 'all', name: '全部', icon: '📊' },
  { code: 'surge', name: '快速拉升', icon: '🚀', color: '#ef4444' },
  { code: 'plunge', name: '快速跳水', icon: '📉', color: '#10b981' },
  { code: 'big_buy', name: '大单买入', icon: '💰', color: '#f59e0b' },
  { code: 'big_sell', name: '大单卖出', icon: '💸', color: '#3b82f6' },
  { code: 'limit_up', name: '涨停', icon: '🔺', color: '#ef4444' },
  { code: 'limit_down', name: '跌停', icon: '🔻', color: '#10b981' },
  { code: 'volume', name: '量比异动', icon: '📊', color: '#8b5cf6' },
  { code: 'new_high', name: '创新高', icon: '🏆', color: '#f59e0b' },
  { code: 'new_low', name: '创新低', icon: '💀', color: '#6b7280' }
];

const DEVIATION_PERIODS = [
  { code: '3d', name: '3日', days: 3 },
  { code: '5d', name: '5日', days: 5 },
  { code: '10d', name: '10日', days: 10 },
  { code: '30d', name: '30日', days: 30 },
  { code: '60d', name: '60日', days: 60 }
];

const BOARD_THRESHOLDS = {
  'sh': { normal: 20, severe: 50 },
  'sz': { normal: 20, severe: 50 },
  'cyb': { normal: 30, severe: 60 },
  'kcb': { normal: 30, severe: 60 },
  'bj': { normal: 40, severe: 80 }
};

Page({
  data: {
    lastUpdateTime: '--:--:--',
    refreshInterval: 10000,
    isLoading: false,
    isRefreshing: false,
    error: null,

    activeTab: 'realtime',
    tabs: [
      { key: 'realtime', name: '实时异动' },
      { key: 'abnormal', name: '异常波动' }
    ],

    realtimeAlerts: [],
    filteredAlerts: [],
    alertTypeFilter: 'all',
    boardFilter: 'all',

    abnormalStocks: [],
    filteredAbnormal: [],
    abnormalTypeFilter: 'all',
    abnormalBoardFilter: 'all',
    abnormalPeriodFilter: 'all',

    searchKeyword: '',
    searchResults: [],
    showSearch: false,

    realtimePage: 1,
    hasMoreRealtime: true,

    showSettings: false
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
          refreshInterval: saved.refreshInterval || 10000,
          activeTab: saved.activeTab || 'realtime'
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
      this.fetchRealtimeAlerts(),
      this.fetchAbnormalStocks()
    ])
      .then(([realtimeAlerts, abnormalStocks]) => {
        const now = new Date();
        const timeStr = `${now.getHours().toString().padStart(2, '0')}:${now.getMinutes().toString().padStart(2, '0')}:${now.getSeconds().toString().padStart(2, '0')}`;

        this.setData({
          lastUpdateTime: timeStr,
          realtimeAlerts: realtimeAlerts,
          abnormalStocks: abnormalStocks,
          isLoading: false,
          isRefreshing: false,
          error: null
        });

        this.applyRealtimeFilter();
        this.applyAbnormalFilter();
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

  fetchRealtimeAlerts() {
    return new Promise((resolve, reject) => {
      const alerts = [];
      const now = new Date();

      const fetchStockChanges = new Promise((res) => {
        const url = 'https://push2ex.eastmoney.com/getAllStockChanges?type=8201,8202,8207,8208,8203,8204,8209,8210,8211,8212&pageindex=0&pagesize=50&ut=7eea3edcaed734bea9cb3c4fac7a3b4b&_=' + Date.now();
        wx.request({
          url: url,
          method: 'GET',
          timeout: 10000,
          success: (resp) => {
            if (resp.statusCode === 200 && resp.data && resp.data.data && resp.data.data.stockchanges) {
              const changes = resp.data.data.stockchanges || [];
              changes.forEach((item, index) => {
                const code = item.stockCode || '';
                const name = item.stockName || '';
                const price = ((item.price || 0) / 1000).toFixed(2);
                const changePercent = ((item.changePercent || 0) / 100).toFixed(2);
                const changeType = item.changeType || '';
                const changeTime = item.changeTime || '';
                const volume = item.volume || 0;
                const amount = ((item.amount || 0) / 10000).toFixed(2);
                let board = 'sh';
                if (code.startsWith('0') || code.startsWith('002')) board = 'sz';
                else if (code.startsWith('3')) board = 'cyb';
                else if (code.startsWith('688')) board = 'kcb';
                else if (code.startsWith('8') || code.startsWith('4')) board = 'bj';

                let alertType = 'surge';
                let alertName = '快速拉升';
                let alertIcon = '�';
                let alertColor = '#ef4444';

                if (changeType === '8201') {
                  alertType = 'surge';
                  alertName = '火箭发射';
                  alertIcon = '🚀';
                  alertColor = '#ef4444';
                } else if (changeType === '8202') {
                  alertType = 'plunge';
                  alertName = '快速跳水';
                  alertIcon = '📉';
                  alertColor = '#10b981';
                } else if (changeType === '8207') {
                  alertType = 'big_buy';
                  alertName = '大笔买入';
                  alertIcon = '💰';
                  alertColor = '#f59e0b';
                } else if (changeType === '8208') {
                  alertType = 'big_sell';
                  alertName = '大笔卖出';
                  alertIcon = '�';
                  alertColor = '#3b82f6';
                } else if (changeType === '8203') {
                  alertType = 'limit_up';
                  alertName = '涨停';
                  alertIcon = '🔺';
                  alertColor = '#ef4444';
                } else if (changeType === '8204') {
                  alertType = 'limit_down';
                  alertName = '跌停';
                  alertIcon = '🔻';
                  alertColor = '#10b981';
                } else if (changeType === '8209') {
                  alertType = 'volume';
                  alertName = '有大买盘';
                  alertIcon = '�';
                  alertColor = '#8b5cf6';
                } else if (changeType === '8210') {
                  alertType = 'volume';
                  alertName = '有大卖盘';
                  alertIcon = '�';
                  alertColor = '#8b5cf6';
                } else if (changeType === '8211') {
                  alertType = 'new_high';
                  alertName = '竞价上涨';
                  alertIcon = '🏆';
                  alertColor = '#f59e0b';
                } else if (changeType === '8212') {
                  alertType = 'new_low';
                  alertName = '竞价下跌';
                  alertIcon = '�';
                  alertColor = '#6b7280';
                }

                alerts.push({
                  id: `change_${index}`,
                  stockCode: code,
                  stockName: name,
                  board: board,
                  alertType: alertType,
                  alertName: alertName,
                  alertIcon: alertIcon,
                  alertColor: alertColor,
                  time: changeTime || `${now.getHours().toString().padStart(2, '0')}:${now.getMinutes().toString().padStart(2, '0')}:${now.getSeconds().toString().padStart(2, '0')}`,
                  timestamp: now.getTime() - index * 1000,
                  price: price,
                  changePercent: parseFloat(changePercent),
                  volume: volume,
                  amount: amount
                });
              });
            }
            res();
          },
          fail: () => res()
        });
      });

      Promise.all([fetchStockChanges]).then(() => {
        alerts.sort((a, b) => b.timestamp - a.timestamp);
        resolve(alerts.slice(0, 50));
      });
    });
  },

  fetchAbnormalStocks() {
    return new Promise((resolve, reject) => {
      const abnormalList = [];
      const now = new Date();

      const fetchAbnormalMonitor = new Promise((res) => {
        const startDate = `${now.getFullYear()}-${(now.getMonth() + 1).toString().padStart(2, '0')}-${(now.getDate() - 30).toString().padStart(2, '0')}`;
        const endDate = `${now.getFullYear()}-${(now.getMonth() + 1).toString().padStart(2, '0')}-${now.getDate().toString().padStart(2, '0')}`;
        const url = `https://datacenter-web.eastmoney.com/api/data/v1/get?reportName=RPT_MARKET_ABNORMAL_MONITOR&columns=ALL&filter=(TRADE_DATE%3E%3D%27${startDate}%27)(TRADE_DATE%3C%3D%27${endDate}%27)&pageNumber=1&pageSize=50&sortTypes=-1&sortColumns=TRADE_DATE&source=WEB&client=WEB&_=${Date.now()}`;
        wx.request({
          url: url,
          method: 'GET',
          timeout: 15000,
          success: (resp) => {
            if (resp.statusCode === 200 && resp.data && resp.data.result && resp.data.result.data) {
              const records = resp.data.result.data || [];
              records.forEach((item, index) => {
                const code = item.SECURITY_CODE || '';
                const name = item.SECURITY_NAME || '';
                const board = item.MARKET || 'unknown';
                const reason = item.ABNORMAL_TYPE || '';
                const tradeDate = item.TRADE_DATE || '';
                const closePrice = item.CLOSE_PRICE || 0;
                const changeRate = item.CHANGE_RATE || 0;
                const turnoverRate = item.TURNOVERRATE || 0;
                const accumAmount = item.ACCUM_AMOUNT || 0;
                const deviation = item.DEVIATION || 0;
                const isSevere = reason.includes('严重');

                abnormalList.push({
                  id: `abnormal_${index}`,
                  stockCode: code,
                  stockName: name,
                  board: board,
                  boardName: board,
                  reason: reason,
                  tradeDate: tradeDate ? tradeDate.split('T')[0] : '',
                  price: closePrice ? closePrice.toFixed(2) : '--',
                  changePercent: changeRate ? parseFloat(changeRate.toFixed(2)) : 0,
                  turnoverRate: turnoverRate ? parseFloat(turnoverRate.toFixed(2)) : 0,
                  amount: accumAmount ? (accumAmount / 100000000).toFixed(2) : '0',
                  deviation: deviation ? parseFloat(deviation.toFixed(2)) : 0,
                  absDeviation: Math.abs(deviation || 0),
                  isSevere: isSevere,
                  isNormal: !isSevere,
                  abnormalType: isSevere ? 'severe' : 'normal',
                  abnormalTypeName: isSevere ? '严重异常波动' : '异常波动'
                });
              });
            }
            res();
          },
          fail: () => res()
        });
      });

      Promise.all([fetchAbnormalMonitor]).then(() => {
        abnormalList.sort((a, b) => b.absDeviation - a.absDeviation);
        resolve(abnormalList.slice(0, 50));
      });
    });
  },

  switchTab(e) {
    const tab = e.currentTarget.dataset.tab;
    this.setData({ activeTab: tab });
    this.saveSettings();
  },

  setAlertTypeFilter(e) {
    const type = e.currentTarget.dataset.type;
    this.setData({ alertTypeFilter: type });
    this.applyRealtimeFilter();
  },

  setBoardFilter(e) {
    const board = e.currentTarget.dataset.board;
    this.setData({ boardFilter: board });
    this.applyRealtimeFilter();
  },

  applyRealtimeFilter() {
    const { realtimeAlerts, alertTypeFilter, boardFilter } = this.data;

    let filtered = [...realtimeAlerts];

    if (alertTypeFilter !== 'all') {
      filtered = filtered.filter(a => a.alertType === alertTypeFilter);
    }

    if (boardFilter !== 'all') {
      filtered = filtered.filter(a => a.board === boardFilter);
    }

    this.setData({ filteredAlerts: filtered });
  },

  setAbnormalTypeFilter(e) {
    const type = e.currentTarget.dataset.type;
    this.setData({ abnormalTypeFilter: type });
    this.applyAbnormalFilter();
  },

  setAbnormalBoardFilter(e) {
    const board = e.currentTarget.dataset.board;
    this.setData({ abnormalBoardFilter: board });
    this.applyAbnormalFilter();
  },

  setAbnormalPeriodFilter(e) {
    const period = e.currentTarget.dataset.period;
    this.setData({ abnormalPeriodFilter: period });
    this.applyAbnormalFilter();
  },

  applyAbnormalFilter() {
    const { abnormalStocks, abnormalTypeFilter, abnormalBoardFilter, abnormalPeriodFilter } = this.data;

    let filtered = [...abnormalStocks];

    if (abnormalTypeFilter !== 'all') {
      filtered = filtered.filter(a => a.abnormalType === abnormalTypeFilter);
    }

    if (abnormalBoardFilter !== 'all') {
      filtered = filtered.filter(a => a.board === abnormalBoardFilter);
    }

    if (abnormalPeriodFilter !== 'all') {
      filtered = filtered.filter(a => a.period === abnormalPeriodFilter);
    }

    this.setData({ filteredAbnormal: filtered });
  },

  onSearchInput(e) {
    const keyword = e.detail.value;
    this.setData({ searchKeyword: keyword });

    if (keyword.length >= 2) {
      this.searchStock(keyword);
    } else {
      this.setData({ searchResults: [], showSearch: false });
    }
  },

  searchStock(keyword) {
    const { abnormalStocks } = this.data;
    const results = abnormalStocks.filter(s =>
      s.stockCode.includes(keyword) ||
      s.stockName.includes(keyword)
    );

    this.setData({
      searchResults: results,
      showSearch: true
    });
  },

  clearSearch() {
    this.setData({
      searchKeyword: '',
      searchResults: [],
      showSearch: false
    });
  },

  setRefreshInterval(e) {
    const interval = parseInt(e.currentTarget.dataset.interval) || 10000;
    this.setData({ refreshInterval: interval });
    this.startAutoRefresh();
    this.saveSettings();
  },

  toggleSettings() {
    this.setData({ showSettings: !this.data.showSettings });
  },

  loadMoreRealtime() {
    this.setData({ realtimePage: this.data.realtimePage + 1 });
  },

  getChangeClass(value) {
    return parseFloat(value) >= 0 ? 'up' : 'down';
  },

  getChangePrefix(value) {
    return parseFloat(value) >= 0 ? '+' : '';
  }
});