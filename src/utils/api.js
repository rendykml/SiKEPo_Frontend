// =============================================================
// SiKEPo API CLIENT
// =============================================================

export const API_BASE =
  import.meta.env.VITE_API_BASE || 'http://localhost:5000';

const TOKEN_KEY = 'sikepo_token';
const USER_KEY = 'sikepo_user';

// =============================================================
// TOKEN
// =============================================================

export function getToken() {
  let token = sessionStorage.getItem(TOKEN_KEY);

  if (!token) {
    const legacy = localStorage.getItem(TOKEN_KEY);

    if (legacy) {
      sessionStorage.setItem(TOKEN_KEY, legacy);
      localStorage.removeItem(TOKEN_KEY);
      token = legacy;
    }
  }

  return token;
}

// =============================================================
// CURRENT USER
// =============================================================

export function getCurrentUser() {
  try {
    let raw = sessionStorage.getItem(USER_KEY);

    if (!raw) {
      const legacy = localStorage.getItem(USER_KEY);

      if (legacy) {
        sessionStorage.setItem(USER_KEY, legacy);
        localStorage.removeItem(USER_KEY);
        raw = legacy;
      }
    }

    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
}

// =============================================================
// ERROR PARSER
// =============================================================

export function parseApiError(data, status) {
  if (!data) {
    if (status === 400) return 'Data yang dikirim tidak valid.';
    if (status === 401) {
      return 'Sesi telah berakhir atau belum terautentikasi. Silakan login kembali.';
    }

    if (status === 403) {
      return 'Akses ditolak: Anda tidak memiliki izin untuk tindakan ini.';
    }

    if (status === 404) {
      return 'Resource yang diminta tidak ditemukan.';
    }

    if (status === 409) {
      return 'Data yang dikirim mengalami konflik dengan data yang sudah ada.';
    }

    if (status >= 500) {
      return 'Terjadi gangguan pada server. Silakan cek terminal backend.';
    }

    return `Terjadi kesalahan (HTTP ${status || 'Unknown'})`;
  }

  if (typeof data === 'string') {
    return data;
  }

  if (data.message && typeof data.message === 'string') {
    return data.message;
  }

  if (data.error && typeof data.error === 'string') {
    return data.error;
  }

  if (data.detail && typeof data.detail === 'string') {
    return data.detail;
  }

  if (Array.isArray(data.errors) && data.errors.length > 0) {
    return data.errors
      .map((e) => {
        if (typeof e === 'string') return e;
        return e?.message || e?.error || JSON.stringify(e);
      })
      .join(', ');
  }

  return `Operasi gagal (HTTP ${status || 'Unknown'})`;
}

// =============================================================
// RESPONSE PARSER
// =============================================================

async function parseResponse(res) {
  const contentType = res.headers.get('content-type') || '';

  if (contentType.includes('application/json')) {
    return await res.json().catch(() => ({}));
  }

  const text = await res.text().catch(() => '');

  return text || {};
}

// =============================================================
// FETCH JSON + AUTH
// =============================================================

export async function fetchWithAuth(endpoint, options = {}) {
  const token = getToken();

  const headers = {
    Accept: 'application/json',
    ...(token
      ? {
          Authorization: `Bearer ${token}`,
        }
      : {}),
    ...(options.headers || {}),
  };

  // Jangan menimpa Content-Type jika sudah diberikan.
  // Untuk request JSON biasa, gunakan application/json.
  if (
    options.body &&
    typeof options.body === 'string' &&
    !headers['Content-Type'] &&
    !headers['content-type']
  ) {
    headers['Content-Type'] = 'application/json';
  }

  let res;

  try {
    res = await fetch(`${API_BASE}${endpoint}`, {
      ...options,
      headers,
    });
  } catch (networkErr) {
    const err = new Error(
      'Koneksi jaringan terputus atau backend tidak dapat dijangkau.',
    );

    err.isNetworkError = true;
    err.originalError = networkErr;

    throw err;
  }

  const data = await parseResponse(res);

  if (!res.ok) {
    // =========================================================
    // 401
    // =========================================================

    if (res.status === 401) {
      sessionStorage.removeItem(TOKEN_KEY);
      sessionStorage.removeItem(USER_KEY);

      localStorage.removeItem(TOKEN_KEY);
      localStorage.removeItem(USER_KEY);

      window.dispatchEvent(
        new CustomEvent('sikepo_session_expired', {
          detail: {
            message:
              'Sesi login Anda telah berakhir. Silakan masuk kembali.',
          },
        }),
      );
    }

    // =========================================================
    // 403
    // =========================================================

    if (res.status === 403) {
      window.dispatchEvent(
        new CustomEvent('sikepo_auth_forbidden', {
          detail: {
            message:
              data?.message ||
              'Akses ditolak: Role Anda tidak memiliki izin untuk tindakan ini.',
          },
        }),
      );
    }

    // =========================================================
    // 409
    // =========================================================

    if (res.status === 409) {
      console.error('HTTP 409 Conflict:', {
        endpoint,
        data,
      });
    }

    // =========================================================
    // 500
    // =========================================================

    if (res.status >= 500) {
      console.error('HTTP SERVER ERROR:', {
        endpoint,
        status: res.status,
        data,
      });
    }

    const errorMsg = parseApiError(data, res.status);

    const err = new Error(errorMsg);

    err.status = res.status;
    err.data = data;
    err.endpoint = endpoint;

    throw err;
  }

  return data;
}

// =============================================================
// FETCH FORM DATA
// =============================================================

export async function fetchFormData(endpoint, formData) {
  const token = getToken();

  const headers = {
    Accept: 'application/json',
    ...(token
      ? {
          Authorization: `Bearer ${token}`,
        }
      : {}),
  };

  let res;

  try {
    res = await fetch(`${API_BASE}${endpoint}`, {
      method: 'POST',
      headers,
      body: formData,
    });
  } catch (networkErr) {
    const err = new Error(
      'Koneksi jaringan terputus atau backend tidak dapat dijangkau.',
    );

    err.isNetworkError = true;
    err.originalError = networkErr;

    throw err;
  }

  const data = await parseResponse(res);

  if (!res.ok) {
    console.error('UPLOAD ERROR:', {
      endpoint,
      status: res.status,
      data,
    });

    if (res.status === 401) {
      sessionStorage.removeItem(TOKEN_KEY);
      sessionStorage.removeItem(USER_KEY);

      localStorage.removeItem(TOKEN_KEY);
      localStorage.removeItem(USER_KEY);

      window.dispatchEvent(
        new CustomEvent('sikepo_session_expired', {
          detail: {
            message:
              'Sesi login Anda telah berakhir. Silakan masuk kembali.',
          },
        }),
      );
    }

    const errorMsg = parseApiError(data, res.status);

    const err = new Error(errorMsg);

    err.status = res.status;
    err.data = data;
    err.endpoint = endpoint;

    throw err;
  }

  return data;
}

// =============================================================
// FETCH BLOB
// =============================================================

export async function fetchBlobWithAuth(endpoint) {
  const token = getToken();

  let res;

  try {
    res = await fetch(`${API_BASE}${endpoint}`, {
      headers: {
        Accept: 'image/png,application/octet-stream',
        ...(token
          ? {
              Authorization: `Bearer ${token}`,
            }
          : {}),
      },
    });
  } catch {
    throw new Error(
      'Koneksi jaringan terputus atau backend tidak dapat dijangkau.',
    );
  }

  if (!res.ok) {
    const data = await parseResponse(res);

    throw new Error(parseApiError(data, res.status));
  }

  return res.blob();
}

// =============================================================
// FOTO
// =============================================================

export function formatPhotoUrl(foto) {
  if (!foto) return null;

  const clean = String(foto).trim();

  if (
    !clean ||
    ['null', 'undefined', 'none', '-'].includes(clean.toLowerCase())
  ) {
    return null;
  }

  if (
    clean.startsWith('data:image/') ||
    clean.startsWith('http://') ||
    clean.startsWith('https://')
  ) {
    return clean;
  }

  const path = clean.startsWith('/') ? clean : `/${clean}`;

  return `${API_BASE}${path}`;
}

// =============================================================
// EQUIPMENT ID
// =============================================================

export function getEquipmentId(peralatan) {
  return (
    peralatan?.id ??
    peralatan?.peralatan_id ??
    peralatan?.id_peralatan ??
    peralatan?.equipment_id ??
    null
  );
}

// =============================================================
// EQUIPMENT CATEGORY
// =============================================================

export function getEquipmentCategoryId(peralatan) {
  const legacyId = Number(peralatan?.kategori_id);

  if (Number.isInteger(legacyId) && legacyId > 0) {
    return legacyId;
  }

  const categoryId = Number(peralatan?.kategori_peralatan_id);

  return Number.isInteger(categoryId) && categoryId > 0
    ? categoryId
    : null;
}

// =============================================================
// STATIC CATEGORY
// =============================================================

export const STATIC_EQUIPMENT_CATEGORIES = [
  {
    id: 1,
    label: 'Alat Ukur',
    desc:
      'Peralatan yang menghasilkan nilai terukur, dan ketelitiannya mempengaruhi keabsahan hasil yang dilaporkan.',
  },
  {
    id: 2,
    label: 'Alat Bantu',
    desc:
      'Peralatan yang diperlukan agar pengujian dapat berjalan, tetapi pembacaannya tidak masuk ke perhitungan hasil.',
  },
  {
    id: 3,
    label: 'Artefak Acuan',
    desc:
      'Benda yang menjadi acuan pembanding sebagai yang diukur, bukan yang membaca. Mencakup Alat Standar dan Golden Sample.',
  },
  {
    id: 4,
    label: 'Komponen Pendukung',
    desc:
      'Bahan atau data yang habis, kedaluwarsa, atau diperbarui — bukan barang inventaris yang tetap.',
  },
];

// =============================================================
// AUTH
// =============================================================

export const authApi = {
  login: async ({ email, password, recaptcha_token }) => {
    sessionStorage.removeItem(TOKEN_KEY);
    sessionStorage.removeItem(USER_KEY);

    localStorage.removeItem(TOKEN_KEY);
    localStorage.removeItem(USER_KEY);

    let res;

    try {
      res = await fetch(`${API_BASE}/api/users/login`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Accept: 'application/json',
        },
        body: JSON.stringify({
          email,
          password,
          recaptcha_token,
        }),
      });
    } catch {
      throw new Error(
        'Koneksi jaringan terputus atau server backend tidak dapat dijangkau.',
      );
    }

    const data = await parseResponse(res);

    if (!res.ok || !data.success) {
      throw new Error(parseApiError(data, res.status));
    }

    sessionStorage.setItem(TOKEN_KEY, data.data.token);
    sessionStorage.setItem(USER_KEY, JSON.stringify(data.data.user));

    return data.data;
  },

  logout: () => {
    sessionStorage.removeItem(TOKEN_KEY);
    sessionStorage.removeItem(USER_KEY);

    localStorage.removeItem(TOKEN_KEY);
    localStorage.removeItem(USER_KEY);

    window.dispatchEvent(
      new CustomEvent('sikepo_auth_logout'),
    );
  },

  getRecaptchaSiteKey: async () => {
    try {
      const res = await fetch(
        `${API_BASE}/recaptcha/sitekey`,
      );

      const data = await parseResponse(res);

      return data.site_key || null;
    } catch {
      return null;
    }
  },
};

