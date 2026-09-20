import { jest } from '@jest/globals';

// Setup chrome mock
const chromeMock = {
  action: {
    setTitle: jest.fn(),
    setBadgeBackgroundColor: jest.fn(),
    setBadgeText: jest.fn(),
    setPopup: jest.fn(),
    onClicked: { addListener: jest.fn() }
  },
  alarms: {
    clear: jest.fn().mockResolvedValue(),
    create: jest.fn(),
    get: jest.fn().mockResolvedValue(null),
    onAlarm: { addListener: jest.fn() }
  },
  i18n: {
    getUILanguage: jest.fn().mockReturnValue("en")
  },
  notifications: {
    create: jest.fn(),
    clear: jest.fn(),
    onClicked: { addListener: jest.fn() }
  },
  runtime: {
    getURL: jest.fn((path) => `chrome-extension://mock-id/${path}`),
    onInstalled: { addListener: jest.fn() },
    onStartup: { addListener: jest.fn() },
    onMessage: { addListener: jest.fn() },
    getManifest: jest.fn(() => ({ version: "1.0.0" }))
  },
  storage: {
    local: {
      get: jest.fn().mockResolvedValue({ preference: {} }),
      set: jest.fn().mockResolvedValue()
    }
  },
  tabs: {
    query: jest.fn().mockResolvedValue([]),
    update: jest.fn().mockResolvedValue({ windowId: 1 }),
    create: jest.fn().mockResolvedValue({ id: 2 })
  },
  windows: {
    update: jest.fn().mockResolvedValue()
  },
  offscreen: {
    createDocument: jest.fn().mockResolvedValue(),
    hasDocument: jest.fn().mockResolvedValue(false),
    closeDocument: jest.fn().mockResolvedValue()
  }
};

global.chrome = chromeMock;
global.fetch = jest.fn().mockResolvedValue({
  json: jest.fn().mockResolvedValue({
    statusUnread: { message: "Unread" },
    statusDisconnected: { message: "Disconnected" }
  }),
  text: jest.fn().mockResolvedValue("mock html")
});
global.OffscreenCanvas = class OffscreenCanvas {
  constructor() {}
  getContext() {
    return {
      drawImage: jest.fn(),
      getImageData: jest.fn(() => ({ data: [] })),
      clearRect: jest.fn()
    };
  }
};

global.matchMedia = jest.fn().mockReturnValue({ matches: false, addEventListener: jest.fn(), removeEventListener: jest.fn() });

// We'll capture listeners to trigger them later
let onMessageListener;
let onAlarmListener;
let onInstalledListener;
let editionMock;

describe('background.js', () => {

  beforeAll(async () => {
    // Capture listeners
    chromeMock.runtime.onMessage.addListener.mockImplementation((listener) => {
      onMessageListener = listener;
    });
    chromeMock.alarms.onAlarm.addListener.mockImplementation((listener) => {
      onAlarmListener = listener;
    });
    chromeMock.runtime.onInstalled.addListener.mockImplementation((listener) => {
      onInstalledListener = listener;
    });

    // Mock edition.js before importing background.js
    jest.unstable_mockModule('./edition.js', () => ({
      analyzeHTML: jest.fn(),
      analyzeMessagesHTML: jest.fn(),
      checkEmailURL: ['http://mock.test'],
      emailURL: ['http://mock.test'],
      matchPattern: ['*://mock.test/*'],
      siteNames: ['mock.test']
    }));

    editionMock = await import('./edition.js');
    await import('./background.js');

    // Wait for the initialize() triggered on load to complete
    await new Promise((resolve) => setTimeout(resolve, 50));
  });

  beforeEach(() => {
    jest.clearAllMocks();
    global.fetch.mockResolvedValue({
      json: jest.fn().mockResolvedValue({}),
      text: jest.fn().mockResolvedValue("mock html")
    });
  });

  test('setup mock env', () => {
    expect(chrome.action.setTitle).toBeDefined();
  });

  test('initialize sets up alarm and action', async () => {
    // initialize is triggered by onInstalled or onStartup manually for testing
    if (onInstalledListener) {
      await onInstalledListener();
    }
    await new Promise((resolve) => setTimeout(resolve, 50));

    expect(chrome.storage.local.get).toHaveBeenCalledWith("preference");
    expect(chrome.action.setPopup).toHaveBeenCalled();
    expect(chrome.alarms.get).toHaveBeenCalledWith("checkMail");
  });

  test('checkNow success sets unread state', async () => {
    chrome.storage.local.get.mockResolvedValue({ preference: { site: 0, showToolbarNumber: true, enableNotifications: false } });
    editionMock.analyzeHTML.mockReturnValue(5); // 5 unread messages

    global.fetch.mockResolvedValue({
      json: jest.fn().mockResolvedValue({}),
      text: jest.fn().mockResolvedValue("mock html")
    });

    // Trigger checkNow via message
    if (onMessageListener) {
      onMessageListener({ type: "checkNow" }, {}, jest.fn());
    }

    await new Promise((resolve) => setTimeout(resolve, 50));

    expect(chrome.action.setBadgeBackgroundColor).toHaveBeenCalled();
    expect(chrome.action.setBadgeText).toHaveBeenCalledWith({ text: "5" });
  });

  test('checkNow disconnected state', async () => {
    chrome.storage.local.get.mockResolvedValue({ preference: { site: 0 } });
    editionMock.analyzeHTML.mockReturnValue(-3); // disconnected

    global.fetch.mockResolvedValue({
      json: jest.fn().mockResolvedValue({}),
      text: jest.fn().mockResolvedValue("mock html")
    });

    if (onMessageListener) {
      onMessageListener({ type: "checkNow" }, {}, jest.fn());
    }

    await new Promise((resolve) => setTimeout(resolve, 50));

    expect(chrome.action.setBadgeText).toHaveBeenCalledWith({ text: "" });
  });

  test('openMail creates new tab', async () => {
    chrome.storage.local.get.mockResolvedValue({ preference: { site: 0, openBehavior: 1, resetCounter: false } });
    chrome.tabs.query.mockResolvedValue([]); // No matching tabs

    if (onMessageListener) {
      onMessageListener({ type: "openMail" }, {}, jest.fn());
    }

    await new Promise((resolve) => setTimeout(resolve, 50));

    expect(chrome.tabs.create).toHaveBeenCalledWith(expect.objectContaining({ url: 'http://mock.test', active: true }));
  });

  test('fetchUnreadCount correctly loops and parses result', async () => {
    chrome.storage.local.get.mockResolvedValue({ preference: { site: 0, showToolbarNumber: true, enableNotifications: false } });

    // Test the logic of following redirects
    editionMock.analyzeHTML
      .mockReturnValueOnce("GET http://mock.test/redirect")
      .mockReturnValueOnce(2);

    global.fetch.mockResolvedValue({
      json: jest.fn().mockResolvedValue({}),
      text: jest.fn().mockResolvedValue("mock html")
    });

    if (onMessageListener) {
      onMessageListener({ type: "checkNow" }, {}, jest.fn());
    }

    await new Promise((resolve) => setTimeout(resolve, 50));

    expect(global.fetch.mock.calls.length).toBeGreaterThanOrEqual(2);
    expect(chrome.action.setBadgeText).toHaveBeenCalledWith({ text: "2" });
  });
});
