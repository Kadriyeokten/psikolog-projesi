// public/assets/js/i18n.js

let translations = {};
let trReference = {};
let currentLang = localStorage.getItem('preferredLanguage') || 'tr';

/**
 * Load translations for the given language
 */
async function loadTranslations(lang) {
  console.log(`Loading translations for: ${lang}`);
  try {
    const response = await fetch(`./assets/locales/${lang}.json?v=${Date.now()}`);
    translations = await response.json();
    
    if (Object.keys(trReference).length === 0) {
      const trRes = await fetch(`./assets/locales/tr.json?v=${Date.now()}`);
      trReference = await trRes.json();
    }

    currentLang = lang;
    document.documentElement.lang = lang;
    applyTranslations();
    localStorage.setItem('preferredLanguage', lang);
    updateToggleLabel(lang);
    
    // Trigger update for dynamic elements
    window.dispatchEvent(new CustomEvent('languageChanged', { detail: { lang, translations } }));
  } catch (error) {
    console.error('Error loading translations:', error);
  }
}

/**
 * Apply translations to elements with data-i18n attribute (Static)
 */
function applyTranslations() {
  const elements = document.querySelectorAll('[data-i18n]');
  elements.forEach(element => {
    const key = element.getAttribute('data-i18n');
    if (translations[key]) {
      if (element.tagName === 'INPUT' || element.tagName === 'TEXTAREA') {
        element.placeholder = translations[key];
      } else {
        element.innerHTML = translations[key];
      }
    }
  });
}

function updateToggleLabel(lang) {
  const label = document.getElementById('langLabel');
  if (label) {
    label.textContent = lang.toUpperCase();
  }
}

async function switchLanguage() {
  const nextLang = currentLang === 'tr' ? 'en' : 'tr';
  await loadTranslations(nextLang);
}

/**
 * Async Translation Helper (Smart AI)
 * @param {string} input - Text to translate
 * @returns {Promise<string>} Translated text
 */
async function t(input) {
  if (!input || typeof input !== 'string') return input || "";
  if (currentLang === 'tr') return input;

  // 1. Check local cache (key match)
  if (translations[input]) return translations[input];

  // 2. Check TR Reference for value match (Reverse lookup)
  for (let key in trReference) {
    if (trReference[key] === input) {
      // Return English version of this key
      return translations[key] || input;
    }
  }

  // 3. AI Auto Translate (Call Backend)
  console.log(`AI Translating: "${input.substring(0, 20)}..."`);
  try {
    const res = await fetch('/api/translate', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ text: input, target: 'en' })
    });
    const data = await res.json();
    if (data.translatedText) {
      // Add to current translations object to avoid re-fetching
      translations[input] = data.translatedText;
      return data.translatedText;
    }
  } catch (err) {
    console.error("Auto-translate failed:", err);
  }

  return input;
}

// Initial load
document.addEventListener('DOMContentLoaded', () => {
  loadTranslations(currentLang);

  const toggleBtn = document.getElementById('langToggle');
  if (toggleBtn) {
    toggleBtn.addEventListener('click', async (e) => {
      e.preventDefault();
      await switchLanguage();
    });
  }
});

window.i18n = {
  t: t,
  getLang: () => currentLang,
  setLang: (lang) => loadTranslations(lang)
};
