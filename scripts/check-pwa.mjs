import { readFile } from 'node:fs/promises'

const manifest = JSON.parse(await readFile(new URL('../public/manifest.webmanifest', import.meta.url), 'utf8'))
const serviceWorker = await readFile(new URL('../public/sw.js', import.meta.url), 'utf8')

if (manifest.name !== 'IPCN Conecta') throw new Error('Nome inválido no manifesto PWA.')
if (!Array.isArray(manifest.icons) || manifest.icons.length < 2) throw new Error('Ícones PWA ausentes.')
if (!serviceWorker.includes("url.pathname.startsWith('/api/')")) throw new Error('O Service Worker deve ignorar as APIs.')
if (serviceWorker.includes('firestore.googleapis.com')) throw new Error('O Service Worker não pode armazenar dados do Firestore.')

console.log('Manifesto e política de cache do PWA validados.')
