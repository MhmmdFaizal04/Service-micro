'use strict'

const API = 'https://service-api-gateway.vercel.app'

// ─── State ────────────────────────────────────────────────────────────────────
const state = {
  token:           localStorage.getItem('token'),
  user:            JSON.parse(localStorage.getItem('user') || 'null'),
  products:        [],
  selectedProduct: null
}

// ─── Init ─────────────────────────────────────────────────────────────────────
document.addEventListener('DOMContentLoaded', () => {
  bindEvents()
  state.token && state.user ? showPage('dashboard') : showPage('login')
})

function bindEvents() {
  document.getElementById('form-login').addEventListener('submit', handleLogin)
  document.getElementById('form-register').addEventListener('submit', handleRegister)
  document.getElementById('form-profile').addEventListener('submit', handleUpdateProfile)
  document.getElementById('go-register').addEventListener('click', (e) => { e.preventDefault(); showPage('register') })
  document.getElementById('go-login').addEventListener('click',    (e) => { e.preventDefault(); showPage('login') })
  document.getElementById('btn-logout').addEventListener('click',  (e) => { e.preventDefault(); logout() })
  document.getElementById('btn-cancel-buy').addEventListener('click', closeBuyModal)
  document.getElementById('modal-buy-backdrop').addEventListener('click', closeBuyModal)
  document.getElementById('btn-confirm-buy').addEventListener('click', confirmBuy)
  document.getElementById('btn-close-success').addEventListener('click', closeSuccessModal)

  document.querySelectorAll('.nav-link[data-page]').forEach(link => {
    link.addEventListener('click', (e) => {
      e.preventDefault()
      showPage(link.dataset.page)
    })
  })
}

// ─── Page router ─────────────────────────────────────────────────────────────
function showPage(name) {
  document.querySelectorAll('.page').forEach(p => p.classList.add('hidden'))
  const page = document.getElementById(`page-${name}`)
  if (page) page.classList.remove('hidden')

  const navbar = document.getElementById('navbar')
  const protectedPages = ['dashboard', 'history', 'profile']
  protectedPages.includes(name) ? navbar.classList.remove('hidden') : navbar.classList.add('hidden')

  document.querySelectorAll('.nav-link[data-page]').forEach(l => {
    l.classList.toggle('active', l.dataset.page === name)
  })

  if (name === 'dashboard') loadProducts()
  if (name === 'history')   loadHistory()
  if (name === 'profile')   loadProfile()
}

// ─── API helper ───────────────────────────────────────────────────────────────
async function apiFetch(path, options = {}) {
  const headers = { 'Content-Type': 'application/json', ...(options.headers || {}) }
  if (state.token) headers['Authorization'] = `Bearer ${state.token}`

  try {
    const res  = await fetch(`${API}${path}`, { ...options, headers })
    const data = await res.json()
    if (res.status === 401) { logout(); return null }
    return { ok: res.ok, status: res.status, data }
  } catch (err) {
    return { ok: false, status: 0, data: { error: 'Koneksi ke server gagal' } }
  }
}

// ─── Auth ─────────────────────────────────────────────────────────────────────
async function handleLogin(e) {
  e.preventDefault()
  const email    = document.getElementById('login-email').value.trim()
  const password = document.getElementById('login-password').value
  const errEl    = document.getElementById('login-error')
  const btn      = document.getElementById('btn-login')

  setLoading(btn, 'Memproses...')
  errEl.classList.add('hidden')

  const result = await apiFetch('/api/auth/login', {
    method: 'POST',
    body: JSON.stringify({ email, password })
  })

  resetBtn(btn, 'Masuk')

  if (!result || !result.ok) {
    showAlert(errEl, result?.data?.error || 'Login gagal, periksa email dan password')
    return
  }

  state.token = result.data.token
  state.user  = result.data.user
  localStorage.setItem('token', state.token)
  localStorage.setItem('user',  JSON.stringify(state.user))
  showPage('dashboard')
}

