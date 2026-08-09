/**
 * Lightweight speaker voiceprint.
 *
 * The desktop original runs a WeSpeaker embedding model; in the browser we use
 * a self-contained DSP embedding (log-mel statistics) so nothing has to be
 * downloaded and everything stays on-device. It is strong enough to tell two
 * speakers apart on the same microphone, which is what the session needs.
 */

const FFT_SIZE = 512;
const HOP = 256;
const N_MELS = 24;
const MEL_LOW = 80;
const MEL_HIGH = 4000;
const RATE = 16000;
const VOICED_RMS = 0.015;

export const EMBEDDING_DIM = N_MELS * 2;
export const VOICEPRINT_KEY = "kibo.voiceprint.v1";

/** Iterative radix-2 FFT, in place on the given real/imag buffers. */
function fft(re: Float32Array, im: Float32Array) {
  const n = re.length;
  for (let i = 1, j = 0; i < n; i += 1) {
    let bit = n >> 1;
    for (; j & bit; bit >>= 1) j ^= bit;
    j ^= bit;
    if (i < j) {
      const tr = re[i]!;
      re[i] = re[j]!;
      re[j] = tr;
      const ti = im[i]!;
      im[i] = im[j]!;
      im[j] = ti;
    }
  }
  for (let len = 2; len <= n; len <<= 1) {
    const ang = (-2 * Math.PI) / len;
    const wr = Math.cos(ang);
    const wi = Math.sin(ang);
    for (let i = 0; i < n; i += len) {
      let cr = 1;
      let ci = 0;
      for (let k = 0; k < len / 2; k += 1) {
        const ar = re[i + k]!;
        const ai = im[i + k]!;
        const br = re[i + k + len / 2]!;
        const bi = im[i + k + len / 2]!;
        const tr = br * cr - bi * ci;
        const ti = br * ci + bi * cr;
        re[i + k] = ar + tr;
        im[i + k] = ai + ti;
        re[i + k + len / 2] = ar - tr;
        im[i + k + len / 2] = ai - ti;
        const ncr = cr * wr - ci * wi;
        ci = cr * wi + ci * wr;
        cr = ncr;
      }
    }
  }
}

const hzToMel = (hz: number) => 2595 * Math.log10(1 + hz / 700);
const melToHz = (mel: number) => 700 * (10 ** (mel / 2595) - 1);

/** Triangular mel filterbank over the FFT_SIZE/2+1 power bins. */
const MEL_BANK = (() => {
  const bins = FFT_SIZE / 2 + 1;
  const points: number[] = [];
  const lo = hzToMel(MEL_LOW);
  const hi = hzToMel(MEL_HIGH);
  for (let i = 0; i < N_MELS + 2; i += 1) {
    const hz = melToHz(lo + ((hi - lo) * i) / (N_MELS + 1));
    points.push(Math.floor(((FFT_SIZE + 1) * hz) / RATE));
  }
  return Array.from({ length: N_MELS }, (_, m) => {
    const filter = new Float32Array(bins);
    const left = points[m]!;
    const center = points[m + 1]!;
    const right = points[m + 2]!;
    for (let k = left; k < center; k += 1) {
      if (k >= 0 && k < bins && center > left) filter[k] = (k - left) / (center - left);
    }
    for (let k = center; k < right; k += 1) {
      if (k >= 0 && k < bins && right > center) filter[k] = (right - k) / (right - center);
    }
    return filter;
  });
})();

const HANN = Float32Array.from({ length: FFT_SIZE }, (_, i) =>
  0.5 * (1 - Math.cos((2 * Math.PI * i) / (FFT_SIZE - 1))),
);

function frameRms(samples: Float32Array, offset: number) {
  let sum = 0;
  for (let i = 0; i < FFT_SIZE; i += 1) sum += (samples[offset + i] ?? 0) ** 2;
  return Math.sqrt(sum / FFT_SIZE);
}

/**
 * Build a speaker embedding from 16 kHz mono PCM. Returns null when the audio
 * has too little voiced material to characterise a voice.
 */
