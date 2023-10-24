function _isLocalStorageAvailable(): boolean {
  try {
    localStorage.setItem("test", "test");
    localStorage.removeItem("test");
    return true;
  } catch (e) {
    return false;
  }
}

export const isLocalStorageAvailable = _isLocalStorageAvailable();