async function handleRegister(e) {
  e.preventDefault()
  const name     = document.getElementById('reg-name').value.trim()
  const email    = document.getElementById('reg-email').value.trim()
  const password = document.getElementById('reg-password').value
  const phone    = document.getElementById('reg-phone').value.trim()
  const errEl    = document.getElementById('reg-error')
  const sucEl    = document.getElementById('reg-success')
  const btn      = document.getElementById('btn-register')

  setLoading(btn, 'Mendaftar...')
  errEl.classList.add('hidden')
  sucEl.classList.add('hidden')

  const result = await apiFetch('/api/auth/register', {
    method: 'POST',
    body: JSON.stringify({ name, email, password, phone: phone || undefined })
  })

  resetBtn(btn, 'Daftar')

  if (!result || !result.ok) {
    showAlert(errEl, result?.data?.error || 'Pendaftaran gagal')
    return
  }

  showAlert(sucEl, 'Pendaftaran berhasil. Silakan login.', 'success')
  setTimeout(() => showPage('login'), 1600)
}

function logout() {
  state.token = null
  state.user  = null
  state.products = []
  localStorage.removeItem('token')
  localStorage.removeItem('user')
  showPage('login')
}

// ─── Dashboard / Products ────────────────────────────────────────────────────
async function loadProducts() {
  const grid = document.getElementById('products-grid')
  grid.innerHTML = '<div class="state-loading"><span class="loading-dots">Memuat produk</span></div>'

  const result = await apiFetch('/api/products')

  if (!result || !result.ok) {
    grid.innerHTML = '<div class="state-empty">Gagal memuat produk. Coba muat ulang.</div>'
    return
  }

  state.products = result.data.products || []
  document.getElementById('welcome-text').textContent =
    `Selamat datang, ${state.user?.name || 'Pelanggan'}`

  if (state.products.length === 0) {
    grid.innerHTML = '<div class="state-empty">Tidak ada produk tersedia.</div>'
    return
  }

  grid.innerHTML = state.products.map(p => `
    <div class="product-card ${p.stock === 0 ? 'out-of-stock' : ''}">
      <span class="stock-badge ${p.stock === 0 ? 'badge-out' : 'badge-available'}">
        ${p.stock === 0 ? 'Habis' : 'Stok ' + p.stock}
      </span>
      <div class="product-denomination">${formatRupiah(p.denomination)}</div>
      <div class="product-name">${p.name}</div>
      <div class="product-price">${formatRupiah(p.price)}</div>
      <button class="btn btn-primary btn-full" onclick="openBuyModal('${p.id}')"
        ${p.stock === 0 ? 'disabled' : ''}>
        ${p.stock === 0 ? 'Stok Habis' : 'Beli Token'}
      </button>
    </div>
  `).join('')
}

// ─── Buy flow ─────────────────────────────────────────────────────────────────
function openBuyModal(productId) {
  const product = state.products.find(p => p.id === productId)
  if (!product) return

  state.selectedProduct = product
  document.getElementById('confirm-name').textContent         = product.name
  document.getElementById('confirm-denomination').textContent = formatRupiah(product.denomination)
  document.getElementById('confirm-price').textContent        = formatRupiah(product.price)
  document.getElementById('modal-buy-error').classList.add('hidden')

  const btn = document.getElementById('btn-confirm-buy')
  resetBtn(btn, 'Beli Sekarang')

  document.getElementById('modal-buy').classList.remove('hidden')
}

function closeBuyModal() {
  document.getElementById('modal-buy').classList.add('hidden')
  state.selectedProduct = null
}

async function confirmBuy() {
  if (!state.selectedProduct) return

  const btn   = document.getElementById('btn-confirm-buy')
  const errEl = document.getElementById('modal-buy-error')

  setLoading(btn, 'Memproses...')
  errEl.classList.add('hidden')

  const result = await apiFetch('/api/transactions', {
    method: 'POST',
    body: JSON.stringify({ product_id: state.selectedProduct.id })
  })

  resetBtn(btn, 'Beli Sekarang')

  if (!result || !result.ok) {
    showAlert(errEl, result?.data?.error || 'Pembelian gagal')
    return
  }

  closeBuyModal()

  const txn = result.data.transaction
  document.getElementById('result-token').textContent   = txn.token_number
  document.getElementById('result-product').textContent = txn.product?.name || state.selectedProduct.name
  document.getElementById('result-amount').textContent  = formatRupiah(txn.amount)
  document.getElementById('modal-success').classList.remove('hidden')

  loadProducts()
}