// =============================================================
// USERS
// =============================================================

export const usersApi = {
  getAll: () =>
    fetchWithAuth('/api/users'),

  getById: (id) =>
    fetchWithAuth(`/api/users/${id}`),

  create: (body) =>
    fetchWithAuth('/api/users/', {
      method: 'POST',
      body: JSON.stringify(body),
    }),

  update: (id, body) =>
    fetchWithAuth(`/api/users/${id}`, {
      method: 'PUT',
      body: JSON.stringify(body),
    }),

  changePassword: (body) =>
    fetchWithAuth('/api/users/me/password', {
      method: 'PUT',
      body: JSON.stringify(body),
    }),

  delete: (id) =>
    fetchWithAuth(`/api/users/${id}`, {
      method: 'DELETE',
    }),
};

// =============================================================
// LABS
// =============================================================

export const labsApi = {
  getAll: () =>
    fetchWithAuth('/api/labs'),

  getById: (id) =>
    fetchWithAuth(`/api/labs/${id}`),

  create: (body) =>
    fetchWithAuth('/api/labs/', {
      method: 'POST',
      body: JSON.stringify(body),
    }),

  update: (id, body) =>
    fetchWithAuth(`/api/labs/${id}`, {
      method: 'PUT',
      body: JSON.stringify(body),
    }),

  delete: (id) =>
    fetchWithAuth(`/api/labs/${id}`, {
      method: 'DELETE',
    }),
};

