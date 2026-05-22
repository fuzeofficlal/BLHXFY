import config from './config'

const insertCSS = () => {
  const link = document.createElement('link')
  link.type = 'text/css'
  link.rel = 'stylesheet'
  link.href = `${config.origin}/blhxfy/data/static/style/BLHXFY.css?lacia=${config.hash['BLHXFY.css'] || ''}`
  document.head.appendChild(link)
}

let fetchInfo = {
  status: 'init',
  result: false,
  data: null
}

const saveManifest = async () => {
  const t = Math.floor(Date.now() / 1000 / 60 / 60 / 6)
  let res
  try {
    res = await fetch(`${config.origin}/blhxfy/manifest.json?t=${t}`)
    if (!res.ok) throw new Error('manifest.json request failed')
  } catch (err) {
    if (config.origin.includes('127.0.0.1') || config.origin.includes('localhost')) {
      console.warn(`[BLHXFY] 本地开发数据源 manifest.json 获取失败，自动降级至官方线上源：https://blhx.danmu9.com`)
      config.origin = 'https://blhx.danmu9.com'
      res = await fetch(`${config.origin}/blhxfy/manifest.json?t=${t}`)
    } else {
      throw err
    }
  }
  const data = await res.json()
  data.time = Date.now()
  localStorage.setItem('blhxfy:manifest', JSON.stringify(data))
  return data
}

const getManifest = async () => {
  let data
  try {
    let str = localStorage.getItem('blhxfy:manifest')
    if (str) data = JSON.parse(str)
    if (Date.now() - data.time > config.cacheTime * 60 * 1000) data = false
  } catch (e) {}
  if (!data) {
    data = await saveManifest()
  } else {
    setTimeout(saveManifest, 5 * 1000)
  }
  return data
}

const checkLocalData = async () => {
  if (config.origin.includes('127.0.0.1') || config.origin.includes('localhost')) {
    const localDataStatus = sessionStorage.getItem('blhxfy:local_data_ok')
    if (localDataStatus === 'false') {
      config.origin = 'https://blhx.danmu9.com'
    } else if (localDataStatus !== 'true') {
      try {
        const t = Math.floor(Date.now() / 1000 / 60 / 60 / 6)
        const res = await fetch(`${config.origin}/blhxfy/manifest.json?t=${t}`, { method: 'HEAD' })
        if (res.ok) {
          sessionStorage.setItem('blhxfy:local_data_ok', 'true')
        } else {
          throw new Error('Local manifest not found')
        }
      } catch (e) {
        console.warn(`[BLHXFY] 本地开发数据不可用，已将 origin 重定向至官方 CDN: https://blhx.danmu9.com`)
        sessionStorage.setItem('blhxfy:local_data_ok', 'false')
        config.origin = 'https://blhx.danmu9.com'
      }
    }
  }
}

const tryFetch = async () => {
  if (window.fetch) {
    try {
      await checkLocalData()
      const data = await getManifest()
      fetchInfo.data = data
      fetchInfo.result = true
      sessionStorage.setItem('blhxfy:cors', 'enabled')
    } catch (e) {
      sessionStorage.setItem('blhxfy:cors', 'disabled')
      console.warn('[BLHXFY] 无法获取 manifest.json，启用本地 Mock 降级并重定向到线上数据源:', e)
      config.origin = 'https://blhx.danmu9.com'
      fetchInfo.data = {
        version: config.version,
        hashes: {}
      }
      fetchInfo.result = true
    }
  }
  fetchInfo.status = 'finished'
}

const request = async (pathname) => {
  if (fetchInfo.result) {
    return new Promise((rev, rej) => {
      const url = /^https?:\/\//.test(pathname) ? pathname :`${config.origin}${pathname}`
      fetch(url)
      .then(res => {
        if (!res.ok) {
          rej(`${res.status} ${res.url}`)
          return ''
        }
        const type = res.headers.get('content-type')
        if (type.includes('json')) {
          return res.json()
        }
        return res.text()
      }).then(rev).catch(rej)
    })
  }
}

let getHashPrms
let getHash = () => {
  if (getHashPrms) return getHashPrms
  return getHashPrms = new Promise((rev, rej) => {
    if (fetchInfo.status !== 'finished') {
      tryFetch().then(() => {
        const beforeStart = (data) => {
          config.newVersion = data.version
          config.hash = data.hashes
          insertCSS('BLHXFY')
        }
        if (fetchInfo.result) {
          beforeStart(fetchInfo.data)
          rev(fetchInfo.data.hashes)
        } else {
          rej('加载manifest.json失败')
        }
      }).catch(rej)
    } else {
      rev(fetchInfo.data.hashes)
    }
  })
}

const fetchWithHash = async (pathname, hash) => {
  if (!hash) {
    const hashes = await getHash()
    const key = pathname.replace('/blhxfy/data/', '')
    hash = hashes[key]
  }
  const data = await request(`${pathname}${hash ? `?lacia=${hash}` : ''}`)
  return data
}


export default fetchWithHash
export { getHash, insertCSS, fetchInfo }
