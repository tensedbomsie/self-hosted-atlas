const express = require('express')
const { exec, spawn } = require('child_process')
const fs = require('fs')
const os = require('os')
const path = require('path')
const crypto = require('crypto')
const multer = require('multer')

const PORT = process.env.PORT || 3131
const TOKEN_FILE = path.join(__dirname, '.token')
const APPS_FILE = path.join(__dirname, 'apps.json')
const SCENES_FILE = path.join(__dirname, 'scenes.json')

// OneDrive silently redirects Desktop/Documents/Pictures on many Windows setups.
// Detect the real location per-machine instead of assuming a fixed path.
function detectSpecialFolder(name) {
  const oneDrivePath = path.join(os.homedir(), 'OneDrive', name)
  if (fs.existsSync(oneDrivePath)) return oneDrivePath
  return path.join(os.homedir(), name)
}

const UPLOAD_DIR = path.join(detectSpecialFolder('Desktop'), 'ATLAS Uploads')
if (!fs.existsSync(UPLOAD_DIR)) fs.mkdirSync(UPLOAD_DIR, { recursive: true })

const FILE_ROOTS = {
  desktop: { label: 'Desktop', icon: '🖥️', path: detectSpecialFolder('Desktop') },
  downloads: { label: 'Downloads', icon: '⬇️', path: detectSpecialFolder('Downloads') },
  documents: { label: 'Documents', icon: '📄', path: detectSpecialFolder('Documents') },
  pictures: { label: 'Pictures', icon: '🖼️', path: detectSpecialFolder('Pictures') },
}

function resolveSafePath(rootId, sub) {
  const root = FILE_ROOTS[rootId]
  if (!root) return null
  const base = path.resolve(root.path)
  const target = path.resolve(base, sub || '.')
  if (target !== base && !target.startsWith(base + path.sep)) return null
  return { base, target }
}

const upload = multer({
  storage: multer.diskStorage({
    destination: (req, file, cb) => cb(null, UPLOAD_DIR),
    filename: (req, file, cb) => {
      const stamp = new Date().toISOString().replace(/[:.]/g, '-')
      const safeName = file.originalname.replace(/[^a-zA-Z0-9._-]/g, '_')
      cb(null, `${stamp}_${safeName}`)
    }
  }),
  limits: { fileSize: 100 * 1024 * 1024 } // 100MB
})

function loadToken() {
  if (fs.existsSync(TOKEN_FILE)) return fs.readFileSync(TOKEN_FILE, 'utf8').trim()
  const token = crypto.randomBytes(8).toString('hex')
  fs.writeFileSync(TOKEN_FILE, token)
  return token
}

function loadApps() {
  if (!fs.existsSync(APPS_FILE)) return []
  return JSON.parse(fs.readFileSync(APPS_FILE, 'utf8'))
}

function saveApps(apps) {
  fs.writeFileSync(APPS_FILE, JSON.stringify(apps, null, 2))
}

function slugify(label) {
  const base = label.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '') || 'app'
  return base
}

function uniqueId(base, existingIds) {
  if (!existingIds.includes(base)) return base
  let n = 2
  while (existingIds.includes(`${base}-${n}`)) n++
  return `${base}-${n}`
}

const EVENTS = []
function logEvent(icon, text) {
  EVENTS.unshift({ time: Date.now(), icon, text })
  if (EVENTS.length > 20) EVENTS.length = 20
}
logEvent('⚡', 'ATLAS server started')

const CONTROL_LABELS = {
  'sleep': 'PC put to sleep',
  'screen-off': 'Screen turned off',
  'mute': 'Audio muted',
  'volume-up': 'Volume up',
  'volume-down': 'Volume down',
  'brightness-up': 'Brightness up',
  'brightness-down': 'Brightness down',
}

function localIPs() {
  const nets = os.networkInterfaces()
  const ips = []
  for (const name of Object.keys(nets)) {
    for (const net of nets[name]) {
      if (net.family === 'IPv4' && !net.internal) ips.push(net.address)
    }
  }
  return ips
}

const TOKEN = loadToken()
const app = express()
app.use(express.static(path.join(__dirname, 'public')))
app.use(express.json())

function tmpClipFile() {
  return path.join(os.tmpdir(), `atlas-clip-${crypto.randomBytes(4).toString('hex')}.txt`)
}

function setClipboard(text) {
  return new Promise((resolve, reject) => {
    const tmp = tmpClipFile()
    fs.writeFileSync(tmp, text, 'utf8')
    exec(`powershell -NoProfile -Command "Set-Clipboard -Value (Get-Content -Raw -Encoding UTF8 -LiteralPath '${tmp}')"`, (err) => {
      fs.unlink(tmp, () => {})
      if (err) return reject(err)
      resolve()
    })
  })
}