// =============================================================
// RUANGAN
// =============================================================

export const ruanganApi = {
  getAll: () =>
    fetchWithAuth('/api/ruangan'),

  getByLabsId: (labsId) =>
    fetchWithAuth(`/api/ruangan/labs/${labsId}`),

  getByPicId: (picId) =>
    fetchWithAuth(`/api/ruangan/pic/${picId}`),

  getById: (id) =>
    fetchWithAuth(`/api/ruangan/${id}`),

  create: (body) =>
    fetchWithAuth('/api/ruangan/', {
      method: 'POST',
      body: JSON.stringify(body),
    }),

  update: (id, body) =>
    fetchWithAuth(`/api/ruangan/${id}`, {
      method: 'PUT',
      body: JSON.stringify(body),
    }),

  delete: (id) =>
    fetchWithAuth(`/api/ruangan/${id}`, {
      method: 'DELETE',
    }),
};

// =============================================================
// KELOMPOK ASSET
// =============================================================

export const kelompokAssetApi = {
  getAll: () =>
    fetchWithAuth('/api/kelompok-asset'),

  getById: (id) =>
    fetchWithAuth(`/api/kelompok-asset/${id}`),

  create: (body) =>
    fetchWithAuth('/api/kelompok-asset/', {
      method: 'POST',
      body: JSON.stringify(body),
    }),

  update: (id, body) =>
    fetchWithAuth(`/api/kelompok-asset/${id}`, {
      method: 'PUT',
      body: JSON.stringify(body),
    }),

  delete: (id) =>
    fetchWithAuth(`/api/kelompok-asset/${id}`, {
      method: 'DELETE',
    }),
};

