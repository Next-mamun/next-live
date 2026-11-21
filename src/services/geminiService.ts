import { getAuthHeaders } from '@/lib/clientAuth';

export const enhancePostText = async (text: string): Promise<string> => {
  if (!text || !text.trim()) return text;
  try {
    const headers = await getAuthHeaders({ 'Content-Type': 'application/json' });
    const res = await fetch('/api/ai/enhance-post', {
      method: 'POST',
      headers,
      body: JSON.stringify({ text: text.slice(0, 2000) }),
    });
    if (!res.ok) return text;
    const data = await res.json();
    return data.text || text;
  } catch (error) {
    console.error('AI post enhancement failed:', error);
    return text;
  }
};

export const generateImage = async (_prompt: string): Promise<string | null> => {
  return null;
};

export const generateBio = async (username: string): Promise<string> => {
  try {
    const headers = await getAuthHeaders({ 'Content-Type': 'application/json' });
    const res = await fetch('/api/ai/generate-bio', {
      method: 'POST',
      headers,
      body: JSON.stringify({ username: String(username || '').slice(0, 40) }),
    });
    if (!res.ok) return 'Just joined Next!';
    const data = await res.json();
    return data.bio || 'Just joined Next!';
  } catch {
    return 'Exploring the world of Next.';
  }
};