function getClipboard() {
  return new Promise((resolve, reject) => {
    const tmp = tmpClipFile()
    exec(`powershell -NoProfile -Command "Get-Clipboard -Raw | Out-File -Encoding UTF8 -NoNewline -FilePath '${tmp}'"`, (err) => {
      if (err) return reject(err)
      let text = ''
      try {
        const raw = fs.readFileSync(tmp, 'utf8')
        text = raw.charCodeAt(0) === 0xFEFF ? raw.slice(1) : raw
      } catch (e) {}
      fs.unlink(tmp, () => {})
      resolve(text)
    })
  })
}

function checkToken(req, res, next) {
  if (req.query.token !== TOKEN) return res.status(401).json({ error: 'invalid token' })
  next()
}

app.get('/api/apps', checkToken, (req, res) => {
  res.set('Cache-Control', 'no-store')
  const apps = loadApps().map(({ id, label, icon }) => ({ id, label, icon }))
  res.json(apps)
})

app.get('/api/apps/:id', checkToken, (req, res) => {
  const target = loadApps().find((a) => a.id === req.params.id)
  if (!target) return res.status(404).json({ error: 'unknown shortcut' })
  res.json(target)
})

app.post('/api/apps', checkToken, (req, res) => {
  const { label, icon, path: appPath, process: processName } = req.body || {}
  if (!label || !appPath) return res.status(400).json({ error: 'label and path required' })
  const apps = loadApps()
  const id = uniqueId(slugify(label), apps.map((a) => a.id))
  const app_ = { id, label, icon: icon || '🚀', path: appPath, process: processName || '' }
  apps.push(app_)
  saveApps(apps)
  res.json(app_)
})

app.put('/api/apps/:id', checkToken, (req, res) => {
  const apps = loadApps()
  const idx = apps.findIndex((a) => a.id === req.params.id)
  if (idx === -1) return res.status(404).json({ error: 'unknown shortcut' })
  const { label, icon, path: appPath, process: processName } = req.body || {}
  if (!label || !appPath) return res.status(400).json({ error: 'label and path required' })
  apps[idx] = { ...apps[idx], label, icon: icon || apps[idx].icon, path: appPath, process: processName ?? apps[idx].process }
  saveApps(apps)
  res.json(apps[idx])
})

app.delete('/api/apps/:id', checkToken, (req, res) => {
  const apps = loadApps()
  const next = apps.filter((a) => a.id !== req.params.id)
  if (next.length === apps.length) return res.status(404).json({ error: 'unknown shortcut' })
  saveApps(next)
  res.json({ ok: true })
})

