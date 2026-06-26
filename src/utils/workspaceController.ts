import { getCachedAccessToken, db } from '../firebase';
import { doc, setDoc, serverTimestamp } from 'firebase/firestore';

export class GoogleWorkspaceService {
  private static instance: GoogleWorkspaceService;
  
  private constructor() {}

  public static getInstance(): GoogleWorkspaceService {
    if (!GoogleWorkspaceService.instance) {
      GoogleWorkspaceService.instance = new GoogleWorkspaceService();
    }
    return GoogleWorkspaceService.instance;
  }

  private async fetchGoogleAPI(url: string, options: RequestInit = {}) {
    const token = getCachedAccessToken();
    if (!token) {
      throw new Error("No Google Access Token available. Call this only after auth.");
    }
    
    if (!options.headers) {
      options.headers = {};
    }
    (options.headers as Record<string, string>)['Authorization'] = `Bearer ${token}`;
    
    const response = await fetch(url, options);
    if (!response.ok) {
      if (response.status === 401) {
        throw new Error("Google access token has expired or is invalid.");
      }
      const errorText = await response.text();
      throw new Error(`Google API Error (${response.status}): ${errorText}`);
    }
    
    return response.json();
  }

  // --- Gmail ---
  async getGmailProfile() {
    return this.fetchGoogleAPI('https://gmail.googleapis.com/gmail/v1/users/me/profile');
  }

  // --- Calendar ---
  async getCalendarEvents(calendarId: string = 'primary', maxResults: number = 20) {
    const timeMin = new Date().toISOString();
    return this.fetchGoogleAPI(`https://www.googleapis.com/calendar/v3/calendars/${encodeURIComponent(calendarId)}/events?maxResults=${maxResults}&timeMin=${encodeURIComponent(timeMin)}&singleEvents=true&orderBy=startTime`);
  }

  // --- Tasks ---
  async getTaskLists() {
    return this.fetchGoogleAPI('https://tasks.googleapis.com/tasks/v1/users/@me/lists');
  }

  // --- Meet ---
  async createMeetingSpace(title: string) {
    return this.fetchGoogleAPI('https://meet.googleapis.com/v2/spaces', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      // Note: Meet v2 spaces creation API requires {} body if not supplying advanced config
      body: JSON.stringify({})
    });
  }

  // --- Contacts ---
  async getConnections() {
    return this.fetchGoogleAPI('https://people.googleapis.com/v1/people/me/connections?personFields=names,emailAddresses,phoneNumbers,photos&pageSize=1000');
  }

  // --- Picker/Drive ---
  // Drive list for picker placeholder
  async getFiles(maxResults: number = 10) {
    return this.fetchGoogleAPI(`https://www.googleapis.com/drive/v3/files?pageSize=${maxResults}&fields=files(id,name,mimeType)`);
  }

  // --- Sync to Firestore ---
  async syncWorkspaceToFirestore(shopId: string) {
    try {
      const dbRef = doc(db, 'shops', shopId, 'workspace', 'sync_status');
      
      const [profile, events, tasks] = await Promise.allSettled([
        this.getGmailProfile(),
        this.getCalendarEvents(),
        this.getTaskLists()
      ]);

      const syncData = {
        lastSync: serverTimestamp(),
        gmail: profile.status === 'fulfilled' ? profile.value : { error: profile.reason?.message },
        calendar: events.status === 'fulfilled' ? { eventCount: events.value.items?.length || 0 } : { error: events.reason?.message },
        tasks: tasks.status === 'fulfilled' ? { listCount: tasks.value.items?.length || 0 } : { error: tasks.reason?.message }
      };

      await setDoc(dbRef, syncData, { merge: true });
      console.log('Workspace auto-sync to Firestore completed.');
    } catch (e) {
      console.error('Failed to sync Workspace to Firestore:', e);
    }
  }
}

export const workspaceController = GoogleWorkspaceService.getInstance();
