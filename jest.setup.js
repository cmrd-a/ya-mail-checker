global.chrome = {
    i18n: {
        getUILanguage: jest.fn()
    },
    runtime: {
        onInstalled: { addListener: jest.fn() },
        onStartup: { addListener: jest.fn() },
        onMessage: { addListener: jest.fn() },
        getURL: jest.fn()
    },
    alarms: {
        onAlarm: { addListener: jest.fn() },
        create: jest.fn(),
        clearAll: jest.fn()
    },
    action: {
        onClicked: { addListener: jest.fn() },
        setBadgeText: jest.fn(),
        setBadgeBackgroundColor: jest.fn(),
        setTitle: jest.fn(),
        setPopup: jest.fn()
    },
    storage: {
        local: {
            get: jest.fn().mockResolvedValue({}),
            set: jest.fn()
        }
    },
    tabs: {
        create: jest.fn(),
        update: jest.fn(),
        query: jest.fn().mockResolvedValue([])
    },
    windows: {
        update: jest.fn()
    },
    offscreen: {
        createDocument: jest.fn().mockResolvedValue(),
        closeDocument: jest.fn().mockResolvedValue()
    }
};

global.OffscreenCanvas = class {
    constructor() {}
    getContext() {
        return {
            drawImage: jest.fn(),
            getImageData: jest.fn(() => ({ data: [] })),
            clearRect: jest.fn(),
            putImageData: jest.fn()
        };
    }
};

global.fetch = jest.fn();
global.chrome.notifications = {
    onClicked: { addListener: jest.fn() },
    clear: jest.fn()
};
global.chrome.alarms.get = jest.fn().mockResolvedValue(null);
