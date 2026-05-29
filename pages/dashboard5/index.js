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
  { code: 'limit_up', name: '涨停', icon: '🔺', color: '#ef4444' },
  { code: 'surge', name: '涨幅居前', icon: '🚀', color: '#ef4444' }
];

Page({
  data: {
    lastUpdateTime: '--:--:--',
    refreshInterval: 10000,
    isLoading: false,
    isRefreshing: false,
    error: null,

    activeTab: 'realtime',
    tabs: [
      { key: 'realtime', name: '涨幅榜' },
      { key: 'abnormal', name: '异常波动' }
    ],

    realtimeAlerts: [],
    filteredAlerts: [],
    alertTypeFilter: 'all',
    boardFilter: 'all',

    abnormalStocks: [],
    filteredAbnormal: [],
    abnormalTypeFilter: 'all',

    searchKeyword: '',
    searchResults: [],
    showSearch: false,

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
    return new Promise((resolve) => {
      const alerts = [];
      const now = new Date();

      const fetchTopGainers = new Promise((res) => {
        const url = 'https://push2.eastmoney.com/api/qt/clist/get?cb=&fid=f3&po=1&pz=50&pn=1&np=1&fltt=2&invt=2&fs=m:0+t:6,m:0+t:80,m:1+t:2,m:1+t:23,m:0+t:81+s:2048&fields=f2,f3,f4,f5,f6,f7,f8,f12,f14,f15,f16,f17,f18';
        wx.request({
          url: url,
          method: 'GET',
          timeout: 10000,
          success: (resp) => {
            if (resp.statusCode === 200 && resp.data && resp.data.data && resp.data.data.diff) {
              const records = resp.data.data.diff || [];
              records.forEach((item, index) => {
                const code = item.f12 || '';
                const name = item.f14 || '';
                const price = (item.f2 || 0);
                const changePercent = (item.f3 || 0);
                const changeAmount = (item.f4 || 0);
                const volume = (item.f5 || 0);
                const amount = (item.f6 || 0);
                const amplitude = (item.f7 || 0);
                const turnover = (item.f8 || 0);
                const high = (item.f15 || 0);
                const low = (item.f16 || 0);
                const open = (item.f17 || 0);
                const prevClose = (item.f18 || 0);
                let board = 'sh';
                if (code.startsWith('0') || code.startsWith('002')) board = 'sz';
                else if (code.startsWith('3')) board = 'cyb';
                else if (code.startsWith('688')) board = 'kcb';
                else if (code.startsWith('8') || code.startsWith('4')) board = 'bj';

                let alertType = 'surge';
                let alertName = '涨幅居前';
                let alertIcon = '🚀';
                let alertColor = '#ef4444';

                if (changePercent >= 9.9) {
                  alertType = 'limit_up';
                  alertName = '涨停';
                  alertIcon = '�';
                  alertColor = '#ef4444';
                }

                alerts.push({
                  id: `gain_${index}`,
                  rank: index + 1,
                  stockCode: code,
                  stockName: name,
                  board: board,
                  alertType: alertType,
                  alertName: alertName,
                  alertIcon: alertIcon,
                  alertColor: alertColor,
                  price: price.toFixed(2),
                  changePercent: parseFloat(changePercent.toFixed(2)),
                  changeAmount: parseFloat(changeAmount.toFixed(2)),
                  volume: volume,
                  amount: (amount / 100000000).toFixed(2),
                  amplitude: parseFloat(amplitude.toFixed(2)),
                  turnover: parseFloat(turnover.toFixed(2)),
                  high: high.toFixed(2),
                  low: low.toFixed(2),
                  open: open.toFixed(2),
                  prevClose: prevClose.toFixed(2)
                });
              });
            }
            res();
          },
          fail: () => res()
        });
      });

      Promise.all([fetchTopGainers]).then(() => {
        alerts.sort((a, b) => b.changePercent - a.changePercent);
        resolve(alerts.slice(0, 50));
      });
    });
  },

  fetchAbnormalStocks() {
    return new Promise((resolve) => {
      const abnormalList = [];
      const now = new Date();
      const dateStr = now.getFullYear() + (now.getMonth() + 1).toString().padStart(2, '0') + now.getDate().toString().padStart(2, '0');

      const fetchBillboard = new Promise((res) => {
        const url = 'https://datacenter-web.eastmoney.com/api/data/v1/get?reportName=RPT_DAILYBILLBOARD_DETAILSNEW&columns=ALL&filter=(TRADE_DATE%3E%27' + dateStr + '%27)&pageNumber=1&pageSize=50&sortTypes=-1&sortColumns=TRADE_DATE&source=WEB&client=WEB&_=' + Date.now();
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
                const reason = item.EXPLANATION || '异常波动';
                const closePrice = item.CLOSE_PRICE || 0;
                const changeRate = item.CHANGE_RATE || 0;
                const accumAmount = item.ACCUM_AMOUNT || 0;
                const turnoverRate = item.TURNOVERRATE || 0;
                const tradeDate = item.TRADE_DATE || '';
                let board = 'unknown';
                if (code.startsWith('6')) board = 'sh';
                else if (code.startsWith('0') || code.startsWith('002')) board = 'sz';
                else if (code.startsWith('3')) board = 'cyb';
                else if (code.startsWith('688')) board = 'kcb';
                else if (code.startsWith('8') || code.startsWith('4')) board = 'bj';

                abnormalList.push({
                  id: `billboard_${index}`,
                  stockCode: code,
                  stockName: name,
                  board: board,
                  boardName: BOARD_TYPES.find(b => b.code === board)?.name || board,
                  reason: reason,
                  tradeDate: tradeDate ? tradeDate.split(' ')[0] || tradeDate.split('T')[0] : '',
                  price: closePrice ? closePrice.toFixed(2) : '--',
                  changePercent: changeRate ? parseFloat(changeRate.toFixed(2)) : 0,
                  amount: accumAmount ? (accumAmount / 100000000).toFixed(2) : '0',
                  turnoverRate: turnoverRate ? parseFloat(turnoverRate.toFixed(2)) : 0,
                  abnormalType: Math.abs(changeRate) > 15 ? 'severe' : 'normal',
                  abnormalTypeName: Math.abs(changeRate) > 15 ? '严重异常' : '异常波动'
                });
              });
            }
            res();
          },
          fail: () => res()
        });
      });

      Promise.all([fetchBillboard]).then(() => {
        abnormalList.sort((a, b) => Math.abs(b.changePercent) - Math.abs(a.changePercent));
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

  applyAbnormalFilter() {
    const { abnormalStocks, abnormalTypeFilter } = this.data;

    let filtered = [...abnormalStocks];

    if (abnormalTypeFilter !== 'all') {
      filtered = filtered.filter(a => a.abnormalType === abnormalTypeFilter);
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

  getChangeClass(value) {
    return parseFloat(value) >= 0 ? 'up' : 'down';
  },

  getChangePrefix(value) {
    return parseFloat(value) >= 0 ? '+' : '';
  }
});
