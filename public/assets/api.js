// public/assets/api.js — Helper para llamadas al backend
const API = {
  base: '/api',

  async post(url, body) {
    const res = await fetch(this.base + url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });
    return res.json();
  },

  async get(url) {
    const res = await fetch(this.base + url);
    return res.json();
  },

  async postAdmin(url, body) {
    const res = await fetch(this.base + '/admin' + url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });
    return res.json();
  },

  async getAdmin(url) {
    const res = await fetch(this.base + '/admin' + url);
    return res.json();
  },

  async putAdmin(url, body) {
    const res = await fetch(this.base + '/admin' + url, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });
    return res.json();
  },

  async uploadExcel(year, distance, file) {
    const fd = new FormData();
    fd.append('year', year);
    fd.append('distance', distance);
    fd.append('file', file);
    const res = await fetch(this.base + '/admin/import', {
      method: 'POST',
      body: fd,
    });
    return res.json();
  },

  searchRunner: (q)    => API.post('/search-runner', { q }),
  getRunner:    (id)   => API.get(`/runner/${id}`),
  rankings:     (type, params = '') => API.get(`/rankings/${type}${params}`),
};
