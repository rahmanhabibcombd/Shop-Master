import React from 'react';
import { GmailClient } from './GmailClient';

interface BusinessMailProps {
  setNotification: (notif: { message: string, type: 'success' | 'error' | 'info' }) => void;
  lang?: string;
}

export function BusinessMail({ setNotification, lang = 'bn' }: BusinessMailProps) {
  return (
    <div className="w-full">
      {/* Container wrapper for the integrated automated dynamic GmailClient component */}
      <GmailClient 
        setNotification={setNotification} 
        lang={lang} 
      />
    </div>
  );
}
