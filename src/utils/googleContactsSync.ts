import { auth, googleProvider, db, collection, getDocs, setDoc, doc, serverTimestamp, writeBatch, getCachedAccessToken, setCachedAccessToken } from '../firebase';
import { signInWithPopup, GoogleAuthProvider } from 'firebase/auth';

export async function syncGoogleContacts(
  shopId: string, 
  existingCustomers: any[],
  onProgress: (msg: string) => void,
  silent: boolean = false
) {
  try {
    let token = getCachedAccessToken();
    
    if (!token) {
      if (silent) {
        // Just return if silent and no token, instead of popping up
        return { downloaded: 0, uploaded: 0 };
      }
      onProgress('Authenticating with Google...');
      const result = await signInWithPopup(auth, googleProvider);
      const credential = GoogleAuthProvider.credentialFromResult(result);
      if (!credential?.accessToken) {
        throw new Error("Failed to get Google Access Token.");
      }
      token = credential.accessToken;
      setCachedAccessToken(token);
    }

    onProgress('Fetching Google Contacts...');
    let url = 'https://people.googleapis.com/v1/people/me/connections?personFields=names,emailAddresses,phoneNumbers,photos&pageSize=1000';
    let allGoogleContacts: any[] = [];
    
    let hasMore = true;
    while(hasMore) {
      const res = await fetch(url, {
        headers: { Authorization: `Bearer ${token}` }
      });
      if (!res.ok) {
         if (res.status === 401) {
            // Token expired or invalid
            setCachedAccessToken(null);
            if (silent) {
               return { downloaded: 0, uploaded: 0 };
            }
            throw new Error("Authentication expired. Please try syncing again.");
         }
         throw new Error(`Google API error: ${res.statusText}`);
      }
      const data = await res.json();
      if (data.connections) {
        allGoogleContacts = allGoogleContacts.concat(data.connections);
      }
      if (data.nextPageToken) {
        url = `https://people.googleapis.com/v1/people/me/connections?personFields=names,emailAddresses,phoneNumbers,photos&pageSize=1000&pageToken=${data.nextPageToken}`;
      } else {
        hasMore = false;
      }
    }

    onProgress('Identifying missing contacts to download...');
    
    // Normalizing phone numbers for comparison
    const normPhone = (num: string) => num.replace(/\D/g, '').slice(-10); // get last 10 digits
    const existingPhones = new Set(existingCustomers.map(c => c.phone ? normPhone(c.phone) : '').filter(Boolean));
    
    const contactsToDownload = allGoogleContacts.filter(gc => {
      const phones = gc.phoneNumbers || [];
      if (!phones.length) return false;
      return !phones.some((p: any) => existingPhones.has(normPhone(p.value)));
    });

    onProgress(`Downloading ${contactsToDownload.length} new contacts to App...`);
    const batch = writeBatch(db);
    let downloadedCount = 0;
    
    for (const gc of contactsToDownload) {
      const name = gc.names?.[0]?.displayName || "Unknown Contact";
      const phone = gc.phoneNumbers?.[0]?.value || "";
      const email = gc.emailAddresses?.[0]?.value || "";
      const photoUrl = gc.photos?.[0]?.url || "";
      
      const newCustomId = `CST${Math.floor(Date.now() / 1000)}${Math.floor(Math.random() * 1000)}`;
      const docRef = doc(db, 'customers', newCustomId);
      
      batch.set(docRef, {
        name,
        phone,
        email,
        photoUrl,
        shopId: shopId,
        totalPurchases: 0,
        totalSpent: 0,
        currentDue: 0,
        address: '',
        dateAdded: new Date().toISOString(),
        timestamp: serverTimestamp(),
        customId: newCustomId,
        syncedWithGoogle: true,
        googleResourceName: gc.resourceName
      });
      downloadedCount++;
    }

    if (downloadedCount > 0) {
      await batch.commit();
    }

    onProgress('Identifying un-synced App customers...');
    
    // Upload missing local customers to Google Contacts
    const googlePhones = new Set();
    allGoogleContacts.forEach(gc => {
      if (gc.phoneNumbers) {
        gc.phoneNumbers.forEach((p: any) => googlePhones.add(normPhone(p.value)));
      }
    });

    const customersToUpload = existingCustomers.filter(c => {
      if (!c.phone) return false;
      return !googlePhones.has(normPhone(c.phone));
    });

    onProgress(`Uploading ${customersToUpload.length} app customers to Google Contacts...`);

    let uploadedCount = 0;
    for (const c of customersToUpload) {
      const newContact = {
        names: [{ givenName: c.name }],
        phoneNumbers: [{ value: c.phone, type: 'mobile' }],
        emailAddresses: c.email ? [{ value: c.email }] : [],
      };

      const res = await fetch('https://people.googleapis.com/v1/people:createContact?personFields=names,emailAddresses,phoneNumbers', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify(newContact)
      });
      
      if (res.ok) {
        uploadedCount++;
        const createdContact = await res.json();
        
        // Push photo if available
        if (c.photoUrl && c.photoUrl.startsWith('data:image')) {
          const base64Data = c.photoUrl.split(',')[1];
          if (base64Data) {
            try {
              await fetch(`https://people.googleapis.com/v1/${createdContact.resourceName}:updateContactPhoto`, {
                method: 'PATCH',
                headers: {
                  'Authorization': `Bearer ${token}`,
                  'Content-Type': 'application/json'
                },
                body: JSON.stringify({ photoBytes: base64Data })
              });
            } catch (err) {
              console.warn("Failed to upload contact photo", err);
            }
          }
        }
      }
    }

    onProgress(`Sync Complete! Downloaded: ${downloadedCount}, Uploaded: ${uploadedCount}`);
    setTimeout(() => onProgress(''), 3000);
    
    return { downloaded: downloadedCount, uploaded: uploadedCount };
  } catch (error: any) {
    console.error("Contact Sync Error", error);
    if (!silent) {
      onProgress(`Sync Error: ${error.message}`);
      setTimeout(() => onProgress(''), 5000);
      throw error;
    }
    return { downloaded: 0, uploaded: 0 };
  }
}
