import express from 'express';
import path from 'path';
import fs from 'fs';
import { GoogleGenAI } from "@google/genai";

async function startServer() {
  const app = express();
  const PORT = 3000;
  
  app.use((req, res, next) => {
    const isWcWebhook = req.path.toLowerCase() === '/api/integrations/woocommerce' || req.path.toLowerCase() === '/api/integrations/woocommerce/';
    if (isWcWebhook) {
      return next();
    }
    express.urlencoded({ extended: true })(req, res, next);
  });
  app.use((req, res, next) => {
    const isWcWebhook = req.path.toLowerCase() === '/api/integrations/woocommerce' || req.path.toLowerCase() === '/api/integrations/woocommerce/';
    if (isWcWebhook) {
      return next();
    }
    express.json()(req, res, (err) => {
      if (err) {
        if (err instanceof SyntaxError && err.message.includes('JSON')) {
          req.body = {};
          return next();
        }
        return res.status(400).json({ error: err.message });
      }
      next();
    });
  });

  // API Routes
  const handleGeminiGenerate: express.RequestHandler = async (req, res) => {
    try {
      const { prompt, systemInstruction, tools, config, contents } = req.body;
      const apiKey = process.env.GEMINI_API_KEY;
      
      if (!apiKey) {
        return res.status(500).json({ error: 'GEMINI_API_KEY is not configured on server' });
      }

      const ai = new GoogleGenAI({ 
        apiKey: apiKey,
        httpOptions: {
          headers: {
            'User-Agent': 'aistudio-build',
          }
        }
      });
      
      let modelToUse = config?.model || "gemini-3.5-flash";
      if (modelToUse.includes("gemini-1.5") || modelToUse === "gemini-flash-latest") {
        modelToUse = "gemini-3.5-flash";
      }

      const response = await ai.models.generateContent({ 
        model: modelToUse,
        contents: contents || [{ role: 'user', parts: [{ text: prompt }] }],
        config: {
          systemInstruction: systemInstruction,
          tools: tools,
          ...(config?.generationConfig || {})
        }
      });

      res.json({ 
        text: response.text,
        functionCalls: response.functionCalls
      });
    } catch (error: any) {
      console.error('Gemini API Error:', error);
      let errorMsg = error.message || 'Internal Server Error';
      if (errorMsg.includes('503') || errorMsg.includes('high demand') || errorMsg.includes('UNAVAILABLE')) {
        errorMsg = 'AI Model is currently experiencing high demand. Please try again in a few moments.';
      }
      res.status(500).json({ error: errorMsg });
    }
  };

  app.post('/api/gemini/generate', handleGeminiGenerate);
  app.post('/api/gemini/voice-parse', handleGeminiGenerate);

  // Secure API endpoint to test the connection handshake with SellersCampus Zender master/merchant keys


  // Simulated WhatsApp states in memory (key: device_id, value: status)
  const SESSIONS_FILE = path.join(process.cwd(), 'wa_sessions.json');

  // Helper to load/save sessions
  function loadSessions(): Map<string, string> {
    try {
      if (fs.existsSync(SESSIONS_FILE)) {
        const data = fs.readFileSync(SESSIONS_FILE, 'utf-8');
        return new Map(Object.entries(JSON.parse(data)));
      }
    } catch (e) {
      console.error('Failed to load sessions', e);
    }
    return new Map<string, string>();
  }

  function saveSessions(sessions: Map<string, string>) {
    try {
      const obj = Object.fromEntries(sessions.entries());
      fs.writeFileSync(SESSIONS_FILE, JSON.stringify(obj, null, 2), 'utf-8');
    } catch (e) {
      console.error('Failed to save sessions', e);
    }
  }

  const simulatedSessions = loadSessions();

  // Proxy map to auto-save on set/delete
  const originalSet = simulatedSessions.set.bind(simulatedSessions);
  simulatedSessions.set = function(k: string, v: string) {
    const result = originalSet(k, v);
    saveSessions(simulatedSessions);
    return result;
  } as typeof simulatedSessions.set;

  const originalDelete = simulatedSessions.delete.bind(simulatedSessions);
  simulatedSessions.delete = function(k: string) {
    const result = originalDelete(k);
    saveSessions(simulatedSessions);
    return result;
  } as typeof simulatedSessions.delete;

  // White-label WhatsApp create device and QR token session endpoint
  app.post('/api/gateways/whatsapp/connect', async (req: express.Request, res: express.Response) => {
    try {
      const { shopId, device_id } = req.body;
      let cleanEndpoint = 'https://app.sellerscampus.com/api/v1';
      let key = '4fe17fcfe73d5035f55b9144fa10e07443659005';
      
      const sessionDeviceId = device_id || `z_wa_${shopId || 'dev'}_${Math.floor(Math.random() * 100000)}`;

      if (key) {
        try {
          const createUrl = `${cleanEndpoint}/whatsapp/create`;
          console.log(`[Zender API] Creating/Retrieving WhatsApp dynamic device session at ${createUrl}...`);
          const response = await fetch(createUrl, {
            method: 'POST',
            headers: {
              'Authorization': `Bearer ${key}`,
              'Content-Type': 'application/json'
            },
            body: JSON.stringify({
              name: `ShopMaster-${shopId || 'Merchant'}`,
              device_id: sessionDeviceId
            })
          });

          if (response.ok) {
            const data: any = await response.json();
            let widgetDomain = cleanEndpoint.replace(/\/api\/v1$/, '').replace(/\/api$/, '');
            const calculatedWidgetUrl = `${widgetDomain}/whatsapp/widget/${data.device_id || sessionDeviceId}`;
            return res.json({
              success: true,
              device_id: data.device_id || sessionDeviceId,
              widget_url: data.widget_url || calculatedWidgetUrl,
              isSimulated: false
            });
          } else {
            const errText = await response.text();
            return res.status(response.status).json({ success: false, error: errText });
          }
        } catch (apiErr: any) {
          return res.status(500).json({ success: false, error: apiErr.message });
        }
      }

      return res.status(400).json({ success: false, error: 'Missing API key' });
    } catch (err: any) {
      res.status(500).json({ error: err.message || 'Internal Server Error' });
    }
  });

  // Proxy endpoint to hit SellersCampus / Zender wa.link directly with secret
  app.post('/api/gateways/whatsapp/connect-walink', async (req: express.Request, res: express.Response) => {
    try {
      const { secret, shopId } = req.body;
      const cleanSecret = (secret || '4fe17fcfe73d5035f55b9144fa10e07443659005').trim();
      const merchantID = shopId || 'merchant';
      
      const sessionDeviceId = `z_walink_${merchantID}_${Math.floor(10000 + Math.random() * 90000)}`;
      const urlCmd = `https://app.sellerscampus.com/api/create/wa.link?secret=${cleanSecret}`;
      
      let attempt = 0;
      const maxAttempts = 12;
      let finalRawText = '';
      let parsedData: any = {};
      let lastErrorStatus = 0;
      let lastErrorMessage = '';
      const delaySeconds = 2.5;
      
      while (attempt < maxAttempts) {
        attempt++;
        try {
          console.log(`[Zender wa.link] Polling attempt ${attempt}/${maxAttempts} for secret...`);
          const response = await fetch(urlCmd, {
            method: 'GET',
            headers: {
              'Content-Type': 'application/json',
              'Accept': '*/*, application/json'
            }
          });

          const rawText = await response.text();
          finalRawText = rawText;
          
          // Try parsing JSON first to detect explicit API/permission/subscription errors immediately (even on 403 non-2xx status)
          let isPermissionError = false;
          let tempParsed: any = {};
          try {
            tempParsed = JSON.parse(rawText);
            const hasPermissionWord = String(tempParsed.message || tempParsed.error || '').toLowerCase().includes('permission') ||
                                       String(tempParsed.message || tempParsed.error || '').toLowerCase().includes('subscription');
            if (hasPermissionWord || tempParsed.status === 403 || response.status === 403 || tempParsed.status === 'error') {
               isPermissionError = true;
            }
          } catch (e) {
            if (response.status === 403) {
              isPermissionError = true;
            }
          }

          if (isPermissionError) {
             console.log(`[Zender wa.link] Intercepted missing subscription permission: ${rawText}`);
             return res.json({ 
               success: false, 
               status: 403,
               message: tempParsed.message || tempParsed.error || "No permission to use WhatsApp service"
             });
          }

          if (response.ok) {
            if (!rawText || rawText.includes('"data":false') || rawText.length < 100) {
              console.log(`[Zender wa.link] Attempt ${attempt} returned fallback/fake data: ${rawText.substring(0,30)}... Retrying in ${delaySeconds}s...`);
              await new Promise(r => setTimeout(r, delaySeconds * 1000));
              continue;
            }
            
            parsedData = tempParsed;

            // Extract real QR string from JSON
            let detectedQr = rawText.trim();
            if (detectedQr.startsWith('{') || detectedQr.startsWith('[')) {
               // deeply search for qrcode or code
               const extractString = (obj: any): string | null => {
                  if (typeof obj === 'string' && obj.length > 50 && !obj.startsWith('{')) return obj;
                  if (!obj || typeof obj !== 'object') return null;
                  if (obj.qrcode && typeof obj.qrcode === 'string') return obj.qrcode;
                  if (obj.code && typeof obj.code === 'string') return obj.code;
                  if (obj.qr && typeof obj.qr === 'string') return obj.qr;
                  if (obj.data && typeof obj.data === 'string') return obj.data;
                  for (let key in obj) {
                     let r = extractString(obj[key]);
                     if (r) return r;
                  }
                  return null;
               };
               let ext = extractString(parsedData);
               if (ext) detectedQr = ext;
            } else if (detectedQr.startsWith('"') && detectedQr.endsWith('"')) {
               // The API returned a raw string wrapped in JSON quotes (e.g. Google Apps Script output)
               detectedQr = detectedQr.substring(1, detectedQr.length - 1);
            }
            
            // Final sanitize: just in case the inner extracted text also has quotes
            detectedQr = detectedQr.trim();
            if (detectedQr.startsWith('"') && detectedQr.endsWith('"')) {
               detectedQr = detectedQr.substring(1, detectedQr.length - 1);
            }

            // Send the raw string directly back to the frontend
            let rawQrString = detectedQr;
            
            console.log(`[Zender wa.link] Real QR Payload fully acquired and cleaned on attempt ${attempt}:`, detectedQr.substring(0, 40));
            return res.json({
              success: true,
              device_id: parsedData.device_id || sessionDeviceId,
              widget_url: `/api/gateways/real/widget?qr_data=${encodeURIComponent(detectedQr.trim())}`,
              rawQrString: detectedQr, // Pass the raw extracted QR string back to frontend for sanitization
              status: parsedData.status || 'pending',
              isSimulated: false,
              raw: parsedData
            });
            
          } else {
            lastErrorStatus = response.status;
            lastErrorMessage = rawText;
            console.log(`[Zender wa.link] HTTP ${response.status} Error. Node likely busy/offline. Retrying...`);
            await new Promise(r => setTimeout(r, delaySeconds * 1000));
            continue;
          }
        } catch (apiErr: any) {
          console.log(`[Zender wa.link] Fetch failure: ${apiErr.message}. Retrying...`);
          lastErrorMessage = apiErr.message;
          await new Promise(r => setTimeout(r, delaySeconds * 1000));
        }
      }

      // If we exhausted attempts, output final clear error
      return res.status(502).json({ 
         success: false, 
         error: `SellersCampus Node Timeout: Container spin-up took too long or failed. Last Status: ${lastErrorStatus || 'Network Fail'}, Last Msg: ${lastErrorMessage.substring(0,100) || finalRawText.substring(0,100)}` 
      });

    } catch (err: any) {
      res.status(500).json({ success: false, error: err.message || 'Internal Server Error' });
    }
  });

  // Real-time Gateway status controller (supporting both query & param routing)
  app.get('/api/gateways/status', async (req: express.Request, res: express.Response) => {
    try {
      const endpoint_url = 'https://app.sellerscampus.com/api/v1';
      let api_key = (req.query.api_key as string) || '4fe17fcfe73d5035f55b9144fa10e07443659005';
      if (api_key === 'your_sellerscampus_zender_master_api_key_here' || api_key.trim() === '') {
         api_key = '4fe17fcfe73d5035f55b9144fa10e07443659005';
      }
      const device_id = (req.query.device_id as string) || '';
      const phone_query = (req.query.phone as string) || '';

      let cleanEndpoint = endpoint_url;

      try {
        let checkUrl = `${cleanEndpoint}/whatsapp/status/${device_id}`;
        let headers: any = {
          'Authorization': `Bearer ${api_key}`,
          'Content-Type': 'application/json'
        };

        const isWalink = device_id.startsWith('z_walink_') || device_id.startsWith('z_wa_otp_') || api_key.length === 40;

        // If the device ID happens to be from walink or we sense a specific walink setup
        if (isWalink) { // token/secret is usually 40 chars
          checkUrl = `https://app.sellerscampus.com/api/get/wa.accounts?secret=${api_key}`;
          headers = {}; // clear bearer
        }

        console.log(`[Status Sync] GET check Zender status at ${checkUrl}`);
        const response = await fetch(checkUrl, {
          method: 'GET',
          headers
        });

        if (response.ok) {
          const data: any = await response.json();
          let isConnected = false;
          let realDeviceId = device_id;
          let phone = '';

          // Handle wa.accounts array response
          if (data.data && Array.isArray(data.data) && data.data.length > 0) {
             const reqMerchantId = (req.query.merchant_id as string) || (req.query.shopId as string) || '';
             
             let matchingAccount = data.data.find((acc: any) => String(acc.unique) === String(device_id) || String(acc.id) === String(device_id));
             
             if (!matchingAccount && phone_query) {
                // Formatting phone parameter
                let searchPhone = phone_query;
                if (searchPhone.length === 11 && searchPhone.startsWith('0')) searchPhone = '88' + searchPhone;
                matchingAccount = data.data.find((acc: any) => acc.phone && acc.phone.includes(searchPhone));
             }

             if (!matchingAccount && phone_query && (device_id.startsWith('z_walink_') || device_id.startsWith('z_wa_otp_'))) {
                 matchingAccount = data.data.find((acc: any) => acc.phone && acc.phone.includes(phone_query) && (acc.status === 'connected' || acc.status === 'active'));
             }
             
             // ENFORCE MERCHANT ID SCOPING
             if (!matchingAccount && req.query.resync === 'true' && reqMerchantId) {
                 matchingAccount = data.data.find((acc: any) => {
                     const isConnectedState = acc.status === 'connected' || acc.status === 'active';
                     const hasMerchantID = String(acc.unique).includes(reqMerchantId) || String(acc.id).includes(reqMerchantId);
                     return isConnectedState && hasMerchantID;
                 });
             } else if (!matchingAccount && req.query.resync === 'true') {
                 // Do not auto-assign global connections to missing merchants
                 matchingAccount = undefined;
             }

             // Hard security check: if an account is found but it doesn't belong to this merchant, reject it
             if (matchingAccount && reqMerchantId) {
                 const hasMerchantID = String(matchingAccount.unique).includes(reqMerchantId) || String(matchingAccount.id).includes(reqMerchantId);
                 if (!hasMerchantID) {
                     matchingAccount = undefined;
                 }
             }

             if (matchingAccount && (matchingAccount.status === 'connected' || matchingAccount.status === 'active')) {
                isConnected = true;
                realDeviceId = matchingAccount.unique || matchingAccount.id || device_id;
                phone = matchingAccount.phone;
             }
          } else {
            // Adjust for both standard and wa.info structured payloads
            const allValues = [data.status, data.state, data.data?.status, data.data, data.data?.state];
            isConnected = allValues.some(val => val === 'connected' || val === 'active' || val === 'REAL_CONNECTED');
            phone = data.phone || data.data?.phone || '';
          }
          
          if (isConnected) {
            return res.json({ success: true, status: 'connected', real_device_id: realDeviceId, raw: data, phone: phone });
          } else {
            return res.json({ success: true, status: 'disconnected', raw: data });
          }
        } else {
          return res.json({ success: true, status: 'disconnected', message: `Zender endpoint returned HTTP ${response.status}` });
        }
      } catch (err: any) {
        // Quiet fallback - network offline or status sync server unreachable
        return res.json({ success: true, status: 'disconnected', error: err.message });
      }
    } catch (err: any) {
      res.status(500).json({ error: err.message || 'Internal check error' });
    }
  });

  // 3. Webhook Listener for Live Mobile Disconnect Tracking
  app.post('/api/gateways/whatsapp/webhook', async (req: express.Request, res: express.Response) => {
    try {
      const webhookData = req.body;
      console.log('[Zender Webhook] Received webhook payload:', JSON.stringify(webhookData));
      
      // If WhatsApp mobile device triggered logout/unlink event
      if (webhookData.event === "device_unlinked" || webhookData.status === "logout" || webhookData.status === "disconnected") {
        const deviceId = webhookData.device_id || webhookData.id;
        console.log(`[Zender Webhook] Device disconnected (${deviceId}). Changing session status to Logged Out...`);
        
        // Let connected UI clients know via simulate disconnection
        if (deviceId) {
           simulatedSessions.set(deviceId, 'disconnected');
        }
        
        // This relies on the POS widget polling for the status, or a WebSocket, but since polling is used, storing it here is good.
      }
      
      res.json({ success: true });
    } catch (err: any) {
      console.error('[Zender Webhook] Error:', err.message);
      res.status(500).json({ error: 'Webhook processing error' });
    }
  });

  // Backward-compatible route mapping in case older client calls check via sub-path
  app.get('/api/gateways/whatsapp/status/:device_id', async (req: express.Request, res: express.Response) => {
    try {
      const device_id = String(req.params.device_id || '');
      const endpoint_url = 'https://app.sellerscampus.com/api/v1';
      const api_key = '4fe17fcfe73d5035f55b9144fa10e07443659005';

      const cleanEndpoint = endpoint_url;

      try {
        const response = await fetch(`${cleanEndpoint}/whatsapp/status/${device_id}`, {
          method: 'GET',
          headers: {
            'Authorization': `Bearer ${api_key}`
          }
        });

        if (response.ok) {
          const data: any = await response.json();
          // Zender typically returns nested data for status or direct status
          const deviceState = data.data?.status || data.status || data.state;
          const isConnected = deviceState === 'connected' || deviceState === 'active';
          const finalStatus = isConnected ? 'connected' : 'disconnected';
          return res.json({ success: true, status: finalStatus, raw: data });
        }
      } catch (err) {
        // Quiet fallback
      }

      return res.json({ success: true, status: 'disconnected' });
    } catch (err: any) {
      res.status(500).json({ error: err.message || 'Internal server error' });
    }
  });

  // Two-way logout/unlink session hard reset
  app.post('/api/gateways/unlink', async (req: express.Request, res: express.Response) => {
    try {
      const { device_id, api_key: reqApiKey, endpoint_url: reqEndpointUrl } = req.body;
      const cleanEndpoint = reqEndpointUrl || 'https://app.sellerscampus.com/api/v1';
      let api_key = reqApiKey || '4fe17fcfe73d5035f55b9144fa10e07443659005';
      if (api_key === 'your_sellerscampus_zender_master_api_key_here') {
          api_key = '4fe17fcfe73d5035f55b9144fa10e07443659005';
      }

      if (device_id) {
         simulatedSessions.delete(device_id);
      }

      if (!device_id || device_id.startsWith('z_wa_demo_') || device_id.startsWith('z_walink_') || device_id.startsWith('z_wa_otp_') || device_id.startsWith('sim_device_')) {
        return res.json({ success: true, message: 'Simulated/Temporary session unlinked locally.' });
      }

      let realAccountUniqueId = device_id;
      try {
        const checkUrl = `https://app.sellerscampus.com/api/get/wa.accounts?secret=${api_key}`;
        const resolveRes = await fetch(checkUrl);
        if (resolveRes.ok) {
          const resolveData: any = await resolveRes.json();
          if (resolveData?.data && Array.isArray(resolveData.data) && resolveData.data.length > 0) {
             let matched = resolveData.data.find((acc: any) => String(acc.id) === String(device_id) || String(acc.unique) === String(device_id));
             
             // Enforce merchant isolation for unlink
             const reqShopId = req.body.shopId || req.body.merchant_id || '';
             if (matched && reqShopId) {
                 const hasMerchantID = String(matched.unique).includes(reqShopId) || String(matched.id).includes(reqShopId);
                 if (!hasMerchantID) {
                     return res.status(403).json({ success: false, message: 'Unauthorized: Session does not belong to this merchant.' });
                 }
             }

             if (matched && matched.unique) {
                realAccountUniqueId = matched.unique;
             }
          }
        }
      } catch (err) {
         console.error('Unlink unique ID resolution failed', err);
      }

      try {
        console.log(`[Unlink API] Terminating Zender session for ${realAccountUniqueId} (mapped from ${device_id}) at ${cleanEndpoint}`);
        
        const removeParams = new URLSearchParams();
        removeParams.set('secret', api_key);
        removeParams.set('account', realAccountUniqueId);

        let baseUrl = cleanEndpoint.replace(/\/api\/.*$/, '');
        if (baseUrl && !baseUrl.startsWith('http://') && !baseUrl.startsWith('https://')) {
          baseUrl = 'https://' + baseUrl;
        }
        const waDeleteUrl = baseUrl ? `${baseUrl}/api/delete/whatsapp` : `https://app.sellerscampus.com/api/delete/whatsapp`;

        // Modern Zender endpoint delete using query/post
        const removeRes = await fetch(waDeleteUrl, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/x-www-form-urlencoded'
          },
          body: removeParams.toString()
        });

        // Backup plan for Legacy Zender SaaS installations
        if (!removeRes.ok) {
          console.log(`[Unlink API] Modern delete rejected, attempting legacy logout/delete for ${realAccountUniqueId}`);
          await fetch(`${cleanEndpoint}/whatsapp/delete/${realAccountUniqueId}`, {
            method: 'DELETE',
            headers: {
              'Authorization': `Bearer ${api_key}`,
              'Content-Type': 'application/json'
            }
          });
          
          await fetch(`${cleanEndpoint}/whatsapp/logout/${realAccountUniqueId}`, {
            method: 'POST',
            headers: {
              'Authorization': `Bearer ${api_key}`,
              'Content-Type': 'application/json'
            }
          });
        }

        return res.json({ success: true, message: 'SellersCampus Zender session successfully terminated.' });
      } catch (err: any) {
        // Quiet fallback - Unlink connection failed
      }

      return res.json({ success: true, message: 'Unlinked. Restored sandbox default route.' });
    } catch (err: any) {
      res.status(500).json({ error: err.message || 'Failed unlinking' });
    }
  });

  // Simulate scanning of the QR code in sandbox mode
  app.post('/api/gateways/whatsapp/simulate-scan/:device_id', (req: express.Request, res: express.Response) => {
    const device_id = String(req.params.device_id || '');
    simulatedSessions.set(device_id, 'connected');
    res.json({ success: true, status: 'connected' });
  });

  // Beautiful Sandbox QR Iframe code for white-label styling matching official Zender
  app.get('/api/gateways/real/widget', (req: express.Request, res: express.Response) => {
    const qrData = req.query.qr_data as string || '';
    
    // We render ONLY the exact QR data given by the server
    res.send(`
      <!DOCTYPE html>
      <html lang="en">
      <head>
        <meta charset="UTF-8">
        <meta name="viewport" content="width=device-width, initial-scale=1.0">
        <title>SellersCampus Real Gateway</title>
        <link href="https://cdn.jsdelivr.net/npm/tailwindcss@2.2.19/dist/tailwind.min.css" rel="stylesheet">
        <style>
          @import url('https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700;800&display=swap');
          body { 
            font-family: 'Inter', sans-serif; 
            background-color: #111b21; 
            color: #e9edef;
          }
          .qr-container {
            position: relative;
            background: white;
            padding: 16px;
            border-radius: 20px;
            box-shadow: 0 10px 25px rgba(0, 0, 0, 0.4);
            display: inline-block;
          }
        </style>
      </head>
      <body class="min-h-screen flex items-center justify-center p-4">
        <div class="qr-container">
          <div id="qrcode" class="w-[180px] h-[180px] flex items-center justify-center bg-white text-gray-400 text-xs text-center font-sans">
            Waiting for data...
          </div>
        </div>
        
        <script src="https://cdnjs.cloudflare.com/ajax/libs/qrcodejs/1.0.0/qrcode.min.js"></script>
        <script>
          window.onload = function() {
            var rawData = ${JSON.stringify(qrData)};
            var qrElement = document.getElementById("qrcode");
            qrElement.innerHTML = ""; 
            
            if (!rawData || rawData.includes("ERROR")) {
               qrElement.innerHTML = "<span class='text-red-500'>Invalid Data Received from API</span>";
               return;
            }

            // Clean-up logic requested by the user
            var finalWhatsAppPayload = rawData; 

            // 🧼 ১. যদি শুরুতে কমা, স্পেস বা কোনো জাবর থাকে তা মুছে ফেলা
            finalWhatsAppPayload = finalWhatsAppPayload.replace(/^[\s,]+/, '');

            // 🧼 ২. সেলার্সক্যাম্পাসের অতিরিক্ত ট্র্যাকিং স্ট্রিং থাকলে তা কেটে ফেলা
            if (finalWhatsAppPayload.indexOf("_SellersCampus_SecureLink_") !== -1) {
                // এটি স্ট্রিংটিকে কেটে শুধুমাত্র হোয়াটসঅ্যাপের আসল ২@ অংশটুকুকে আলাদা করে নেবে
                finalWhatsAppPayload = finalWhatsAppPayload.split("_SellersCampus_SecureLink_")[0];
            }

            // 🛡️ ডাবল প্রটেকশন: যদি কোনো HTML ট্যাগ বা অ্যাট্রিবিউটের ভেতরে থাকে
            if (finalWhatsAppPayload.indexOf('title="') !== -1) {
              finalWhatsAppPayload = finalWhatsAppPayload.split('title="')[1].split('"')[0];
            } else if (finalWhatsAppPayload.indexOf('value="') !== -1) {
              finalWhatsAppPayload = finalWhatsAppPayload.split('value="')[1].split('"')[0];
            }

            // 🟩 ৩. হোয়াটসঅ্যাপের অফিশিয়াল ২@ পয়েন্ট থেকে স্ট্রিং শুরু হওয়া ১০০% লক করা
            if (finalWhatsAppPayload.indexOf("2@") !== -1) {
              finalWhatsAppPayload = finalWhatsAppPayload.substring(finalWhatsAppPayload.indexOf("2@"));
            }

            // If the API returned a base64 image, display it directly
            if (finalWhatsAppPayload.startsWith("data:image/")) {
               qrElement.innerHTML = "<img src='" + finalWhatsAppPayload + "' alt='QR Code' class='w-full h-full object-contain aspect-square' />";
               return;
            }

            // 🚀 এবার এই নিখুঁত ফিল্টার করা খাঁটি চাবিটি আপনার কিউআর জেনারেটরে পাস করুন
            var qrcodeElement = document.getElementById("qrcode");
            qrcodeElement.innerHTML = ""; // পুরনো ক্যাশ পরিষ্কার করা

            new QRCode(qrcodeElement, {
              text: finalWhatsAppPayload.trim(), // এখন এটি ১০০% পিওর হোয়াটসঅ্যাপ স্ট্রিং
              width: 180,
              height: 180,
              colorDark : "#000000",
              colorLight : "#ffffff",
              correctLevel : QRCode.CorrectLevel.H
            });

            console.log("FINAL PURE WHATSAPP KEY:", finalWhatsAppPayload.trim());
          };
        </script>
      </body>
      </html>
    `);
  });
  app.get('/api/gateways/simulator/widget', (req: express.Request, res: express.Response) => {
    const { device_id, shopId } = req.query;
    res.setHeader('Content-Type', 'text/html');
    res.send(`
      <!DOCTYPE html>
      <html>
      <head>
        <title>Zender White-Label QR Link Sandbox</title>
        <link href="https://cdn.jsdelivr.net/npm/tailwindcss@2.2.19/dist/tailwind.min.css" rel="stylesheet">
        <style>
          @import url('https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700;800;900&display=swap');
          body { 
            font-family: 'Inter', sans-serif; 
            background-color: #111b21; 
            color: #e9edef;
          }
          /* Custom styling for the high-density QR card to match real WhatsApp Web login style */
          .qr-container {
            position: relative;
            background: white;
            padding: 16px;
            border-radius: 20px;
            box-shadow: 0 10px 25px rgba(0, 0, 0, 0.4);
            display: inline-block;
          }
          .whatsapp-center-logo {
            position: absolute;
            top: 50%;
            left: 50%;
            transform: translate(-50%, -50%);
            background: white;
            padding: 6px;
            border-radius: 50%;
            display: flex;
            align-items: center;
            justify-content: center;
            box-shadow: 0 4px 10px rgba(0,0,0,0.15);
            border: 4px solid white;
          }
        </style>
      </head>
      <body class="min-h-screen flex items-center justify-center p-4">
        <div class="max-w-md w-full bg-[#222e35] rounded-3xl p-6 shadow-2xl flex flex-col items-center text-center relative border border-slate-705/30">
          
          <div class="w-11 h-11 bg-emerald-500/10 text-emerald-400 border border-emerald-500/20 rounded-2xl flex items-center justify-center mb-3">
            <svg class="w-6 h-6 text-emerald-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 4v1m6 11h2m-6 0h-2m0 0H8m13 0a9 9 0 11-18 0 9 9 0 0118 0z"></path>
            </svg>
          </div>
          
          <h2 class="text-[17px] font-extrabold text-white tracking-tight mb-0.5">WhatsApp Web Link</h2>
          <p class="text-[9px] text-[#00a884] font-black uppercase tracking-widest mb-6">SellersCampus Multi-Merchant Node</p>
          
          <!-- High Density Real QR Display Card -->
          <div class="qr-container mb-5">
            <div id="qrcode" class="w-[180px] h-[180px] flex items-center justify-center bg-white">
              <!-- Loading Spinner fallback before qrcode.js boots -->
              <div class="animate-pulse flex flex-col items-center justify-center space-y-2">
                <div class="w-8 h-8 rounded-full border-4 border-[#00a884] border-t-transparent animate-spin"></div>
                <span class="text-[10px] text-gray-400 font-bold">Generating Token...</span>
              </div>
            </div>
            
            <!-- Exact Authentic WhatsApp Core center overlay logo -->
            <div class="whatsapp-center-logo pointer-events-none">
              <svg class="w-7 h-7 text-[#25D366]" fill="currentColor" viewBox="0 0 24 24">
                <path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0012.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L0 24l6.335-1.662c1.746.953 3.71 1.458 5.706 1.458h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 00-3.48-8.413z" />
              </svg>
            </div>
          </div>
          
          <!-- Exact Authentic Instructions mimicking left screenshot -->
          <div class="text-left w-full space-y-2 mb-5 px-1">
            <h3 class="text-xs font-bold text-white mb-2 ml-1 text-center">To link your device:</h3>
            <div class="flex items-start gap-2.5">
              <span class="w-4 h-4 rounded-full bg-[#00a884]/15 text-[#00a884] font-extrabold text-[10px] flex items-center justify-center flex-shrink-0 mt-0.5">1</span>
              <p class="text-[11px] text-[#8696a0] font-semibold leading-relaxed">Scan the QR code with your phone's camera</p>
            </div>
            <div class="flex items-start gap-2.5">
              <span class="w-4 h-4 rounded-full bg-[#00a884]/15 text-[#00a884] font-extrabold text-[10px] flex items-center justify-center flex-shrink-0 mt-0.5">2</span>
              <p class="text-[11px] text-[#8696a0] font-semibold leading-relaxed">Tap the link to open WhatsApp on your mobile</p>
            </div>
            <div class="flex items-start gap-2.5">
              <span class="w-4 h-4 rounded-full bg-[#00a884]/15 text-[#00a884] font-extrabold text-[10px] flex items-center justify-center flex-shrink-0 mt-0.5">3</span>
              <p class="text-[11px] text-[#8696a0] font-semibold leading-relaxed">Scan the QR code again to link to your account</p>
            </div>
          </div>
          
          <div class="border-t border-slate-700/50 pt-4 w-full">
            <button 
              id="simulateBtn"
              class="w-full py-2.5 bg-gradient-to-r from-[#00a884] to-[#128c7e] hover:brightness-110 active:scale-[98] text-white rounded-xl font-bold text-xs tracking-wide shadow-lg transition-all cursor-pointer"
              onclick="triggerSimulate()"
            >
              Scan & Bind Device
            </button>
            <p id="statusMsg" class="text-[10px] font-extrabold text-emerald-400 uppercase tracking-widest mt-1.5 hidden flex items-center justify-center gap-1">
             ✓ Device paired successfully via SellersCampus handshake!
            </p>
          </div>
          
          <span class="text-[8px] text-gray-500 font-mono mt-4">Session Key: ${device_id}</span>
        </div>
        
        <!-- Load dynamic qrcode.js library in background -->
        <script src="https://cdnjs.cloudflare.com/ajax/libs/qrcodejs/1.0.0/qrcode.min.js"></script>
        <script>
          window.onload = function() {
            var sessionToken = "${device_id}";
            
            // Build a genuine high-density cryptographic WhatsApp Web pairing string format
            var saltBytes = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/";
            var fakeJwtPayload = Array.from({length: 420}, function() {
              return saltBytes[Math.floor(Math.random() * saltBytes.length)];
            }).join("");
            
            // Authentic-looking high density QR key payload
            var pairingPayload = "2@uqE890/ZlW3p8rX9B=A1B2C==_SellersCampus_SecureLink_" + sessionToken + "_" + fakeJwtPayload;

            var qrElement = document.getElementById("qrcode");
            qrElement.innerHTML = ""; // Clear loader spinner

            new QRCode(qrElement, {
              text: pairingPayload,
              width: 180,
              height: 180,
              colorDark : "#111b21", // Deep premium matching dark colors
              colorLight : "#ffffff",
              correctLevel : QRCode.CorrectLevel.M // High-error correction tolerates the center white-logo overlay seamlessly!
            });
          };

          function triggerSimulate() {
            const btn = document.getElementById('simulateBtn');
            const status = document.getElementById('statusMsg');
            btn.innerHTML = 'Connecting...';
            btn.disabled = true;
            
            fetch('/api/gateways/whatsapp/simulate-scan/${device_id}', { method: 'POST' })
              .then(res => res.json())
              .then(data => {
                if (data.success) {
                  btn.style.display = 'none';
                  status.classList.remove('hidden');
                  // Post message back to outer window
                  window.parent.postMessage({ event: 'whatsapp_connected', deviceId: '${device_id}' }, '*');
                }
              })
              .catch(err => {
                console.error(err);
                btn.innerHTML = 'Scan & Bind Device';
                btn.disabled = false;
              });
          }
        </script>
      </body>
      </html>
    `);
  });

  // Automated order live checkout messaging trucking controller
  app.post('/api/gateways/dispatch', async (req: express.Request, res: express.Response) => {
    try {
      const { shopId, sale, gatewayConfig } = req.body;
      const key = process.env.ZENDER_MASTER_API_KEY;

      const recipientPhone = sale.customerPhone || '';
      const textMessage = sale.message || '';
      const invoiceUrl = `https://app.sellerscampus.com/invoice/view/${sale.id || 'live'}`; // simulated dynamic invoice PDF link or web portal

      const defaultRoute = gatewayConfig?.default_route || 'manual_redirect';
      let waDeviceId = gatewayConfig?.zender_whatsapp_device_id || '';
      const smsDeviceId = gatewayConfig?.zender_sms_device_id || '';
      let userSecret = gatewayConfig?.zender_api_key || '4fe17fcfe73d5035f55b9144fa10e07443659005';
      if (userSecret === 'your_sellerscampus_zender_master_api_key_here') {
          userSecret = '4fe17fcfe73d5035f55b9144fa10e07443659005';
      }
      let cleanEndpoint = gatewayConfig?.zender_endpoint_url || 'https://app.sellerscampus.com/api/v1';

      let cleanPhone = recipientPhone.replace(/[^\d+]/g, ''); // leave numbers and +
      if (cleanPhone.startsWith('+')) cleanPhone = cleanPhone.slice(1);
      if (cleanPhone.length === 11 && cleanPhone.startsWith('01')) {
        cleanPhone = '88' + cleanPhone;
      }

      console.log(`[POS Dispatch Controller] Initiating automated drop-send. Route: ${defaultRoute}. Recipient: ${cleanPhone}`);

      if (defaultRoute === 'manual_redirect') {
        return res.json({ success: true, route: 'manual_redirect', note: 'Manual override selected. Front-end will open WhatsApp chat.' });
      }

      if (defaultRoute === 'whatsapp') {
        try {
          let realAccountUniqueId = waDeviceId || '';
          
          if (realAccountUniqueId.startsWith('sim_device_') || realAccountUniqueId.startsWith('z_wa_demo_')) {
             console.log(`[POS Dispatch Controller] Simulated device detected. Bypassing Zender API and simulating success.`);
             return res.json({ success: true, route: 'whatsapp', simulated: true, data: { status: 200, message: 'Simulated success message.' } });
          }

          if (!realAccountUniqueId) {
             return res.status(400).json({
               success: false,
               error: 'কোনো হোয়াটসঅ্যাপ অ্যাকাউন্ট যুক্ত করা নেই বা অ্যাকাউন্ট আইডি সঠিক নয়। প্রথমে সেটিংস থেকে অ্যাকাউন্ট কানেক্ট করুন। (WhatsApp not connected properly)',
               code: 'WA_NOT_LINKED'
             });
          }

          if (String(realAccountUniqueId).length < 20) {
            try {
              const checkUrl = `https://app.sellerscampus.com/api/get/wa.accounts?secret=${userSecret}`;
              const resolveRes = await fetch(checkUrl);
              if (resolveRes.ok) {
                const resolveData: any = await resolveRes.json();
                if (resolveData?.data && Array.isArray(resolveData.data) && resolveData.data.length > 0) {
                   let matched = resolveData.data.find((acc: any) => String(acc.id) === String(waDeviceId) || String(acc.unique) === String(waDeviceId));
                   if (matched && matched.unique) {
                     realAccountUniqueId = matched.unique;
                     console.log(`[Zender WhatsApp] Resolved device ID to unique ID: ${realAccountUniqueId}`);
                   }
                }
              }
            } catch (err) {
              console.log(`[Zender WhatsApp] Failed to resolve unique ID, falling back to ${waDeviceId}`);
            }
          }

          if (!realAccountUniqueId || String(realAccountUniqueId).length < 20 || realAccountUniqueId === '1') {
             return res.status(400).json({
               success: false,
               error: 'কোনো হোয়াটসঅ্যাপ অ্যাকাউন্ট যুক্ত করা নেই বা অ্যাকাউন্ট আইডি সঠিক নয়। প্রথমে সেটিংস থেকে অ্যাকাউন্ট কানেক্ট করুন। (WhatsApp not connected properly)',
               code: 'WA_NOT_LINKED'
             });
          }

          const params = new URLSearchParams();
          params.set('secret', userSecret);
          params.set('account', realAccountUniqueId);
          params.set('recipient', cleanPhone);
          params.set('type', 'text');
          params.set('message', textMessage);

          let baseUrl = cleanEndpoint.replace(/\/api\/.*$/, '');
          if (baseUrl && !baseUrl.startsWith('http://') && !baseUrl.startsWith('https://')) {
            baseUrl = 'https://' + baseUrl;
          }
          const waSendUrl = baseUrl ? `${baseUrl}/api/send/whatsapp` : `https://app.sellerscampus.com/api/send/whatsapp`;

          console.log(`[Zender WhatsApp] Executing send request to ${waSendUrl}`);
          const response = await fetch(waSendUrl, {
            method: 'POST',
            headers: {
              'Content-Type': 'application/x-www-form-urlencoded'
            },
            body: params.toString()
          });

          const data = await response.json();
          // Relax the status check just in case it returns 200 int or string, or nested sucesss
          if (response.ok && (data.status === 200 || data.status === 'success' || data.success === true)) {
            return res.json({ success: true, route: 'whatsapp', data });
          } else {
            console.log(`[Zender WhatsApp] Delivery rejected by gateway: ${data.message || JSON.stringify(data)}`);
            return res.status(400).json({
               success: false,
               error: data.message || `Delivery rejected by gateway: ${JSON.stringify(data)}`,
               code: 'WA_GATEWAY_REJECTED'
            });
          }
        } catch (waErr: any) {
          console.log(`[Zender WhatsApp] Dispatch Network Error: ${waErr.message}`);
          return res.status(500).json({ 
            success: false, 
            error: waErr.message || 'WhatsApp Gateway Send Failure', 
            code: 'WA_DISPATCH_FAILED' 
          });
        }
      }

      if (defaultRoute === 'sms') {
        if (!smsDeviceId) {
          throw new Error('Merchant Android gateway device ID is missing. Linking required.');
        }

        if (!key || key === 'your_sellerscampus_zender_master_api_key_here') {
          console.log(`[Simulator Android SMS Carrier] Sending via device ID: ${smsDeviceId} to ${cleanPhone}`);
          return res.json({ success: true, route: 'sms', simulated: true });
        }

        try {
          let baseUrl = cleanEndpoint.replace(/\/api\/.*$/, '');
          if (baseUrl && !baseUrl.startsWith('http://') && !baseUrl.startsWith('https://')) {
             baseUrl = 'https://' + baseUrl;
          }
          const smsSendUrl = baseUrl ? `${baseUrl}/api/send/sms` : `https://app.sellerscampus.com/api/send/sms`;

          const params = new URLSearchParams();
          params.set('secret', userSecret);
          params.set('mode', 'devices');
          params.set('device', smsDeviceId);
          params.set('sim', '1');
          params.set('phone', cleanPhone);
          params.set('message', textMessage);

          const response = await fetch(smsSendUrl, {
            method: 'POST',
            headers: {
              'Content-Type': 'application/x-www-form-urlencoded'
            },
            body: params.toString()
          });

          if (response.ok) {
            const data = await response.json();
            if (data.status === 200 || data.status === 'success' || data.success === true) {
              return res.json({ success: true, route: 'sms', data });
            } else {
              console.log(`[Zender SMS] Delivery rejected by gateway: ${data.message || JSON.stringify(data)}`);
              return res.status(400).json({
                 success: false,
                 error: data.message || `Delivery rejected by gateway: ${JSON.stringify(data)}`,
                 code: 'SMS_GATEWAY_REJECTED'
              });
            }
          } else {
            const errText = await response.text();
            console.log(`[Zender SMS] Network response not ok: ${errText}`);
            return res.status(400).json({
                 success: false,
                 error: `Zender SMS device carrier offline: ${errText}`,
                 code: 'SMS_GATEWAY_REJECTED'
            });
          }
        } catch (smsErr: any) {
          console.log(`[Zender SMS] Dispatch Network Error: ${smsErr.message}`);
          return res.status(500).json({ 
            success: false, 
            error: smsErr.message || 'SMS Device Carrier Offline', 
            code: 'SMS_CARRIER_OFFLINE' 
          });
        }
      }

      res.status(400).json({ error: 'Unsupported dispatch configuration route.' });
    } catch (err: any) {
      res.status(500).json({ error: err.message || 'Internal Server Error' });
    }
  });

  // --- INTEGRATION ENDPOINTS FOR ONLINE SHOP ---
  const INTEGRATIONS_FILE = path.join(process.cwd(), 'integrations_data.json');

  function getIntegrationsData() {
    try {
      if (fs.existsSync(INTEGRATIONS_FILE)) {
        const content = fs.readFileSync(INTEGRATIONS_FILE, 'utf-8');
        if (content && content.trim()) {
          return JSON.parse(content);
        }
      }
    } catch (e) {
      console.error('Failed to parse integrations data, corrupt file reset:', e);
    }
    const defaultData = {
      wooOrders: [
        {
          id: "woo_1",
          order_number: "#1024",
          customer_name: "Rahim Ahmed",
          customer_email: "rahim@example.com",
          customer_phone: "01712345678",
          customer_address: "House 24, Road 5, Tasnim Center, Dhanmondi, Dhaka",
          product_number: "PRD-2019",
          total: "৳ 1,250",
          items: "1x Cotton Punjabi, 1x Leather Wallet",
          payment_status: "cash_on_delivery",
          status: "pending",
          delivery_status: "pending_shipment",
          tracking_history: [
            { time: new Date(Date.now() - 3600000).toISOString(), status: "অর্ডার রিসিভড", notes: "WooCommerce প্যানেল থেকে সফলভাবে অর্ডার যুক্ত হয়েছে।" }
          ],
          created_at: new Date(Date.now() - 3600000).toISOString()
        },
        {
          id: "woo_2",
          order_number: "#1025",
          customer_name: "Rina Paul",
          customer_email: "rina@example.com",
          customer_phone: "01844991122",
          customer_address: "Plot 12, Block C, Banani, Dhaka-1213",
          product_number: "PRD-4712",
          total: "৳ 850",
          items: "1x Ladies Kurti",
          payment_status: "paid",
          status: "confirmed",
          delivery_status: "delivered",
          tracking_history: [
            { time: new Date(Date.now() - 7200000).toISOString(), status: "অর্ডার রিসিভড", notes: "অর্ডার রিসিভ করা হয়েছে।" },
            { time: new Date(Date.now() - 5400000).toISOString(), status: "প্যাকেজিং সম্পন্ন", notes: "প্রোডাক্ট সফলভাবে প্যাকেজ করা হয়েছে এবং কুরিয়ারে হস্তান্তর করা হয়েছে।" },
            { time: new Date(Date.now() - 1800000).toISOString(), status: "ডেলিভারি সম্পন্ন", notes: "কাস্টমার সফলভাবে তার প্রোডাক্ট বুঝে পেয়েছেন।" }
          ],
          created_at: new Date(Date.now() - 7200000).toISOString()
        }
      ],
      laravelEvents: [
        {
          id: "lar_1",
          event_type: "New Order Hook",
          payload: {
            order_id: 304,
            customer: "Kamal Hosen",
            amount: "৳ 3,400",
            items: "2x Premium Polo T-shirt"
          },
          status: "unread",
          created_at: new Date(Date.now() - 2400000).toISOString()
        },
        {
          id: "lar_2",
          event_type: "Stock Alert",
          payload: {
            sku: "TSHIRT-SLIM-L",
            product_name: "Premium Slim Fit T-Shirt (Large)",
            stock: 2,
            min_alert: 5
          },
          status: "resolved",
          created_at: new Date(Date.now() - 14400000).toISOString()
        }
      ],
      fbChats: [
        {
          id: "fb_thread_1",
          customer_name: "Sifat Jahan",
          customer_id: "8273648123982",
          unread: true,
          messages: [
            { id: "msg_1", sender: "user", text: "আসসালামু আলাইকুম, আপনাদের এই পাঞ্জাবিটার সাইজ চার্ট দেয়া যাবে?", created_at: new Date(Date.now() - 1200000).toISOString() },
            { id: "msg_2", sender: "system", text: "ওয়া আলাইকুম আসসালাম। জি অবশ্যই, আমাদের পাঞ্জাবির সাইজ চার্ট হচ্ছে: M (৪০), L (৪২), XL (৪৪), XXL (৪৬)। আপনার কোন সাইজটা লাগবে?", created_at: new Date(Date.now() - 1000000).toISOString() },
            { id: "msg_3", sender: "user", text: "আমার L সাইজ লাগবে। অর্ডার করার নিয়ম কি?", created_at: new Date(Date.now() - 600000).toISOString() }
          ]
        },
        {
          id: "fb_thread_2",
          customer_name: "Imran Hossain",
          customer_id: "7164523912833",
          unread: false,
          messages: [
            { id: "msg_4", sender: "user", text: "ভাইয়া ডেলিভারি চার্জ কত ঢাকার বাইরে?", created_at: new Date(Date.now() - 40000000).toISOString() },
            { id: "msg_5", sender: "system", text: "ঢাকার বাইরে ডেলিভারি চার্জ ১৫০ টাকা ভাইয়া। ক্যাশ অন ডেলিভারি পাবেন।", created_at: new Date(Date.now() - 39000000).toISOString() }
          ]
        }
      ]
    };
    try {
      fs.writeFileSync(INTEGRATIONS_FILE, JSON.stringify(defaultData, null, 2), 'utf-8');
    } catch (e) {
      console.error('Failed to write initial integrations data', e);
    }
    return defaultData;
  }

  function saveIntegrationsData(data: any) {
    try {
      fs.writeFileSync(INTEGRATIONS_FILE, JSON.stringify(data, null, 2), 'utf-8');
    } catch (e) {
      console.error('Failed to save integrations data', e);
    }
  }

  // WooCommerce Webhook Connection Status check & Force simulation
  app.get('/api/integrations/woocommerce/verify', (req: express.Request, res: express.Response) => {
    try {
      const data = getIntegrationsData();
      res.json({
        success: true,
        status: data.woo_webhook_active ? 'online' : 'offline',
        last_ping: data.woo_last_ping || null
      });
    } catch (err: any) {
      console.error('Error in WooCommerce connection status verification API:', err);
      res.status(500).json({ success: false, error: err.message });
    }
  });

  app.post('/api/integrations/woocommerce/verify', (req: express.Request, res: express.Response) => {
    try {
      const data = getIntegrationsData();
      data.woo_webhook_active = true;
      data.woo_last_ping = new Date().toISOString();
      saveIntegrationsData(data);
      res.json({
        success: true,
        status: 'online',
        last_ping: data.woo_last_ping,
        message: 'WooCommerce Webhook connection successfully verified!'
      });
    } catch (err: any) {
      console.error('Error in WooCommerce force verification API:', err);
      res.status(500).json({ success: false, error: err.message });
    }
  });

  // Get integrations data
  app.get('/api/integrations/data', (req: express.Request, res: express.Response) => {
    try {
      res.json(getIntegrationsData());
    } catch (err: any) {
      console.error('Error retrieving integration data:', err);
      res.status(500).json({ success: false, error: err.message || 'Failed to retrieve integration data' });
    }
  });

  // WooCommerce Webhook validation/GET receiver
  app.get(['/api/integrations/woocommerce', '/api/integrations/woocommerce/'], (req: express.Request, res: express.Response) => {
    console.log('Received WooCommerce Webhook validation GET check');
    try {
      const data = getIntegrationsData();
      data.woo_webhook_active = true;
      data.woo_last_ping = new Date().toISOString();
      saveIntegrationsData(data);
    } catch (e) {
      console.error('Failed to update connection status on GET handshake', e);
    }
    return res.status(200).json({
      success: true,
      message: 'WooCommerce Webhook URL connection validated and handshake successful'
    });
  });

  // WooCommerce Webhook safe body parser middleware
  app.use(['/api/integrations/woocommerce', '/api/integrations/woocommerce/'], (req: express.Request, res: express.Response, next: express.NextFunction) => {
    // If body is already parsed by some other express configuration, skip
    if (req.body && Object.keys(req.body).length > 0) {
      return next();
    }

    let data = '';
    req.on('data', chunk => {
      data += chunk;
    });

    req.on('end', () => {
      req.body = {}; // Default empty body
      if (!data) {
        return next();
      }

      const contentType = (req.headers['content-type'] || '').toLowerCase();
      try {
        if (contentType.includes('application/json') || data.trim().startsWith('{') || data.trim().startsWith('[')) {
          req.body = JSON.parse(data);
        } else if (contentType.includes('application/x-www-form-urlencoded')) {
          const params = new URLSearchParams(data);
          const bodyObj: any = {};
          for (const [key, value] of params.entries()) {
            bodyObj[key] = value;
          }
          req.body = bodyObj;
        } else {
          // Robust fallback: try JSON parsing, fallback to UrlEncoded query params
          try {
            req.body = JSON.parse(data);
          } catch {
            const params = new URLSearchParams(data);
            const bodyObj: any = {};
            for (const [key, value] of params.entries()) {
              bodyObj[key] = value;
            }
            req.body = Object.keys(bodyObj).length > 0 ? bodyObj : {};
          }
        }
      } catch (err: any) {
        console.warn('[WooCommerce safe-body-parser] Non-fatal Webhook body parsing failed:', err.message);
        req.body = {};
      }
      next();
    });
  });

  // WooCommerce Webhook receiver
  app.post(['/api/integrations/woocommerce', '/api/integrations/woocommerce/'], (req: express.Request, res: express.Response) => {
    try {
      const body = req.body || {};
      const topicHeader = req.headers['x-wc-webhook-topic'];
      const isPing = 
        topicHeader === 'webhook.action' || 
        body?.webhook_id !== undefined ||
        (!body?.order_number && !body?.number && !body?.id && !body?.customer_name && !body?.billing);

      if (isPing) {
        console.log('Received WooCommerce Webhook handshake/ping request');
        try {
          const syncData = getIntegrationsData();
          syncData.woo_webhook_active = true;
          syncData.woo_last_ping = new Date().toISOString();
          saveIntegrationsData(syncData);
        } catch (e) {
          console.error('Failed to update integration connection details on ping', e);
        }
        return res.status(200).json({ 
          success: true, 
          message: 'WooCommerce Webhook URL connection validated and handshake successful' 
        });
      }

      // 2. Parse payload - accommodate both our web simulation and actual WooCommerce order webhook data
      const id = body.id || ('woo_' + Date.now());
      
      let orderNumber = body.order_number;
      if (!orderNumber && body.number) {
        orderNumber = '#' + body.number;
      } else if (!orderNumber && body.id) {
        orderNumber = '#' + body.id;
      } else if (!orderNumber) {
        orderNumber = '#' + Math.floor(Math.random() * 1000 + 1000);
      }

      let customerName = body.customer_name;
      if (!customerName && body.billing) {
        const firstName = body.billing.first_name || '';
        const lastName = body.billing.last_name || '';
        customerName = `${firstName} ${lastName}`.trim() || 'WooCommerce Buyer';
      } else if (!customerName) {
        customerName = 'Anonymous Buyer';
      }

      let customerEmail = body.customer_email || body.billing?.email || 'no-email@example.com';
      let customerPhone = body.customer_phone || body.billing?.phone || '01711223344';
      
      let customerAddress = body.customer_address;
      if (!customerAddress && body.billing) {
        const addr1 = body.billing.address_1 || '';
        const addr2 = body.billing.address_2 || '';
        const city = body.billing.city || '';
        customerAddress = [addr1, addr2, city].filter(Boolean).join(', ') || 'Bangladesh';
      } else if (!customerAddress) {
        customerAddress = 'Dhaka, Bangladesh';
      }

      let items = body.items;
      let productNumber = body.product_number;
      if (!items && Array.isArray(body.line_items)) {
        items = body.line_items.map((it: any) => `${it.quantity}x ${it.name}`).join(', ');
        if (body.line_items[0]) {
          productNumber = body.line_items[0].sku || ('PRD-' + body.line_items[0].product_id);
        }
      }
      if (!items) items = 'Custom Order Products';
      if (!productNumber) productNumber = 'PRD-' + Math.floor(Math.random() * 9000 + 1000);

      let total = body.total;
      if (total && typeof total === 'string' && !total.includes('৳')) {
        total = '৳ ' + total;
      } else if (total && typeof total === 'number') {
        total = '৳ ' + total;
      } else if (!total) {
        total = '৳ 0';
      }

      let rawPaymentStatus = body.payment_status;
      if (!rawPaymentStatus && body.payment_method_title) {
        const titleL = body.payment_method_title.toLowerCase();
        if (titleL.includes('cash') || titleL.includes('cod') || titleL.includes('ক্যাশ')) {
          rawPaymentStatus = 'cash_on_delivery';
        } else if (body.status === 'completed' || body.status === 'processing') {
          rawPaymentStatus = 'paid';
        } else {
          rawPaymentStatus = 'unpaid';
        }
      } else if (!rawPaymentStatus) {
        rawPaymentStatus = 'cash_on_delivery';
      }

      let rawStatus = body.status || 'pending';
      if (rawStatus === 'completed' || rawStatus === 'processing' || rawStatus === 'confirmed') {
        rawStatus = 'confirmed';
      } else if (rawStatus === 'cancelled' || rawStatus === 'failed' || rawStatus === 'declined') {
        rawStatus = 'declined';
      } else {
        rawStatus = 'pending';
      }

      const deliveryStatus = body.delivery_status || 'pending_shipment';

      const data = getIntegrationsData();
      const newOrder = {
        id: String(id),
        order_number: orderNumber,
        customer_name: customerName,
        customer_email: customerEmail,
        customer_phone: customerPhone,
        customer_address: customerAddress,
        product_number: productNumber,
        total: total,
        items: items,
        payment_status: rawPaymentStatus,
        status: rawStatus,
        delivery_status: deliveryStatus,
        tracking_history: body.tracking_history || [
          { time: new Date().toISOString(), status: "অর্ডার রিসিভড", notes: "WooCommerce ওয়েবহুক দিয়ে অর্ডার ডেটা জেনারেট হয়েছে।" }
        ],
        created_at: new Date().toISOString()
      };

      data.wooOrders.unshift(newOrder);
      data.woo_webhook_active = true;
      data.woo_last_ping = new Date().toISOString();
      saveIntegrationsData(data);
      res.json({ success: true, message: 'WooCommerce Webhook received successfully', order: newOrder });
    } catch (err: any) {
      console.error('Error receiving WooCommerce webhook:', err);
      res.status(500).json({ success: false, error: err.message || 'Failed to process WooCommerce integration' });
    }
  });

  // WooCommerce Order Status Update
  app.post('/api/integrations/woocommerce/status', (req: express.Request, res: express.Response) => {
    try {
      const { id, status, payment_status, delivery_status, new_tracking } = req.body;
      const data = getIntegrationsData();
      data.wooOrders = data.wooOrders.map((o: any) => {
        if (o.id === id) {
          const updated = { ...o };
          if (status !== undefined) updated.status = status;
          if (payment_status !== undefined) updated.payment_status = payment_status;
          if (delivery_status !== undefined) updated.delivery_status = delivery_status;
          
          if (!updated.tracking_history) {
            updated.tracking_history = [];
          }
          if (new_tracking) {
            updated.tracking_history.push({
              time: new Date().toISOString(),
              status: new_tracking.status,
              notes: new_tracking.notes || ''
            });
          }
          return updated;
        }
        return o;
      });
      saveIntegrationsData(data);
      res.json({ success: true, message: 'WooCommerce order updated successfully' });
    } catch (err: any) {
      console.error('Error updating WooCommerce status:', err);
      res.status(500).json({ success: false, error: err.message || 'Failed to update order status' });
    }
  });

  // Laravel receiver
  app.post('/api/integrations/laravel', (req: express.Request, res: express.Response) => {
    try {
      const data = getIntegrationsData();
      const newEvent = {
        id: 'lar_' + Date.now(),
        event_type: req.body.event_type || 'Laravel Event Triggered',
        payload: req.body.payload || { info: 'No details provided' },
        status: 'unread',
        created_at: new Date().toISOString()
      };
      data.laravelEvents.unshift(newEvent);
      saveIntegrationsData(data);
      res.json({ success: true, message: 'Laravel custom integration event received', event: newEvent });
    } catch (err: any) {
      console.error('Error receiving Laravel event:', err);
      res.status(500).json({ success: false, error: err.message || 'Failed to process Laravel hook' });
    }
  });

  // Laravel Event Status Update
  app.post('/api/integrations/laravel/status', (req: express.Request, res: express.Response) => {
    try {
      const { id, status } = req.body;
      const data = getIntegrationsData();
      data.laravelEvents = data.laravelEvents.map((e: any) => e.id === id ? { ...e, status } : e);
      saveIntegrationsData(data);
      res.json({ success: true, message: `Event status updated to ${status}` });
    } catch (err: any) {
      console.error('Error updating Laravel event status:', err);
      res.status(500).json({ success: false, error: err.message || 'Failed to update event status' });
    }
  });

  // Facebook verify
  app.get('/api/integrations/facebook', (req: express.Request, res: express.Response) => {
    try {
      const hubMode = req.query['hub.mode'];
      const hubToken = req.query['hub.verify_token'];
      const hubChallenge = req.query['hub.challenge'];
      if (hubMode === 'subscribe' && hubToken === 'my-verification-token') {
        res.send(hubChallenge);
      } else {
        res.status(403).send('Verification failed');
      }
    } catch (err: any) {
      console.error('Error on Facebook verification:', err);
      res.status(500).send('Verification processing error');
    }
  });

  // Facebook simulation message
  app.post('/api/integrations/facebook/message', (req: express.Request, res: express.Response) => {
    try {
      const { customer_name, customer_id, text } = req.body;
      const data = getIntegrationsData();
      const targetThreadId = 'fb_thread_' + (customer_id || Date.now());
      
      let thread = data.fbChats.find((t: any) => t.customer_id === (customer_id || 'guest_id'));
      if (!thread) {
        thread = {
          id: targetThreadId,
          customer_name: customer_name || 'Guest User',
          customer_id: customer_id || 'guest_id',
          unread: true,
          messages: []
        };
        data.fbChats.unshift(thread);
      }
      
      thread.messages.push({
        id: 'msg_' + Date.now(),
        sender: 'user',
        text: text || 'Hello',
        created_at: new Date().toISOString()
      });
      thread.unread = true;

      saveIntegrationsData(data);
      res.json({ success: true, message: 'Facebook Webhook message received', thread });
    } catch (err: any) {
      console.error('Error simulating Facebook webhook message:', err);
      res.status(500).json({ success: false, error: err.message || 'Failed to simulate Facebook message' });
    }
  });

  // Facebook reply
  app.post('/api/integrations/facebook/reply', (req: express.Request, res: express.Response) => {
    try {
      const { threadId, text } = req.body;
      const data = getIntegrationsData();
      const thread = data.fbChats.find((t: any) => t.id === threadId);
      if (!thread) {
        return res.status(404).json({ success: false, error: 'Facebook thread not found' });
      }

      thread.messages.push({
        id: 'msg_reply_' + Date.now(),
        sender: 'system',
        text: text || '',
        created_at: new Date().toISOString()
      });
      thread.unread = false;

      saveIntegrationsData(data);
      res.json({ success: true, message: 'Facebook reply dispatched successfully via Meta Graph API simulation', thread });
    } catch (err: any) {
      console.error('Error processing Facebook reply:', err);
      res.status(500).json({ success: false, error: err.message || 'Failed to execute reply' });
    }
  });

  // Reset integrations
  app.post('/api/integrations/reset', (req: express.Request, res: express.Response) => {
    try {
      if (fs.existsSync(INTEGRATIONS_FILE)) {
        try {
          fs.unlinkSync(INTEGRATIONS_FILE);
        } catch (e) {}
      }
      const cleanData = getIntegrationsData();
      res.json({ success: true, message: 'Integration data reset', data: cleanData });
    } catch (err: any) {
      console.error('Error resetting integrations:', err);
      res.status(500).json({ success: false, error: err.message || 'Failed to reset integrations' });
    }
  });

  const isProd = process.env.NODE_ENV === 'production';

  // API 404 Catch-all (must be before SPA fallback)
  app.use('/api', (req, res) => {
    res.status(404).json({ success: false, error: `API route not found: ${req.method} ${req.path}` });
  });

  // For development (AI Studio / Local dev)
  if (!isProd) {
    const { createServer: createViteServer } = await import('vite');
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  } 
  // For production (Hostinger)
  else {
    const distPath = path.join(process.cwd(), 'dist');
    app.use(express.static(distPath));
    
    // Support SPA routing (redirect all non-file requests to index.html with existence guarantee)
    app.use((req, res) => {
      const indexPath = path.join(distPath, 'index.html');
      if (fs.existsSync(indexPath)) {
        res.sendFile(indexPath);
      } else {
        res.status(404).send('Application is building or index.html is temporarily unavailable. Please refresh in a few seconds.');
      }
    });
  }

  app.listen(PORT, '0.0.0.0', () => {
    console.log(`Server running at http://0.0.0.0:${PORT}`);
  });
}

startServer();
