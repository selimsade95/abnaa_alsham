import api, { API_MUTATION_EVENT } from "@/lib/api";

describe("API mutation progress", () => {
  let originalAdapter;
  const progress = [];
  const handleProgress = (event) => progress.push(event.detail);

  beforeEach(() => {
    originalAdapter = api.defaults.adapter;
    progress.length = 0;
    window.addEventListener(API_MUTATION_EVENT, handleProgress);
    localStorage.clear();
  });

  afterEach(() => {
    api.defaults.adapter = originalAdapter;
    window.removeEventListener(API_MUTATION_EVENT, handleProgress);
  });

  test("tracks a mutation until its response completes", async () => {
    let finishRequest;
    let adapterStarted;
    const started = new Promise((resolve) => {
      adapterStarted = resolve;
    });
    const pending = new Promise((resolve) => {
      finishRequest = resolve;
    });

    api.defaults.adapter = async (config) => {
      adapterStarted();
      await pending;
      return {
        config,
        data: { ok: true },
        headers: {},
        status: 200,
        statusText: "OK",
      };
    };

    const request = api.post("/test", {});
    await started;
    expect(progress).toEqual([1]);

    finishRequest();
    await expect(request).resolves.toMatchObject({ data: { ok: true } });
    expect(progress).toEqual([1, -1]);
  });

  test("ends mutation progress when a request fails", async () => {
    let adapterStarted;
    const started = new Promise((resolve) => {
      adapterStarted = resolve;
    });
    api.defaults.adapter = async (config) => {
      adapterStarted();
      throw Object.assign(new Error("Network error"), { config });
    };

    const request = api.delete("/test");
    await started;
    expect(progress).toEqual([1]);
    await expect(request).rejects.toThrow("Network error");
    expect(progress).toEqual([1, -1]);
  });
});