// =============================================================
// PERALATAN
// =============================================================

export const peralatanApi = {
  // GET /api/peralatan
  getAll: () =>
    fetchWithAuth('/api/peralatan'),

  // GET /api/peralatan/:id
  getById: (id) =>
    fetchWithAuth(`/api/peralatan/${id}`),

  // POST /api/peralatan/
  create: async (body) => {
    console.log('CREATE PERALATAN REQUEST:', body);

    return fetchWithAuth('/api/peralatan/', {
      method: 'POST',
      body: JSON.stringify(body),
    });
  },

  // PUT /api/peralatan/:id
  update: (id, body) =>
    fetchWithAuth(`/api/peralatan/${id}`, {
      method: 'PUT',
      body: JSON.stringify(body),
    }),

  // POST /api/peralatan/:id/foto
  uploadFoto: async (id, file) => {
    if (!id) {
      throw new Error(
        'ID peralatan tidak tersedia untuk upload foto.',
      );
    }

    if (!file) {
      throw new Error(
        'File foto belum dipilih.',
      );
    }

    const form = new FormData();

    form.append('foto', file);

    console.log('UPLOAD FOTO:', {
      id,
      name: file.name,
      type: file.type,
      size: file.size,
    });

    return fetchFormData(
      `/api/peralatan/${id}/foto`,
      form,
    );
  },

  // GET /api/peralatan/:id/qr
  getQRCodeUrl: (id) =>
    `${API_BASE}/api/peralatan/${id}/qr`,
};

// =============================================================
// KATEGORI PERALATAN
// =============================================================

export const kategoriPeralatanApi = {
  getAll: () =>
    fetchWithAuth('/api/kategori-peralatan/'),

  getById: (id) =>
    fetchWithAuth(`/api/kategori-peralatan/${id}`),

  create: (body) =>
    fetchWithAuth('/api/kategori-peralatan/', {
      method: 'POST',
      body: JSON.stringify(body),
    }),

  update: (id, body) =>
    fetchWithAuth(`/api/kategori-peralatan/${id}`, {
      method: 'PUT',
      body: JSON.stringify(body),
    }),

  delete: (id) =>
    fetchWithAuth(`/api/kategori-peralatan/${id}`, {
      method: 'DELETE',
    }),
};

// =============================================================
// VERIFIKASI
// =============================================================

