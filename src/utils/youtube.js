let youtubeIframeApiPromise = null;

export const resolveYouTubeTarget = (rawInput) => {
  const input = String(rawInput || '').trim();
  if (!input) return null;

  if (/^UC[\w-]{22}$/.test(input)) {
    return {
      type: 'playlist',
      value: `UU${input.slice(2)}`,
      canonicalUrl: `https://www.youtube.com/channel/${input}`,
    };
  }

  if (/^(PL|UU|OLAK5uy_)[\w-]+$/.test(input)) {
    return {
      type: 'playlist',
      value: input,
      canonicalUrl: `https://www.youtube.com/playlist?list=${input}`,
    };
  }

  if (/^[\w-]{11}$/.test(input)) {
    return {
      type: 'video',
      value: input,
      canonicalUrl: `https://www.youtube.com/watch?v=${input}`,
    };
  }

  const normalizedInput = /^https?:\/\//i.test(input) ? input : `https://${input}`;

  let parsedUrl;
  try {
    parsedUrl = new URL(normalizedInput);
  } catch {
    return null;
  }

  const host = parsedUrl.hostname.replace(/^www\./, '').toLowerCase();

  if (host === 'youtu.be') {
    const videoId = parsedUrl.pathname.split('/').filter(Boolean)[0];
    if (!videoId) return null;
    return {
      type: 'video',
      value: videoId,
      canonicalUrl: `https://youtu.be/${videoId}`,
    };
  }

  const allowedHosts = ['youtube.com', 'm.youtube.com', 'music.youtube.com'];
  if (!allowedHosts.includes(host)) return null;

  const listId = parsedUrl.searchParams.get('list');
  if (listId) {
    return {
      type: 'playlist',
      value: listId,
      canonicalUrl: `https://www.youtube.com/playlist?list=${listId}`,
    };
  }

  const videoId = parsedUrl.searchParams.get('v');
  if (videoId) {
    return {
      type: 'video',
      value: videoId,
      canonicalUrl: `https://www.youtube.com/watch?v=${videoId}`,
    };
  }

  const parts = parsedUrl.pathname.split('/').filter(Boolean);
  if (parts[0] === 'channel' && /^UC[\w-]{22}$/.test(parts[1] || '')) {
    const channelId = parts[1];
    return {
      type: 'playlist',
      value: `UU${channelId.slice(2)}`,
      canonicalUrl: `https://www.youtube.com/channel/${channelId}`,
    };
  }

  if ((parts[0] === 'shorts' || parts[0] === 'embed' || parts[0] === 'live') && parts[1]) {
    return {
      type: 'video',
      value: parts[1],
      canonicalUrl: `https://www.youtube.com/watch?v=${parts[1]}`,
    };
  }

  return null;
};

export const cueYouTubeTarget = (player, target) => {
  if (!player || !target) return;

  if (target.type === 'playlist' && typeof player.cuePlaylist === 'function') {
    player.cuePlaylist({ listType: 'playlist', list: target.value, index: 0 });
    return;
  }

  if (target.type === 'video' && typeof player.cueVideoById === 'function') {
    player.cueVideoById(target.value);
  }
};

export const loadYouTubeTarget = (player, target) => {
  if (!player || !target) return;

  if (target.type === 'playlist' && typeof player.loadPlaylist === 'function') {
    player.loadPlaylist({ listType: 'playlist', list: target.value, index: 0 });
    return;
  }

  if (target.type === 'video' && typeof player.loadVideoById === 'function') {
    player.loadVideoById(target.value);
  }
};

export const loadYouTubeIframeAPI = () => {
  if (typeof window === 'undefined') return Promise.reject(new Error('browser-only'));
  if (window.YT && typeof window.YT.Player === 'function') return Promise.resolve(window.YT);
  if (youtubeIframeApiPromise) return youtubeIframeApiPromise;

  youtubeIframeApiPromise = new Promise((resolve, reject) => {
    const previousReadyHandler = window.onYouTubeIframeAPIReady;
    window.onYouTubeIframeAPIReady = () => {
      if (typeof previousReadyHandler === 'function') previousReadyHandler();
      if (window.YT && typeof window.YT.Player === 'function') {
        resolve(window.YT);
        return;
      }
      youtubeIframeApiPromise = null;
      reject(new Error('youtube-api-missing'));
    };

    const existingScript = document.querySelector('script[data-maestro-youtube-api="true"]');
    if (existingScript) return;

    const script = document.createElement('script');
    script.src = 'https://www.youtube.com/iframe_api';
    script.async = true;
    script.dataset.maestroYoutubeApi = 'true';
    script.onerror = () => {
      youtubeIframeApiPromise = null;
      reject(new Error('youtube-api-load-failed'));
    };
    document.head.appendChild(script);
  });

  return youtubeIframeApiPromise;
};
