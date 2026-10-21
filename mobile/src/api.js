import axios from 'axios';

// Aponte para o IP/host do backend. Emulador Android: http://10.0.2.2:3000
// Dispositivo fisico: http://<ip-da-sua-maquina>:3000
export const API_URL = 'http://10.0.2.2:3000';

const api = axios.create({ baseURL: API_URL });

export async function uploadSong(fileUri, fileName, mimeType, title) {
  const form = new FormData();
  form.append('audio', { uri: fileUri, name: fileName, type: mimeType || 'audio/mpeg' });
  if (title) form.append('title', title);
  const { data } = await api.post('/songs/upload', form, {
    headers: { 'Content-Type': 'multipart/form-data' },
  });
  return data;
}

export async function getSong(id) {
  const { data } = await api.get(`/songs/${id}`);
  return data;
}

export async function listSongs() {
  const { data } = await api.get('/songs');
  return data;
}

export function pdfUrl(id) {
  return `${API_URL}/songs/${id}/pdf`;
}

export default api;