export const verifikasiApi = {
  getAll: () =>
    fetchWithAuth('/api/verifikasi/'),

  getPengajuan: () =>
    fetchWithAuth('/api/verifikasi/pengajuan'),

  getLogPeninjauan: () =>
    fetchWithAuth('/api/verifikasi/log-peninjauan'),

  getLogByPeralatanId: (peralatanId) =>
    fetchWithAuth(
      `/api/verifikasi/log-peninjauan/peralatan/${peralatanId}`,
    ),

  getByPeralatanId: (peralatanId) =>
    fetchWithAuth(
      `/api/verifikasi/peralatan/${peralatanId}`,
    ),

  getById: (id) =>
    fetchWithAuth(`/api/verifikasi/${id}`),

  create: (body) =>
    fetchWithAuth('/api/verifikasi/', {
      method: 'POST',
      body: JSON.stringify(body),
    }),

  signPic: (id, signature) =>
    fetchWithAuth(`/api/verifikasi/${id}/sign-pic`, {
      method: 'PUT',
      body: JSON.stringify({
        signature,
      }),
    }),

  approve: (id, signature) =>
    fetchWithAuth(`/api/verifikasi/${id}/approve`, {
      method: 'PUT',
      body: JSON.stringify({
        signature,
      }),
    }),

  reject: (id, body) =>
    fetchWithAuth(`/api/verifikasi/${id}/reject`, {
      method: 'PUT',
      body: JSON.stringify(body),
    }),

  delete: (id) =>
    fetchWithAuth(`/api/verifikasi/${id}`, {
      method: 'DELETE',
    }),
};

// =============================================================
// DOKUMEN PERALATAN
// =============================================================

export const dokumenApi = {
  // GET semua dokumen
  getAll: () =>
    fetchWithAuth('/api/dokumen-peralatan'),

  // GET dokumen berdasarkan peralatan
  getByPeralatanId: (id) =>
    fetchWithAuth(
      `/api/dokumen-peralatan/peralatan/${id}`,
    ),

  // GET satu dokumen
  getById: (id) =>
    fetchWithAuth(
      `/api/dokumen-peralatan/${id}`,
    ),

  // POST dokumen JSON
  create: (body) =>
    fetchWithAuth('/api/dokumen-peralatan/', {
      method: 'POST',
      body: JSON.stringify(body),
    }),

  // =========================================================
  // UPLOAD DOKUMEN
  // =========================================================
  upload: async (
    peralatanId,
    file,
    namaDokumen = null,
  ) => {
    if (!peralatanId) {
      throw new Error(
        'ID peralatan tidak tersedia untuk upload dokumen.',
      );
    }

    if (!file) {
      throw new Error(
        'File dokumen belum dipilih.',
      );
    }

    /*
     * Jangan gunakan Content-Type secara manual.
     * Browser akan otomatis membuat:
     *
     * multipart/form-data;
     * boundary=....
     */

    const form = new FormData();

    /*
     * Nama file yang dikirim ke backend.
     *
     * Jika namaDokumen diberikan dari frontend,
     * gunakan nama tersebut.
     *
     * Jika tidak, gunakan nama file asli.
     */
    const documentName =
      namaDokumen ||
      file.name ||
      `dokumen-${Date.now()}`;

    form.append('dokumen', file);
    form.append(
      'nama_dokumen',
      documentName,
    );
    form.append(
      'peralatan_id',
      String(peralatanId),
    );

    console.log('UPLOAD DOKUMEN:', {
      peralatanId,
      namaDokumen: documentName,
      fileName: file.name,
      fileType: file.type,
      fileSize: file.size,
    });

    return fetchFormData(
      '/api/dokumen-peralatan/',
      form,
    );
  },

  // PUT
  update: (id, body) =>
    fetchWithAuth(
      `/api/dokumen-peralatan/${id}`,
      {
        method: 'PUT',
        body: JSON.stringify(body),
      },
    ),

  // DELETE
  delete: (id) =>
    fetchWithAuth(
      `/api/dokumen-peralatan/${id}`,
      {
        method: 'DELETE',
      },
    ),
};

// =============================================================
// NOTIFICATION
// =============================================================

export const notificationApi = {
  getByUserId: (userId) =>
    fetchWithAuth(
      `/api/notifications/user/${userId}`,
    ),

  markRead: (id) =>
    fetchWithAuth(
      `/api/notifications/${id}/read`,
      {
        method: 'PATCH',
      },
    ),
};

// =============================================================
// STATUS ALAT
// =============================================================

export const STATUS_ALAT_OPTIONS = [
  'Karantina',
  'Aktif',
  'Dipinjam',
  'Dalam Kalibrasi',
  'Rusak',
  'Dihapuskan',
];

// =============================================================
// STATUS BADGE
// =============================================================

export const STATUS_BADGE_CLASS = {
  Aktif: 'badge-aktif',
  Dipinjam: 'badge-dipinjam',
  'Dalam Kalibrasi': 'badge-kalibrasi',
  Rusak: 'badge-rusak',
  Dihapuskan: 'badge-dihapuskan',
  Karantina: 'badge-rusak',
};