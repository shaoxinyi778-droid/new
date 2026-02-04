import { Session, createClient } from '@supabase/supabase-js';
import { Video } from './types';

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL as string | undefined;
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY as string | undefined;
const supabaseBucket = import.meta.env.VITE_SUPABASE_BUCKET as string | undefined;

if (!supabaseUrl || !supabaseAnonKey) {
  console.warn('Supabase env vars missing: VITE_SUPABASE_URL / VITE_SUPABASE_ANON_KEY');
}

const supabase = supabaseUrl && supabaseAnonKey
  ? createClient(supabaseUrl, supabaseAnonKey)
  : null;

const ensureSupabase = () => {
  if (!supabase) {
    throw new Error('Supabase not configured. Please set VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY.');
  }
  return supabase;
};

const ensureBucket = () => {
  if (!supabaseBucket) {
    throw new Error('Supabase not configured. Please set VITE_SUPABASE_BUCKET.');
  }
  return supabaseBucket;
};

export const getCurrentSession = async (): Promise<Session | null> => {
  const client = ensureSupabase();
  const { data, error } = await client.auth.getSession();
  if (error) {
    throw error;
  }
  return data.session;
};

export const onAuthStateChange = (callback: (session: Session | null) => void) => {
  const client = ensureSupabase();
  return client.auth.onAuthStateChange((_event, session) => callback(session));
};

export const signInWithEmail = async (email: string, password: string) => {
  const client = ensureSupabase();
  const { data, error } = await client.auth.signInWithPassword({ email, password });
  if (error) {
    throw error;
  }
  return data.session;
};

export const signUpWithEmail = async (email: string, password: string) => {
  const client = ensureSupabase();
  const { data, error } = await client.auth.signUp({ email, password });
  if (error) {
    throw error;
  }
  return data.session;
};

export const signOut = async () => {
  const client = ensureSupabase();
  const { error } = await client.auth.signOut();
  if (error) {
    throw error;
  }
};

const buildFileId = () => {
  if (typeof crypto !== 'undefined' && 'randomUUID' in crypto) {
    return crypto.randomUUID();
  }
  return `${Date.now()}-${Math.random().toString(36).slice(2)}`;
};

const getFileExtension = (fileName: string) => {
  const parts = fileName.split('.');
  return parts.length > 1 ? parts.pop() : 'mp4';
};

export const uploadVideoFile = async (file: File) => {
  const client = ensureSupabase();
  const bucket = ensureBucket();

  const fileId = buildFileId();
  const fileExt = getFileExtension(file.name);
  const filePath = `videos/${fileId}.${fileExt}`;

  const { error } = await client
    .storage
    .from(bucket)
    .upload(filePath, file, {
      cacheControl: '3600',
      upsert: false,
      contentType: file.type || 'video/mp4'
    });

  if (error) {
    throw error;
  }

  const { data } = client.storage.from(bucket).getPublicUrl(filePath);
  return { publicUrl: data.publicUrl, path: filePath };
};

type VideoRecord = {
  id: number;
  user_id: string;
  title: string;
  duration: string;
  orientation: 'portrait' | 'landscape';
  has_human: boolean;
  color: string;
  height_class: string;
  upload_date: string;
  is_deleted: boolean;
  is_favorite: boolean;
  url: string | null;
  thumbnail: string | null;
  project_id: number | null;
  storage_path: string | null;
};

export const saveVideoMetadata = async (video: Video, userId: string) => {
  const client = ensureSupabase();
  const payload: VideoRecord = {
    id: video.id,
    user_id: userId,
    title: video.title,
    duration: video.duration,
    orientation: video.orientation,
    has_human: video.hasHuman,
    color: video.color,
    height_class: video.heightClass,
    upload_date: video.uploadDate,
    is_deleted: video.isDeleted ?? false,
    is_favorite: video.isFavorite ?? false,
    url: video.url ?? null,
    thumbnail: video.thumbnail ?? null,
    project_id: video.projectId ?? null,
    storage_path: video.storagePath ?? null
  };

  const { error } = await client.from('videos').upsert(payload);
  if (error) {
    throw error;
  }
};

export const fetchVideos = async (userId: string) => {
  const client = ensureSupabase();
  const { data, error } = await client
    .from('videos')
    .select('*')
    .eq('user_id', userId)
    .order('upload_date', { ascending: false });

  if (error) {
    throw error;
  }

  return (data ?? []).map((record: VideoRecord): Video => ({
    id: record.id,
    title: record.title,
    duration: record.duration,
    orientation: record.orientation,
    hasHuman: record.has_human,
    color: record.color,
    heightClass: record.height_class,
    uploadDate: record.upload_date,
    isDeleted: record.is_deleted,
    isFavorite: record.is_favorite,
    url: record.url ?? undefined,
    thumbnail: record.thumbnail ?? undefined,
    projectId: record.project_id ?? undefined,
    storagePath: record.storage_path ?? undefined
  }));
};

export const deleteRemoteVideo = async (video: Video, userId: string) => {
  const client = ensureSupabase();
  const bucket = ensureBucket();

  if (video.storagePath) {
    const { error: storageError } = await client.storage.from(bucket).remove([video.storagePath]);
    if (storageError) {
      throw storageError;
    }
  }

  const { error } = await client.from('videos').delete().eq('id', video.id).eq('user_id', userId);
  if (error) {
    throw error;
  }
};