function closeSuccessModal() {
  document.getElementById('modal-success').classList.add('hidden')
  showPage('history')
}

// ─── History ──────────────────────────────────────────────────────────────────
async function loadHistory() {
  const container = document.getElementById('history-content')
  container.innerHTML = '<div class="state-loading"><span class="loading-dots">Memuat riwayat</span></div>'

  if (!state.user?.id) return

  const result = await apiFetch(`/api/transactions/user/${state.user.id}`)

  if (!result || !result.ok) {
    container.innerHTML = '<div class="state-empty">Gagal memuat riwayat transaksi.</div>'
    return
  }

  const { transactions, pagination } = result.data

  if (!transactions || transactions.length === 0) {
    container.innerHTML = '<div class="state-empty">Belum ada transaksi.</div>'
    return
  }

  container.innerHTML = `
    <div class="history-table-wrap">
      <table class="history-table">
        <thead>
          <tr>
            <th>Tanggal</th>
            <th>Nomor Token</th>
            <th>Harga</th>
            <th>Status</th>
          </tr>
        </thead>
        <tbody>
          ${transactions.map(t => `
            <tr>
              <td>${formatDate(t.created_at)}</td>
              <td><span class="token-code">${t.token_number}</span></td>
              <td>${formatRupiah(t.amount)}</td>
              <td><span class="status-badge status-${t.status}">${t.status}</span></td>
            </tr>
          `).join('')}
        </tbody>
      </table>
    </div>
    <p class="history-summary">Menampilkan ${transactions.length} dari ${pagination.total} transaksi</p>
  `
}

// ─── Profile ──────────────────────────────────────────────────────────────────
async function loadProfile() {
  const result = await apiFetch('/api/users/profile')
  if (!result || !result.ok) return

  const user = result.data.user
  state.user = { ...state.user, ...user }
  localStorage.setItem('user', JSON.stringify(state.user))

  document.getElementById('profile-avatar').textContent       = user.name.charAt(0).toUpperCase()
  document.getElementById('profile-name').textContent         = user.name
  document.getElementById('profile-email-display').textContent = user.email
  document.getElementById('profile-role').textContent         = user.role
  document.getElementById('prof-name').value  = user.name
  document.getElementById('prof-phone').value = user.phone || ''
  document.getElementById('prof-email').value = user.email
}

async function handleUpdateProfile(e) {
  e.preventDefault()
  const name  = document.getElementById('prof-name').value.trim()
  const phone = document.getElementById('prof-phone').value.trim()
  const errEl = document.getElementById('prof-error')
  const sucEl = document.getElementById('prof-success')
  const btn   = document.getElementById('btn-save-profile')

  setLoading(btn, 'Menyimpan...')
  errEl.classList.add('hidden')
  sucEl.classList.add('hidden')

  const result = await apiFetch('/api/users/profile', {
    method: 'PUT',
    body: JSON.stringify({ name, phone: phone || undefined })
  })

  resetBtn(btn, 'Simpan Perubahan')

  if (!result || !result.ok) {
    showAlert(errEl, result?.data?.error || 'Gagal menyimpan perubahan')
    return
  }

  showAlert(sucEl, 'Profil berhasil diperbarui', 'success')
  loadProfile()
  setTimeout(() => sucEl.classList.add('hidden'), 3000)
}

// ─── Utils ────────────────────────────────────────────────────────────────────
function formatRupiah(amount) {
  return new Intl.NumberFormat('id-ID', {
    style: 'currency', currency: 'IDR', minimumFractionDigits: 0
  }).format(Number(amount))
}

function formatDate(dateStr) {
  return new Date(dateStr).toLocaleString('id-ID', {
    day: '2-digit', month: 'short', year: 'numeric',
    hour: '2-digit', minute: '2-digit'
  })
}

function setLoading(btn, text) {
  btn.disabled    = true
  btn.textContent = text
}

function resetBtn(btn, text) {
  btn.disabled    = false
  btn.textContent = text
}

function showAlert(el, msg, type = 'error') {
  el.textContent = msg
  el.className   = `alert alert-${type}`
  el.classList.remove('hidden')
}