app.post('/api/run/:id', checkToken, (req, res) => {
  const apps = loadApps()
  const app = apps.find((a) => a.id === req.params.id)
  if (!app) return res.status(404).json({ error: 'unknown shortcut' })

  const escapedPath = app.path.replace(/'/g, "''")
  exec(`powershell -NoProfile -Command "Start-Process -FilePath '${escapedPath}'"`, (err) => {
    if (err) return res.status(500).json({ error: err.message })
    logEvent(app.icon || '🚀', `${app.label} opened`)
    res.json({ ok: true })
  })
})

app.post('/api/kill/:id', checkToken, (req, res) => {
  const apps = loadApps()
  const target = apps.find((a) => a.id === req.params.id)
  if (!target) return res.status(404).json({ error: 'unknown shortcut' })
  if (target.process === 'explorer') return res.status(400).json({ error: 'ปิด File Explorer แบบนี้ไม่ได้ เพราะเป็น Windows shell' })
  exec(`taskkill /F /IM "${target.process}.exe"`, (err) => {
    if (err) return res.status(500).json({ error: 'ปิดไม่สำเร็จ (อาจไม่ได้เปิดอยู่)' })
    logEvent('⏹️', `${target.label} closed`)
    res.json({ ok: true })
  })
})

const CONTROL_ACTIONS = ['sleep', 'volume-up', 'volume-down', 'mute', 'screen-off', 'brightness-up', 'brightness-down']

app.post('/api/control/:action', checkToken, (req, res) => {
  const action = req.params.action
  if (!CONTROL_ACTIONS.includes(action)) return res.status(404).json({ error: 'unknown control' })
  const script = path.join(__dirname, 'controls.ps1')
  exec(`powershell -NoProfile -ExecutionPolicy Bypass -File "${script}" -Action ${action}`, (err) => {
    if (err) return res.status(500).json({ error: err.message })
    logEvent('⚙️', CONTROL_LABELS[action] || action)
    res.json({ ok: true })
  })
})

function runAppById(id) {
  return new Promise((resolve, reject) => {
    const target = loadApps().find((a) => a.id === id)
    if (!target) return reject(new Error(`unknown app: ${id}`))
    const escapedPath = target.path.replace(/'/g, "''")
    exec(`powershell -NoProfile -Command "Start-Process -FilePath '${escapedPath}'"`, (err) => {
      if (err) return reject(err)
      logEvent(target.icon || '🚀', `${target.label} opened`)
      resolve()
    })
  })
}

function runControlAction(action) {
  return new Promise((resolve, reject) => {
    if (!CONTROL_ACTIONS.includes(action)) return reject(new Error(`unknown control: ${action}`))
    const script = path.join(__dirname, 'controls.ps1')
    exec(`powershell -NoProfile -ExecutionPolicy Bypass -File "${script}" -Action ${action}`, (err) => {
      if (err) return reject(err)
      logEvent('⚙️', CONTROL_LABELS[action] || action)
      resolve()
    })
  })
}

function loadScenes() {
  if (!fs.existsSync(SCENES_FILE)) return []
  return JSON.parse(fs.readFileSync(SCENES_FILE, 'utf8'))
}

function saveScenes(scenes) {
  fs.writeFileSync(SCENES_FILE, JSON.stringify(scenes, null, 2))
}

app.get('/api/scenes', checkToken, (req, res) => {
  res.json(loadScenes().map(({ id, label, icon }) => ({ id, label, icon })))
})

app.get('/api/scenes/:id', checkToken, (req, res) => {
  const scene = loadScenes().find((s) => s.id === req.params.id)
  if (!scene) return res.status(404).json({ error: 'unknown scene' })
  res.json(scene)
})

app.post('/api/scenes', checkToken, (req, res) => {
  const { label, icon, steps } = req.body || {}
  if (!label || !Array.isArray(steps) || !steps.length) return res.status(400).json({ error: 'label and at least 1 step required' })
  const scenes = loadScenes()
  const id = uniqueId(slugify(label), scenes.map((s) => s.id))
  const scene = { id, label, icon: icon || '🎬', steps }
  scenes.push(scene)
  saveScenes(scenes)
  res.json(scene)
})

app.put('/api/scenes/:id', checkToken, (req, res) => {
  const scenes = loadScenes()
  const idx = scenes.findIndex((s) => s.id === req.params.id)
  if (idx === -1) return res.status(404).json({ error: 'unknown scene' })
  const { label, icon, steps } = req.body || {}
  if (!label || !Array.isArray(steps) || !steps.length) return res.status(400).json({ error: 'label and at least 1 step required' })
  scenes[idx] = { ...scenes[idx], label, icon: icon || scenes[idx].icon, steps }
  saveScenes(scenes)
  res.json(scenes[idx])
})

app.delete('/api/scenes/:id', checkToken, (req, res) => {
  const scenes = loadScenes()
  const next = scenes.filter((s) => s.id !== req.params.id)
  if (next.length === scenes.length) return res.status(404).json({ error: 'unknown scene' })
  saveScenes(next)
  res.json({ ok: true })
})

app.post('/api/scenes/:id/run', checkToken, async (req, res) => {
  const scene = loadScenes().find((s) => s.id === req.params.id)
  if (!scene) return res.status(404).json({ error: 'unknown scene' })
  try {
    for (const step of scene.steps) {
      if (step.type === 'run') await runAppById(step.id)
      else if (step.type === 'control') await runControlAction(step.id)
      if (step.wait) await new Promise((r) => setTimeout(r, step.wait))
    }
    logEvent(scene.icon || '🎬', `"${scene.label}" scene ran`)
    res.json({ ok: true })
  } catch (e) {
    res.status(500).json({ error: e.message })
  }
})

app.get('/api/apps/status', checkToken, (req, res) => {
  res.set('Cache-Control', 'no-store')
  const script = path.join(__dirname, 'app-status.ps1')
  exec(`powershell -NoProfile -ExecutionPolicy Bypass -File "${script}"`, (err, stdout) => {
    if (err) return res.status(500).json({ error: err.message })
    try {
      res.json(JSON.parse(stdout))
    } catch (e) {
      res.status(500).json({ error: 'bad status output' })
    }
  })
})

app.post('/api/upload', checkToken, upload.single('file'), (req, res) => {
  if (!req.file) return res.status(400).json({ error: 'no file received' })
  logEvent('📤', `${req.file.originalname} received`)
  res.json({ ok: true, filename: req.file.filename })
})

app.get('/api/events', checkToken, (req, res) => {
  res.set('Cache-Control', 'no-store')
  res.json(EVENTS)
})

app.post('/api/clipboard', checkToken, async (req, res) => {
  const text = req.body && req.body.text
  if (typeof text !== 'string' || !text.length) return res.status(400).json({ error: 'no text' })
  try {
    await setClipboard(text)
    logEvent('📋', 'Clipboard sent from phone')
    res.json({ ok: true })
  } catch (e) {
    res.status(500).json({ error: e.message })
  }
})

app.get('/api/files/roots', checkToken, (req, res) => {
  res.json(Object.entries(FILE_ROOTS).map(([id, r]) => ({ id, label: r.label, icon: r.icon })))
})

app.get('/api/files/list', checkToken, (req, res) => {
  const resolved = resolveSafePath(req.query.root, req.query.sub || '')
  if (!resolved) return res.status(400).json({ error: 'invalid path' })
  fs.readdir(resolved.target, { withFileTypes: true }, (err, entries) => {
    if (err) return res.status(404).json({ error: 'folder not found' })
    const items = entries
      .filter((e) => !e.name.startsWith('.'))
      .map((e) => {
        const full = path.join(resolved.target, e.name)
        let size = 0, mtime = 0
        try {
          const st = fs.statSync(full)
          size = st.size
          mtime = st.mtimeMs
        } catch (err2) {}
        return { name: e.name, isDir: e.isDirectory(), size, mtime }
      })
      .sort((a, b) => (a.isDir === b.isDir ? a.name.localeCompare(b.name) : a.isDir ? -1 : 1))
    res.json(items)
  })
})

app.get('/api/files/download', checkToken, (req, res) => {
  const resolved = resolveSafePath(req.query.root, req.query.sub || '')
  if (!resolved) return res.status(400).json({ error: 'invalid path' })
  fs.stat(resolved.target, (err, st) => {
    if (err || !st.isFile()) return res.status(404).json({ error: 'file not found' })
    res.download(resolved.target)
  })
})

app.get('/api/nowplaying', checkToken, (req, res) => {
  res.set('Cache-Control', 'no-store')
  const script = path.join(__dirname, 'nowplaying.ps1')
  const tmp = path.join(os.tmpdir(), `atlas-np-${crypto.randomBytes(4).toString('hex')}.json`)
  exec(`powershell -NoProfile -ExecutionPolicy Bypass -File "${script}" -OutFile "${tmp}"`, () => {
    try {
      let raw = fs.readFileSync(tmp, 'utf8')
      if (raw.charCodeAt(0) === 0xFEFF) raw = raw.slice(1)
      res.json(JSON.parse(raw))
    } catch (e) {
      res.json({ playing: false })
    } finally {
      fs.unlink(tmp, () => {})
    }
  })
})

const MEDIA_ACTIONS = ['playpause', 'next', 'prev']

app.post('/api/mediacontrol/:action', checkToken, (req, res) => {
  const action = req.params.action
  if (!MEDIA_ACTIONS.includes(action)) return res.status(404).json({ error: 'unknown action' })
  const script = path.join(__dirname, 'mediacontrol.ps1')
  exec(`powershell -NoProfile -ExecutionPolicy Bypass -File "${script}" -Action ${action}`, (err) => {
    if (err) return res.status(500).json({ error: 'ควบคุมไม่สำเร็จ (อาจไม่มีอะไรเล่นอยู่)' })
    res.json({ ok: true })
  })
})

app.get('/api/clipboard', checkToken, async (req, res) => {
  res.set('Cache-Control', 'no-store')
  try {
    const text = await getClipboard()
    res.json({ text })
  } catch (e) {
    res.status(500).json({ error: e.message })
  }
})

app.get('/api/uploads/recent', checkToken, (req, res) => {
  res.set('Cache-Control', 'no-store')
  try {
    const files = fs.readdirSync(UPLOAD_DIR)
      .map(name => ({ name, mtime: fs.statSync(path.join(UPLOAD_DIR, name)).mtimeMs }))
      .sort((a, b) => b.mtime - a.mtime)
      .slice(0, 10)
      .map(f => f.name)
    res.json(files)
  } catch (e) {
    res.status(500).json({ error: e.message })
  }
})

app.get('/api/status', checkToken, (req, res) => {
  res.set('Cache-Control', 'no-store')
  const script = path.join(__dirname, 'status.ps1')
  exec(`powershell -NoProfile -ExecutionPolicy Bypass -File "${script}"`, (err, stdout) => {
    if (err) return res.status(500).json({ error: err.message })
    try {
      res.json(JSON.parse(stdout))
    } catch (e) {
      res.status(500).json({ error: 'bad status output' })
    }
  })
})

app.listen(PORT, () => {
  console.log(`ATLAS running on port ${PORT}`)
  console.log(`Token: ${TOKEN}`)
  console.log('Open on your phone (same WiFi/hotspot):')
  for (const ip of localIPs()) {
    console.log(`  http://${ip}:${PORT}/?token=${TOKEN}`)
  }
})
