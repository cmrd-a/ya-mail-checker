import { jest } from '@jest/globals';
import { getPreference, DEFAULT_PREFERENCE } from './preferences.js';

// Setup chrome mock
const chromeMock = {
  storage: {
    local: {
      get: jest.fn(),
      set: jest.fn()
    }
  }
};
global.chrome = chromeMock;

describe('getPreference', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('should return DEFAULT_PREFERENCE and call set if no preference is stored', async () => {
    chromeMock.storage.local.get.mockResolvedValue({});

    const result = await getPreference();

    expect(chromeMock.storage.local.get).toHaveBeenCalledWith('preference');
    expect(chromeMock.storage.local.set).toHaveBeenCalledWith({ preference: DEFAULT_PREFERENCE });
    expect(result).toEqual(DEFAULT_PREFERENCE);
  });

  it('should merge stored preference with DEFAULT_PREFERENCE and not call set', async () => {
    const storedPreference = {
      interval: 15, // override
      showPopup: false // override
    };
    chromeMock.storage.local.get.mockResolvedValue({ preference: storedPreference });

    const result = await getPreference();

    expect(chromeMock.storage.local.get).toHaveBeenCalledWith('preference');
    expect(chromeMock.storage.local.set).not.toHaveBeenCalled();

    const expectedMergedPreference = {
      ...DEFAULT_PREFERENCE,
      ...storedPreference
    };
    expect(result).toEqual(expectedMergedPreference);
  });
});