export function embedVoice(samples: Float32Array): Float32Array | null {
  const frames: Float32Array[] = [];
  const re = new Float32Array(FFT_SIZE);
  const im = new Float32Array(FFT_SIZE);

  for (let offset = 0; offset + FFT_SIZE <= samples.length; offset += HOP) {
    if (frameRms(samples, offset) < VOICED_RMS) continue;
    for (let i = 0; i < FFT_SIZE; i += 1) {
      re[i] = (samples[offset + i] ?? 0) * (HANN[i] ?? 0);
      im[i] = 0;
    }
    fft(re, im);

    const bins = FFT_SIZE / 2 + 1;
    const power = new Float32Array(bins);
    for (let k = 0; k < bins; k += 1) power[k] = re[k]! ** 2 + im[k]! ** 2;

    const logMel = new Float32Array(N_MELS);
    for (let m = 0; m < N_MELS; m += 1) {
      const filter = MEL_BANK[m]!;
      let energy = 0;
      for (let k = 0; k < bins; k += 1) energy += power[k]! * filter[k]!;
      logMel[m] = Math.log(energy + 1e-10);
    }
    frames.push(logMel);
  }

  // Fewer than ~0.5 s of voiced audio is not a usable voiceprint.
  if (frames.length < 24) return null;

  const mean = new Float32Array(N_MELS);
  for (const f of frames) for (let m = 0; m < N_MELS; m += 1) mean[m] = mean[m]! + f[m]!;
  for (let m = 0; m < N_MELS; m += 1) mean[m] = mean[m]! / frames.length;

  const std = new Float32Array(N_MELS);
  for (const f of frames) for (let m = 0; m < N_MELS; m += 1) std[m] = std[m]! + (f[m]! - mean[m]!) ** 2;
  for (let m = 0; m < N_MELS; m += 1) std[m] = Math.sqrt(std[m]! / frames.length);

  // Remove overall loudness (channel gain) so distance reflects timbre.
  let avg = 0;
  for (let m = 0; m < N_MELS; m += 1) avg += mean[m]!;
  avg /= N_MELS;

  const vec = new Float32Array(EMBEDDING_DIM);
  for (let m = 0; m < N_MELS; m += 1) {
    vec[m] = mean[m]! - avg;
    vec[N_MELS + m] = std[m]!;
  }
  return l2normalize(vec);
}

export function l2normalize(vec: Float32Array) {
  let norm = 0;
  for (let i = 0; i < vec.length; i += 1) norm += vec[i]! ** 2;
  norm = Math.sqrt(norm) || 1;
  const out = new Float32Array(vec.length);
  for (let i = 0; i < vec.length; i += 1) out[i] = vec[i]! / norm;
  return out;
}

export function cosine(a: Float32Array, b: Float32Array) {
  let dot = 0;
  for (let i = 0; i < Math.min(a.length, b.length); i += 1) dot += a[i]! * b[i]!;
  return dot;
}

/** Blend a new observation into a running centroid. */
export function updateCentroid(centroid: Float32Array | null, sample: Float32Array, weight = 0.3) {
  if (!centroid) return sample;
  const merged = new Float32Array(sample.length);
  for (let i = 0; i < sample.length; i += 1) {
    merged[i] = centroid[i]! * (1 - weight) + sample[i]! * weight;
  }
  return l2normalize(merged);
}

/* ---------------------------------------------------------------- storage */

export function loadVoiceprint(): Float32Array | null {
  if (typeof localStorage === "undefined") return null;
  try {
    const raw = localStorage.getItem(VOICEPRINT_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as number[];
    if (!Array.isArray(parsed) || parsed.length !== EMBEDDING_DIM) return null;
    return Float32Array.from(parsed);
  } catch {
    return null;
  }
}

export function saveVoiceprint(vec: Float32Array) {
  if (typeof localStorage === "undefined") return;
  localStorage.setItem(VOICEPRINT_KEY, JSON.stringify(Array.from(vec)));
  window.dispatchEvent(new Event("kibo:voiceprint"));
}

export function clearVoiceprint() {
  if (typeof localStorage === "undefined") return;
  localStorage.removeItem(VOICEPRINT_KEY);
  window.dispatchEvent(new Event("kibo:voiceprint"));
}

/**
 * Nearest-centroid speaker decision with hysteresis. When the other person's
 * centroid is not known yet we fall back to an absolute similarity threshold.
 */
export function classifySpeaker(
  embedding: Float32Array,
  enrolled: Float32Array,
  otherCentroid: Float32Array | null,
  previous: "user" | "other" | null,
): { speaker: "user" | "other"; confident: boolean } {
  const toUser = cosine(embedding, enrolled);
  if (otherCentroid) {
    const toOther = cosine(embedding, otherCentroid);
    const margin = toUser - toOther;
    if (Math.abs(margin) < 0.02 && previous) return { speaker: previous, confident: false };
    return { speaker: margin > 0 ? "user" : "other", confident: Math.abs(margin) > 0.05 };
  }
  if (toUser > 0.9) return { speaker: "user", confident: true };
  if (toUser < 0.75) return { speaker: "other", confident: true };
  return { speaker: previous ?? "user", confident: false };
}
