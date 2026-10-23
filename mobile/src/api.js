import axios from 'axios';
import * as FileSystem from 'expo-file-system';

// Aponte para o IP/host do backend. Emulador Android: http://10.0.2.2:3000
// Dispositivo fisico: http://<ip-da-sua-maquina>:3000
export const API_URL = 'http://192.168.1.172:3000';

const api = axios.create({ baseURL: API_URL });

export async function uploadSong(fileUri, fileName, mimeType, title) {
  // Usa uploadAsync do expo-file-system (nao axios/fetch): ele monta o multipart nativamente
  // e evita os problemas conhecidos de FormData no React Native ("Network Error" e campos
  // que o multer nao reconhece).
  const res = await FileSystem.uploadAsync(`${API_URL}/songs/upload`, fileUri, {
    fieldName: 'audio',
    mimeType: mimeType || 'audio/mpeg',
    uploadType: FileSystem.FileSystemUploadType.MULTIPART,
    parameters: title ? { title } : {},
  });

  if (res.status < 200 || res.status >= 300) {
    throw new Error(`servidor respondeu ${res.status}: ${String(res.body).slice(0, 200)}`);
  }
  return JSON.parse(res.body);
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
