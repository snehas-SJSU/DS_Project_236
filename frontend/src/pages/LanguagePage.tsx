import { useState } from 'react';
import { showToast } from '../lib/toast';

const options = ['English (US)', 'English (UK)', 'Hindi', 'Spanish', 'French'];

export default function LanguagePage() {
  const [language, setLanguage] = useState('English (US)');

  return (
    <div className="li-card p-5">
      <h1 className="text-xl font-semibold text-[#191919]">Language Preferences</h1>
      <p className="mt-1 text-sm text-[#666]">Select your preferred language for UI and notifications.</p>
      <div className="mt-3 max-w-sm">
        <select
          value={language}
          onChange={(e) => setLanguage(e.target.value)}
          className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm"
        >
          {options.map((op) => (
            <option key={op}>{op}</option>
          ))}
        </select>
      </div>
      <button
        onClick={() => showToast(`Language updated to ${language}.`, 'success')}
        className="mt-4 rounded-full bg-[#0a66c2] px-5 py-2 text-sm font-semibold text-white hover:bg-[#004182]"
      >
        Update language
      </button>
    </div>
  );
}

