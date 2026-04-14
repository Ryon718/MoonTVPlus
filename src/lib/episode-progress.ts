const EPISODE_PROGRESS_PREFIX = 'moontv_episode_progress:';
const EPISODE_PROGRESS_MAX_ENTRIES = 200;
const EPISODE_PROGRESS_MAX_AGE_MS = 1000 * 60 * 60 * 24 * 120;

interface LocalEpisodeProgressRecord {
  playTime: number;
  totalTime: number;
  updatedAt: number;
}

function isBrowser() {
  return typeof window !== 'undefined';
}

function isQuotaExceededError(error: unknown) {
  return (
    error instanceof DOMException &&
    (error.name === 'QuotaExceededError' || error.name === 'NS_ERROR_DOM_QUOTA_REACHED')
  );
}

function parseEpisodeProgressRecord(raw: string | null): LocalEpisodeProgressRecord | null {
  if (!raw) {
    return null;
  }

  try {
    const parsed = JSON.parse(raw) as Partial<LocalEpisodeProgressRecord>;
    const playTime = Number(parsed.playTime);
    const totalTime = Number(parsed.totalTime);
    const updatedAt = Number(parsed.updatedAt);

    if (!Number.isFinite(playTime) || playTime <= 0) {
      return null;
    }

    return {
      playTime,
      totalTime: Number.isFinite(totalTime) && totalTime >= 0 ? totalTime : 0,
      updatedAt: Number.isFinite(updatedAt) && updatedAt > 0 ? updatedAt : 0,
    };
  } catch {
    return null;
  }
}

function collectEpisodeProgressEntries() {
  if (!isBrowser()) {
    return [];
  }

  const entries: Array<{ key: string; record: LocalEpisodeProgressRecord }> = [];
  const keys = Array.from({ length: localStorage.length }, (_, index) =>
    localStorage.key(index)
  ).filter((key): key is string => Boolean(key));

  for (const key of keys) {
    if (!key.startsWith(EPISODE_PROGRESS_PREFIX)) {
      continue;
    }

    const record = parseEpisodeProgressRecord(localStorage.getItem(key));
    if (!record) {
      localStorage.removeItem(key);
      continue;
    }

    entries.push({ key, record });
  }

  return entries;
}

export function getEpisodeProgressStorageKey(
  source: string,
  id: string,
  episodeIndex: number
) {
  return `${EPISODE_PROGRESS_PREFIX}${source}+${id}:${episodeIndex}`;
}

export function loadLocalEpisodeProgressRecord(
  source: string,
  id: string,
  episodeIndex: number
) {
  if (!isBrowser()) {
    return null;
  }

  const key = getEpisodeProgressStorageKey(source, id, episodeIndex);
  const record = parseEpisodeProgressRecord(localStorage.getItem(key));

  if (!record) {
    localStorage.removeItem(key);
    return null;
  }

  if (
    record.updatedAt > 0 &&
    Date.now() - record.updatedAt > EPISODE_PROGRESS_MAX_AGE_MS
  ) {
    localStorage.removeItem(key);
    return null;
  }

  return record;
}

export function loadLocalEpisodeProgress(
  source: string,
  id: string,
  episodeIndex: number
) {
  const record = loadLocalEpisodeProgressRecord(source, id, episodeIndex);
  if (!record) {
    return null;
  }

  return Number.isFinite(record.playTime) && record.playTime > 1
    ? Math.floor(record.playTime)
    : null;
}

export function pruneLocalEpisodeProgressStorage(maxEntries = EPISODE_PROGRESS_MAX_ENTRIES) {
  if (!isBrowser()) {
    return;
  }

  const now = Date.now();
  const entries = collectEpisodeProgressEntries();

  entries.forEach(({ key, record }) => {
    if (record.updatedAt > 0 && now - record.updatedAt > EPISODE_PROGRESS_MAX_AGE_MS) {
      localStorage.removeItem(key);
    }
  });

  const validEntries = entries
    .filter(({ record }) => record.updatedAt <= 0 || now - record.updatedAt <= EPISODE_PROGRESS_MAX_AGE_MS)
    .sort((a, b) => b.record.updatedAt - a.record.updatedAt);

  if (validEntries.length <= maxEntries) {
    return;
  }

  validEntries.slice(maxEntries).forEach(({ key }) => {
    localStorage.removeItem(key);
  });
}

export function saveLocalEpisodeProgress(
  source: string,
  id: string,
  episodeIndex: number,
  playTime: number,
  totalTime: number
) {
  if (!isBrowser() || !Number.isFinite(playTime) || playTime <= 0) {
    return;
  }

  const key = getEpisodeProgressStorageKey(source, id, episodeIndex);
  const payload = JSON.stringify({
    playTime: Math.floor(playTime),
    totalTime: Number.isFinite(totalTime) && totalTime >= 0 ? Math.floor(totalTime) : 0,
    updatedAt: Date.now(),
  });

  try {
    localStorage.setItem(key, payload);
    pruneLocalEpisodeProgressStorage();
  } catch (error) {
    if (!isQuotaExceededError(error)) {
      throw error;
    }

    pruneLocalEpisodeProgressStorage(Math.max(50, Math.floor(EPISODE_PROGRESS_MAX_ENTRIES / 2)));
    localStorage.setItem(key, payload);
    pruneLocalEpisodeProgressStorage();
  }
}
