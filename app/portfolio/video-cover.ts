export type VideoCover = { imageDataUrl: string; frameSeconds: number };

function waitForVideo(video: HTMLVideoElement, event: string, ready: () => boolean, signal?: AbortSignal) {
  if (signal?.aborted) return Promise.reject(new DOMException('Cancelado', 'AbortError'));
  if (ready()) return Promise.resolve();
  return new Promise<void>((resolve, reject) => {
    const cleanup = () => {
      clearTimeout(timeout);
      video.removeEventListener(event, done);
      video.removeEventListener('error', fail);
      signal?.removeEventListener('abort', cancel);
    };
    const done = () => { cleanup(); resolve(); };
    const fail = () => { cleanup(); reject(new Error('Não consegui abrir este vídeo para criar a capa.')); };
    const cancel = () => { cleanup(); reject(new DOMException('Cancelado', 'AbortError')); };
    const timeout = setTimeout(fail, 45_000);
    video.addEventListener(event, done, { once: true });
    video.addEventListener('error', fail, { once: true });
    signal?.addEventListener('abort', cancel, { once: true });
  });
}

export function automaticFrame(duration: number) {
  return Math.min(3, duration * 0.1);
}

export async function captureVideoCover(video: HTMLVideoElement, signal?: AbortSignal): Promise<VideoCover> {
  await waitForVideo(video, 'seeked', () => !video.seeking && video.readyState >= 2, signal);
  if (!video.videoWidth || !video.videoHeight) throw new Error('Aguarde o vídeo carregar para escolher a capa.');
  const canvas = document.createElement('canvas');
  canvas.width = 540; canvas.height = 960;
  const context = canvas.getContext('2d');
  if (!context) throw new Error('Não consegui criar a capa neste navegador.');
  context.fillStyle = '#080908'; context.fillRect(0, 0, canvas.width, canvas.height);
  const scale = Math.min(canvas.width / video.videoWidth, canvas.height / video.videoHeight);
  const width = video.videoWidth * scale, height = video.videoHeight * scale;
  context.drawImage(video, (canvas.width - width) / 2, (canvas.height - height) / 2, width, height);
  return { imageDataUrl: canvas.toDataURL('image/jpeg', 0.82), frameSeconds: video.currentTime };
}

export async function createAutomaticCover(source: File | string, signal?: AbortSignal) {
  const video = document.createElement('video');
  const localUrl = typeof source === 'string' ? null : URL.createObjectURL(source);
  video.crossOrigin = 'anonymous'; video.preload = 'auto'; video.muted = true; video.playsInline = true;
  try {
    const metadata = waitForVideo(video, 'loadedmetadata', () => video.readyState >= 1, signal);
    video.src = localUrl || source as string;
    await metadata;
    if (!Number.isFinite(video.duration) || video.duration <= 0) throw new Error('Não consegui ler a duração do vídeo.');
    const ready = waitForVideo(video, 'seeked', () => false, signal);
    video.currentTime = automaticFrame(video.duration);
    await ready;
    return await captureVideoCover(video, signal);
  } finally {
    video.removeAttribute('src'); video.load();
    if (localUrl) URL.revokeObjectURL(localUrl);
  }
}

export async function saveVideoCover(itemId: string, cover: VideoCover, automatic = false, signal?: AbortSignal) {
  const response = await fetch('/api/portfolio/cover', {
    method: 'POST', headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ itemId, ...cover, automatic }), signal,
  });
  const data = await response.json();
  if (!response.ok) throw new Error(data.error || 'Não foi possível salvar a capa.');
  return data as { coverUrl: string; coverFrameSeconds: number };
}
