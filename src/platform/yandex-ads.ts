interface YandexSdk {
  adv: {
    showRewardedVideo(options: { callbacks: {
      onRewarded: () => void;
      onClose: () => void;
      onError: () => void;
    } }): void;
    showFullscreenAdv(options: { callbacks: {
      onClose: (wasShown: boolean) => void;
      onError: () => void;
    } }): void;
  };
}

type Result = 'rewarded' | 'closed' | 'unavailable';
type YandexWindow = Window & { YaGames?: { init(): Promise<YandexSdk> } };
let sdk: Promise<YandexSdk | null> | undefined;

function loadSdk(): Promise<YandexSdk | null> {
  sdk ??= (async () => {
    const yandex = window as YandexWindow;
    if (!yandex.YaGames && import.meta.env.VITE_YANDEX_GAMES === '1') {
      await new Promise<void>((resolve, reject) => {
        const script = document.createElement('script');
        script.src = '/sdk.js';
        script.onload = () => resolve();
        script.onerror = () => { script.remove(); reject(new Error('SDK')); };
        document.head.append(script);
      });
    }
    return yandex.YaGames ? yandex.YaGames.init() : null;
  })().catch(() => {
    sdk = undefined;
    return null;
  });
  return sdk;
}

export function preloadAds(): void {
  void loadSdk();
}

export async function showFullscreenAd(): Promise<void> {
  try {
    // If loading the SDK takes too long, skip this opportunity instead of showing a late ad.
    let deadline: number | undefined;
    const ready = await Promise.race([
      loadSdk(),
      new Promise<null>(resolve => { deadline = window.setTimeout(() => resolve(null), 1500); }),
    ]).finally(() => window.clearTimeout(deadline));
    if (!ready) return;
    await new Promise<void>(resolve => {
      ready.adv.showFullscreenAdv({ callbacks: {
        onClose: () => resolve(),
        onError: () => resolve(),
      } });
    });
  } catch {
    // Night continues when the platform cannot show an ad.
  }
}

export async function showRewardedVideo(): Promise<Result> {
  try {
    const connection = await loadSdk();
    if (!connection) return 'unavailable';
    return await new Promise<Result>(resolve => {
      let rewarded = false;
      connection.adv.showRewardedVideo({ callbacks: {
        onRewarded: () => { rewarded = true; },
        onClose: () => resolve(rewarded ? 'rewarded' : 'closed'),
        onError: () => resolve(rewarded ? 'rewarded' : 'unavailable'),
      } });
    });
  } catch {
    return 'unavailable';
  }
}
